# Nuevas Funcionalidades - WhatsApp Bot Manager

## 📋 Resumen

Se han implementado tres funcionalidades principales:

1. **Envío de Imágenes** 📷
2. **Envío de Documentos** 📄
3. **Mensajes con Botones Interactivos** 🔘
4. **Edición de Información de Chats** ✏️

---

## 1. Envío de Imágenes 📷

### Características:
- Selección de imágenes desde el explorador de archivos
- Vista previa antes de enviar
- Opción para añadir descripción/caption
- Formatos soportados: JPG, PNG, GIF, WebP

### Cómo usar:
1. Abre una conversación (el bot debe estar **desactivado**)
2. Haz clic en el botón 📷 junto al campo de mensaje
3. Selecciona una imagen desde tu computadora
4. (Opcional) Añade una descripción
5. Haz clic en "Enviar imagen"

---

## 2. Envío de Documentos 📄

### Características:
- Selección de documentos desde el explorador de archivos
- Vista previa con nombre y tamaño del archivo
- Opción para añadir descripción
- Formatos soportados: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP, RAR

### Cómo usar:
1. Abre una conversación (el bot debe estar **desactivado**)
2. Haz clic en el botón 📄 junto al campo de mensaje
3. Selecciona un documento desde tu computadora
4. (Opcional) Añade una descripción
5. Haz clic en "Enviar documento"

### Límites:
- Tamaño máximo por archivo: **16 MB**

---

## 3. Mensajes con Botones Interactivos 🔘

### Características:
- Configuración de mensajes con botones personalizados
- Los botones se guardan por sesión y están disponibles para todos los chats
- Hasta 3 botones por mensaje
- Cada botón tiene un texto visible y un ID único

### Estructura de un mensaje con botones:
- **Nombre**: Identificador interno (ej: "Menú Principal")
- **Título**: Encabezado del mensaje
- **Cuerpo**: Contenido principal del mensaje
- **Footer**: Pie de mensaje (opcional)
- **Botones**: Lista de botones (texto + ID único)

### Cómo configurar botones:
1. Selecciona una sesión
2. Haz clic en **"🔘 Botones"** en la barra superior
3. Completa el formulario:
   - Nombre para identificar el mensaje
   - Título del mensaje
   - Cuerpo del mensaje
   - Footer (opcional)
   - Añade botones (máximo 3):
     - Texto del botón (lo que ve el usuario)
     - ID único (para identificar la respuesta)
4. Haz clic en "Guardar mensaje con botones"

### Cómo enviar un mensaje con botones:
1. Abre una conversación
2. Haz clic en el botón 🔘 junto al campo de mensaje
3. Selecciona el mensaje con botones que deseas enviar
4. El mensaje se enviará automáticamente

### Ejemplo de configuración:

```javascript
{
    nombre: "Menú Principal",
    titulo: "Bienvenido",
    cuerpo: "Hola, selecciona una opción 👇",
    footer: "Powered by Bot",
    botones: [
        { texto: "Opción 1", id: "id_opcion_1" },
        { texto: "Hablar con soporte", id: "id_soporte" },
        { texto: "Ver productos", id: "id_productos" }
    ]
}
```

### Formato técnico:

Los mensajes con botones se envían usando el formato `viewOnceMessage` con `interactiveMessage` compatible con Baileys:

```javascript
{
    viewOnceMessage: {
        message: {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2
            },
            interactiveMessage: {
                body: { text: "Cuerpo del mensaje" },
                footer: { text: "Footer" },
                header: {
                    title: "Título",
                    subtitle: "",
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Texto del botón",
                                id: "id_unico"
                            })
                        }
                    ]
                }
            }
        }
    }
}
```

---

## 4. Edición de Información de Chats ✏️

### Características:
- Asignar un **nombre personalizado** a cada conversación
- Añadir una **descripción/notas** a cada contacto
- Los cambios se guardan automáticamente
- El nombre personalizado se muestra en las tarjetas del Kanban y en el header del chat

