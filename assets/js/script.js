const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let charts = {}; 
const MAX_DATAPOINTS = 15; 
let useLocalMode = false;
let searchQuery = ""; // Variable para guardar lo que el usuario busca

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    setInterval(mainLoop, 2000); 

    // Escuchador de eventos para la barra de búsqueda en tiempo real
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        // Forzamos un renderizado inmediato sin esperar los 2 segundos del ciclo
        renderControl(devicesCache);
        renderAdmin(devicesCache);
        updateCharts(devicesCache); 
    });
});

async function mainLoop() {
    if(useLocalMode) {
        simulatePhysicsLocal(); 
        renderControl(devicesCache);
        updateCharts(devicesCache); 
    } else {
        await simulatePhysicsAndSave();
        await fetchDevices();
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
    updateCharts(devicesCache); 
}

// --- RENDERS ---
function renderControl(mixers) {
    const grid = document.getElementById('mixerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    // Filtrar batidoras según la búsqueda
    const filteredMixers = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    
    if (filteredMixers.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center mt-5 text-muted"><h5>No se encontraron coincidencias 🔍</h5></div>';
        return;
    }

    filteredMixers.forEach(m => {
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

function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Filtrar batidoras según la búsqueda
    const filteredMixers = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));

    filteredMixers.forEach(m => {
        tbody.innerHTML += `<tr><td>${m.name}</td><td>${m.threshold}°C</td><td><button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger">✕</button></td></tr>`;
    });
}

// --- LÓGICA DINÁMICA DE GRÁFICAS E HISTORIAL ---
function updateCharts(mixers) {
    const container = document.getElementById('chartsContainer');
    if(!container) return;

    const currentTime = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const currentIds = mixers.map(m => m.id.toString());

    mixers.forEach(m => {
        const strId = m.id.toString();
        let chartDiv = document.getElementById(`chart-wrapper-${strId}`);
        
        // 1. Crear la tarjeta con Gráfica y Tabla si no existe
        if (!chartDiv) {
            chartDiv = document.createElement('div');
            chartDiv.className = 'col-lg-6 mb-3'; 
            chartDiv.id = `chart-wrapper-${strId}`;
            chartDiv.innerHTML = `
                <div class="card p-3 h-100 border-off">
                    <h5 class="text-center brand-tech mb-3" style="color: var(--neon-blue); font-size: 1.2rem;">${m.name}</h5>
                    <canvas id="canvas-${strId}" height="100"></canvas>
                    <div class="mt-4">
                        <p class="text-muted mb-2" style="font-size: 0.85rem; border-bottom: 1px solid #ffffff; padding-bottom: 5px;">📜 Últimos 10 registros</p>
                        <div class="table-responsive">
                            <table class="table table-sm table-dark-custom mb-0" style="font-size: 0.8rem;">
                                <thead>
                                    <tr>
                                        <th class="text-secondary">Temp</th>
                                        <th class="text-secondary">Estatus</th>
                                        <th class="text-secondary text-end">Hora</th>
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
                data: { labels: [], datasets: [{ label: 'Temp', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0, 212, 255, 0.1)', fill: true, tension: 0.4, pointRadius: 2 }] },
                options: { responsive: true, animation: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' }, suggestedMin: 15, suggestedMax: parseInt(m.threshold) + 10 }, x: { grid: { color: '#333' }, ticks: { color: '#888', font: {size: 10} } } } }
            });
        }

        // --- FILTRO DE BÚSQUEDA VISUAL ---
        // Ocultamos o mostramos el contenedor según la búsqueda, pero NO dejamos de procesar los datos
        const isVisible = m.name.toLowerCase().includes(searchQuery);
        if (isVisible) {
            chartDiv.classList.remove('d-none');
        } else {
            chartDiv.classList.add('d-none');
        }

        // 2. Actualizar los datos de la gráfica (Aun estando ocultos)
        const chart = charts[strId];
        const dataset = chart.data.datasets[0];
        const isDanger = m.sensorValue >= m.threshold;
        
        dataset.borderColor = isDanger ? '#ff2a2a' : (m.status ? '#00ff9d' : '#00d4ff');
        dataset.backgroundColor = isDanger ? 'rgba(255, 42, 42, 0.1)' : (m.status ? 'rgba(0, 255, 157, 0.1)' : 'rgba(0, 212, 255, 0.1)');

        chart.data.labels.push(currentTime);
        dataset.data.push(m.sensorValue);

        if (chart.data.labels.length > MAX_DATAPOINTS) {
            chart.data.labels.shift();
            dataset.data.shift();
        }
        chart.update();

        // 3. Actualizar la mini-tabla de historial (Aun estando ocultos)
        const tbody = document.getElementById(`history-${strId}`);
        const statusBadge = m.status ? 
            '<span class="badge bg-success bg-opacity-25 text-success border border-success" style="font-size: 0.7rem;">Activo</span>' : 
            '<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary" style="font-size: 0.7rem;">Paro</span>';
        
        let tempColor = isDanger ? 'text-danger fw-bold' : 'text-light';
        
        const newRow = `
            <tr>
                <td class="${tempColor}">${parseFloat(m.sensorValue).toFixed(1)}°C</td>
                <td>${statusBadge}</td>
                <td class="text-end text-muted">${currentTime}</td>
            </tr>
        `;

        tbody.insertAdjacentHTML('afterbegin', newRow);
        while(tbody.children.length > 10) {
            tbody.removeChild(tbody.lastChild);
        }
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
function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const filteredMixers = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    
    filteredMixers.forEach(m => {
        tbody.innerHTML += `
        <tr>
            <td>${m.name}</td>
            <td>${m.threshold}°C</td>
            <td>
                <button onclick="openEditModal('${m.id}')" class="btn btn-sm btn-outline-info me-2">Editar</button>
                <button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger">✕</button>
            </td>
        </tr>`;
    });
}

// --- LÓGICA DE EDICIÓN (MODAL) ---
function openEditModal(id) {
    // Buscar los datos actuales del dispositivo
    const mixer = devicesCache.find(m => m.id === id);
    if (mixer) {
        // Llenar los campos del formulario modal
        document.getElementById('editId').value = mixer.id;
        document.getElementById('editName').value = mixer.name;
        document.getElementById('editThreshold').value = mixer.threshold;
        
        // Mostrar el modal usando Bootstrap JS
        const editModal = new bootstrap.Modal(document.getElementById('editModal'));
        editModal.show();
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const newName = document.getElementById('editName').value;
    const newThreshold = document.getElementById('editThreshold').value;

    if (!useLocalMode) {
        // Enviar la actualización a MockAPI
        try {
            await fetch(`${DEVICES_URL}/${id}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ deviceId: newName, threshold: newThreshold }) 
            });
        } catch(error) {
            console.error("Error al actualizar", error);
        }
    } else {
        // Actualizar localmente si no hay conexión
        const mixer = devicesCache.find(m => m.id === id);
        if (mixer) {
            mixer.name = newName;
            mixer.threshold = newThreshold;
        }
    }

    // Ocultar el modal
    const modalEl = document.getElementById('editModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    modalInstance.hide();

    // Refrescar los datos en pantalla
    fetchDevices();
});