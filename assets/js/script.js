const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let charts = {}; 
const MAX_DATAPOINTS = 15; 
let useLocalMode = false;

// Estado del Dashboard
let searchQuery = ""; 
let filterState = "all";
let sortState = "id";
let userRole = "operador"; // operador | supervisor
let audioCtx = null;
let lastValuesMap = {}; 

document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    setInterval(mainLoop, 2000); 

    // Listeners de la barra de herramientas
    document.getElementById('searchInput').addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); triggerRender(); });
    document.getElementById('filterSelect').addEventListener('change', (e) => { filterState = e.target.value; triggerRender(); });
    document.getElementById('sortSelect').addEventListener('change', (e) => { sortState = e.target.value; triggerRender(); });
});

async function mainLoop() {
    devicesCache.forEach(d => lastValuesMap[d.id] = d.sensorValue);

    if(useLocalMode) {
        simulatePhysicsLocal(); 
    } else {
        await simulatePhysicsAndSave();
        await fetchDevices();
    }
    
    checkHealthAndAlerts();
    triggerRender();
}

function triggerRender() {
    renderControl(devicesCache);
    updateCharts(devicesCache); // El monitor se mantiene intacto
    if (userRole === 'supervisor') renderAdmin(devicesCache);
}

// --- RED Y DATOS ---
async function fetchDevices() {
    try {
        const res = await fetch(DEVICES_URL);
        if (!res.ok) throw new Error("Error API");
        const rawData = await res.json();
        
        if (rawData.length === 0) {
             if(!useLocalMode) devicesCache = getLocalData(); 
             useLocalMode = true; 
             updateStatus('API VACÍA - MODO LOCAL', 'warning');
        } else {
            const now = Date.now();
            devicesCache = rawData.map(d => {
                const existing = devicesCache.find(x => x.id === d.id);
                return {
                    id: d.id,
                    name: d.deviceId || `Dispositivo ${d.id}`,
                    // Agrupación por Líneas (Plant Layout)
                    zone: parseInt(d.id) <= 3 ? 'Línea A - Mezcla' : 'Línea B - Envasado',
                    sensorValue: parseFloat(d.value) || 20,
                    status: d.status !== undefined ? d.status : false, 
                    threshold: parseFloat(d.threshold) || 90,
                    message: d.message || "Operación Normal",
                    lastUpdate: now, // Watchdog tracker
                    watchdogError: existing && (now - existing.lastUpdate > 6000) ? true : false
                };
            });
            useLocalMode = false;
            updateStatus('EN LÍNEA', 'success');
        }
    } catch (error) {
        useLocalMode = true;
        updateStatus('OFFLINE (DEMO)', 'danger');
        if (devicesCache.length === 0) devicesCache = getLocalData();
    }
}

// --- LÓGICA DE ALARMAS Y SALUD (Watchdog & Audio) ---
function checkHealthAndAlerts() {
    let playAlarm = false;
    const now = Date.now();

    devicesCache.forEach(m => {
        // Watchdog check
        if (!useLocalMode && (now - m.lastUpdate > 6000)) m.watchdogError = true;
        
        // Alertas de Audio si está crítico y activo
        if (m.sensorValue >= m.threshold && m.status) {
            playAlarm = true;
        }
    });

    if (playAlarm) playBeep();
}

function playBeep() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.connect(audioCtx.destination);
    osc.start(); 
    osc.stop(audioCtx.currentTime + 0.1); 
}

