const API_URL = 'https://698a1871c04d974bc6a1579f.mockapi.io/api/v1'; 
const DEVICES_URL = `${API_URL}/logs`; 

let devicesCache = [];
let charts = {}; 
const MAX_DATAPOINTS = 10; // Rúbrica: Últimos 10 estatus
let deviceHistory = {}; // Almacenará el historial para las tablas y el CSV
let useLocalMode = false;
let globalStop = false; // Bandera de seguridad industrial

let searchQuery = ""; 
let filterState = "all";
let sortState = "id";
let userRole = "operador"; 
let audioCtx = null;
let startTime = Date.now();
const HOLD_TIME = 30; // Tiempo de retención

// --- ESTADÍSTICAS GLOBALES DEL TURNO ---
let sessionStats = {
    totalChecked: 0,
    totalOk: 0,
    totalFail: 0
};

window.registrarResultadoCiclo = function(deviceId) {
    let fallasEnEsteCiclo = 0;
    
    // 1. Contar fallas guardadas en la memoria para esta cámara
    for(let i = 0; i < 12; i++) {
        if(localStorage.getItem(`fail_dev_${deviceId}_bot_${i}`) === 'true') {
            fallasEnEsteCiclo++;
        }
    }

    // 2. Sumar a las estadísticas globales
    sessionStats.totalChecked += 12;
    sessionStats.totalFail += fallasEnEsteCiclo;
    sessionStats.totalOk += (12 - fallasEnEsteCiclo);

    // 3. Crear el mensaje para la terminal
    const msg = `Resumen Ciclo: ${12 - fallasEnEsteCiclo} OK / ${fallasEnEsteCiclo} FALLAS`;
    
    // Si hay fallas usamos color naranja (warning), si no, verde (success)
    const colorLog = fallasEnEsteCiclo > 0 ? "text-warning" : "text-success";
    logEvent(`MÁQUINA ${deviceId}`, msg, colorLog);

    // 4. Actualizar los números en la pantalla (Header)
    if (typeof updateHeaderStats === "function") {
        updateHeaderStats();
    }
};

// Actualiza el Uptime y datos del footer
function updateFooter() {
    // 1. Contador de Nodos
    const total = devicesCache.length;
    const activos = devicesCache.filter(d => d.status).length;
    const nodesEl = document.getElementById('active-nodes');
    if(nodesEl) nodesEl.innerText = `${activos}/${total}`;

    // 2. Reloj de Uptime
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    const uptimeEl = document.getElementById('uptime-clock');
    if(uptimeEl) uptimeEl.innerText = `${hrs}:${mins}:${secs}`;

    // 3. Simulación de Latencia API
    const latencyEl = document.getElementById('api-latency');
    if(latencyEl) {
        const fakeLatency = Math.floor(Math.random() * (45 - 18) + 18);
        latencyEl.innerText = `${fakeLatency}ms`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    setInterval(mainLoop, 2000); 
    setInterval(() => { 
        const clockEl = document.getElementById('clock');
        if (clockEl) clockEl.innerText = new Date().toLocaleTimeString(); 
    }, 1000);

    document.getElementById('searchInput')?.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); triggerRender(); });
    document.getElementById('filterSelect')?.addEventListener('change', (e) => { filterState = e.target.value; triggerRender(); });
    document.getElementById('sortSelect')?.addEventListener('change', (e) => { sortState = e.target.value; triggerRender(); });
    
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    
    logEvent("SISTEMA", "HMI Iniciado. Conectando a sensores...", "text-success");
});

// --- SISTEMA DE NOTIFICACIONES (TOASTS) Y LOGS ---
function showToast(message, type = 'info') {
    let bg = type === 'danger' ? 'bg-danger' : (type === 'success' ? 'bg-success' : (type === 'warning' ? 'bg-warning text-dark' : 'bg-primary'));
    let toastHTML = `
        <div class="toast align-items-center text-white ${bg} border-0 show" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex"><div class="toast-body fw-bold"><i class="fas fa-info-circle"></i> ${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>
        </div>`;
    const container = document.getElementById('toastContainer');
    if (container) {
        container.insertAdjacentHTML('beforeend', toastHTML);
        setTimeout(() => { if(container.firstChild) container.removeChild(container.firstChild); }, 4000);
    }
}

function logEvent(machineName, action, type = 'text-secondary') {
    const time = new Date().toLocaleTimeString();
    const logStr = `<div class="${type}">> [${time}] ${machineName}: ${action}</div>`;
    const term = document.getElementById('terminalOutput');
    if (term) term.insertAdjacentHTML('afterbegin', logStr);
}

// --- PARO GENERAL Y ATAJOS DE TECLADO ---
window.ejecutarParoGeneral = async function() {
    globalStop = true;
    playBuzzer();
    showToast("¡PARO GENERAL ACTIVADO!", "danger");
    logEvent("SISTEMA CENTRAL", "PARO DE EMERGENCIA EJECUTADO", "text-danger fw-bold");
    
    devicesCache.forEach(d => {
        d.phase = 'OPEN'; // Regresamos a estado seguro (abierto/despresurizado)
        d.status = false;
        d.alarma = true;
        saveApiState(d);
    });

    const modalEl = document.getElementById('paroModal');
    if(modalEl) bootstrap.Modal.getInstance(modalEl).hide();
    
    triggerRender();
}

