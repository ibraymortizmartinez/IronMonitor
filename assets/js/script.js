const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let charts = {}; 
const MAX_DATAPOINTS = 15; 
let useLocalMode = false;
let searchQuery = ""; 

// Guardamos valores anteriores para calcular las flechas de tendencia (sube/baja)
let lastValuesMap = {}; 

document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    setInterval(mainLoop, 2000); 

    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderControl(devicesCache);
        renderAdmin(devicesCache);
        updateCharts(devicesCache); 
    });
});

async function mainLoop() {
    // Guardamos las temperaturas antes de simular o descargar nuevas
    devicesCache.forEach(d => lastValuesMap[d.id] = d.sensorValue);

    if(useLocalMode) {
        simulatePhysicsLocal(); 
    } else {
        await simulatePhysicsAndSave();
        await fetchDevices();
    }
    
    renderControl(devicesCache);
    updateCharts(devicesCache); 
    renderAdmin(devicesCache);
}

async function fetchDevices() {
    try {
        const res = await fetch(DEVICES_URL);
        if (!res.ok) throw new Error("Error API");
        const rawData = await res.json();
        
        if (rawData.length === 0) {
             if(!useLocalMode) devicesCache = getLocalData(); 
             useLocalMode = true; 
             updateStatus('API VACÍA', 'warning');
        } else {
            devicesCache = rawData.map(d => ({
                id: d.id,
                name: d.deviceId || "Sin Nombre",
                sensorValue: parseFloat(d.value) || 20,
                status: d.status !== undefined ? d.status : false, 
                threshold: parseFloat(d.threshold) || 90,
                message: d.message || "Operación Normal"
            }));
            useLocalMode = false;
            updateStatus('EN LÍNEA', 'success');
        }
    } catch (error) {
        useLocalMode = true;
        updateStatus('OFFLINE (DEMO)', 'danger');
        if (devicesCache.length === 0) devicesCache = getLocalData();
    }
}

// --- RENDERS ---
function renderControl(mixers) {
    const grid = document.getElementById('mixerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const filteredMixers = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    
    if (filteredMixers.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center mt-5 text-muted"><h5>No se encontraron coincidencias 🔍</h5></div>';
        return;
    }

    const nowStr = new Date().toLocaleTimeString('es-ES'); // Hora de última actualización

    filteredMixers.forEach(m => {
        const temp = parseFloat(m.sensorValue).toFixed(0);
        const isOn = m.status;
        const isDanger = temp >= m.threshold;
        
        let borderClass = isOn ? 'border-on' : 'border-off';
        let statusColor = isOn ? '#00ff9d' : '#666';
        if (isDanger) { borderClass = 'border-danger'; statusColor = '#ff2a2a'; }

        // Lógica de flechas de tendencia
        let prevVal = lastValuesMap[m.id] !== undefined ? lastValuesMap[m.id] : m.sensorValue;
        let trendIcon = '➖';
        let trendClass = 'text-trend-stable';
        
        if (m.sensorValue > prevVal) {
            trendIcon = '⬆️'; trendClass = 'text-trend-up';
        } else if (m.sensorValue < prevVal) {
            trendIcon = '⬇️'; trendClass = 'text-trend-down';
        }

        // Lógica de Barra de Progreso
        let progressPercent = (m.sensorValue / m.threshold) * 100;
        if (progressPercent > 100) progressPercent = 100;
        
        let progressColor = '#00d4ff'; // Azul por defecto
        if (progressPercent > 70) progressColor = '#ffc107'; // Amarillo si se acerca
        if (progressPercent >= 90) progressColor = '#ff2a2a'; // Rojo si es peligro

        // Animaciones dinámicas
        const gearAnim = isOn ? 'spin-gear' : '';
        const ledAnim = isOn ? 'led-blink' : '';

        grid.innerHTML += `
        <div class="col-md-4 mb-4">
            <div class="card h-100 ${borderClass}">
                <div class="card-body text-center position-relative">
                    
                    <div class="${ledAnim}" style="position: absolute; top: 15px; right: 15px; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor};"></div>
                    
                    <h5 class="text-white mb-3 fw-bold">${m.name}</h5>
                    
                    <div class="mb-2 ${gearAnim}" style="color: ${isOn ? 'var(--neon-blue)' : '#444'}; font-size: 3.5rem;">⚙️</div>
                    
                    <div class="my-2 d-flex justify-content-center align-items-center" style="font-family: 'Orbitron'; font-size: 2.5rem; font-weight: bold; color: ${statusColor}">
                        ${temp}°C <span class="${trendClass} ms-2" style="font-size: 1.5rem; font-family: 'Roboto';">${trendIcon}</span>
                    </div>

                    <div class="px-2 mb-4 text-start">
                        <div class="d-flex justify-content-between text-muted" style="font-size: 0.75rem; margin-bottom: 2px;">
                            <span>Actual</span>
                            <span>Límite: ${m.threshold}°C</span>
                        </div>
                        <div class="progress-container">
                            <div class="progress-bar" style="width: ${progressPercent}%; background-color: ${progressColor};"></div>
                        </div>
                    </div>

                    <button onclick="toggleMixer('${m.id}', ${isOn})" class="btn w-100 fw-bold ${isOn ? 'btn-outline-danger' : 'btn-outline-info'}">
                        ${isOn ? '🛑 DETENER' : '⚡ INICIAR'}
                    </button>

                    <div class="mt-3 text-secondary" style="font-size: 0.75rem;">
                        ⏱️ Act: ${nowStr}
                    </div>
                </div>
            </div>
        </div>`;
    });
}

function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const filteredMixers = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));

    filteredMixers.forEach(m => {
        const statusLabel = m.status ? '<span class="text-success fw-bold" style="font-size: 0.8rem;">● ACTIVO</span>' : '<span class="text-secondary" style="font-size: 0.8rem;">● PARO</span>';
        const isNearLimit = (m.threshold - m.sensorValue) <= 5 && m.status;
        const tempClass = isNearLimit ? 'text-warning fw-bold pulse-alert' : 'text-dark';

        tbody.innerHTML += `
        <tr>
            <td class="text-muted" style="font-size: 0.8rem;">#${m.id}</td>
            <td class="fw-bold text-dark">${m.name}</td>
            <td>${statusLabel}</td>
            <td class="${tempClass}">${parseFloat(m.sensorValue).toFixed(1)}°C</td>
            <td class="text-dark">${m.threshold}°C</td>
            <td>
                <div class="btn-group">
                    <button onclick="openEditModal('${m.id}')" class="btn btn-sm btn-outline-info me-2" title="Editar">✏️</button>
                    <button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar">✕</button>
                </div>
            </td>
        </tr>`;
    });
}

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
                            <table class="table table-sm table-dark mb-0" style="font-size: 0.8rem; background-color: transparent;">
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
        
        const newRow = `<tr><td class="${tempColor} border-bottom border-dark">${parseFloat(m.sensorValue).toFixed(1)}°C</td><td class="border-bottom border-dark">${statusBadge}</td><td class="text-end text-muted border-bottom border-dark">${currentTime}</td></tr>`;
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