// --- RENDERS ---
function renderControl(mixers) {
    const grid = document.getElementById('mixerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    // 1. Filtrado
    let filtered = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    if (filterState === 'active') filtered = filtered.filter(m => m.status);
    if (filterState === 'alert') filtered = filtered.filter(m => m.sensorValue >= m.threshold * 0.8);
    
    // 2. Ordenamiento
    if (sortState === 'temp_desc') filtered.sort((a,b) => b.sensorValue - a.sensorValue);
    else filtered.sort((a,b) => parseInt(a.id) - parseInt(b.id));

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center mt-5 text-contrast"><h5>No se encontraron equipos 🔍</h5></div>';
        return;
    }

    const nowStr = new Date().toLocaleTimeString('es-ES'); 
    
    // 3. Agrupación por Zonas (Plant Layout)
    const zones = {};
    filtered.forEach(m => { if (!zones[m.zone]) zones[m.zone] = []; zones[m.zone].push(m); });

    for (const [zoneName, machines] of Object.entries(zones)) {
        // Render de Cabecera de Zona
        grid.innerHTML += `<h4 class="mt-4 mb-3 border-bottom border-secondary pb-2" style="color: var(--neon-blue); font-family: 'Orbitron';">${zoneName}</h4>`;
        let rowHtml = `<div class="row g-4">`;

        machines.forEach(m => {
            const temp = parseFloat(m.sensorValue).toFixed(1);
            const isOn = m.status;
            
            // Zonas Escalonadas (Warning vs Critical)
            const isCritical = m.sensorValue >= m.threshold;
            const isWarning = !isCritical && m.sensorValue >= (m.threshold * 0.8);
            
            let borderClass = isOn ? 'border-on' : 'border-off';
            let statusColor = isOn ? 'var(--neon-green)' : '#666';
            let statusText = isOn ? 'EN MARCHA' : 'DETENIDO';

            if (isWarning) { borderClass = 'border-warning'; statusColor = 'var(--neon-yellow)'; statusText = 'ADVERTENCIA'; }
            if (isCritical) { borderClass = 'border-danger pulse-alert'; statusColor = 'var(--neon-red)'; statusText = 'CRÍTICO'; }
            if (m.watchdogError) { borderClass = 'border-off'; statusColor = '#888'; statusText = 'ERR SENSOR'; }

            // Mantenimiento Predictivo / Cálculo de tiempo
            let prevVal = lastValuesMap[m.id] !== undefined ? lastValuesMap[m.id] : m.sensorValue;
            let rate = m.sensorValue - prevVal;
            let trendIcon = '➖'; let trendClass = 'text-trend-stable';
            let predictText = "";

            if (rate > 0) {
                trendIcon = '⬆️'; trendClass = 'text-trend-up';
                if (isOn && !isCritical) {
                    let cyclesLeft = (m.threshold - m.sensorValue) / rate;
                    predictText = `Límite en ~${Math.round(cyclesLeft * 2)}s`;
                }
            } else if (rate < 0) {
                trendIcon = '⬇️'; trendClass = 'text-trend-down';
            }

            // Barra de Progreso Dinámica
            let progressPercent = Math.min((m.sensorValue / m.threshold) * 100, 100);
            let progressColor = 'var(--neon-blue)'; 
            if (progressPercent >= 80) progressColor = 'var(--neon-yellow)'; 
            if (progressPercent >= 100) progressColor = 'var(--neon-red)'; 

            const gearAnim = isOn && !m.watchdogError ? 'spin-gear' : '';
            const ledAnim = isOn ? 'led-blink' : '';

            rowHtml += `
            <div class="col-md-4">
                <div class="card h-100 ${borderClass}">
                    <div class="card-body text-center position-relative">
                        
                        <div class="${ledAnim}" style="position: absolute; top: 15px; right: 15px; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor};" title="${statusText}"></div>
                        
                        <h5 class="text-white mb-1 fw-bold">${m.name}</h5>
                        <div style="font-size: 0.75rem; color: ${statusColor}; font-weight: bold;" class="mb-3">${statusText}</div>
                        
                        <div class="mb-2 ${gearAnim}" style="color: ${isOn ? 'var(--neon-blue)' : '#444'}; font-size: 3.5rem;">⚙️</div>
                        
                        <div class="my-2 d-flex justify-content-center align-items-center" style="font-family: 'Orbitron'; font-size: 2.5rem; font-weight: bold; color: ${statusColor}">
                            ${temp}°C <span class="${trendClass} ms-2" style="font-size: 1.5rem; font-family: 'Roboto';">${trendIcon}</span>
                        </div>

                        <div class="px-2 mb-4 text-start">
                            <div class="d-flex justify-content-between text-contrast" style="font-size: 0.75rem; margin-bottom: 2px;">
                                <span>Máx: ${m.threshold}°C</span>
                                <span class="text-warning">${predictText}</span>
                            </div>
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progressPercent}%; background-color: ${progressColor};"></div>
                            </div>
                        </div>

                        <button onclick="safeToggleMixer('${m.id}', ${isOn})" class="btn w-100 fw-bold ${isOn ? 'btn-action-stop' : 'btn-action-start'}">
                            ${isOn ? '🛑 DETENER EQUIPO' : '⚡ INICIAR EQUIPO'}
                        </button>

                        <div class="mt-3 text-timestamp">
                            ⏱️ Actualizado: ${nowStr}
                        </div>
                    </div>
                </div>
            </div>`;
        });
        rowHtml += `</div>`;
        grid.innerHTML += rowHtml;
    }
}