document.addEventListener('keydown', (e) => {
    // Paro General con Barra Espaciadora
    if(e.code === 'Space' && e.target.tagName !== 'INPUT' && !globalStop) {
        e.preventDefault();
        const modalEl = document.getElementById('paroModal');
        if(modalEl) new bootstrap.Modal(modalEl).show();
    }
});

// --- MOTOR PRINCIPAL ---
async function mainLoop() {
    if(globalStop) return; // Congela la simulación si hay paro general

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
    updateFooter(); // Añadimos la actualización del footer aquí también
    
    if (userRole === 'supervisor') renderAdmin(devicesCache);
    
    // Lógica de visibilidad del botón de rearme
    const resetBtn = document.getElementById('resetContainer');
    if (resetBtn) {
        // Solo aparece si hay un PARO activo Y el usuario es SUPERVISOR
        if (globalStop && userRole === 'supervisor') {
            resetBtn.style.display = 'block';
        } else {
            resetBtn.style.display = 'none';
        }
    }
}

// --- RED Y DATOS ---
async function fetchDevices() {
    try {
        const res = await fetch(DEVICES_URL);
        if (!res.ok) throw new Error("Error API");
        const rawData = await res.json();
        
        if (rawData.length === 0) {
             useLocalMode = true;
             updateStatus('API VACÍA - MODO LOCAL', 'warning');
        } else {
            const now = Date.now();
            devicesCache = rawData.map(d => {
                const existing = devicesCache.find(x => x.id === d.id);
                const limAgua = parseFloat(d.waterLimit) || 100;
                const limPresion = parseFloat(d.pressureLimit) || parseFloat(d.Setpoint) || 10;

                return {
                    id: d.id, name: d.Nombre || `Máquina ${d.id}`, sensorValue: parseFloat(d.Valor_Actual) || 1000,
                    status: d.Estado !== undefined ? d.Estado : false, waterLimit: limAgua, pressureLimit: limPresion,
                    threshold: limPresion, water: d.water !== undefined ? parseFloat(d.water) : (existing ? existing.water : 0),
                    pressure: d.pressure !== undefined ? parseFloat(d.pressure) : (existing ? existing.pressure : 1000),
                    timer: d.timer !== undefined ? parseInt(d.timer) : (existing ? existing.timer : 0),
                    phase: d.phase || (existing ? existing.phase : 'IDLE'),
                    alarma: d.Alarma !== undefined ? d.Alarma : (existing ? existing.alarma : false), 
                    lastUpdate: now
                };
            });
            useLocalMode = false; updateStatus('EN LÍNEA', 'success');
        }
    } catch (error) { 
        useLocalMode = true;
        updateStatus('OFFLINE (DEMO)', 'danger'); 
    }
}

// --- MOTOR FÍSICO CORREGIDO ---
function simulatePhysicsLocal() {
    devicesCache.forEach(dev => {
        let prevPhase = dev.phase;

        switch(dev.phase) {
            case 'FILLING':
                dev.water += (dev.waterLimit * 0.15); 
                if (dev.water >= dev.waterLimit) { 
                    dev.water = dev.waterLimit; 
                    dev.phase = 'WATER_FULL'; 
                    dev.alarma = true; 
                    dev.status = false; 
                }
                break;

            case 'VACUUMING':
                dev.alarma = false; 
                dev.pressure -= 150; 

                // --- LÓGICA DE CUOTA MÍNIMA DE ERRORES ---
                let fallasActuales = 0;
                for(let i=0; i<12; i++) {
                    if(localStorage.getItem(`fail_dev_${dev.id}_bot_${i}`) === 'true') fallasActuales++;
                }

                // Si tiene menos de 2 fallas, aumentamos drásticamente la probabilidad
                let cuotaObjetivo = 2; // Queremos al menos 2 errores por cámara
                let probForzada = (fallasActuales < cuotaObjetivo) ? 0.15 : 0.005;

                if (Math.random() < probForzada) { 
                    const randomBottle = Math.floor(Math.random() * 12);
                    const key = `fail_dev_${dev.id}_bot_${randomBottle}`;
                    
                    if (localStorage.getItem(key) !== 'true') {
                        localStorage.setItem(key, 'true');
                        logEvent(dev.name, `CONTROL DE CALIDAD: Defecto detectado en Botella #${randomBottle + 1}`, "text-danger");
                        showToast(`Falla obligatoria detectada: Posición ${randomBottle + 1}`, "warning");
                        if(typeof playBuzzer === "function") playBuzzer(); 
                    }
                }

                // --- LÓGICA DE FALLA DIFERENCIADA ---
                let probBurbuja = (dev.id == "1") ? 0.03 : 0.005;

                if (Math.random() < probBurbuja) { 
                    const randomBottle = Math.floor(Math.random() * 12);
                    const key = `fail_dev_${dev.id}_bot_${randomBottle}`;
                    
                    if (localStorage.getItem(key) !== 'true') {
                        localStorage.setItem(key, 'true');
                        let msg = (dev.id == "1") 
                            ? `⚠️ FALLA RECURRENTE: Máquina 1 detectó burbuja en pos. ${randomBottle + 1}`
                            : `ALERTA SENSOR: Burbuja en Botella #${randomBottle + 1}`;
                        logEvent(dev.name, msg, "text-danger fw-bold");
                        showToast(msg, "danger");
                        if(typeof playBuzzer === "function") playBuzzer();
                    }
                }

                if (dev.pressure <= dev.pressureLimit) { 
                    dev.pressure = dev.pressureLimit;
                    dev.phase = 'HOLDING'; 
                    dev.timer = 0; 
                }
                break;

            case 'HOLDING':
                dev.timer += 2; // Incremento corregido del temporizador
                
                let probHolding = (dev.id == "1") ? 0.01 : 0.002;
                let fallaDetectada = false;

                if (Math.random() < probHolding) { 
                    const randomBottle = Math.floor(Math.random() * 12);
                    const key = `fail_dev_${dev.id}_bot_${randomBottle}`;
                    if (localStorage.getItem(key) !== 'true') {
                        localStorage.setItem(key, 'true');
                        logEvent(dev.name, `FALLO EN RETENCIÓN: Botella #${randomBottle + 1}`, "text-danger");
                        if(typeof playBuzzer === "function") playBuzzer();
                        fallaDetectada = true;
                    }
                }

                // Si se detecta una falla guardamos reporte en gráfica
                if (fallaDetectada) {
                    marcarFallaEnGrafica(dev.id, dev.pressure);
                    if(typeof takeSnapshot === "function") takeSnapshot(dev.id);
                }

                if (dev.timer >= HOLD_TIME) { 
                    dev.timer = HOLD_TIME;
                    dev.phase = 'DEPRESSURIZING'; 
                }
                break;

            case 'DEPRESSURIZING':
                dev.pressure += 200; 

                // Si la presión llega o supera el nivel atmosférico (1000 mb)
                if (dev.pressure >= 1000) { 
                    dev.pressure = 1000;
                    if (dev.phase !== 'OPEN') {
                        dev.phase = 'OPEN';
                        dev.status = false; 
                        dev.water = 0; 

                        if (typeof registrarResultadoCiclo === "function") {
                            registrarResultadoCiclo(dev.id);
                        }

                        logEvent(dev.name, "Ciclo finalizado: Cámara atmosférica.", "text-success");
                        if (typeof saveApiState === "function") saveApiState(dev);
                    }
                }
                break;
        }
        
        dev.sensorValue = dev.pressure;
        
        // Notificaciones de cambio de fase
        if (prevPhase !== dev.phase) {
            let logType = dev.phase === 'OPEN' ? 'text-warning' : 'text-info';
            logEvent(dev.name, `Cambió a fase: ${dev.phase}`, logType);
            
            if (dev.phase === 'WATER_FULL') {
                showToast(`${dev.name}: Llenado completado.`, 'warning');
            } else if (dev.phase === 'OPEN' && prevPhase === 'DEPRESSURIZING') {
                showToast(`${dev.name}: Ciclo finalizado exitosamente.`, 'success');
                playBeep(); 
            }
        }
    });
}

