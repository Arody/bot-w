require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const OpenAI = require('openai');
const multer = require('multer');
const mime = require('mime-types');

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configurar multer para subida de archivos
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 16 * 1024 * 1024 } // 16MB máximo
});

const DEFAULT_MODELS = {
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini'
};

// Message Queue Class for rate limiting AI requests
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastProcessed = 0;
    }

    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessed;
        
        if (timeSinceLastProcess < AI_COOLDOWN_MS) {
            setTimeout(() => this.process(), AI_COOLDOWN_MS - timeSinceLastProcess);
            return;
        }

        this.processing = true;
        const { fn, resolve, reject } = this.queue.shift();
        
        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.lastProcessed = Date.now();
            this.processing = false;
            if (this.queue.length > 0) {
                setTimeout(() => this.process(), AI_COOLDOWN_MS);
            }
        }
    }
}

const MAX_MESSAGES_PER_CONVERSATION = parseInt(process.env.MAX_MESSAGES_PER_CONVERSATION) || 200;
const CONVERSATIONS_FILE = 'conversations.json';
const SESSION_CONFIG_FILE = 'config.json';
const BUTTONS_FILE = 'buttons.json';
const AI_COOLDOWN_MS = parseInt(process.env.AI_COOLDOWN_MS) || 1000; // 1 segundo entre respuestas AI

function normalizeProvider(provider) {
    return provider === 'openai' ? 'openai' : 'gemini';
}

function resolveModelName(provider, preferredModel) {
    if (preferredModel) return preferredModel;
    const key = normalizeProvider(provider);
    return DEFAULT_MODELS[key] || DEFAULT_MODELS.gemini;
}

function sanitizeModelName(provider, preferredModel) {
    const trimmed = typeof preferredModel === 'string' ? preferredModel.trim() : '';
    return resolveModelName(provider, trimmed || undefined);
}

function getLastMessage(messages = []) {
    return messages.length ? messages[messages.length - 1] : null;
}

function getConversationFilePath(sessionId) {
    return path.join(SESSIONS_DIR, sessionId, CONVERSATIONS_FILE);
}

function getSessionConfigFilePath(sessionId) {
    return path.join(SESSIONS_DIR, sessionId, SESSION_CONFIG_FILE);
}

function getButtonsFilePath(sessionId) {
    return path.join(SESSIONS_DIR, sessionId, BUTTONS_FILE);
}

async function loadSessionButtons(sessionId) {
    try {
        const buttonsPath = getButtonsFilePath(sessionId);
        if (await fs.pathExists(buttonsPath)) {
            return await fs.readJson(buttonsPath);
        }
    } catch (error) {
        console.error(`Error loading buttons for ${sessionId}:`, error);
    }
    return [];
}

async function saveSessionButtons(sessionId, buttons) {
    try {
        const buttonsPath = getButtonsFilePath(sessionId);
        await fs.ensureDir(path.dirname(buttonsPath));
        await fs.writeJson(buttonsPath, buttons, { spaces: 2 });
    } catch (error) {
        console.error(`Error saving buttons for ${sessionId}:`, error);
    }
}

// Función para crear mensaje con botones interactivos
function createButtonMessage(config) {
    const { title, body, footer, buttons } = config;
    
    const nativeButtons = buttons.map(btn => ({
        name: btn.type || 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: btn.text,
            id: btn.id
        })
    }));
    
    return {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: {
                    body: { text: body || '' },
                    footer: { text: footer || '' },
                    header: {
                        title: title || '',
                        subtitle: '',
                        hasMediaAttachment: false
                    },
                    nativeFlowMessage: {
                        buttons: nativeButtons
                    }
                }
            }
        }
    };
}

async function loadSessionConfig(sessionId) {
    try {
        const configPath = getSessionConfigFilePath(sessionId);
        if (await fs.pathExists(configPath)) {
            return await fs.readJson(configPath);
        }
    } catch (error) {
        console.error(`Error loading config for ${sessionId}:`, error);
    }
    return {};
}

