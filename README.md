# ⚡ IronMonitor - Industrial IIoT Dashboard

**IronMonitor** es una plataforma web de monitoreo y control diseñada para equipos industriales (como máquinas de vacío o batidoras de alto rendimiento). Este proyecto permite visualizar en tiempo real el estatus y la temperatura de múltiples dispositivos, aplicando conceptos clave de la Industria 4.0 y el Mantenimiento Predictivo.

Desarrollado como proyecto para la materia de **Implementación de Soluciones IoT** (9º Semestre).
**Autor:** Angel Ibraym Ortiz Martínez.

---

## 🚀 Características Principales

* **Búsqueda Dinámica Global:** Barra de búsqueda optimizada que filtra dispositivos en tiempo real a través de las tres pestañas (Control, Monitor y Admin) sin interrumpir la recolección de datos en segundo plano.
* **Mantenimiento Predictivo (Safe-Stop):** Sistema de seguridad automatizado. Si una máquina supera su umbral térmico máximo, el sistema fuerza un paro de emergencia y registra el evento.
* **Gráficas en Tiempo Real:** Integración con *Chart.js* para generar paneles individuales por máquina que grafican el comportamiento térmico en vivo, acompañados de una tabla con los últimos 10 registros.
* **Arquitectura de 3 Paneles:**
  * **🎛️ Control:** Tarjetas interactivas de cada equipo para encendido/apagado remoto y visualización rápida de estado.
  * **📈 Monitor:** Vista analítica con gráficas de temperatura e historial de eventos detallado.
  * **⚙️ Admin:** Panel de gestión para registrar nuevas máquinas en la red o eliminar equipos fuera de servicio.
* **Interfaz Cyberpunk / Dark Mode:** Diseño UI/UX enfocado en entornos industriales de poca luz, utilizando Bootstrap 5 y una paleta de colores neón (azul/verde) con iconos personalizados.
* **Simulador Físico (Fallback Mode):** Si la API REST pierde conexión, el sistema cambia automáticamente a un modo "Offline (Demo)" que simula la termodinámica de las máquinas en el navegador.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+).
* **Framework CSS:** Bootstrap 5 (Customized).
* **Visualización de Datos:** Chart.js.
* **Backend / API:** MockAPI.io (Simulación de Endpoints RESTful con métodos GET, POST, PUT, DELETE).
* **Tipografía:** Orbitron & Roboto (Google Fonts).

---

## 📂 Estructura del Proyecto

Para que la interfaz visualice correctamente los iconos personalizados, el proyecto debe mantener la siguiente estructura de carpetas:

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
        ├── icon-logo.png
        ├── icon-search.png
        ├── icon-control.png
        ├── icon-monitor.png
        ├── icon-admin.png
        ├── icon-machine.png
        ├── icon-start.png
        ├── icon-stop.png
        ├── icon-notfound.png
        └── icon-history.png