async function simulatePhysicsAndSave() {
    simulatePhysicsLocal(); 
    for (let dev of devicesCache) {
        try {
            await fetch(`${DEVICES_URL}/${dev.id}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    Valor_Actual: dev.sensorValue, Estado: dev.status, Alarma: dev.alarma,
                    water: dev.water, pressure: dev.pressure, timer: dev.timer, phase: dev.phase
                })
            });
        } catch(e) {}
    }
}

// --- CONTROL ---
window.cmdLlenar = async function(id) { 
    if(globalStop) return;
    let dev = devicesCache.find(d => d.id == id); 
    if(dev) { 
        dev.hasCounted = false;
        // Limpiar puntos rojos anteriores
        for(let i = 0; i < 12; i++) {
            localStorage.removeItem(`fail_dev_${id}_bot_${i}`);
        }

        dev.phase = 'FILLING';
        dev.status = true; 
        dev.alarma = false; 
        dev.water = 0; 
        dev.pressure = 1000; 
        dev.timer = 0;
        
        saveApiState(dev); 
        logEvent(dev.name, "Comando: Iniciar Llenado (Cámara Limpia)", "text-primary");
        triggerRender(); 
    } 
}
window.cmdIniciarVacio = async function(id) { 
    if(globalStop) return;
    let dev = devicesCache.find(d => d.id == id); 
    if(dev) { dev.phase = 'VACUUMING'; dev.status = true; dev.alarma = false; saveApiState(dev);
    logEvent(dev.name, "Comando: Iniciar Vacío", "text-primary"); triggerRender(); } 
}
window.cmdDespresurizar = async function(id) { 
    if(globalStop) return;
    let dev = devicesCache.find(d => d.id == id); 
    if(dev) { dev.phase = 'DEPRESSURIZING'; dev.status = true; dev.alarma = false; saveApiState(dev);
    logEvent(dev.name, "Comando: Despresurización manual", "text-warning"); triggerRender(); } 
}

async function saveApiState(dev) { 
    if(!useLocalMode) { 
        await fetch(`${DEVICES_URL}/${dev.id}`, { 
            method: 'PUT', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ Estado: dev.status, phase: dev.phase, water: dev.water, pressure: dev.pressure, timer: dev.timer }) 
        });
    } 
}

// --- AUDIO INDUSTRIAL ---
function playTone(frequency, type, duration, vol=0.1) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}
const playBeep = () => playTone(800, 'sine', 0.3, 0.1);
const playBuzzer = () => { playTone(150, 'sawtooth', 1, 0.4); setTimeout(()=>playTone(150, 'sawtooth', 1, 0.4), 1100); };

function checkHealthAndAlerts() { 
    let playAlarm = false; 
    devicesCache.forEach(m => { if (m.alarma && !globalStop) playAlarm = true; });
    if (playAlarm) playBeep(); 
}
function updateStatus(msg, type) { 
    const el = document.getElementById('connectionStatus'); 
    if(el) { el.innerText = msg; el.className = `badge rounded-pill bg-${type} border border-${type}`; } 
}

// --- FUNCIÓN PARA REGISTRAR FALLO DE BURBUJA ---
window.toggleBottle = function(deviceId, bottleIndex) {
    if(globalStop) return;
    
    const dev = devicesCache.find(d => d.id == deviceId);
    if (!dev || ['IDLE', 'OPEN'].includes(dev.phase)) {
        showToast("Acción no permitida: La cámara debe estar cerrada y con agua.", "warning");
        return;
    }

    const key = `fail_dev_${deviceId}_bot_${bottleIndex}`;
    const isAlreadyFailed = localStorage.getItem(key) === 'true';
    if(!isAlreadyFailed) {
        localStorage.setItem(key, 'true');
        logEvent(dev.name, `BOTELLA #${bottleIndex + 1}: BURBUJA DETECTADA`, "text-danger fw-bold");
        showToast(`Fuga detectada en Botella ${bottleIndex + 1} (${dev.name})`, "danger");
        if(typeof playBeep === "function") playBeep();
    } else {
        localStorage.removeItem(key);
        logEvent(dev.name, `BOTELLA #${bottleIndex + 1}: Fuga descartada por operador`, "text-secondary");
    }
    triggerRender();
}


function renderControl(mixers) {
    const grid = document.getElementById('mixerGrid'); 
    if(!grid) return; 
    grid.innerHTML = '';
    
    let filtered = mixers.filter(m => m.name.toLowerCase().includes(searchQuery));
    if (filterState === 'active') filtered = filtered.filter(m => m.status);
    filtered.sort((a,b) => parseInt(a.id) - parseInt(b.id));
    
    let rowHtml = `<div class="row g-4 justify-content-center w-100">`;
    
    filtered.forEach(m => {
        let statusText = "EN ESPERA"; 
        let borderClass = "border-off"; 
        let statusColor = "var(--neon-blue)";
        let progressPercent = 0; 
        let progressLabel = "Progreso";
        let iconAnim = "";

        // LÓGICA DE ESTADOS
        if (m.phase === 'FILLING') { 
            statusText = "LLENANDO (VÁLVULA ABIERTA)"; 
            borderClass = "border-on status-border-FILLING"; 
            progressPercent = (m.water / (m.waterLimit || 80)) * 100; 
            progressLabel = "Flujo de Agua"; 
            iconAnim = "pulse-breathe"; 
        }
        else if (m.phase === 'WATER_FULL') { 
            statusText = `${m.waterLimit || 80}L ALCANZADOS - PARO ACTIVO`; 
            borderClass = "border-warning pulse-alert"; 
            statusColor = "var(--neon-yellow)"; 
            progressPercent = 100; 
            progressLabel = "Flujo Detenido"; 
        }
        else if (m.phase === 'VACUUMING') { 
            statusText = "EXTRAYENDO AIRE...";
            borderClass = "border-on status-border-VACUUMING"; 
            statusColor = "var(--neon-aqua)"; 
            progressPercent = Math.min(((1000 - m.pressure) / (1000 - (m.pressureLimit || 250))) * 100, 100);
            progressLabel = "Vacío"; 
            iconAnim = "fa-spin"; 
        }
        else if (m.phase === 'HOLDING') { 
            statusText = "PRUEBA EN RETENCIÓN";
            borderClass = "border-info pulse-alert status-border-HOLDING"; 
            statusColor = "var(--neon-green)"; 
            const totalHold = (typeof HOLD_TIME !== 'undefined' && HOLD_TIME > 0) ? HOLD_TIME : 60;
            progressPercent = Math.max(0, Math.min(100, ((totalHold - m.timer) / totalHold) * 100)); 
            progressLabel = "Tiempo Restante";
        }
        else if (m.phase === 'DEPRESSURIZING') { 
            statusText = "DESPRESURIZANDO...";
            borderClass = "border-danger shadow-danger"; 
            statusColor = "var(--neon-red)"; 
            progressPercent = Math.min(((m.pressure - (m.pressureLimit || 250)) / (1000 - (m.pressureLimit || 250))) * 100, 100);
            progressLabel = "Retorno Atmosférico"; 
        }
        else if (m.phase === 'OPEN' || m.phase === 'IDLE') { 
            statusText = "PISTONES ABIERTOS / LISTO";
            borderClass = "border-secondary"; 
            statusColor = "#aaa"; 
            progressPercent = 0; 
        }
        
        if(globalStop) { 
            statusText = "PARO DE EMERGENCIA";
            borderClass = "border-danger pulse-danger"; 
            statusColor = "var(--neon-red)"; 
            iconAnim = "";
        }

        // LÓGICA DE TIEMPO Y BOTONES
        const isTimerActive = (m.phase === 'HOLDING' || m.modo === 'tiempo');
        const disabledBtn = globalStop ? 'disabled' : '';
        const disableDepressurize = (['IDLE', 'OPEN', 'DEPRESSURIZING', 'WATER_FULL'].includes(m.phase) || globalStop) ? 'disabled' : '';

        let actionBtn = "";
        if (m.phase === 'IDLE' || m.phase === 'OPEN') { 
            actionBtn = `<button onclick="cmdLlenar('${m.id}')" class="btn btn-action-start py-2 fw-bold w-100 mb-2" style="border-color: var(--neon-blue); color: var(--neon-blue);" ${disabledBtn}><i class="fas fa-tint"></i> LLENAR CÁMARA</button>`; 
        } 
        else if (m.phase === 'WATER_FULL') { 
            actionBtn = `<button onclick="cmdIniciarVacio('${m.id}')" class="btn btn-action-start py-2 fw-bold w-100 mb-2" style="background-color: var(--neon-aqua); color: #000;" ${disabledBtn}><i class="fas fa-wind"></i> GENERAR VACÍO</button>`; 
        }

        // REJILLA DE INSPECCIÓN
        let bottleGridHtml = `<div class="text-center mb-2"><small class="text-secondary uppercase" style="font-size:0.6rem;">Inspección de 12 Unidades</small></div><div class="bottle-grid mb-3">`;
        for(let i = 0; i < 12; i++) {
            const isFailed = localStorage.getItem(`fail_dev_${m.id}_bot_${i}`) === 'true';
            let bottleStatusClass = isFailed ? "fail" : (['HOLDING', 'VACUUMING'].includes(m.phase) ? "ok" : "");
            bottleGridHtml += `<div class="bottle-slot ${bottleStatusClass}" onclick="toggleBottle('${m.id}', ${i})">${i + 1}</div>`;
        }
        bottleGridHtml += `</div>`;

        // CONSTRUCCIÓN DEL ROW HTML
        rowHtml += `
        <div class="col-md-6 col-lg-4">
            <div class="card h-100 ${borderClass}" style="transition: all 0.3s ease; background-color: #1a1a2e;">
                <div class="card-body p-4 d-flex flex-column position-relative">
                    <h5 class="brand-tech mb-4 text-center" style="font-size: 1.1rem; color: #fff;">
                        <i class="fas fa-cube ${iconAnim}" style="color: ${statusColor};"></i> ${m.name}
                    </h5>
                    
                    <div class="row text-center mb-4">
                        <div class="col-4 px-1">
                            <small class="text-secondary fw-bold" style="font-size:0.65rem;">💧 AGUA</small>
                            <div class="fw-bold" style="color:var(--neon-blue); font-family:'Orbitron'; font-size:1rem;">
                                ${Number(m.water || 0).toFixed(0)}L
                            </div>
                        </div>
                        <div class="col-4 px-1 border-start border-end border-secondary">
                            <small class="text-secondary fw-bold" style="font-size:0.65rem;">🌪️ PRESIÓN</small>
                            <div class="fw-bold" style="color:var(--neon-aqua); font-family:'Orbitron'; font-size:1rem;">
                                ${Number(m.pressure || 0).toFixed(0)}
                            </div>
                        </div>
                        <div class="col-4 px-1">
                            <small class="text-secondary fw-bold" style="font-size:0.65rem;">⏱️ TIEMPO</small>
                            <div class="fw-bold" style="color:${isTimerActive ? 'var(--neon-yellow)' : '#555'}; font-family:'Orbitron'; font-size:1rem; text-shadow: ${isTimerActive ? '0 0 10px rgba(255,255,0,0.5)' : 'none'};">
                                ${isTimerActive ? (m.timer || 0) + 's' : '--'}
                            </div>
                        </div>
                    </div>

                    ${bottleGridHtml}

                    <div class="mb-4">
                        <div class="d-flex justify-content-between text-contrast fw-bold" style="font-size: 0.7rem; margin-bottom: 5px;">
                            <span style="color: #aaa;">${progressLabel}</span>
                            <span style="color: ${statusColor};">${Math.round(progressPercent)}%</span>
                        </div>
                        <div class="progress-container" style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden;">
                            <div class="progress-bar" style="width: ${progressPercent}%; background-color: ${statusColor}; transition: width 0.5s ease; box-shadow: 0 0 10px ${statusColor}66;"></div>
                        </div>
                    </div>

                    <div class="d-grid gap-2 mt-auto">
                        ${actionBtn}
                        <button onclick="cmdDespresurizar('${m.id}')" class="btn py-2 fw-bold btn-action-stop" ${disableDepressurize} 
                                style="border: 1px solid var(--neon-red); color: var(--neon-red); background: transparent;">
                            <i class="fas fa-door-open"></i> DESPRESURIZAR
                        </button>
                    </div>
                    
                    <div class="mt-3 text-center" style="font-size: 0.75rem; color: ${statusColor}; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; min-height: 1.2rem;">
                        ${statusText}
                    </div>
                </div>
            </div>
        </div>`;
    });

    rowHtml += `</div>`;
    grid.innerHTML = rowHtml;
}

// --- CONTRASEÑA, ROL Y CSV ---
window.toggleRole = function() {
    if (userRole === 'operador') {
        const pass = prompt("Acceso restringido. Ingrese contraseña de Supervisor (admin123):");
        if (pass !== 'admin123') { 
            showToast("Contraseña incorrecta", "danger"); 
            return; 
        }
        userRole = 'supervisor';
        showToast("Modo Supervisor Activado", "warning");
        logEvent("SEGURIDAD", "Acceso nivel Supervisor concedido", "text-warning");
    } else {
        userRole = 'operador';
        logEvent("SEGURIDAD", "Regreso a modo Operador", "text-secondary");
    }

    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        el.style.display = userRole === 'supervisor' ? 'block' : 'none';
    });
    
    const roleBtn = document.getElementById('roleBtn');
    if(roleBtn) {
        roleBtn.innerHTML = userRole === 'supervisor' ? `<i class="fas fa-user-shield"></i> Modo: Supervisor` : `👤 Modo: Operador`;
        roleBtn.className = userRole === 'supervisor' ? "btn btn-sm btn-warning fw-bold text-dark mt-1" : "btn btn-sm btn-outline-secondary fw-bold mt-1";
    }
    triggerRender();
};