async function saveSessionConfig(sessionId, config) {
    try {
        const configPath = getSessionConfigFilePath(sessionId);
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, config, { spaces: 2 });
    } catch (error) {
        console.error(`Error saving config for ${sessionId}:`, error);
    }
}

function normalizeMessageEntry(message = {}) {
    return {
        id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        direction: message.direction === 'outgoing' ? 'outgoing' : 'incoming',
        text: typeof message.text === 'string' ? message.text : '',
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now()
    };
}

function serializeConversation(conversation, { includeMessages = true } = {}) {
    const lastMessage = getLastMessage(conversation.messages || []);
    const payload = {
        chatId: conversation.chatId,
        title: conversation.title || conversation.chatId,
        lastMessageText: lastMessage?.text || '',
        lastMessageAt: lastMessage?.timestamp || conversation.updatedAt || Date.now(),
        messageCount: conversation.messages?.length || 0,
        stage: conversation.stage || 'interest'
    };

    if (includeMessages) {
        payload.messages = (conversation.messages || []).map(normalizeMessageEntry);
    }

    return payload;
}

function serializeConversationsCollection(conversations, options = {}) {
    return conversations.map((conversation) => serializeConversation(conversation, options));
}

async function loadStoredConversations(sessionId) {
    const conversations = new Map();
    try {
        const filePath = getConversationFilePath(sessionId);
        if (!await fs.pathExists(filePath)) {
            return conversations;
        }
        const raw = await fs.readJson(filePath);
        if (!Array.isArray(raw)) return conversations;

        raw.forEach((entry) => {
            const normalizedMessages = Array.isArray(entry.messages) ? entry.messages.map(normalizeMessageEntry) : [];
            const tail = getLastMessage(normalizedMessages);
            conversations.set(entry.chatId, {
                chatId: entry.chatId,
                title: entry.title || entry.chatId,
                messages: normalizedMessages,
                updatedAt: entry.lastMessageAt || tail?.timestamp || Date.now(),
                stage: entry.stage || 'interest'
            });
        });
    } catch (error) {
        console.error(`No se pudieron cargar las conversaciones para la sesión ${sessionId}:`, error);
    }
    return conversations;
}

async function persistConversations(sessionId) {
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.conversations) return;

    const filePath = getConversationFilePath(sessionId);
    try {
        await fs.ensureDir(path.dirname(filePath));
        const serialized = serializeConversationsCollection(
            Array.from(sessionData.conversations.values()),
            { includeMessages: true }
        );
        await fs.writeJson(filePath, serialized, { spaces: 2 });
    } catch (error) {
        console.error(`No se pudieron guardar las conversaciones para la sesión ${sessionId}:`, error);
    }
}

function ensureConversationRecord(sessionId, chatId, title = '') {
    const sessionData = sessions.get(sessionId);
    if (!sessionData) return null;

    if (!sessionData.conversations) {
        sessionData.conversations = new Map();
    }

    let conversation = sessionData.conversations.get(chatId);
    if (!conversation) {
        conversation = {
            chatId,
            title: title || chatId,
            stage: 'interest',
            messages: [],
            updatedAt: Date.now()
        };
        sessionData.conversations.set(chatId, conversation);
    } else if (title && (!conversation.title || conversation.title === conversation.chatId)) {
        conversation.title = title;
    }

    return conversation;
}

function appendMessage(conversation, message) {
    if (!conversation) return;
    const normalized = normalizeMessageEntry(message);
    conversation.messages.push(normalized);
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        conversation.messages.splice(0, conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION);
    }
    conversation.updatedAt = normalized.timestamp;
}

function emitConversationUpdate(sessionId, conversation) {
    if (!conversation) return;
    io.emit('conversation_update', {
        id: sessionId,
        sessionId,
        conversation: serializeConversation(conversation, { includeMessages: true })
    });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, 'sessions');

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Endpoint para subir archivos
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const mimeType = mime.lookup(req.file.originalname) || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');
    
    res.json({
        success: true,
        filePath,
        originalName: req.file.originalname,
        mimeType,
        size: req.file.size,
        isImage
    });
});

