# ⚡ IronMonitor - Industrial IIoT Dashboard

**IronMonitor** es una plataforma web de monitoreo y control diseñada para equipos industriales (como máquinas de vacío o batidoras de alto rendimiento). Este proyecto permite visualizar en tiempo real el estatus y la temperatura de múltiples dispositivos, aplicando conceptos clave de la Industria 4.0, interfaces HMI (Human-Machine Interface) y el Mantenimiento Predictivo.

Desarrollado como proyecto para la materia de **Implementación de Soluciones IoT** (9º Semestre).
**Autor:** Angel Ibraym Ortiz Martínez.

---

## 🚀 Características Principales

* **Interfaz HMI/SCADA Avanzada:** Diseño UI/UX Dark Mode con feedback visual en tiempo real, incluyendo engranes giratorios en máquinas activas, LEDs de estado parpadeantes, barras de progreso térmicas con indicadores de tendencia (⬆️⬇️) y timestamps de última actualización.
* **🛑 Paro General (Global Kill Switch):** Botón de emergencia de acceso rápido en la barra superior para detener simultáneamente todas las máquinas de la planta con un solo clic.
* **Búsqueda Dinámica Global:** Barra de búsqueda optimizada que filtra dispositivos en tiempo real a través de las tres pestañas (Control, Monitor y Admin).
* **Mantenimiento Predictivo (Safe-Stop):** Sistema de seguridad automatizado que fuerza un paro de emergencia si una máquina supera su umbral térmico máximo, registrando el evento.
* **Monitoreo Térmico Dinámico:** Gráficas en vivo con *Chart.js* para paneles individuales, que incluyen una **línea de referencia roja** estática para visualizar el límite de temperatura de un vistazo.
* **Arquitectura de 3 Paneles:**
    * **🎛️ Control:** Tarjetas interactivas con animaciones para encendido/apagado remoto y evaluación rápida de estado.
    * **📈 Monitor:** Vista analítica con gráficas de temperatura y tablas de historial de alto contraste con los últimos 10 registros.
    * **⚙️ Admin:** Panel de gestión para registrar nuevas máquinas, editar límites térmicos, eliminar equipos y **Exportar Reportes a CSV**.
* **Simulador Físico (Fallback Mode):** Modo "Offline" automático que simula la termodinámica de las máquinas si falla la conexión a la API REST.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+).
* **Framework CSS:** Bootstrap 5 (Customized for Dark Mode).
* **Visualización de Datos:** Chart.js.
* **Backend / API:** MockAPI.io (Simulación de Endpoints RESTful).
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