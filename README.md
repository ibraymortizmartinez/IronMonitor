# ⚡ SmartMix | IronMonitor

**SmartMix** es un dashboard de monitoreo industrial interactivo diseñado para supervisar y controlar dispositivos de mezcla en tiempo real. Cuenta con una interfaz moderna de estilo *Cyberpunk* (Dark Mode + Neón) y un sistema integrado de seguridad automatizado.

## ✨ Características Principales

* 🎛️ **Panel de Control Interactivo:** Enciende y apaga dispositivos manualmente. Los dispositivos activos cuentan con animaciones visuales (vibración) y retroalimentación de color.
* 📈 **Monitoreo en Tiempo Real:** Gráfica dinámica impulsada por **Chart.js** que rastrea la temperatura de todos los dispositivos conectados.
* 🛑 **Sistema "Safe-Stop" (Paro de Emergencia):** Lógica automatizada que detiene los dispositivos inmediatamente si superan su límite de temperatura establecido.
* 📜 **Historial de Eventos:** Registro tabular de las últimas acciones y cambios de estado de los equipos.
* ⚙️ **Panel de Administración (CRUD):** Agrega nuevos dispositivos configurando su nombre y límite de temperatura, o elimina equipos fuera de servicio.
* 🔄 **Modo Resiliencia (Local Fallback):** Si la API externa falla, el sistema entra automáticamente en modo "Demo Local" para que la interfaz siga funcionando sin interrupciones.

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5, CSS3 (Custom Properties, Animaciones Keyframes), JavaScript (ES6+, Async/Await).
* **Framework CSS:** [Bootstrap 5.3](https://getbootstrap.com/)
* **Librería de Gráficos:** [Chart.js](https://www.chartjs.org/)
* **Backend / API:** [MockAPI](https://mockapi.io/) (para la simulación de base de datos y endpoints RESTful).

## 🚀 Cómo ejecutar el proyecto

Este proyecto no requiere instalación de dependencias complejas ni servidores locales especiales (Node.js, etc.) gracias a su arquitectura Vanilla JS.

1. **Clona este repositorio:**
   ```bash
   git clone [https://github.com/ibraymortizmartinez/IronMonitor.git](https://github.com/ibraymortizmartinez/IronMonitor.git)