window.downloadCSV = function() {
    if (userRole !== 'supervisor') {
        showToast("Acceso denegado: Se requieren permisos de Supervisor", "danger");
        return;
    }   
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "--- REPORTE DE TURNO - IRONMONITOR ---\n";
    csvContent += `Fecha del Reporte,${new Date().toLocaleString()}\n`;
    csvContent += `Total Botellas Procesadas,${sessionStats.totalChecked}\n`;
    csvContent += `Botellas Aprobadas (OK),${sessionStats.totalOk}\n`;
    csvContent += `Botellas Rechazadas (FAIL),${sessionStats.totalFail}\n`;
    
    let tasaCalidad = sessionStats.totalChecked > 0 ? ((sessionStats.totalOk / sessionStats.totalChecked) * 100).toFixed(2) : 0;
    csvContent += `Tasa de Calidad (%),${tasaCalidad}%\n`;
    
    if(window.sessionSnapshots && window.sessionSnapshots.length > 0) {
        csvContent += "\n--- INCIDENCIAS DETECTADAS (SNAPSHOTS) ---\n";
        csvContent += "Timestamp,Dispositivo,Presión (mb),Estado de Botellas\n";
        window.sessionSnapshots.forEach(s => {
            csvContent += `${s.timestamp},${s.machine},${s.pressure},"${s.bottles.join(' | ')}"\n`;
        });
    }

    csvContent += "\n--- HISTORIAL DETALLADO DE SENSORES ---\n";
    csvContent += "ID,Dispositivo,Hora,Fase,Agua (Litros),Presión (mbar)\n";
    
    for (let id in deviceHistory) {
        let devName = devicesCache.find(d => d.id == id)?.name || `Equipo ${id}`;
        deviceHistory[id].forEach(record => {
            let faseES = record.phase;
            if(faseES==='FILLING') faseES='Llenando'; 
            if(faseES==='WATER_FULL') faseES='Agua Lista';
            if(faseES==='VACUUMING') faseES='Extrayendo Aire'; 
            if(faseES==='HOLDING') faseES='Retencion';
            if(faseES==='DEPRESSURIZING') faseES='Despresurizando'; 
            if(faseES==='OPEN') faseES='Abierto';
            if(faseES==='IDLE') faseES='En Espera';

            csvContent += `${id},${devName},${record.time},${faseES},${record.water},${record.pressure}\n`;
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_Turno_IronMonitor_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); 
    link.click();
    document.body.removeChild(link);
    
    logEvent("SISTEMA", "Reporte consolidado exportado exitosamente", "text-success");
};

function renderAdmin(mixers) {
    const tbody = document.getElementById('adminTableBody'); if(!tbody) return; tbody.innerHTML = '';
    let filtered = mixers.filter(m => m.name.toLowerCase().includes(searchQuery)); filtered.sort((a,b) => parseInt(a.id) - parseInt(b.id));
    filtered.forEach(m => {
        const statusColor = m.status ? 'var(--neon-aqua)' : '#6c757d'; const statusText = m.status ? 'ACTIVO' : 'INACTIVO';
        let phaseText = m.phase; let phaseColor = '#aaa';
        if (m.phase === 'FILLING') { phaseText = 'LLENANDO'; phaseColor = 'var(--neon-blue)'; }
        else if (m.phase === 'WATER_FULL') { phaseText = 'AGUA AL LÍMITE'; phaseColor = 'var(--neon-yellow)'; }
        else if (m.phase === 'VACUUMING') { phaseText = 'EXTRAYENDO AIRE'; phaseColor = 'var(--neon-aqua)'; }
        else if (m.phase === 'HOLDING') { phaseText = 'EN RETENCIÓN'; phaseColor = 'var(--neon-aqua)'; }
        else if (m.phase === 'DEPRESSURIZING') { phaseText = 'DESPRESURIZANDO'; phaseColor = 'var(--neon-red)'; }

        tbody.innerHTML += `
        <tr style="vertical-align: middle; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td class="fw-bold" style="color: var(--neon-aqua);">#${m.id}</td><td class="fw-bold text-light">${m.name}</td>
            <td><span style="color: ${statusColor}; font-weight: bold;">● ${statusText}</span><br><small style="color: ${phaseColor}; font-size: 0.70rem; text-transform: uppercase;">[ ${phaseText} ]</small></td>
            <td class="text-center" style="font-family: 'Orbitron'; font-size: 0.85rem; background-color: rgba(0,0,0,0.2); border-radius: 5px;"><span style="color: #0055ff;">💧 ${m.water.toFixed(0)}L</span> <span style="color:#444;">|</span> <span style="color: #00d4ff;">🌪️ ${m.pressure.toFixed(0)}mb</span></td>
            <td class="text-center fw-bold text-contrast">Max: ${m.waterLimit}L <br> Max: ${m.pressureLimit}mb</td>
            <td><div class="d-flex gap-2 justify-content-center"><button onclick="openEditModal('${m.id}')" class="btn btn-sm btn-outline-info"><i class="fas fa-edit"></i></button><button onclick="deleteDev('${m.id}')" class="btn btn-sm btn-outline-danger"><i class="fas fa-times"></i></button></div></td>
        </tr>`;
    });
}

// CRUD
document.getElementById('addMixerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { Nombre: document.getElementById('devName').value, waterLimit: document.getElementById('devWaterLimit').value, pressureLimit: document.getElementById('devPressureLimit').value, Valor_Actual: 1000, Estado: false, phase: 'IDLE', water: 0, pressure: 1000, timer: 0 };
    await fetch(DEVICES_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    document.getElementById('addMixerForm').reset();
    fetchDevices();
    logEvent("ADMIN", `Nuevo equipo agregado: ${data.Nombre}`, "text-success");
});

window.deleteDev = async function(id) { if(confirm("¿Eliminar este equipo?")) { await fetch(`${DEVICES_URL}/${id}`, { method: 'DELETE' });
    fetchDevices(); logEvent("ADMIN", `Equipo ID:${id} eliminado`, "text-danger"); } }
window.openEditModal = function(id) { const dev = devicesCache.find(m => m.id === id);
    if (dev) { document.getElementById('editId').value = dev.id; document.getElementById('editName').value = dev.name; document.getElementById('editWaterLimit').value = dev.waterLimit; document.getElementById('editPressureLimit').value = dev.pressureLimit; new bootstrap.Modal(document.getElementById('editModal')).show();
    } }
document.getElementById('editForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('editId').value;
    await fetch(`${DEVICES_URL}/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ Nombre: document.getElementById('editName').value, waterLimit: document.getElementById('editWaterLimit').value, pressureLimit: document.getElementById('editPressureLimit').value }) });
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide(); fetchDevices();
    logEvent("ADMIN", `Equipo ID:${id} editado`, "text-info");
});

// --- GRÁFICAS Y TABLAS DE HISTORIAL ---
function updateCharts(mixers) {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    const now = new Date();
    const currentTime = now.toLocaleTimeString('es-ES', { hour12: false });

    mixers.forEach(m => {
        try {
            const strId = m.id.toString();

            if (!deviceHistory[strId]) deviceHistory[strId] = [];
            
            if (deviceHistory[strId].length === 0 || deviceHistory[strId][0].time !== currentTime) {
                deviceHistory[strId].unshift({ 
                    time: currentTime, 
                    phase: m.phase || 'IDLE', 
                    water: parseFloat(m.water || 0).toFixed(1), 
                    pressure: parseFloat(m.pressure || 0).toFixed(1) 
                });
            }
            if (deviceHistory[strId].length > 10) deviceHistory[strId].pop();

            let chartDiv = document.getElementById(`chart-wrapper-${strId}`);
            if (!chartDiv) {
                chartDiv = document.createElement('div');
                chartDiv.className = 'col-lg-6 mb-4'; 
                chartDiv.id = `chart-wrapper-${strId}`;
                chartDiv.innerHTML = `
                    <div class="card p-3 h-100 border-secondary" style="background-color: #1a1a2e; border-width: 2px; transition: all 0.3s ease;">
                        <h5 class="brand-tech m-0 mb-3" style="color: var(--neon-aqua); text-align: center;">
                            <i class="fas fa-chart-line"></i> TELEMETRÍA: ${m.name}
                        </h5>
                        <div style="height: 220px; position: relative;">
                            <canvas id="canvas-${strId}"></canvas>
                        </div>
                        
                        <div class="table-responsive mt-3 border border-secondary rounded" style="max-height: 200px; overflow-y: auto;">
                            <table class="table table-sm table-dark text-center mb-0" style="font-size: 0.7rem;">
                                <thead>
                                    <tr style="color: var(--neon-blue); position: sticky; top: 0; background: #1a1a2e;">
                                        <th>HORA</th><th>ESTADO</th><th>H2O</th><th>PRES.</th>
                                    </tr>
                                </thead>
                                <tbody id="history-table-${strId}"></tbody>
                            </table>
                        </div>
                    </div>`;
                container.appendChild(chartDiv);

                const ctx = document.getElementById(`canvas-${strId}`).getContext('2d');
                charts[strId] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            { label: 'Presión', yAxisID: 'y', data: [], borderColor: '#00d4ff', tension: 0.2, fill: true, backgroundColor: 'rgba(0, 212, 255, 0.05)', pointRadius: 1 },
                            { label: 'Agua', yAxisID: 'y1', data: [], borderColor: '#0055ff', tension: 0.2, fill: false, pointRadius: 1 },
                            { label: 'Límite', yAxisID: 'y', data: [], borderColor: '#ff2a2a', borderDash: [5, 5], pointRadius: 0, borderWidth: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, animation: false,
                        scales: {
                            y: { position: 'left', suggestedMin: 0, suggestedMax: 1100, ticks: { color: '#00d4ff', font: { size: 8 } } },
                            y1: { position: 'right', suggestedMin: 0, suggestedMax: 100, ticks: { color: '#0055ff', font: { size: 8 } }, grid: { drawOnChartArea: false } },
                            x: { ticks: { display: false } } 
                        },
                        plugins: { legend: { display: true, labels: { color: '#fff', font: { size: 9 }, boxWidth: 8 } } }
                    }
                });
            }

            const chart = charts[strId];
            if (chart) {
                chart.data.labels.push(currentTime);
                chart.data.datasets[0].data.push(m.pressure);
                chart.data.datasets[1].data.push(m.water);
                chart.data.datasets[2].data.push(m.pressureLimit || 250);

                if (chart.data.labels.length > 15) { 
                    chart.data.labels.shift();
                    chart.data.datasets.forEach(ds => ds.data.shift());
                }
                chart.update('none');
            }

            const cardElement = chartDiv.querySelector('.card');
            const fase = (m.phase || '').toUpperCase();
            let borderCol = '#444'; 
            let shadow = 'none';
            if (fase.includes('DEPRES')) {
                borderCol = '#ff2a2a';
                shadow = '0 0 15px rgba(255, 42, 42, 0.5)';
            } else if (fase.includes('FULL')) {
                borderCol = '#0055ff';
                shadow = '0 0 15px rgba(0, 85, 255, 0.4)';
            } else if (fase.includes('FILL')) {
                borderCol = '#ffff00';
                shadow = '0 0 15px rgba(255, 255, 0, 0.4)';
            } else if (fase.includes('OPEN') || fase.includes('VACUUM') || fase.includes('HOLD')) {
                borderCol = '#00f2ff';
                shadow = '0 0 10px rgba(0, 242, 255, 0.3)';
            }

            cardElement.style.borderColor = borderCol;
            cardElement.style.boxShadow = shadow;
            
            const tbody = document.getElementById(`history-table-${strId}`);
            if (tbody) {
                tbody.innerHTML = deviceHistory[strId].map(r => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td>${r.time}</td>
                        <td style="color: ${r.phase.includes('DEPRES') ? '#ff2a2a' : '#00f2ff'}; font-weight: bold;">${r.phase}</td>
                        <td>${r.water}</td>
                        <td>${r.pressure}</td>
                    </tr>`).join('');
            }

        } catch (e) {
            console.error("Error actualizando máquina:", m.id, e);
        }
    });
}