// --- FÍSICA Y CONTROL ---
async function simulatePhysicsAndSave() {
    for (let mixer of devicesCache) {
        let currentMsg = "Operación Normal";
        if (mixer.status) mixer.sensorValue += 2.5;
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

async function toggleMixer(id, current) {
    const mixer = devicesCache.find(d => d.id == id);
    if(mixer) {
        mixer.status = !current;
        if(!useLocalMode) {
            await fetch(`${DEVICES_URL}/${id}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ status: mixer.status, message: mixer.status ? "Inicio manual" : "Paro manual" })
            });
        }
        renderControl(devicesCache);
    }
}

// PARO DE EMERGENCIA GLOBAL
async function emergencyStopAll() {
    if(!confirm("⚠️ ADVERTENCIA: ¿Estás seguro que deseas DETENER TODAS las máquinas?")) return;
    
    devicesCache.forEach(m => {
        if(m.status) m.status = false;
    });
    renderControl(devicesCache);
    
    if(!useLocalMode) {
        for (let mixer of devicesCache) {
            try {
                await fetch(`${DEVICES_URL}/${mixer.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ status: false, message: "🛑 PARO DE EMERGENCIA EJECUTADO" })
                });
            } catch(e) { console.error("Error al detener máquina:", mixer.id); }
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
    return [{ id: "1", name: "Batidora Demo", status: false, sensorValue: 20, threshold: 80 }];
}

function simulatePhysicsLocal() {
    devicesCache.forEach(mixer => {
        if (mixer.status) mixer.sensorValue += 2;
        else mixer.sensorValue -= 1;
        if (mixer.sensorValue < 20) mixer.sensorValue = 20;
    });
}

// --- EVENTOS Y FORMULARIOS ---
document.getElementById('addMixerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { deviceId: document.getElementById('devName').value, threshold: document.getElementById('devThreshold').value, value: 20, status: false, message: "Dispositivo registrado" };
    await fetch(DEVICES_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    document.getElementById('addMixerForm').reset();
    fetchDevices();
});

async function deleteDev(id) {
    if(confirm("¿Eliminar dispositivo?")) { await fetch(`${DEVICES_URL}/${id}`, { method: 'DELETE' }); fetchDevices(); }
}

function openEditModal(id) {
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

function exportToCSV() {
    if (devicesCache.length === 0) { alert("No hay datos para exportar."); return; }
    let csvContent = "data:text/csv;charset=utf-8,\nID,Dispositivo,Estado,Temperatura_Actual,Limite_Seguridad\n";
    devicesCache.forEach(m => {
        csvContent += `${m.id},${m.name.replace(/,/g, '')},${m.status ? "ACTIVO" : "PARO"},${parseFloat(m.sensorValue).toFixed(2)},${m.threshold}\n`;
    });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Reporte_IronMonitor.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}