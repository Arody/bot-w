# WBot - WhatsApp Bot Manager

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/WhatsApp-Bot-25D366?logo=whatsapp" alt="WhatsApp">
  <img src="https://img.shields.io/badge/OpenAI-Supported-412991?logo=openai" alt="OpenAI">
  <img src="https://img.shields.io/badge/Gemini-Supported-4285F4?logo=google" alt="Gemini">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
</p>

Bot de WhatsApp con integración de IA (OpenAI/Gemini) y un tablero Kanban para gestión de conversaciones tipo CRM.

## ✨ Características

- 🤖 **Respuestas automáticas con IA** - Integración con OpenAI (GPT) y Google Gemini
- 📱 **Multi-sesión** - Gestiona múltiples números de WhatsApp simultáneamente
- 📊 **Tablero Kanban** - Organiza conversaciones en un embudo de ventas (Interés → Cotización → Negociación → Cerrado)
- 💬 **Chat en tiempo real** - Visualiza y responde mensajes manualmente
- ⚙️ **System Prompts personalizables** - Define cómo debe comportarse el bot para cada sesión
- 🔒 **Filtro de mensajes** - Solo responde a mensajes directos (ignora grupos y estados)
- 📱 **Interfaz responsive** - Sidebar plegable con menú hamburguesa
- 🔔 **Notificaciones de escritorio** - Alertas de nuevos mensajes

## 📋 Requisitos

- Node.js 18 o superior
- NPM o Yarn
- Claves API de OpenAI y/o Google Gemini

## 🚀 Instalación

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/wbot.git
   cd wbot
   ```

2. **Instala las dependencias**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Edita `.env` con tus configuraciones:
   ```env
   PORT=3000
   SESSIONS_DIR=sessions
   MAX_MESSAGES_PER_CONVERSATION=100
   AI_COOLDOWN_MS=1000
   ```

4. **Inicia el servidor**
   ```bash
   npm start
   ```
   
   O en modo desarrollo (con auto-reload):
   ```bash
   npm run dev
   ```

5. **Abre el navegador**
   ```
   http://localhost:3000
   ```

## 📖 Uso

### Crear una sesión

1. Escribe un nombre para la sesión en el campo de texto
2. Haz clic en el botón "+"
3. Escanea el código QR con WhatsApp (Dispositivos vinculados)

### Configurar el bot

1. Haz clic en "Claves API" para agregar tus claves de OpenAI o Gemini
2. Selecciona una sesión y haz clic en "Configuración"
3. Elige el proveedor (OpenAI/Gemini) y el modelo
4. Escribe un System Prompt para definir el comportamiento del bot
5. Activa el bot con el switch

### Tablero Kanban

- **Arrastra y suelta** las tarjetas de conversación entre columnas
- **Usa los botones ← →** para mover conversaciones entre etapas
- **Haz doble clic** en los títulos de las columnas para editarlos
- **Haz clic en 💬** para abrir el chat en tiempo real

## 🛠️ Tecnologías

- **Backend**: Node.js, Express, Socket.IO
- **WhatsApp**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **IA**: OpenAI API, Google Generative AI (Gemini)
- **Frontend**: HTML, CSS, JavaScript vanilla

## 📁 Estructura del proyecto

```
wbot/
├── server.js          # Servidor principal
├── public/
│   ├── index.html     # Interfaz web
│   ├── app.js         # Lógica del cliente
│   └── style.css      # Estilos
├── sessions/          # Datos de sesiones (ignorado en git)
├── .env               # Variables de entorno (ignorado en git)
├── .env.example       # Plantilla de variables de entorno
└── package.json
```

## ⚠️ Notas importantes

- Las credenciales de WhatsApp se guardan localmente en la carpeta `sessions/`
- Las claves API se almacenan en el localStorage del navegador
- El bot solo responde a mensajes directos, no a grupos ni estados
- Respeta los términos de servicio de WhatsApp al usar este bot

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir los cambios que te gustaría hacer.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

---

<p align="center">
  Hecho con ❤️ usando Node.js y WhatsApp Web
</p>

