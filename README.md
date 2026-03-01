# 🎛️ IronMonitor SCADA v3.0
> **Sistema de Control de Estanqueidad y Telemetría Industrial**

![Status](https://img.shields.io/badge/Status-Operativo-brightgreen?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-3.0.1--Stable-blue?style=for-the-badge)
![Tech](https://img.shields.io/badge/Tech-JavaScript_ES6-yellow?style=for-the-badge&logo=javascript)

## 📋 Descripción del Proyecto
IronMonitor es una solución HMI (Human-Machine Interface) desarrollada para el monitoreo y control de cámaras de prueba de estanqueidad. Permite supervisar en tiempo real variables críticas como la **presión atmosférica/vacío**, el **volumen de agua** y los **tiempos de retención**, asegurando la calidad en líneas de producción de botellas o envases.

El sistema simula un entorno físico industrial real, gestionando ciclos de llenado, vacío y despresurización con una precisión de milisegundos y sincronización en la nube.

---

## ✨ Características Principales

### 🔴 Control de Seguridad Industrial
- **Paro de Emergencia Global:** Bloqueo instantáneo de todos los procesos físicos mediante el botón SOS o la tecla `Espacio`.
- **Rearme de Seguridad:** Solo el personal con rol de **Supervisor** puede rearmar el sistema tras una emergencia.

### 🧪 Ciclo de Prueba Automatizado
1. **Llenado (Filling):** Control de flujo de agua con límites configurables.
2. **Vacío (Vacuuming):** Extracción de aire hasta alcanzar el setpoint de presión negativa.
3. **Retención (Holding):** Temporizador de precisión para la detección de micro-fugas.
4. **Despresurización:** Retorno seguro a la presión atmosférica.

### 📊 Gestión de Datos y Calidad
- **Panel de Telemetría:** Gráficas en tiempo real (Chart.js) para cada cámara.
- **Inspección de 12 Unidades:** Rejilla interactiva para marcar fallas por burbujeo en cada posición.
- **Exportación CSV:** Generación de reportes detallados para auditorías de calidad.

---

## 🛠️ Stack Tecnológico
- **Frontend:** HTML5, CSS3 (Custom Neon Styles), JavaScript (Módulos ES6).
- **Framework UI:** Bootstrap 5.
- **Gráficas:** Chart.js.
- **Backend/API:** MockAPI (RESTful API).
- **Audio:** Web Audio API para alarmas industriales.

---

## ⚙️ Configuración del Entorno

### 1. Backend (MockAPI)
El sistema requiere un endpoint llamado `logs`. El esquema de datos debe ser el siguiente:

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `Nombre` | String | Identificador de la máquina |
| `Estado` | Boolean | Estado de marcha/paro |
| `phase` | String | Fase actual (IDLE, FILLING, VACUUMING, etc.) |
| `water` | Number | Nivel actual de agua en Litros |
| `pressure` | Number | Presión actual en mbar |
| `timer` | Number | Segundos transcurridos en retención |
| `Alarma` | Boolean | Indicador de fallo activo |

### 2. Instalación Local
1. Clona este repositorio.
2. Abre `index.html` en un navegador moderno.
3. El sistema detectará automáticamente si la API está en línea; de lo contrario, activará el **Modo Demo (Offline)**.

---

## 🔐 Roles y Acceso
- **Operador:** Puede iniciar ciclos, marcar fallas en botellas y ver gráficas.
- **Supervisor:** - **Contraseña por defecto:** `admin123`
    - **Permisos:** Editar parámetros de cámaras, eliminar equipos, rearmar sistema tras paro y exportar reportes.

---

## ⌨️ Atajos de Teclado
| Tecla | Acción |
| :--- | :--- |
| `Barra Espaciadora` | **PARO DE EMERGENCIA** |
| `F5` | Sincronización forzada con servidor |

---

## 📸 Vista de la Interfaz
*La interfaz utiliza un diseño Dark-Mode con acentos neón para facilitar la lectura en entornos industriales (SCADA moderno).*

- **Azul Neon:** Agua / Llenado.
- **Aqua:** Vacío / Presión.
- **Amarillo/Naranja:** Alertas / Fase de Retención.
- **Rojo:** Paro de Emergencia / Falla de botella.

---

## ✒️ Autor
* **Desarrollo:** ANGEL IBRAYM ORTIZ MARTINEZ
* **Institución:** INSTITUTO TECNOLÓGICO CAMPUS PACHUCA
* **Propósito:** Proyecto de Instrumentación Virtual / SCADA

---