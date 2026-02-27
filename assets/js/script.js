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

// --- NUEVAS VARIABLES GLOBALES ---
let dataLogger = {}; // Guarda el historial completo para exportación
const SHIFT_OPERATORS = ["G. Martínez", "L. Sánchez", "A. Gómez", "R. López"];
const DOWNTIME_CAUSES = ["Falla Eléctrica", "Atasco Mecánico", "Mantenimiento Prev", "Limpieza", "Calentamiento Motor"];

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
    updateCharts(devicesCache); 
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
                    zone: parseInt(d.id) <= 3 ? 'Línea A - Mezcla' : 'Línea B - Envasado',
                    sensorValue: parseFloat(d.value) || 20,
                    status: d.status !== undefined ? d.status : false, 
                    threshold: parseFloat(d.threshold) || 90,
                    message: d.message || "Operación Normal",
                    lastUpdate: now, 
                    watchdogError: existing && (now - existing.lastUpdate > 6000) ? true : false,
                    // Mantener datos extendidos si existen
                    operator: existing ? existing.operator : null,
                    rpm: existing ? existing.rpm : 0,
                    vibration: existing ? existing.vibration : "0.00",
                    oee: existing ? existing.oee : "0.0",
                    downtimeCause: existing ? existing.downtimeCause : "-"
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
        if (!useLocalMode && (now - m.lastUpdate > 6000)) m.watchdogError = true;
        if (m.sensorValue >= m.threshold && m.status) playAlarm = true;
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
    
    let filtered = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    if (filterState === 'active') filtered = filtered.filter(m => m.status);
    if (filterState === 'alert') filtered = filtered.filter(m => m.sensorValue >= m.threshold * 0.8);
    
    if (sortState === 'temp_desc') filtered.sort((a,b) => b.sensorValue - a.sensorValue);
    else filtered.sort((a,b) => parseInt(a.id) - parseInt(b.id));

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center mt-5 text-contrast"><h5>No se encontraron equipos 🔍</h5></div>';
        return;
    }

    const nowStr = new Date().toLocaleTimeString('es-ES'); 
    const zones = {};
    filtered.forEach(m => { if (!zones[m.zone]) zones[m.zone] = []; zones[m.zone].push(m); });

    for (const [zoneName, machines] of Object.entries(zones)) {
        grid.innerHTML += `<h4 class="mt-4 mb-3 border-bottom border-secondary pb-2" style="color: var(--neon-blue); font-family: 'Orbitron';">${zoneName}</h4>`;
        let rowHtml = `<div class="row g-4">`;

        machines.forEach(m => {
            const temp = parseFloat(m.sensorValue).toFixed(1);
            const isOn = m.status;
            
            const isCritical = m.sensorValue >= m.threshold;
            const isWarning = !isCritical && m.sensorValue >= (m.threshold * 0.8);
            
            let borderClass = isOn ? 'border-on' : 'border-off';
            let statusColor = isOn ? 'var(--neon-green)' : '#666';
            let statusText = isOn ? 'EN MARCHA' : 'DETENIDO';

            if (isWarning) { borderClass = 'border-warning'; statusColor = 'var(--neon-yellow)'; statusText = 'ADVERTENCIA'; }
            if (isCritical) { borderClass = 'border-danger pulse-alert'; statusColor = 'var(--neon-red)'; statusText = 'CRÍTICO'; }
            if (m.watchdogError) { borderClass = 'border-off'; statusColor = '#888'; statusText = 'ERR SENSOR'; }

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
// PESTAÑA MONITOR (MODIFICADA)
// ==========================================
function updateCharts(mixers) {
    const container = document.getElementById('chartsContainer');
    if(!container) return;

    const currentTime = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const currentIds = mixers.map(m => m.id.toString());

    mixers.forEach(m => {
        const strId = m.id.toString();
        let chartDiv = document.getElementById(`chart-wrapper-${strId}`);
        
        const isCritical = m.sensorValue >= m.threshold;
        const isWarning = !isCritical && m.sensorValue >= m.preAlarm;
        let cardBorderClass = 'border-off';
        
        if (m.status) cardBorderClass = 'border-on';
        if (isWarning) cardBorderClass = 'border-pre-warning pulse-warning-card';
        if (isCritical) cardBorderClass = 'border-danger pulse-alert';

        if (!chartDiv) {
            chartDiv = document.createElement('div');
            chartDiv.className = 'col-lg-6 mb-4'; 
            chartDiv.id = `chart-wrapper-${strId}`;
            
            chartDiv.innerHTML = `
                <div class="card p-3 h-100 ${cardBorderClass}" id="card-monitor-${strId}" style="transition: all 0.3s;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h5 class="brand-tech m-0" style="color: var(--neon-blue); font-size: 1.3rem;">${m.name}</h5>
                        <button onclick="exportDeviceLog('${strId}', '${m.name}')" class="btn btn-sm btn-outline-warning supervisor-only" title="Descargar Log Completo">
                            📥 Reporte CSV
                        </button>
                    </div>

                    <div class="kpi-panel d-flex justify-content-around">
                        <div class="kpi-item"><span class="kpi-label">Operador</span><span class="kpi-val text-info" id="kpi-op-${strId}">${m.operator}</span></div>
                        <div class="kpi-item"><span class="kpi-label">OEE</span><span class="kpi-val" id="kpi-oee-${strId}">${m.oee}%</span></div>
                        <div class="kpi-item"><span class="kpi-label">RPM</span><span class="kpi-val" id="kpi-rpm-${strId}">${m.rpm}</span></div>
                        <div class="kpi-item"><span class="kpi-label">Vibración</span><span class="kpi-val" id="kpi-vib-${strId}">${m.vibration}</span></div>
                    </div>

                    <canvas id="canvas-${strId}" height="100"></canvas>
                    
                    <div class="mt-3 monitor-table-wrapper">
                        <table class="table table-monitor">
                            <thead>
                                <tr>
                                    <th>Temp</th>
                                    <th>Mecánica</th>
                                    <th>Estatus / Causa</th>
                                    <th class="text-end">Hora</th>
                                </tr>
                            </thead>
                            <tbody id="history-${strId}"></tbody>
                        </table>
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
                        { label: 'Pre-Alarma', data: [], borderColor: '#ff8c00', borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, fill: false },
                        { label: 'Límite', data: [], borderColor: '#ff2a2a', borderWidth: 2, borderDash: [2, 4], pointRadius: 0, fill: false }
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
        
        const cardEl = document.getElementById(`card-monitor-${strId}`);
        if(cardEl) cardEl.className = `card p-3 h-100 ${cardBorderClass}`;

        document.getElementById(`kpi-op-${strId}`).innerText = m.operator;
        document.getElementById(`kpi-oee-${strId}`).innerText = `${m.oee}%`;
        document.getElementById(`kpi-oee-${strId}`).style.color = m.oee > 75 ? 'var(--neon-green)' : 'var(--neon-red)';
        document.getElementById(`kpi-rpm-${strId}`).innerText = m.rpm;
        document.getElementById(`kpi-vib-${strId}`).innerText = m.vibration;

        const chart = charts[strId];
        const datasetTemp = chart.data.datasets[0]; 
        const datasetPre = chart.data.datasets[1];
        const datasetMax = chart.data.datasets[2]; 
        
        datasetTemp.borderColor = isCritical ? '#ff2a2a' : (isWarning ? '#ff8c00' : (m.status ? '#00ff9d' : '#00d4ff'));
        datasetTemp.backgroundColor = isCritical ? 'rgba(255, 42, 42, 0.15)' : (isWarning ? 'rgba(255, 140, 0, 0.1)' : (m.status ? 'rgba(0, 255, 157, 0.1)' : 'rgba(0, 212, 255, 0.1)'));

        chart.data.labels.push(currentTime);
        datasetTemp.data.push(m.sensorValue);
        datasetPre.data.push(m.preAlarm);
        datasetMax.data.push(m.threshold);

        if (chart.data.labels.length > MAX_DATAPOINTS) {
            chart.data.labels.shift(); datasetTemp.data.shift(); datasetPre.data.shift(); datasetMax.data.shift();
        }
        chart.update();

        const tbody = document.getElementById(`history-${strId}`);
        let statusBadge = '';
        let causeText = '';
        if (m.status) {
            statusBadge = isWarning ? `<span class="badge-status badge-advertencia">Advertencia</span>` : `<span class="badge-status badge-operando">Operando</span>`;
        } else {
            statusBadge = `<span class="badge-status badge-paro">Paro</span>`;
            causeText = `<br><small class="text-danger">${m.downtimeCause}</small>`;
        }

        let tempColor = isCritical ? 'text-danger fw-bold' : (isWarning ? 'text-warning fw-bold' : 'text-white');
        
        const newRow = `
            <tr>
                <td class="${tempColor}">${parseFloat(m.sensorValue).toFixed(1)}°C</td>
                <td class="text-contrast"><small>RPM:</small> ${m.rpm}<br><small>Vib:</small> ${m.vibration}</td>
                <td>${statusBadge} ${causeText}</td>
                <td class="text-end text-timestamp">${currentTime}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('afterbegin', newRow);
        while(tbody.children.length > 5) tbody.removeChild(tbody.lastChild); 
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

// --- FÍSICA Y CONTROL AMPLIADOS ---
function simulatePhysicsLocal() {
    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString('es-ES', { hour12: false });

    devicesCache.forEach(mixer => {
        if (!mixer.operator) mixer.operator = SHIFT_OPERATORS[parseInt(mixer.id) % SHIFT_OPERATORS.length];
        
        if (mixer.status) {
            mixer.sensorValue += (Math.random() * 1.5 + 0.5); 
            mixer.rpm = Math.floor(1450 + Math.random() * 100);
            mixer.vibration = (2.0 + Math.random() * 1.5).toFixed(2);
            mixer.oee = (85 + Math.random() * 10).toFixed(1);
            mixer.downtimeCause = "-";
        } else {
            mixer.sensorValue -= 1.5; 
            mixer.rpm = 0;
            mixer.vibration = "0.00";
            mixer.oee = "0.0";
            if (!mixer.downtimeCause || mixer.downtimeCause === "-") {
                mixer.downtimeCause = mixer.sensorValue >= mixer.threshold ? "Sobretensión (Temp)" : DOWNTIME_CAUSES[Math.floor(Math.random() * DOWNTIME_CAUSES.length)];
            }
        }
        
        if (mixer.sensorValue < 20) mixer.sensorValue = 20;
        mixer.lastUpdate = now;
        mixer.preAlarm = mixer.threshold * 0.8; 

        if (mixer.sensorValue >= mixer.threshold && mixer.status) {
            mixer.status = false;
        }

        if (!dataLogger[mixer.id]) dataLogger[mixer.id] = [];
        dataLogger[mixer.id].push({
            time: timeStr, temp: parseFloat(mixer.sensorValue).toFixed(1), rpm: mixer.rpm,
            vibration: mixer.vibration, oee: mixer.oee, status: mixer.status ? "OPERANDO" : "PARO",
            cause: mixer.downtimeCause, operator: mixer.operator
        });
        if(dataLogger[mixer.id].length > 500) dataLogger[mixer.id].shift();
    });
}

async function simulatePhysicsAndSave() {
    simulatePhysicsLocal(); 
    for (let mixer of devicesCache) {
        let currentMsg = mixer.status ? "Operación Normal" : `Paro: ${mixer.downtimeCause}`;
        if (mixer.sensorValue >= mixer.threshold && !mixer.status) currentMsg = "⚠️ SAFE-STOP: Límite excedido";

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
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
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

// --- ROLES Y PERMISOS ---
function toggleRole() {
    if (userRole === 'operador') {
        const pin = prompt("Ingrese PIN de Supervisor (Prueba con: 1234):");
        if (pin === "1234") {
            userRole = 'supervisor';
            document.body.classList.add('supervisor-mode'); 
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            document.getElementById('roleBtn').innerHTML = "👑 Modo: Supervisor";
            document.getElementById('roleBtn').className = "btn btn-sm btn-warning fw-bold text-dark";
        } else {
            alert("PIN Incorrecto. Acceso Denegado.");
        }
    } else {
        userRole = 'operador';
        document.body.classList.remove('supervisor-mode'); 
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.getElementById('roleBtn').innerHTML = "👤 Modo: Operador";
        document.getElementById('roleBtn').className = "btn btn-sm btn-outline-secondary fw-bold";
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

// --- EXPORTACIÓN GENERAL Y LOG DE DATOS INDIVIDUAL ---
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

function exportDeviceLog(deviceId, deviceName) {
    if (userRole !== 'supervisor') return; 
    
    const logs = dataLogger[deviceId];
    if (!logs || logs.length === 0) {
        alert("Aún no hay suficientes datos registrados para esta máquina.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\n";
    csvContent += `REPORTE DE DATA LOGGING - ${deviceName.toUpperCase()}\n`;
    csvContent += `Generado el: ${new Date().toLocaleString('es-ES')}\n\n`;
    
    csvContent += "Hora,Temp (°C),RPM,Vibracion (mm/s),OEE (%),Estatus,Causa de Paro,Operador\n";
    
    logs.forEach(row => {
        csvContent += `${row.time},${row.temp},${row.rpm},${row.vibration},${row.oee},${row.status},${row.cause},${row.operator}\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Log_${deviceName.replace(/\s+/g, '_')}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}