// Limpiar archivo después de enviarlo
async function cleanupFile(filePath) {
    try {
        if (filePath && await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }
    } catch (error) {
        console.error('Error cleaning up file:', error);
    }
}

// Active sessions in memory
// Map<id, { sock: WASocket, botEnabled: boolean, apiKey: string, conversations: Map }>
const sessions = new Map();

// Message queues for rate limiting AI requests per session
const MESSAGE_QUEUE = new Map(); // sessionId -> MessageQueue

function buildSessionPayload(id, overrides = {}) {
    const sessionData = sessions.get(id);

    if (!sessionData) {
        return {
            id,
            status: overrides.status || 'disconnected',
            user: overrides.user ?? null,
            botEnabled: overrides.botEnabled ?? false,
            hasApiKey: overrides.hasApiKey ?? false,
            modelProvider: overrides.modelProvider || 'gemini',
            modelName: overrides.modelName || DEFAULT_MODELS.gemini,
            systemPrompt: overrides.systemPrompt ?? ''
        };
    }

    const provider = normalizeProvider(overrides.modelProvider || sessionData.modelProvider);

    return {
        id,
        status: overrides.status || (sessionData.sock?.user ? 'connected' : 'connecting'),
        user: overrides.user ?? sessionData.sock?.user ?? null,
        botEnabled: overrides.botEnabled ?? sessionData.botEnabled ?? false,
        hasApiKey: overrides.hasApiKey ?? !!sessionData.apiKey,
        modelProvider: provider,
        modelName: overrides.modelName || sanitizeModelName(provider, sessionData.modelName),
        systemPrompt: overrides.systemPrompt ?? sessionData.systemPrompt ?? ''
    };
}

function emitSessionStatus(id, overrides = {}) {
    const payload = buildSessionPayload(id, overrides);
    io.emit('session_status', payload);
}

async function generateAiResponse(sessionData, userText, conversationHistory = []) {
    const provider = normalizeProvider(sessionData.modelProvider);
    
    // Limitar contexto a últimos 10 mensajes para no saturar el prompt
    const recentMessages = conversationHistory.slice(-10);

    if (provider === 'openai') {
        const openai = new OpenAI({
            apiKey: sessionData.apiKey
        });

        // Construir array de mensajes con historial
        const messages = [
            ...(sessionData.systemPrompt ? [{ role: 'system', content: sessionData.systemPrompt }] : []),
            ...recentMessages.map(msg => ({
                role: msg.direction === 'incoming' ? 'user' : 'assistant',
                content: msg.text
            })),
            { role: 'user', content: userText }
        ];

        const completion = await openai.chat.completions.create({
            model: resolveModelName(provider, sessionData.modelName),
            messages
        });

        return completion.choices?.[0]?.message?.content?.trim();
    }

    // Para Gemini, construir contexto en contentParts
    const genAI = new GoogleGenerativeAI(sessionData.apiKey);
    const model = genAI.getGenerativeModel({
        model: resolveModelName(provider, sessionData.modelName)
    });

    const contentParts = [];
    
    if (sessionData.systemPrompt) {
        contentParts.push({ text: `[INSTRUCCIONES DEL SISTEMA]\n${sessionData.systemPrompt}\n\n` });
    }
    
    // Agregar historial de conversación
    recentMessages.forEach(msg => {
        const role = msg.direction === 'incoming' ? 'Usuario' : 'Asistente';
        contentParts.push({ text: `${role}: ${msg.text}\n` });
    });
    
    contentParts.push({ text: `Usuario: ${userText}` });

    const result = await model.generateContent(contentParts);
    return result.response?.text()?.trim();
}