// Función para mostrar el Manual Estandarizado
window.verManual = function() {
    logEvent("SISTEMA", "Accediendo a Manual de Operación (POE)", "text-info");
    alert(
        "📋 MANUAL DE OPERACIÓN ESTANDARIZADO - IRONMONITOR v3.0\n" +
        "PROCEDIMIENTO DE PRUEBA DE ESTANQUEIDAD (Cierres Elásticos / Corchos)\n\n" +
        "Fase 1: PREPARACIÓN Y CARGA\n" +
        "• Verifique que el nivel de fluido cubra la muestra al menos 2.5 cm por encima del tapón.\n" +
        "• Asegure la escotilla de la cámara de acrílico antes de iniciar.\n\n" +
        "Fase 2: CICLO DE VACÍO (DEPRESSURIZING)\n" +
        "• Al accionar el arranque, el sistema extraerá la atmósfera hasta alcanzar el setpoint automático de 500 mbar (Rel: -0.50 bar).\n\n" +
        "Fase 3: INSPECCIÓN (HOLDING - 30s)\n" +
        "• El sistema mantendrá el vacío estrictamente durante 30 segundos.\n" +
        "• Criterio de Rechazo: Emisión de un hilo continuo y constante de burbujas. (1 a 3 burbujas aisladas al inicio se consideran falsos positivos por la porosidad del corcho).\n\n" +
        "Fase 4: ABORTO Y EMERGENCIA\n" +
        "• Pulse la [BARRA ESPACIADORA] en cualquier momento para ejecutar un Paro General."
    );
}

