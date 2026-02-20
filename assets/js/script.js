const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let charts = {}; // Diccionario para guardar las gráficas individuales
const MAX_DATAPOINTS = 15; // Límite de puntos en el tiempo a mostrar
let useLocalMode = false;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    // Ciclo principal de actualización cada 2 segundos
    setInterval(mainLoop, 2000); 
});

async function mainLoop() {
    if(useLocalMode) {
        simulatePhysicsLocal(); 
        renderControl(devicesCache);
        updateCharts(devicesCache); // Llama a la nueva función de gráficas
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
    updateCharts(devicesCache); // Llama a la nueva función de gráficas
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
    if(!tbody) return;
    tbody.innerHTML = '';
    mixers.forEach(m => {
        tbody.innerHTML += `<tr><td>${m.name}</td><td>${m.threshold}°C</td><td><button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger">✕</button></td></tr>`;
    });
}

// --- LÓGICA DINÁMICA DE GRÁFICAS ---
function updateCharts(mixers) {
    const container = document.getElementById('chartsContainer');
    if(!container) return;

    // Obtener la hora actual para el eje X
    const currentTime = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const currentIds = mixers.map(m => m.id.toString());

    mixers.forEach(m => {
        const strId = m.id.toString();
        let chartDiv = document.getElementById(`chart-wrapper-${strId}`);
        
        // Si la batidora no tiene su gráfica aún, la creamos
        if (!chartDiv) {
            chartDiv = document.createElement('div');
            chartDiv.className = 'col-md-6 mb-3'; // Dos gráficas por fila en PC
            chartDiv.id = `chart-wrapper-${strId}`;
            chartDiv.innerHTML = `
                <div class="p-3 border border-secondary rounded" style="background-color: #1a1a25;">
                    <h6 class="text-center" style="color: var(--neon-blue); font-family: 'Orbitron', sans-serif;">${m.name}</h6>
                    <canvas id="canvas-${strId}" height="150"></canvas>
                </div>
            `;
            container.appendChild(chartDiv);

            const ctx = document.getElementById(`canvas-${strId}`).getContext('2d');
            charts[strId] = new Chart(ctx, {
                type: 'line',
                data: { 
                    labels: [], 
                    datasets: [{ 
                        label: 'Temp (°C)', 
                        data: [], 
                        borderColor: '#00d4ff', 
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        fill: true, 
                        tension: 0.4,
                        pointRadius: 2
                    }] 
                },
                options: { 
                    responsive: true,
                    animation: false, // Apagado para evitar parpadeos en cada ciclo
                    plugins: { legend: { display: false } },
                    scales: { 
                        y: { grid: { color: '#333' }, suggestedMin: 15, suggestedMax: parseInt(m.threshold) + 10 },
                        x: { grid: { color: '#333' }, ticks: { color: '#888', font: {size: 10} } }
                    } 
                }
            });
        }

        // Actualizamos los datos de la gráfica de esta batidora
        const chart = charts[strId];
        const dataset = chart.data.datasets[0];
        
        // Cambiar color si está en peligro o apagada
        const isDanger = m.sensorValue >= m.threshold;
        dataset.borderColor = isDanger ? '#ff2a2a' : (m.status ? '#00ff9d' : '#00d4ff');
        dataset.backgroundColor = isDanger ? 'rgba(255, 42, 42, 0.1)' : (m.status ? 'rgba(0, 255, 157, 0.1)' : 'rgba(0, 212, 255, 0.1)');

        // Agregar el nuevo dato en el tiempo
        chart.data.labels.push(currentTime);
        dataset.data.push(m.sensorValue);

        // Mantener solo los últimos X puntos en el histórico de la gráfica
        if (chart.data.labels.length > MAX_DATAPOINTS) {
            chart.data.labels.shift();
            dataset.data.shift();
        }

        chart.update();
    });

    // Limpieza: Eliminar gráficas de dispositivos que fueron borrados en el Admin
    Object.keys(charts).forEach(id => {
        if (!currentIds.includes(id)) {
            charts[id].destroy(); 
            delete charts[id];
            const wrapper = document.getElementById(`chart-wrapper-${id}`);
            if (wrapper) wrapper.remove();
        }
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
    if(confirm("¿Eliminar dispositivo?")) {
        await fetch(`${DEVICES_URL}/${id}`, { method: 'DELETE' });
        fetchDevices();
    }
}