function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    if (sortState === 'temp_desc') filtered.sort((a,b) => b.sensorValue - a.sensorValue);
    else filtered.sort((a,b) => parseInt(a.id) - parseInt(b.id));

    filtered.forEach(m => {
        const statusLabel = m.status ? '<span class="text-success fw-bold" style="font-size: 0.8rem;">● ACTIVO</span>' : '<span class="text-secondary" style="font-size: 0.8rem;">● PARO</span>';
        const isNearLimit = (m.threshold - m.sensorValue) <= (m.threshold * 0.2) && m.status;
        const tempClass = isNearLimit ? 'text-warning fw-bold pulse-alert' : 'text-light';

        tbody.innerHTML += `
        <tr>
            <td class="text-contrast" style="font-size: 0.8rem;">#${m.id}</td>
            <td class="text-contrast">${m.zone}</td>
            <td class="fw-bold text-light">${m.name}</td>
            <td>${m.watchdogError ? '<span class="text-danger">ERR CONEX</span>' : statusLabel}</td>
            <td class="${tempClass}">${parseFloat(m.sensorValue).toFixed(1)}°C</td>
            <td class="text-contrast">${m.threshold}°C</td>
            <td>
                <div class="btn-group">
                    <button onclick="openEditModal('${m.id}')" class="btn btn-sm btn-outline-info me-2" title="Editar">✏️</button>
                    <button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar">✕</button>
                </div>
            </td>
        </tr>`;
    });
}