// Función para ver Protocolos de Seguridad Industrial
window.verProtocolos = function() {
    logEvent("SEGURIDAD", "Revisando protocolos de seguridad y normativas", "text-warning");
    alert(
        "⚠️ PROTOCOLOS DE SEGURIDAD INDUSTRIAL Y CALIDAD\n" +
        "Evaluación de hermeticidad referenciada bajo estándares normativos (ej. ASTM D3078)\n\n" +
        "REGLAS DE OPERACIÓN CRÍTICA:\n\n" +
        "1. PREVENCIÓN DE DESCORCHE: El límite del sistema está restringido a 500 mbar para evitar la expulsión violenta del tapón debido a la presión interna del espacio de cabeza.\n\n" +
        "2. INTERBLOQUEO MECÁNICO: Queda estrictamente prohibido intentar aperturar la cámara de prueba si la presión del manómetro no se encuentra ecualizada a la presión atmosférica (~1000 mbar).\n\n" +
        "3. RESPUESTA A ALARMAS: Ante activación de baliza roja o falla crítica, presione el PARO DE EMERGENCIA. El sistema bloqueará las funciones y requerirá credenciales de Supervisor para el rearme.\n\n" +
        "4. EQUIPO DE PROTECCIÓN (EPP): Por riesgo latente de implosión/explosión del envase de vidrio bajo presión negativa, es obligatorio el uso de gafas de seguridad (Norma ANSI Z87.1) frente al equipo."
    );
}
// --- FUNCIÓN DE REARME EXCLUSIVA ---
window.rearmarSistema = function() {
    if (userRole !== 'supervisor') {
        showToast("ACCESO DENEGADO: Solo el Supervisor puede rearmar el sistema.", "danger");
        return;
    }
    
    globalStop = false;
    logEvent("SEGURIDAD", "SISTEMA REARMADO POR SUPERVISOR", "text-success fw-bold");
    showToast("SISTEMA REOPERATIVO", "success");
    
    devicesCache.forEach(d => {
        d.phase = 'OPEN';
        d.alarma = false;
        d.status = false;
        saveApiState(d);
    });

    const resetBtn = document.getElementById('resetContainer');
    if (resetBtn) resetBtn.style.display = 'none';
    
    triggerRender(); 
}

window.marcarFallaEnGrafica = function(deviceId, valorPresion) {
    const chart = window[`chart_dev_${deviceId}`]; 
    if (chart) {
        chart.data.datasets[1].data.push({
            x: new Date().toLocaleTimeString(), 
            y: valorPresion                      
        });
        chart.update(); 
    }
};