### Cómo usar:
1. En el tablero Kanban, localiza la conversación que deseas editar
2. Haz clic en el botón **✏️** en la esquina superior derecha de la tarjeta
3. Completa los campos:
   - **Nombre personalizado**: Un alias o identificador (ej: "Cliente VIP", "Proveedor ABC")
   - **Descripción**: Notas sobre el contacto (ej: "Interesado en producto X", "Pendiente de cotización")
4. Haz clic en "Guardar cambios"

### Visualización:
- Si se asigna un nombre personalizado, este reemplaza al nombre de WhatsApp en:
  - Las tarjetas del Kanban
  - El header del chat cuando lo abres
- La descripción aparece debajo del nombre en la tarjeta del Kanban
- Si no hay nombre personalizado, se muestra el nombre original de WhatsApp

---

## 📝 Notas Importantes

1. **Los botones de adjuntos** (📷 📄 🔘) solo aparecen cuando el bot está **desactivado** para permitir el envío manual de mensajes.

2. **Los archivos se suben al servidor** temporalmente y se eliminan después de enviarlos para no ocupar espacio.

3. **Los botones configurados se guardan por sesión**, lo que significa que cada sesión de WhatsApp tiene su propia configuración de botones.

4. **La información personalizada de los chats** (nombre y descripción) se guarda junto con las conversaciones y persiste entre sesiones.

5. **Límite de archivos**: El tamaño máximo por archivo es de **16 MB**.

---

## 🔧 Dependencias Añadidas

```json
{
  "multer": "^1.4.5-lts.1",
  "mime-types": "^2.1.35"
}
```

---

## 📂 Estructura de Archivos

### Backend (server.js)
- Middleware Multer para subida de archivos
- Endpoint `/upload` para procesar archivos
- Handlers de socket para:
  - `send_image`
  - `send_document`
  - `send_button_message`
  - `get_session_buttons`
  - `save_session_buttons`
  - `delete_session_button`
  - `update_conversation_info`

### Frontend
- **HTML**: Modales para preview de archivos, configuración de botones y edición de chats
- **CSS**: Estilos para los nuevos componentes y modales
- **JavaScript**: Lógica de manejo de archivos, botones y edición de información

### Archivos de Datos
- `sessions/{sessionId}/buttons.json` - Configuración de botones por sesión
- `sessions/{sessionId}/conversations.json` - Incluye nombre y descripción personalizados
- `uploads/` - Carpeta temporal para archivos subidos (se limpian automáticamente)

---

## 5. Ver Contactos de WhatsApp e Iniciar Conversaciones 👥

### Características:
- Ver la lista completa de contactos de WhatsApp de cada sesión
- Buscar contactos por nombre o número
- Iniciar conversaciones con cualquier contacto
- Las conversaciones nuevas se agregan automáticamente a la etapa "Interés" del funnel

### Cómo usar:
1. Selecciona una sesión activa y conectada
2. Haz clic en el botón **"👥 Contactos"** (ubicado entre "Configuración" y "Eliminar")
3. Espera a que se cargue la lista de contactos
4. (Opcional) Usa la barra de búsqueda para filtrar contactos
5. Haz clic en cualquier contacto para iniciar una conversación
6. La conversación aparecerá automáticamente en la columna "Interés" del Kanban

### Notas importantes:
- Los contactos se sincronizan automáticamente cuando te conectas a WhatsApp
- Si no ves contactos inmediatamente después de conectarte, espera unos segundos y vuelve a abrir el modal
- Los contactos incluyen solo números individuales (no grupos ni estados)
- Cada conversación iniciada desde contactos se marca con un mensaje inicial "📝 Conversación iniciada desde contactos"

---

## 🚀 Próximas Mejoras Sugeridas

1. Permitir enviar videos y audios
2. Añadir botones de tipo "lista" (list message)
3. Programar mensajes para envío automático
4. Exportar conversaciones a PDF con formato
5. Añadir tags/etiquetas a las conversaciones
6. Sistema de plantillas de mensajes rápidos
7. Filtrar contactos por múltiples criterios (con/sin foto, verificados, etc.)

---

## 📞 Soporte

Para cualquier duda o problema con las nuevas funcionalidades, revisa los logs del servidor en la consola.