// ==========================================
// PESTAÑA MONITOR (Intacta, se copia igual)
// ==========================================
function updateCharts(mixers) {
    const container = document.getElementById('chartsContainer');
    if(!container) return;

    const currentTime = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const currentIds = mixers.map(m => m.id.toString());

    mixers.forEach(m => {
        const strId = m.id.toString();
        let chartDiv = document.getElementById(`chart-wrapper-${strId}`);
        
        if (!chartDiv) {
            chartDiv = document.createElement('div');
            chartDiv.className = 'col-lg-6 mb-3'; 
            chartDiv.id = `chart-wrapper-${strId}`;
            chartDiv.innerHTML = `
                <div class="card p-3 h-100 border-off">
                    <h5 class="text-center brand-tech mb-3" style="color: var(--neon-blue); font-size: 1.2rem;">${m.name}</h5>
                    <canvas id="canvas-${strId}" height="100"></canvas>
                    <div class="mt-4">
                        <p class="text-muted mb-2" style="font-size: 0.85rem; border-bottom: 1px solid #333; padding-bottom: 5px;">📜 Últimos 10 registros</p>
                        <div class="table-responsive">
                            <table class="table table-dark-custom table-sm mb-0" style="font-size: 0.8rem; background-color: transparent;">
                                <thead>
                                    <tr>
                                        <th class="text-secondary border-bottom border-secondary">Temp</th>
                                        <th class="text-secondary border-bottom border-secondary">Estatus</th>
                                        <th class="text-secondary text-end border-bottom border-secondary">Hora</th>
                                    </tr>
                                </thead>
                                <tbody id="history-${strId}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(chartDiv);

            const ctx = document.getElementById(`canvas-${strId}`).getContext('2d');
            charts[strId] = new Chart(ctx, {
                type: 'line',
                data: { 
                    labels: [], 
                    datasets: [
                        { label: 'Temp', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0, 212, 255, 0.1)', fill: true, tension: 0.4, pointRadius: 2 },
                        { label: 'Límite', data: [], borderColor: '#ff2a2a', borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, fill: false }
                    ] 
                },
                options: { 
                    responsive: true, 
                    animation: false, 
                    plugins: { legend: { display: false } }, 
                    scales: { 
                        y: { grid: { color: '#333' }, suggestedMin: 15, suggestedMax: parseInt(m.threshold) + 10 }, 
                        x: { grid: { color: '#333' }, ticks: { color: '#888', font: {size: 10} } } 
                    } 
                }
            });
        }

        const isVisible = m.name.toLowerCase().includes(searchQuery);
        if (isVisible) chartDiv.classList.remove('d-none'); else chartDiv.classList.add('d-none');

        const chart = charts[strId];
        const datasetTemp = chart.data.datasets[0]; 
        const datasetThreshold = chart.data.datasets[1]; 
        const isDanger = m.sensorValue >= m.threshold;
        
        datasetTemp.borderColor = isDanger ? '#ff2a2a' : (m.status ? '#00ff9d' : '#00d4ff');
        datasetTemp.backgroundColor = isDanger ? 'rgba(255, 42, 42, 0.1)' : (m.status ? 'rgba(0, 255, 157, 0.1)' : 'rgba(0, 212, 255, 0.1)');

        chart.data.labels.push(currentTime);
        datasetTemp.data.push(m.sensorValue);
        datasetThreshold.data.push(m.threshold);

        if (chart.data.labels.length > MAX_DATAPOINTS) {
            chart.data.labels.shift();
            datasetTemp.data.shift();
            datasetThreshold.data.shift();
        }
        chart.update();

        const tbody = document.getElementById(`history-${strId}`);
        const statusBadge = m.status ? '<span class="badge bg-success bg-opacity-25 text-success border border-success" style="font-size: 0.7rem;">Activo</span>' : '<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary" style="font-size: 0.7rem;">Paro</span>';
        let tempColor = isDanger ? 'text-danger fw-bold' : 'text-light';
        
        const newRow = `<tr><td class="${tempColor} border-bottom border-dark">${parseFloat(m.sensorValue).toFixed(1)}°C</td><td class="border-bottom border-dark">${statusBadge}</td><td class="text-end text-light border-bottom border-dark">${currentTime}</td></tr>`;
        tbody.insertAdjacentHTML('afterbegin', newRow);
        
        while(tbody.children.length > 10) tbody.removeChild(tbody.lastChild);
    });

    Object.keys(charts).forEach(id => {
        if (!currentIds.includes(id)) {
            charts[id].destroy(); 
            delete charts[id];
            const wrapper = document.getElementById(`chart-wrapper-${id}`);
            if (wrapper) wrapper.remove();
        }
    });
}
// ==========================================


// --- FÍSICA Y CONTROL ---
async function simulatePhysicsAndSave() {
    for (let mixer of devicesCache) {
        let currentMsg = "Operación Normal";
        if (mixer.status) mixer.sensorValue += (Math.random() * 1.5 + 1); // Variabilidad
        else mixer.sensorValue -= 1.5;
        if (mixer.sensorValue < 20) mixer.sensorValue = 20;

        if (mixer.sensorValue >= mixer.threshold && mixer.status) {
            mixer.status = false;
            currentMsg = "⚠️ SAFE-STOP: Límite excedido";
        }

        try {
            await fetch(`${DEVICES_URL}/${mixer.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ value: mixer.sensorValue, deviceId: mixer.name, status: mixer.status, message: currentMsg })
            });
        } catch(e) {}
    }
}

// Fricción Positiva
async function safeToggleMixer(id, current) {
    if (!current && !confirm('⚠️ ¿Estás seguro que deseas INICIAR este equipo? Asegúrate que la línea esté despejada.')) {
        return; 
    }
    
    const mixer = devicesCache.find(d => d.id == id);
    if(mixer) {
        mixer.status = !current;
        if(!useLocalMode) {
            await fetch(`${DEVICES_URL}/${id}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ status: mixer.status, message: mixer.status ? "Inicio manual" : "Paro manual" })
            });
        }
        triggerRender();
    }
}

// PARO DE EMERGENCIA GLOBAL
async function emergencyStopAll() {
    if(!confirm("⚠️ ADVERTENCIA CRÍTICA: ¿Estás seguro que deseas DETENER TODAS las máquinas de la planta?")) return;
    
    devicesCache.forEach(m => {
        if(m.status) m.status = false;
    });
    triggerRender();
    
    if(!useLocalMode) {
        for (let mixer of devicesCache) {
            try {
                await fetch(`${DEVICES_URL}/${mixer.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ status: false, message: "🛑 PARO DE EMERGENCIA EJECUTADO" })
                });
            } catch(e) {}
        }
    }
    alert("🛑 Paro de emergencia activado. Todas las máquinas han sido detenidas.");
}

// --- UTILIDADES ---
function updateStatus(text, type) {
    const badge = document.getElementById('connectionStatus');
    if(!badge) return;
    badge.innerText = text;
    badge.className = `badge rounded-pill bg-${type} bg-opacity-25 text-${type} border border-${type}`;
}

