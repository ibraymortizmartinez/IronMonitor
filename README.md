# ⚡ IronMonitor - Industrial IIoT Dashboard

**IronMonitor** es una plataforma web de monitoreo y control diseñada para equipos industriales (como máquinas de vacío o batidoras de alto rendimiento). Este proyecto permite visualizar en tiempo real el estatus y la temperatura de múltiples dispositivos, aplicando conceptos clave de la Industria 4.0, interfaces HMI (Human-Machine Interface) y el Mantenimiento Predictivo.

Desarrollado como proyecto para la materia de **Implementación de Soluciones IoT** (9º Semestre).
**Autor:** Angel Ibraym Ortiz Martínez.

---

## 🚀 Características Principales

* **Interfaz HMI/SCADA Avanzada:** Diseño UI/UX Dark Mode enfocado en entornos industriales. Incluye feedback visual en tiempo real como engranes giratorios en máquinas activas, LEDs de estado parpadeantes y timestamps de última actualización (latencia visual).
* **Control y Prevención de Riesgos (Safe-Stop):** Sistema de seguridad automatizado. Si una máquina supera su umbral térmico máximo, el sistema fuerza un paro de emergencia y registra el evento.
* **🛑 Paro General (Global Kill Switch):** Botón de emergencia global de acceso rápido que permite al operador detener simultáneamente todas las máquinas de la planta con un solo clic en caso de un evento crítico.
* **Monitoreo Térmico Dinámico:**
  * **Gráficas en Vivo:** Integración con *Chart.js* para paneles individuales. Incluye una **línea de umbral de peligro (roja punteada)** estática para evaluar el riesgo de un vistazo.
  * **Indicadores Analíticos:** Barras de progreso térmicas que cambian de color según la proximidad al límite (Azul -> Amarillo -> Rojo) y flechas de tendencia (⬆️⬇️) que comparan la lectura actual con la anterior.
* **Búsqueda Dinámica Global:** Barra de búsqueda optimizada que filtra dispositivos en tiempo real a través de las tres pestañas sin interrumpir la recolección de datos en segundo plano.
* **Arquitectura de 3 Paneles:**
  * **🎛️ Control:** Tarjetas interactivas de cada equipo para encendido/apagado remoto y evaluación rápida de estado.
  * **📈 Monitor:** Vista analítica con gráficas de temperatura y tablas de historial de alto contraste (Dark Mode) con los últimos 10 registros.
  * **⚙️ Admin:** Panel de gestión para registrar nuevas máquinas, editar límites térmicos, eliminar equipos y **Exportar Reportes a CSV**.
* **Simulador Físico (Fallback Mode):** Si la API REST pierde conexión, el sistema cambia automáticamente a un modo "Offline (Demo)" que simula la termodinámica de las máquinas directamente en el navegador.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+).
* **Framework CSS:** Bootstrap 5 (Customized for Dark Mode/Cyberpunk aesthetic).
* **Visualización de Datos:** Chart.js.
* **Backend / API:** MockAPI.io (Simulación de Endpoints RESTful con métodos GET, POST, PUT, DELETE).
* **Tipografía:** Orbitron & Roboto (Google Fonts).

---

## 📂 Estructura del Proyecto

Para que la interfaz visualice correctamente los iconos personalizados y hojas de estilo, el proyecto debe mantener la siguiente estructura de carpetas:

```text
IronMonitor/
├── index.html
├── README.md
└── assets/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── script.js
    └── img/
        ├── favIcon.png
        ├── icon-buscar.png
        ├── icon-control.png
        ├── icon-monitor.png
        └── icon-registro.png