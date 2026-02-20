const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let myChart;
let useLocalMode = false;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    fetchDevices();
    // Ciclo principal de actualización cada 2 segundos
    setInterval(mainLoop, 2000); 
});

async function mainLoop() {
    if(useLocalMode) {
        simulatePhysicsLocal(); 
        renderControl(devicesCache);
        updateChart(devicesCache);
    } else {
        await simulatePhysicsAndSave();
        await fetchDevices();
        await renderHistoryTable();
    }
}

// --- COMUNICACIÓN API ---
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
                threshold: d.threshold || 90,
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
    renderControl(devicesCache);
    renderAdmin(devicesCache);
    updateChart(devicesCache);
}

// --- RENDERS ---
function renderControl(mixers) {
    const grid = document.getElementById('mixerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    mixers.forEach(m => {
        const temp = parseFloat(m.sensorValue).toFixed(0);
        const isOn = m.status;
        const isDanger = temp >= m.threshold;
        let borderClass = isOn ? 'border-on' : 'border-off';
        let statusColor = isOn ? '#00ff9d' : '#666';
        if (isDanger) { borderClass = 'border-danger'; statusColor = '#ff2a2a'; }

        grid.innerHTML += `
        <div class="col-md-4 mb-4">
            <div class="card h-100 ${borderClass}">
                <div class="card-body text-center position-relative">
                    <div style="position: absolute; top: 15px; right: 15px; width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 8px ${statusColor}"></div>
                    <h5 class="text-white mb-3">${m.name}</h5>
                    <div class="mixer-icon mb-2 ${isOn ? 'vibrating' : ''}" style="color: ${isOn ? '#fff' : '#444'}">⚙️</div>
                    <div class="temp-display my-3" style="color: ${statusColor}">${temp}°C</div>
                    <button onclick="toggleMixer('${m.id}', ${isOn})" class="btn w-100 ${isOn ? 'btn-outline-danger' : 'btn-outline-info'}">
                        ${isOn ? '🛑 DETENER' : '⚡ INICIAR'}
                    </button>
                </div>
            </div>
        </div>`;
    });
}

async function renderHistoryTable() {
    try {
        const res = await fetch(DEVICES_URL);
        const data = await res.json();
        const history = [...data].sort((a, b) => b.id - a.id).slice(0, 10);
        
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = history.map(log => {
            const date = log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Reciente';
            const statusBadge = log.status ? 
                '<span class="badge bg-success bg-opacity-25 text-success border border-success">Activo</span>' : 
                '<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary">Paro</span>';
            
            return `
                <tr>
                    <td class="fw-bold text-info">${log.deviceId || 'Sistema'}</td>
                    <td>${parseFloat(log.value).toFixed(1)}°C</td>
                    <td>${statusBadge}</td>
                    <td class="text-muted italic">${log.message || 'Sin reporte'}</td>
                    <td>${date}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {}
}

function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = '';
    mixers.forEach(m => {
        tbody.innerHTML += `<tr><td>${m.name}</td><td>${m.threshold}°C</td><td><button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger">✕</button></td></tr>`;
    });
}

// --- LÓGICA DE FÍSICA Y CONTROL ---
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
                body: JSON.stringify({ 
                    value: mixer.sensorValue,
                    deviceId: mixer.name,
                    status: mixer.status,
                    message: currentMsg
                })
            });
        } catch(e) {}
    }
}

async function toggleMixer(id, current) {
    const mixer = devicesCache.find(d => d.id == id);
    if(mixer) {
        mixer.status = !current;
        const msg = mixer.status ? "Inicio manual" : "Paro manual";
        if(!useLocalMode) {
            await fetch(`${DEVICES_URL}/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ status: mixer.status, message: msg })
            });
        }
        renderControl(devicesCache);
    }
}

// --- UTILIDADES ---
function updateStatus(text, type) {
    const badge = document.getElementById('connectionStatus');
    badge.innerText = text;
    badge.className = `badge rounded-pill bg-${type} bg-opacity-25 text-${type} border border-${type}`;
}

function initChart() {
    const ctx = document.getElementById('tempChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Temp', data: [], borderColor: '#00d4ff', fill: true, tension: 0.4 }] },
        options: { scales: { y: { grid: { color: '#333' } } }, animation: false }
    });
}

function updateChart(mixers) {
    if(!myChart) return;
    myChart.data.labels = mixers.map(m => m.name);
    myChart.data.datasets[0].data = mixers.map(m => m.sensorValue);
    myChart.update();
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

// --- EVENTOS DE FORMULARIO ---
document.getElementById('addMixerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        deviceId: document.getElementById('devName').value,
        threshold: document.getElementById('devThreshold').value,
        value: 20,
        status: false,
        message: "Dispositivo registrado"
    };
    await fetch(DEVICES_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    document.getElementById('addMixerForm').reset();
    fetchDevices();
});

async function deleteDev(id) {
    if(confirm("¿Eliminar?")) {
        await fetch(`${DEVICES_URL}/${id}`, { method: 'DELETE' });
        fetchDevices();
    }
}