function getLocalData() {
    return [
        { id: "1", name: "Batidora Demo A1", status: false, sensorValue: 20, threshold: 80, zone: 'Línea A - Mezcla' },
        { id: "4", name: "Envasadora B1", status: false, sensorValue: 20, threshold: 90, zone: 'Línea B - Envasado' }
    ];
}

function simulatePhysicsLocal() {
    devicesCache.forEach(mixer => {
        if (mixer.status) mixer.sensorValue += 2;
        else mixer.sensorValue -= 1;
        if (mixer.sensorValue < 20) mixer.sensorValue = 20;
        mixer.lastUpdate = Date.now();
    });
}

// --- ROLES Y PERMISOS ---
function toggleRole() {
    if (userRole === 'operador') {
        const pin = prompt("Ingrese PIN de Supervisor (Prueba con: 1234):");
        if (pin === "1234") {
            userRole = 'supervisor';
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            document.getElementById('roleBtn').innerHTML = "👑 Modo: Supervisor";
            document.getElementById('roleBtn').className = "btn btn-sm btn-warning fw-bold text-dark";
        } else {
            alert("PIN Incorrecto. Acceso Denegado.");
        }
    } else {
        userRole = 'operador';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.getElementById('roleBtn').innerHTML = "👤 Modo: Operador";
        document.getElementById('roleBtn').className = "btn btn-sm btn-outline-secondary fw-bold";
        // Si estaba en la pestaña admin, lo regresamos a control
        const controlTab = new bootstrap.Tab(document.querySelector('button[data-bs-target="#panel-control"]'));
        controlTab.show();
    }
    triggerRender();
}

// --- EVENTOS Y FORMULARIOS (ADMIN) ---
document.getElementById('addMixerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(userRole !== 'supervisor') return alert("Permisos insuficientes");
    const data = { deviceId: document.getElementById('devName').value, threshold: document.getElementById('devThreshold').value, value: 20, status: false, message: "Dispositivo registrado" };
    await fetch(DEVICES_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    document.getElementById('addMixerForm').reset();
    fetchDevices();
});

async function deleteDev(id) {
    if(userRole !== 'supervisor') return alert("Permisos insuficientes");
    if(confirm("¿Eliminar dispositivo de forma permanente?")) { 
        await fetch(`${DEVICES_URL}/${id}`, { method: 'DELETE' }); 
        fetchDevices(); 
    }
}

function openEditModal(id) {
    if(userRole !== 'supervisor') return alert("Permisos insuficientes");
    const mixer = devicesCache.find(m => m.id === id);
    if (mixer) {
        document.getElementById('editId').value = mixer.id; document.getElementById('editName').value = mixer.name; document.getElementById('editThreshold').value = mixer.threshold;
        new bootstrap.Modal(document.getElementById('editModal')).show();
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value, newName = document.getElementById('editName').value, newThreshold = document.getElementById('editThreshold').value;
    if (!useLocalMode) {
        try { await fetch(`${DEVICES_URL}/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ deviceId: newName, threshold: newThreshold }) }); } catch(e) {}
    } else {
        const mixer = devicesCache.find(m => m.id === id); if (mixer) { mixer.name = newName; mixer.threshold = newThreshold; }
    }
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    fetchDevices();
});

// Reportes (CSV y Shift)
function exportToCSV(type) {
    if (devicesCache.length === 0) { alert("No hay datos para exportar."); return; }
    
    let fileName = type === 'turn' ? "Reporte_Fin_De_Turno.csv" : "Data_Completa_IronMonitor.csv";
    const dateStr = new Date().toLocaleString('es-ES');
    
    let csvContent = "data:text/csv;charset=utf-8,\n";
    if(type === 'turn') csvContent += `REPORTE DE TURNO - GENERADO: ${dateStr}\n\n`;
    
    csvContent += "ID,Zona,Dispositivo,Estado,Temperatura_Actual,Limite_Seguridad,Alerta\n";
    
    devicesCache.forEach(m => {
        const isAlert = m.sensorValue >= (m.threshold * 0.8) ? "SI" : "NO";
        csvContent += `${m.id},${m.zone},${m.name.replace(/,/g, '')},${m.status ? "ACTIVO" : "PARO"},${parseFloat(m.sensorValue).toFixed(2)},${m.threshold},${isAlert}\n`;
    });
    
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csvContent)); 
    link.setAttribute("download", fileName);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
}