// Helper to get all session IDs from disk
async function getStoredSessions() {
    if (!await fs.pathExists(SESSIONS_DIR)) {
        await fs.mkdir(SESSIONS_DIR);
        return [];
    }
    const files = await fs.readdir(SESSIONS_DIR);
    const sessionIds = [];
    for (const file of files) {
        const stats = await fs.stat(path.join(SESSIONS_DIR, file));
        if (stats.isDirectory()) {
            sessionIds.push(file);
        }
    }
    return sessionIds;
}

// Initialize a session
async function initSession(id, socketToEmit = null) {
    const sessionPath = path.join(SESSIONS_DIR, id);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const storedConversations = await loadStoredConversations(id);
    const savedConfig = await loadSessionConfig(id);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    // Store session in memory with saved or default config
    const existingSession = sessions.get(id);
    const provider = normalizeProvider(savedConfig.modelProvider || existingSession?.modelProvider);

    sessions.set(id, { 
        sock, 
        botEnabled: savedConfig.botEnabled || existingSession?.botEnabled || false, 
        apiKey: savedConfig.apiKey || existingSession?.apiKey || '',
        modelProvider: provider,
        modelName: sanitizeModelName(provider, savedConfig.modelName || existingSession?.modelName),
        systemPrompt: savedConfig.systemPrompt || existingSession?.systemPrompt || '',
        conversations: storedConversations.size ? storedConversations : (existingSession?.conversations || new Map())
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrCodeDataUrl = await QRCode.toDataURL(qr);
            io.emit('session_qr', { id, qr: qrCodeDataUrl });
            if (socketToEmit) socketToEmit.emit('session_qr', { id, qr: qrCodeDataUrl });
        }

        if (connection === 'close') {
            const sessionData = sessions.get(id);
            // No reconectar si la sesión fue marcada para eliminar o ya no existe
            if (!sessionData || sessionData.deleting) {
                console.log(`Session ${id} closed (deleted or marked for deletion)`);
                return;
            }
            
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed for session ${id}. Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                // Verificar que la carpeta de sesión aún existe antes de reconectar
                if (await fs.pathExists(sessionPath)) {
                    initSession(id);
                } else {
                    console.log(`Session folder for ${id} no longer exists, not reconnecting`);
                    sessions.delete(id);
                    emitSessionStatus(id, { status: 'disconnected', user: null, botEnabled: false, hasApiKey: false });
                }
            } else {
                if (fs.existsSync(sessionPath)) {
                    await fs.remove(sessionPath);
                }
                sessions.delete(id);
                emitSessionStatus(id, { status: 'disconnected', user: null, botEnabled: false, hasApiKey: false });
            }
        } else if (connection === 'open') {
            console.log(`Session ${id} opened`);
            emitSessionStatus(id, { status: 'connected', user: sock.user });
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const sessionData = sessions.get(id);
        if (!sessionData) return;

        const msg = m.messages[0];
        if (!msg || msg.key.fromMe || m.type !== 'notify') return;

        const chatId = msg.key.remoteJid;
        
        // Filtrar: ignorar grupos y estados/historias
        // Los grupos terminan en @g.us, los estados en @broadcast o status@broadcast
        const isGroup = chatId.endsWith('@g.us');
        const isStatus = chatId === 'status@broadcast' || chatId.endsWith('@broadcast');
        
        // Si es grupo o historia, ignorar completamente
        if (isGroup || isStatus) {
            return;
        }

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!text) return;

        const conversation = ensureConversationRecord(id, chatId, msg.pushName || chatId);

        appendMessage(conversation, {
            id: msg.key.id,
            direction: 'incoming',
            text,
            timestamp: Date.now()
        });

        await persistConversations(id);
        emitConversationUpdate(id, conversation);

        if (!sessionData.botEnabled || !sessionData.apiKey) return;

        // Initialize queue for this session if it doesn't exist
        if (!MESSAGE_QUEUE.has(id)) {
            MESSAGE_QUEUE.set(id, new MessageQueue());
        }

        const queue = MESSAGE_QUEUE.get(id);

        // Add AI request to queue with rate limiting
        queue.add(async () => {
            try {
                // Emitir evento de "escribiendo"
                io.emit('bot_typing', { id, chatId, typing: true });
                
                // Pasar historial de conversación para contexto
                const replyText = await generateAiResponse(sessionData, text, conversation.messages);
                
                // Detener indicador de "escribiendo"
                io.emit('bot_typing', { id, chatId, typing: false });
                
                if (!replyText) {
                    console.warn(`AI no devolvió texto para la sesión ${id}`);
                    return;
                }

                await sock.sendMessage(chatId, { text: replyText });

                appendMessage(conversation, {
                    id: `bot-${Date.now()}`,
                    direction: 'outgoing',
                    text: replyText,
                    timestamp: Date.now()
                });

                await persistConversations(id);
                emitConversationUpdate(id, conversation);
            } catch (error) {
                console.error('Error generating AI response:', error);
                // Detener indicador en caso de error
                io.emit('bot_typing', { id, chatId, typing: false });
            }
        }).catch(error => {
            console.error('Queue error:', error);
            io.emit('bot_typing', { id, chatId, typing: false });
        });
    });
}

// Restore all sessions on startup
(async () => {
    const storedIds = await getStoredSessions();
    for (const id of storedIds) {
        console.log(`Restoring session: ${id}`);
        initSession(id);
    }
})();

// Wrapper para manejar errores en handlers de socket
function asyncSocketHandler(handler) {
    return async (...args) => {
        try {
            await handler(...args);
        } catch (error) {
            console.error('Socket handler error:', error);
            const socket = args[args.length - 1];
            if (socket && typeof socket.emit === 'function') {
                socket.emit('error', { message: 'Error interno del servidor' });
            }
        }
    };
}

io.on('connection', async (socket) => {
    console.log('Client connected');

    try {
        const storedIds = await getStoredSessions();
        const sessionList = storedIds.map((id) => buildSessionPayload(id));
        socket.emit('init', sessionList);
    } catch (error) {
        console.error('Error initializing connection:', error);
        socket.emit('error', { message: 'Error al inicializar' });
    }

    socket.on('create_session', asyncSocketHandler(async (data) => {
        const { id } = data;
        if (!id || typeof id !== 'string' || id.trim() === '') {
            socket.emit('error', { message: 'ID de sesión inválido' });
            return;
        }
        if (sessions.has(id)) {
            socket.emit('error', { message: 'La sesión ya existe' });
            return;
        }
        console.log(`Creating new session: ${id}`);
        await initSession(id, socket);
    }));

    socket.on('delete_session', asyncSocketHandler(async (data) => {
        const { id } = data;
        if (!id) {
            socket.emit('error', { message: 'ID de sesión requerido' });
            return;
        }
        console.log(`Deleting session: ${id}`);
        
        const sessionData = sessions.get(id);
        if (sessionData) {
            // Marcar como eliminándose para evitar reconexiones
            sessionData.deleting = true;
            
            if (sessionData.sock) {
                try {
                    // Intentar logout primero para cerrar la conexión limpiamente
                    await sessionData.sock.logout();
                } catch (e) {
                    // Si logout falla, intentar end
                    try {
                        sessionData.sock.end(undefined);
                    } catch (e2) {
                        console.log(`Error closing socket for ${id}:`, e2.message);
                    }
                }
            }
            
            // Eliminar de la memoria
            sessions.delete(id);
        }
        
        // Eliminar la carpeta de sesión
        const sessionPath = path.join(SESSIONS_DIR, id);
        if (await fs.pathExists(sessionPath)) {
            await fs.remove(sessionPath);
        }
        
        // Eliminar la cola de mensajes si existe
        MESSAGE_QUEUE.delete(id);
        
        io.emit('session_deleted', { id });
    }));

    socket.on('get_conversations', asyncSocketHandler(async (data = {}) => {
        const { id } = data;
        if (!id) {
            socket.emit('conversations', { id: null, conversations: [] });
            return;
        }
        
        const sessionData = sessions.get(id);
        if (!sessionData) {
            socket.emit('conversations', { id, sessionId: id, conversations: [] });
            return;
        }

        if (!sessionData.conversations) {
            sessionData.conversations = await loadStoredConversations(id);
        }

        socket.emit('conversations', { 
            id,
            sessionId: id,
            conversations: serializeConversationsCollection(
                Array.from(sessionData.conversations.values()),
                { includeMessages: true }
            )
        });
    }));

    // Enviar mensaje manual (cuando el bot está desactivado)
    socket.on('send_manual_message', asyncSocketHandler(async (data) => {
        const { sessionId, chatId, text } = data;
        
        if (!sessionId || !chatId || !text) {
            socket.emit('message_sent', { sessionId, chatId, success: false });
            return;
        }
        
        const sessionData = sessions.get(sessionId);
        if (!sessionData || !sessionData.sock) {
            socket.emit('message_sent', { sessionId, chatId, success: false });
            return;
        }
        
        // No permitir envío manual si el bot está activo
        if (sessionData.botEnabled) {
            socket.emit('error', { message: 'El bot está activo. Desactívalo para enviar mensajes manualmente.' });
            socket.emit('message_sent', { sessionId, chatId, success: false });
            return;
        }
        
        try {
            await sessionData.sock.sendMessage(chatId, { text });
            
            // Registrar mensaje en la conversación
            const conversation = ensureConversationRecord(sessionId, chatId, chatId);
            appendMessage(conversation, {
                id: `manual-${Date.now()}`,
                direction: 'outgoing',
                text,
                timestamp: Date.now()
            });
            
            await persistConversations(sessionId);
            emitConversationUpdate(sessionId, conversation);
            
            socket.emit('message_sent', { sessionId, chatId, success: true });
        } catch (error) {
            console.error('Error sending manual message:', error);
            socket.emit('message_sent', { sessionId, chatId, success: false });
        }
    }));

    // Actualizar el stage de una conversación en el funnel
    socket.on('update_conversation_stage', asyncSocketHandler(async (data) => {
        const { sessionId, chatId, stage } = data;
        
        if (!sessionId || !chatId || !stage) {
            return;
        }
        
        const validStages = ['interest', 'quote', 'negotiation', 'closed'];
        if (!validStages.includes(stage)) {
            socket.emit('error', { message: 'Stage inválido' });
            return;
        }
        
        const sessionData = sessions.get(sessionId);
        if (!sessionData || !sessionData.conversations) {
            return;
        }
        
        const conversation = sessionData.conversations.get(chatId);
        if (!conversation) {
            return;
        }
        
        conversation.stage = stage;
        await persistConversations(sessionId);
        
        // Emitir actualización a todos los clientes
        emitConversationUpdate(sessionId, conversation);
    }));

    // Enviar imagen
    socket.on('send_image', asyncSocketHandler(async (data) => {
        const { sessionId, chatId, filePath, caption } = data;
        
        if (!sessionId || !chatId || !filePath) {
            socket.emit('media_sent', { sessionId, chatId, success: false, error: 'Datos incompletos' });
            return;
        }
        
        const sessionData = sessions.get(sessionId);
        if (!sessionData || !sessionData.sock) {
            socket.emit('media_sent', { sessionId, chatId, success: false, error: 'Sesión no encontrada' });
            return;
        }
        
        try {
            const imageBuffer = await fs.readFile(filePath);
            const mimeType = mime.lookup(filePath) || 'image/jpeg';
            
            await sessionData.sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: caption || '',
                mimetype: mimeType
            });
            
            // Registrar mensaje en la conversación
            const conversation = ensureConversationRecord(sessionId, chatId, chatId);
            appendMessage(conversation, {
                id: `img-${Date.now()}`,
                direction: 'outgoing',
                text: caption ? `📷 Imagen: ${caption}` : '📷 Imagen enviada',
                timestamp: Date.now()
            });
            
            await persistConversations(sessionId);
            emitConversationUpdate(sessionId, conversation);
            
            // Limpiar archivo
            await cleanupFile(filePath);
            
            socket.emit('media_sent', { sessionId, chatId, success: true, type: 'image' });
        } catch (error) {
            console.error('Error sending image:', error);
            await cleanupFile(filePath);
            socket.emit('media_sent', { sessionId, chatId, success: false, error: error.message });
        }
    }));

    // Enviar documento
    socket.on('send_document', asyncSocketHandler(async (data) => {
        const { sessionId, chatId, filePath, fileName, caption } = data;
        
        if (!sessionId || !chatId || !filePath) {
            socket.emit('media_sent', { sessionId, chatId, success: false, error: 'Datos incompletos' });
            return;
        }
        
        const sessionData = sessions.get(sessionId);
        if (!sessionData || !sessionData.sock) {
            socket.emit('media_sent', { sessionId, chatId, success: false, error: 'Sesión no encontrada' });
            return;
        }
        
        try {
            const docBuffer = await fs.readFile(filePath);
            const mimeType = mime.lookup(filePath) || 'application/octet-stream';
            
            await sessionData.sock.sendMessage(chatId, {
                document: docBuffer,
                mimetype: mimeType,
                fileName: fileName || path.basename(filePath),
                caption: caption || ''
            });
            
            // Registrar mensaje en la conversación
            const conversation = ensureConversationRecord(sessionId, chatId, chatId);
            appendMessage(conversation, {
                id: `doc-${Date.now()}`,
                direction: 'outgoing',
                text: `📄 Documento: ${fileName || path.basename(filePath)}`,
                timestamp: Date.now()
            });
            
            await persistConversations(sessionId);
            emitConversationUpdate(sessionId, conversation);
            
            // Limpiar archivo
            await cleanupFile(filePath);
            
            socket.emit('media_sent', { sessionId, chatId, success: true, type: 'document' });
        } catch (error) {
            console.error('Error sending document:', error);
            await cleanupFile(filePath);
            socket.emit('media_sent', { sessionId, chatId, success: false, error: error.message });
        }
    }));

    // Enviar mensaje con botones
    socket.on('send_button_message', asyncSocketHandler(async (data) => {
        const { sessionId, chatId, buttonConfig } = data;
        
        if (!sessionId || !chatId || !buttonConfig) {
            socket.emit('button_message_sent', { sessionId, chatId, success: false, error: 'Datos incompletos' });
            return;
        }
        
        const sessionData = sessions.get(sessionId);
        if (!sessionData || !sessionData.sock) {
            socket.emit('button_message_sent', { sessionId, chatId, success: false, error: 'Sesión no encontrada' });
            return;
        }
        
        try {
            const msg = createButtonMessage(buttonConfig);
            await sessionData.sock.sendMessage(chatId, msg);
            
            // Registrar mensaje en la conversación
            const conversation = ensureConversationRecord(sessionId, chatId, chatId);
            const buttonTexts = buttonConfig.buttons.map(b => b.text).join(', ');
            appendMessage(conversation, {
                id: `btn-${Date.now()}`,
                direction: 'outgoing',
                text: `🔘 Mensaje con botones: ${buttonConfig.title || buttonConfig.body}\n[${buttonTexts}]`,
                timestamp: Date.now()
            });
            
            await persistConversations(sessionId);
            emitConversationUpdate(sessionId, conversation);
            
            socket.emit('button_message_sent', { sessionId, chatId, success: true });
        } catch (error) {
            console.error('Error sending button message:', error);
            socket.emit('button_message_sent', { sessionId, chatId, success: false, error: error.message });
        }
    }));

    // Obtener botones configurados para una sesión
    socket.on('get_session_buttons', asyncSocketHandler(async (data) => {
        const { sessionId } = data;
        
        if (!sessionId) {
            socket.emit('session_buttons', { sessionId, buttons: [] });
            return;
        }
        
        const buttons = await loadSessionButtons(sessionId);
        socket.emit('session_buttons', { sessionId, buttons });
    }));

    // Guardar/actualizar botones para una sesión
    socket.on('save_session_buttons', asyncSocketHandler(async (data) => {
        const { sessionId, buttons } = data;
        
        if (!sessionId) {
            socket.emit('error', { message: 'ID de sesión requerido' });
            return;
        }
        
        await saveSessionButtons(sessionId, buttons || []);
        io.emit('session_buttons_updated', { sessionId, buttons: buttons || [] });
    }));

    // Eliminar un botón específico
    socket.on('delete_session_button', asyncSocketHandler(async (data) => {
        const { sessionId, buttonId } = data;
        
        if (!sessionId || !buttonId) {
            socket.emit('error', { message: 'Datos incompletos' });
            return;
        }
        
        const buttons = await loadSessionButtons(sessionId);
        const updatedButtons = buttons.filter(b => b.id !== buttonId);
        await saveSessionButtons(sessionId, updatedButtons);
        
        io.emit('session_buttons_updated', { sessionId, buttons: updatedButtons });
    }));

    socket.on('update_session_config', asyncSocketHandler(async (data) => {
        const { id, modelProvider, modelName, systemPrompt, apiKey } = data;
        if (!id) {
            socket.emit('error', { message: 'ID de sesión requerido' });
            return;
        }
        
        const sessionData = sessions.get(id);
        if (!sessionData) {
            socket.emit('error', { message: 'Sesión no encontrada' });
            return;
        }

        const provider = normalizeProvider(modelProvider || sessionData.modelProvider);
        sessionData.modelProvider = provider;
        sessionData.modelName = sanitizeModelName(provider, modelName || sessionData.modelName);
        if (typeof systemPrompt === 'string') {
            sessionData.systemPrompt = systemPrompt;
        }

        if (typeof apiKey === 'string' && apiKey.trim()) {
            sessionData.apiKey = apiKey.trim();
        }

        // Persist configuration
        await saveSessionConfig(id, {
            botEnabled: sessionData.botEnabled,
            apiKey: sessionData.apiKey,
            modelProvider: sessionData.modelProvider,
            modelName: sessionData.modelName,
            systemPrompt: sessionData.systemPrompt
        });

        emitSessionStatus(id, { 
            modelProvider: sessionData.modelProvider,
            modelName: sessionData.modelName,
            systemPrompt: sessionData.systemPrompt,
            hasApiKey: !!sessionData.apiKey
        });
    }));

    socket.on('toggle_bot', asyncSocketHandler(async (data) => {
        const { id, enabled, apiKey, modelProvider, modelName, systemPrompt } = data;
        if (!id) {
            socket.emit('error', { message: 'ID de sesión requerido' });
            return;
        }
        
        const sessionData = sessions.get(id);
        if (!sessionData) {
            socket.emit('error', { message: 'Sesión no encontrada' });
            return;
        }

        const provider = normalizeProvider(modelProvider || sessionData.modelProvider);
        sessionData.modelProvider = provider;
        sessionData.modelName = sanitizeModelName(provider, modelName || sessionData.modelName);
        if (typeof systemPrompt === 'string') {
            sessionData.systemPrompt = systemPrompt;
        }

        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

        if (enabled) {
            if (!normalizedApiKey) {
                sessionData.botEnabled = false;
                socket.emit('error', { message: 'Se requiere una clave API para habilitar el bot' });
                emitSessionStatus(id, { botEnabled: false });
                return;
            }
            sessionData.apiKey = normalizedApiKey;
        }

        sessionData.botEnabled = !!enabled;

        // Persist configuration
        await saveSessionConfig(id, {
            botEnabled: sessionData.botEnabled,
            apiKey: sessionData.apiKey,
            modelProvider: sessionData.modelProvider,
            modelName: sessionData.modelName,
            systemPrompt: sessionData.systemPrompt
        });

        emitSessionStatus(id, { 
            botEnabled: sessionData.botEnabled,
            hasApiKey: !!sessionData.apiKey,
            modelProvider: sessionData.modelProvider,
            modelName: sessionData.modelName,
            systemPrompt: sessionData.systemPrompt
        });
    }));
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
