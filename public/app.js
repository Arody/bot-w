const socket = io();

const DEFAULT_MODELS = {
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini'
};

const LOCAL_STORAGE_KEY = 'wbot.apiKeys';
const FUNNEL_STORAGE_KEY = 'wbot.funnel';

// Default funnel stages
const DEFAULT_FUNNEL_STAGES = {
    interest: 'Interés',
    quote: 'Cotización',
    negotiation: 'Negociación',
    closed: 'Cerrado'
};

const STAGE_ORDER = ['interest', 'quote', 'negotiation', 'closed'];

// Solicitar permiso para notificaciones
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// State
let sessions = [];
let currentSessionId = null;
let activeChat = null;
const conversationCache = new Map();
const conversationStages = new Map(); // chatId -> stage
let funnelTitles = { ...DEFAULT_FUNNEL_STAGES };
let saveFeedbackTimeout = null;
let toastTimeout = null;
let toastHideTimeout = null;
let draggedCard = null;

// DOM Elements
const newSessionInput = document.getElementById('new-session-input');
const sessionListEl = document.getElementById('session-list');
const addSessionBtn = document.getElementById('add-session-btn');
const welcomeScreen = document.getElementById('welcome-screen');
const sessionDetails = document.getElementById('session-details');
const sessionTitle = document.getElementById('session-title');
const connectionStatus = document.getElementById('connection-status');
const statusDot = document.getElementById('status-dot');
const qrContainer = document.getElementById('qr-container');
const qrImage = document.getElementById('qr-image');
const qrText = document.getElementById('qr-text');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const deleteSessionBtn = document.getElementById('delete-session-btn');
const toggleConfigBtn = document.getElementById('toggle-config-btn');
const configPanel = document.getElementById('config-panel');
const botToggle = document.getElementById('bot-toggle');
const botStatusText = document.getElementById('bot-status-text');
const modelProviderSelect = document.getElementById('model-provider-select');
const modelNameInput = document.getElementById('model-name-input');
const systemPromptInput = document.getElementById('system-prompt-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const providerPill = document.getElementById('bot-provider-pill');
const saveFeedback = document.getElementById('save-feedback');
const refreshConversationsBtn = document.getElementById('refresh-conversations-btn');
const conversationSearchInput = document.getElementById('conversation-search');
const toastEl = document.getElementById('toast');

// Kanban Elements
const kanbanBoard = document.getElementById('kanban-board');

// Sidebar Elements
const sidebar = document.getElementById('sidebar');
const hamburgerBtn = document.getElementById('hamburger-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// Active Chat Elements
const activeChatEl = document.getElementById('active-chat');
const closeChatBtn = document.getElementById('close-chat-btn');
const exportChatBtn = document.getElementById('export-chat-btn');
const chatContactName = document.getElementById('chat-contact-name');
const chatContactStatus = document.getElementById('chat-contact-status');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputContainer = document.getElementById('chat-input-container');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const botActiveNotice = document.getElementById('bot-active-notice');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsOverlay = document.getElementById('settings-overlay');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const openaiKeyInput = document.getElementById('openai-key-input');
const geminiKeyInput = document.getElementById('gemini-key-input');
const saveOpenaiKeyBtn = document.getElementById('save-openai-key');
const deleteOpenaiKeyBtn = document.getElementById('delete-openai-key');
const saveGeminiKeyBtn = document.getElementById('save-gemini-key');
const deleteGeminiKeyBtn = document.getElementById('delete-gemini-key');
const exportKeysBtn = document.getElementById('export-keys-btn');

// Attachment Elements
const attachImageBtn = document.getElementById('attach-image-btn');
const attachDocBtn = document.getElementById('attach-doc-btn');
const sendButtonsBtn = document.getElementById('send-buttons-btn');
const imageUpload = document.getElementById('image-upload');
const docUpload = document.getElementById('doc-upload');

// Buttons Modal Elements
const manageButtonsBtn = document.getElementById('manage-buttons-btn');
const buttonsModal = document.getElementById('buttons-modal');
const buttonsModalOverlay = document.getElementById('buttons-modal-overlay');
const closeButtonsModalBtn = document.getElementById('close-buttons-modal-btn');
const buttonsList = document.getElementById('buttons-list');
const btnNameInput = document.getElementById('btn-name-input');
const btnTitleInput = document.getElementById('btn-title-input');
const btnBodyInput = document.getElementById('btn-body-input');
const btnFooterInput = document.getElementById('btn-footer-input');
const buttonsInputs = document.getElementById('buttons-inputs');
const addButtonRowBtn = document.getElementById('add-button-row-btn');
const saveNewButtonBtn = document.getElementById('save-new-button-btn');

// Send Button Modal Elements
const sendButtonModal = document.getElementById('send-button-modal');
const sendButtonModalOverlay = document.getElementById('send-button-modal-overlay');
const closeSendButtonModalBtn = document.getElementById('close-send-button-modal-btn');
const availableButtonsList = document.getElementById('available-buttons-list');

// Image Preview Modal Elements
const imagePreviewModal = document.getElementById('image-preview-modal');
const imagePreviewModalOverlay = document.getElementById('image-preview-modal-overlay');
const closeImagePreviewBtn = document.getElementById('close-image-preview-btn');
const previewImage = document.getElementById('preview-image');
const imageCaptionInput = document.getElementById('image-caption-input');
const confirmSendImageBtn = document.getElementById('confirm-send-image-btn');

// Doc Preview Modal Elements
const docPreviewModal = document.getElementById('doc-preview-modal');
const docPreviewModalOverlay = document.getElementById('doc-preview-modal-overlay');
const closeDocPreviewBtn = document.getElementById('close-doc-preview-btn');
const docNameEl = document.getElementById('doc-name');
const docSizeEl = document.getElementById('doc-size');
const docCaptionInput = document.getElementById('doc-caption-input');
const confirmSendDocBtn = document.getElementById('confirm-send-doc-btn');

// Session buttons cache
const sessionButtonsCache = new Map();
let pendingFileUpload = null;

// Edit Chat Modal Elements
const editChatModal = document.getElementById('edit-chat-modal');
const editChatModalOverlay = document.getElementById('edit-chat-modal-overlay');
const closeEditChatBtn = document.getElementById('close-edit-chat-btn');
const chatCustomNameInput = document.getElementById('chat-custom-name-input');
const chatDescriptionInput = document.getElementById('chat-description-input');
const saveChatInfoBtn = document.getElementById('save-chat-info-btn');

// Current chat being edited
let editingChatData = null;

modelProviderSelect.dataset.prevProvider = modelProviderSelect.value || 'gemini';

// Helpers
function normalizeProvider(provider) {
    return provider === 'openai' ? 'openai' : 'gemini';
}

function normalizeSessionPayload(payload = {}) {
    const provider = normalizeProvider(payload.modelProvider);
    const modelName = (payload.modelName || '').trim() || DEFAULT_MODELS[provider];

    return {
        id: payload.id,
        status: payload.status || 'connecting',
        user: payload.user || null,
        botEnabled: Boolean(payload.botEnabled),
        hasApiKey: Boolean(payload.hasApiKey),
        modelProvider: provider,
        modelName,
        systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : ''
    };
}

function normalizeConversation(conv = {}) {
    const normalizedMessages = Array.isArray(conv.messages)
        ? conv.messages.map((msg) => ({
            id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            direction: msg.direction === 'outgoing' ? 'outgoing' : 'incoming',
            text: msg.text || '',
            timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()
        }))
        : [];

    const lastMessage = normalizedMessages.length ? normalizedMessages[normalizedMessages.length - 1] : null;

    return {
        chatId: conv.chatId,
        title: conv.title || conv.chatId || 'Chat',
        customName: conv.customName || '',
        description: conv.description || '',
        lastMessageText: conv.lastMessageText || lastMessage?.text || '',
        lastMessageAt: typeof conv.lastMessageAt === 'number' ? conv.lastMessageAt : lastMessage?.timestamp || Date.now(),
        messages: normalizedMessages
    };
}

function upsertConversation(sessionId, conversation) {
    if (!conversation) return null;
    const normalized = normalizeConversation(conversation);
    let sessionConversations = conversationCache.get(sessionId);
    if (!sessionConversations) {
        sessionConversations = new Map();
        conversationCache.set(sessionId, sessionConversations);
    }
    sessionConversations.set(normalized.chatId, normalized);
    return normalized;
}

function getConversationsForSession(sessionId) {
    return conversationCache.get(sessionId) || new Map();
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncateText(text, max = 60) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function createMessageBubble(message) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}`;

    const textNode = document.createElement('div');
    textNode.textContent = message.text || '';

    const meta = document.createElement('span');
    meta.className = 'message-meta';
    meta.textContent = formatTimestamp(message.timestamp);

    bubble.appendChild(textNode);
    bubble.appendChild(meta);
    return bubble;
}

function scrollToBottom(element, smooth = true) {
    if (!element) return;
    element.scrollTo({
        top: element.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    });
}

// Config Panel Toggle
function toggleConfigPanel() {
    if (configPanel.classList.contains('collapsed')) {
        configPanel.classList.remove('collapsed');
        configPanel.classList.add('expanded');
        toggleConfigBtn.querySelector('span:last-child').textContent = 'Ocultar';
    } else {
        configPanel.classList.add('collapsed');
        configPanel.classList.remove('expanded');
        toggleConfigBtn.querySelector('span:last-child').textContent = 'Configuración';
    }
}

// Funnel/Kanban Functions
function loadFunnelData() {
    try {
        const stored = localStorage.getItem(FUNNEL_STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            if (data.titles) funnelTitles = { ...DEFAULT_FUNNEL_STAGES, ...data.titles };
            if (data.stages && currentSessionId) {
                const sessionStages = data.stages[currentSessionId] || {};
                Object.entries(sessionStages).forEach(([chatId, stage]) => {
                    conversationStages.set(chatId, stage);
                });
            }
        }
    } catch (e) {
        console.error('Error loading funnel data:', e);
    }
}

function saveFunnelData() {
    try {
        const stored = localStorage.getItem(FUNNEL_STORAGE_KEY);
        let data = stored ? JSON.parse(stored) : { titles: {}, stages: {} };
        
        data.titles = funnelTitles;
        
        if (currentSessionId) {
            if (!data.stages) data.stages = {};
            data.stages[currentSessionId] = {};
            conversationStages.forEach((stage, chatId) => {
                data.stages[currentSessionId][chatId] = stage;
            });
        }
        
        localStorage.setItem(FUNNEL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving funnel data:', e);
    }
}

function getConversationStage(chatId) {
    return conversationStages.get(chatId) || 'interest';
}

function setConversationStage(chatId, stage) {
    conversationStages.set(chatId, stage);
    saveFunnelData();
}

function updateFunnelTitle(stage, newTitle) {
    funnelTitles[stage] = newTitle;
    saveFunnelData();
    
    const titleEl = document.querySelector(`.kanban-title[data-stage="${stage}"]`);
    if (titleEl) {
        titleEl.textContent = newTitle;
    }
}

function renderKanbanBoard(sessionId, filterQuery = '') {
    const sessionConversations = getConversationsForSession(sessionId);
    
    // Limpiar todas las columnas
    STAGE_ORDER.forEach(stage => {
        const cardsContainer = document.getElementById(`cards-${stage}`);
        const countEl = document.getElementById(`count-${stage}`);
        if (cardsContainer) cardsContainer.innerHTML = '';
        if (countEl) countEl.textContent = '0';
    });
    
    if (!sessionConversations || sessionConversations.size === 0) {
        STAGE_ORDER.forEach(stage => {
            const cardsContainer = document.getElementById(`cards-${stage}`);
            if (cardsContainer) {
                cardsContainer.classList.add('empty-state');
                cardsContainer.innerHTML = '<span>Sin conversaciones</span>';
            }
        });
        return;
    }
    
    // Actualizar títulos
    STAGE_ORDER.forEach(stage => {
        const titleEl = document.querySelector(`.kanban-title[data-stage="${stage}"]`);
        if (titleEl) titleEl.textContent = funnelTitles[stage];
    });
    
    // Agrupar conversaciones por stage
    const grouped = { interest: [], quote: [], negotiation: [], closed: [] };
    
    let conversations = Array.from(sessionConversations.values())
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    
    // Filtrar si hay query
    if (filterQuery) {
        const query = filterQuery.toLowerCase();
        conversations = conversations.filter(conv => 
            conv.title.toLowerCase().includes(query) ||
            conv.lastMessageText.toLowerCase().includes(query)
        );
    }
    
    conversations.forEach(conv => {
        const stage = getConversationStage(conv.chatId);
        if (grouped[stage]) {
            grouped[stage].push(conv);
        } else {
            grouped.interest.push(conv);
        }
    });
    
    // Renderizar cards en cada columna
    STAGE_ORDER.forEach(stage => {
        const cardsContainer = document.getElementById(`cards-${stage}`);
        const countEl = document.getElementById(`count-${stage}`);
        
        if (!cardsContainer) return;
        
        cardsContainer.classList.remove('empty-state');
        cardsContainer.innerHTML = '';
        
        const stageConversations = grouped[stage];
        countEl.textContent = stageConversations.length;
        
        if (stageConversations.length === 0) {
            cardsContainer.classList.add('empty-state');
            cardsContainer.innerHTML = '<span>Sin conversaciones</span>';
            return;
        }
        
        stageConversations.forEach(conversation => {
            const card = createKanbanCard(conversation, stage);
            cardsContainer.appendChild(card);
        });
    });
}

function createKanbanCard(conversation, currentStage) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.dataset.chatId = conversation.chatId;
    card.dataset.stage = currentStage;
    card.draggable = true;
    
    const stageIndex = STAGE_ORDER.indexOf(currentStage);
    const canMoveLeft = stageIndex > 0;
    const canMoveRight = stageIndex < STAGE_ORDER.length - 1;
    
    // Usar nombre personalizado si existe, sino usar el título de WhatsApp
    const displayName = conversation.customName || conversation.title;
    const hasDescription = conversation.description && conversation.description.trim();
    
    card.innerHTML = `
        <div class="kanban-card-header">
            <div class="kanban-card-avatar">${getInitials(displayName)}</div>
            <div class="kanban-card-name">${displayName}</div>
            <button class="kanban-card-edit-btn" title="Editar información">✏️</button>
        </div>
        ${hasDescription ? `<div class="kanban-card-description">${conversation.description}</div>` : ''}
        <div class="kanban-card-preview">${truncateText(conversation.lastMessageText, 60) || 'Sin mensajes'}</div>
        <div class="kanban-card-meta">
            <span>${formatTimestamp(conversation.lastMessageAt)}</span>
            <span class="kanban-card-badge">${conversation.messages.length}</span>
        </div>
        <div class="kanban-card-actions">
            <button class="btn-move btn-move-left" ${!canMoveLeft ? 'disabled' : ''} title="Mover a ${canMoveLeft ? funnelTitles[STAGE_ORDER[stageIndex - 1]] : ''}">←</button>
            <button class="btn-move btn-move-chat" title="Abrir chat">💬</button>
            <button class="btn-move btn-move-right" ${!canMoveRight ? 'disabled' : ''} title="Mover a ${canMoveRight ? funnelTitles[STAGE_ORDER[stageIndex + 1]] : ''}">→</button>
        </div>
    `;
    
    // Event listeners
    card.querySelector('.btn-move-left').onclick = (e) => {
        e.stopPropagation();
        if (canMoveLeft) {
            moveConversationToStage(conversation.chatId, STAGE_ORDER[stageIndex - 1]);
        }
    };
    
    card.querySelector('.btn-move-right').onclick = (e) => {
        e.stopPropagation();
        if (canMoveRight) {
            moveConversationToStage(conversation.chatId, STAGE_ORDER[stageIndex + 1]);
        }
    };
    
    card.querySelector('.btn-move-chat').onclick = (e) => {
        e.stopPropagation();
        openChat(conversation);
    };
    
    card.querySelector('.kanban-card-edit-btn').onclick = (e) => {
        e.stopPropagation();
        openEditChatModal(conversation);
    };
    
    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    return card;
}

function moveConversationToStage(chatId, newStage) {
    setConversationStage(chatId, newStage);
    renderKanbanBoard(currentSessionId, conversationSearchInput?.value || '');
    showToast(`Movido a ${funnelTitles[newStage]}`);
    
    // Notificar al servidor
    socket.emit('update_conversation_stage', {
        sessionId: currentSessionId,
        chatId,
        stage: newStage
    });
}

// Drag and Drop
function handleDragStart(e) {
    draggedCard = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.chatId);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedCard = null;
    
    // Remover estilos de drag-over de todas las columnas
    document.querySelectorAll('.kanban-cards').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const column = e.target.closest('.kanban-cards');
    if (column) {
        column.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const column = e.target.closest('.kanban-cards');
    if (column && !column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    const column = e.target.closest('.kanban-cards');
    if (!column || !draggedCard) return;
    
    column.classList.remove('drag-over');
    
    const chatId = draggedCard.dataset.chatId;
    const newStage = column.dataset.stage;
    const oldStage = draggedCard.dataset.stage;
    
    if (newStage && newStage !== oldStage) {
        moveConversationToStage(chatId, newStage);
    }
}

// Title editing
function setupTitleEditing() {
    document.querySelectorAll('.kanban-title').forEach(titleEl => {
        titleEl.addEventListener('dblclick', () => {
            const stage = titleEl.dataset.stage;
            const currentTitle = funnelTitles[stage];
            
            titleEl.contentEditable = true;
            titleEl.classList.add('editing');
            titleEl.focus();
            
            // Seleccionar todo el texto
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            const finishEditing = () => {
                titleEl.contentEditable = false;
                titleEl.classList.remove('editing');
                const newTitle = titleEl.textContent.trim() || currentTitle;
                updateFunnelTitle(stage, newTitle);
            };
            
            titleEl.addEventListener('blur', finishEditing, { once: true });
            titleEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleEl.blur();
                }
                if (e.key === 'Escape') {
                    titleEl.textContent = currentTitle;
                    titleEl.blur();
                }
            });
        });
    });
}

function setupKanbanDragDrop() {
    document.querySelectorAll('.kanban-cards').forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
    });
}

// Netflix-style Conversation Cards
function renderConversationCards(sessionId, filterQuery = '') {
    if (!conversationCardsEl) return;
    const sessionConversations = getConversationsForSession(sessionId);
    const isEmpty = !sessionConversations || sessionConversations.size === 0;

    conversationCardsEl.classList.toggle('empty-state', isEmpty);

    if (isEmpty) {
        conversationCardsEl.innerHTML = '<p>No hay conversaciones registradas todavía.</p>';
        return;
    }

    conversationCardsEl.innerHTML = '';
    let conversations = Array.from(sessionConversations.values())
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    // Filtrar si hay query
    if (filterQuery) {
        const query = filterQuery.toLowerCase();
        conversations = conversations.filter(conv => 
            conv.title.toLowerCase().includes(query) ||
            conv.lastMessageText.toLowerCase().includes(query)
        );
    }

    if (conversations.length === 0) {
        conversationCardsEl.innerHTML = '<p>No se encontraron conversaciones.</p>';
        return;
    }

    conversations.forEach((conversation) => {
        const card = document.createElement('div');
        card.className = 'conv-card';
        card.dataset.chatId = conversation.chatId;
        
        card.innerHTML = `
            <div class="conv-card-header">
                <div class="conv-card-avatar">${getInitials(conversation.title)}</div>
                <div class="conv-card-name">${conversation.title}</div>
            </div>
            <div class="conv-card-body">
                <div class="conv-card-preview">${truncateText(conversation.lastMessageText, 80) || 'Sin mensajes'}</div>
                <div class="conv-card-meta">
                    <span>${formatTimestamp(conversation.lastMessageAt)}</span>
                    <span class="conv-card-badge">${conversation.messages.length}</span>
                </div>
            </div>
        `;
        
        card.onclick = () => openChat(conversation);
        conversationCardsEl.appendChild(card);
    });
}

// Active Chat Functions
function openChat(conversation) {
    if (!conversation) return;
    activeChat = conversation;
    
    // Ocultar kanban y mostrar chat
    if (kanbanBoard) kanbanBoard.classList.add('hidden');
    activeChatEl.classList.remove('hidden');
    
    // Actualizar header - usar nombre personalizado si existe
    const displayName = conversation.customName || conversation.title;
    chatContactName.textContent = displayName;
    const stage = getConversationStage(conversation.chatId);
    chatContactStatus.textContent = `${conversation.messages.length} mensajes · ${funnelTitles[stage]}`;
    
    // Renderizar mensajes
    renderChatMessages(conversation);
    
    // Mostrar/ocultar input según estado del bot
    const session = getSessionById(currentSessionId);
    if (session?.botEnabled) {
        chatInputContainer.classList.add('hidden');
        botActiveNotice.classList.remove('hidden');
    } else {
        chatInputContainer.classList.remove('hidden');
        botActiveNotice.classList.add('hidden');
    }
    
    // Scroll al final
    setTimeout(() => scrollToBottom(chatMessagesEl), 100);
}

function closeChat() {
    activeChat = null;
    activeChatEl.classList.add('hidden');
    if (kanbanBoard) kanbanBoard.classList.remove('hidden');
}

function renderChatMessages(conversation) {
    if (!chatMessagesEl || !conversation) return;
    chatMessagesEl.innerHTML = '';
    
    conversation.messages.forEach((message) => {
        chatMessagesEl.appendChild(createMessageBubble(message));
    });
}

function sendManualMessage() {
    if (!activeChat || !currentSessionId) return;
    
    const text = chatInput.value.trim();
    if (!text) return;
    
    socket.emit('send_manual_message', {
        sessionId: currentSessionId,
        chatId: activeChat.chatId,
        text
    });
    
    chatInput.value = '';
}

function showTypingIndicator(chatId) {
    if (!activeChat || activeChat.chatId !== chatId) return;
    
    // Remover indicador existente
    hideTypingIndicator(chatId);
    
    const typingBubble = document.createElement('div');
    typingBubble.className = 'message-bubble typing-indicator';
    typingBubble.id = `typing-${chatId}`;
    typingBubble.innerHTML = '<span></span><span></span><span></span>';
    
    chatMessagesEl.appendChild(typingBubble);
    scrollToBottom(chatMessagesEl);
}

function hideTypingIndicator(chatId) {
    const indicator = document.getElementById(`typing-${chatId}`);
    if (indicator) {
        indicator.remove();
    }
}

// Loading State
function showLoadingState(element, message = 'Cargando...') {
    if (!element) return null;
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.innerHTML = `<span class="spinner"></span><span>${message}</span>`;
    element.appendChild(loader);
    return loader;
}

function removeLoadingState(loader) {
    if (loader && loader.parentElement) {
        loader.parentElement.removeChild(loader);
    }
}

function requestConversations(sessionId) {
    if (!sessionId) return;
    
    try {
        // Usar el primer contenedor de Kanban para mostrar el loader
        const kanbanContainer = document.getElementById('kanban-interest');
        if (kanbanContainer) {
            kanbanContainer.innerHTML = '<p class="loading-text">Cargando conversaciones...</p>';
        }
        
        const timeout = setTimeout(() => {
            showAlertDialog('Tiempo de espera agotado al cargar conversaciones');
        }, 10000);
        
        // Guardar timeout para limpiarlo después
        window.conversationTimeout = timeout;
        socket.emit('get_conversations', { id: sessionId });
    } catch (error) {
        console.error('Error requesting conversations:', error);
        showAlertDialog('Error al solicitar conversaciones');
    }
}

// Toast & Dialogs
function showToast(message = 'Acción completada', duration = 2500) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastEl.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    if (toastHideTimeout) clearTimeout(toastHideTimeout);
    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show');
        toastHideTimeout = setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 300);
    }, duration);
}

function showSaveFeedback(message = 'Cambios guardados') {
    if (saveFeedback) {
        saveFeedback.textContent = message;
        saveFeedback.classList.remove('hidden');
        if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);
        saveFeedbackTimeout = setTimeout(() => {
            saveFeedback.classList.add('hidden');
        }, 2500);
    }
    showToast(message);
}

function showConfirmDialog(message, onConfirm, onCancel = null) {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-content">
                <p>${message}</p>
                <div class="confirm-actions">
                    <button class="btn-secondary" id="confirm-cancel">Cancelar</button>
                    <button class="btn-danger" id="confirm-ok">Confirmar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    const okBtn = dialog.querySelector('#confirm-ok');
    const cancelBtn = dialog.querySelector('#confirm-cancel');
    
    const cleanup = () => dialog.remove();
    
    okBtn.onclick = () => { onConfirm(); cleanup(); };
    cancelBtn.onclick = () => { if (onCancel) onCancel(); cleanup(); };
    dialog.onclick = (e) => { if (e.target === dialog) { if (onCancel) onCancel(); cleanup(); } };
}

function showAlertDialog(message) {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
        <div class="confirm-dialog alert-dialog">
            <div class="confirm-content">
                <p>${message}</p>
                <div class="confirm-actions">
                    <button class="btn-primary" id="alert-ok">Aceptar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    const okBtn = dialog.querySelector('#alert-ok');
    const cleanup = () => dialog.remove();
    
    okBtn.onclick = cleanup;
    dialog.onclick = (e) => { if (e.target === dialog) cleanup(); };
}

// Session Management
function getSessionById(id) {
    return sessions.find((session) => session.id === id);
}

function renderSessionList() {
    sessionListEl.innerHTML = '';
    sessions.forEach((session) => {
        const li = document.createElement('li');
        li.className = `session-item ${currentSessionId === session.id ? 'active' : ''}`;
        
        // Extraer número de teléfono (últimos 10 dígitos)
        const phoneNumber = extractPhoneNumber(session.user);
        
        li.innerHTML = `
            <div class="session-item-row">
                <div class="session-item-info">
                    <span class="session-item-name">${session.id}</span>
                    ${phoneNumber ? `<span class="session-item-phone">${phoneNumber}</span>` : '<span class="session-item-phone">Sin conectar</span>'}
                </div>
                <div class="status-indicator ${session.status === 'connected' ? 'status-connected' : ''}"></div>
            </div>
        `;
        li.onclick = () => {
            selectSession(session.id);
            closeSidebar();
        };
        sessionListEl.appendChild(li);
    });
}

// Extraer número de teléfono de 10 dígitos del objeto user
function extractPhoneNumber(user) {
    if (!user || !user.id) return null;
    
    // El ID viene en formato "521234567890:XX@s.whatsapp.net" o "521234567890@s.whatsapp.net"
    let fullNumber = user.id.split('@')[0];
    
    // Remover sufijo después de ":" si existe (ej: "521234567890:45")
    if (fullNumber.includes(':')) {
        fullNumber = fullNumber.split(':')[0];
    }
    
    // Extraer solo dígitos
    const digitsOnly = fullNumber.replace(/\D/g, '');
    
    // Obtener los últimos 10 dígitos (número sin código de país)
    if (digitsOnly && digitsOnly.length >= 10) {
        const last10 = digitsOnly.slice(-10);
        // Formatear como (XXX) XXX-XXXX
        return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
    }
    
    return digitsOnly || null;
}

function formatBotStatus(session) {
    const providerLabel = session.modelProvider === 'openai' ? 'OpenAI' : 'Gemini';
    const modelLabel = session.modelName ? ` · ${session.modelName}` : '';
    return session.botEnabled ? `Bot habilitado (${providerLabel}${modelLabel})` : 'Bot deshabilitado';
}

function updateSessionDetails(session) {
    welcomeScreen.classList.add('hidden');
    sessionDetails.classList.remove('hidden');
    
    sessionTitle.textContent = session.id;
    
    const isConnected = session.status === 'connected';
    connectionStatus.textContent = isConnected ? 'Conectado' : 'Conectando...';
    statusDot.classList.toggle('connected', isConnected);
    
    if (isConnected) {
        qrContainer.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userName.textContent = session.user?.name || session.user?.id || 'Desconocido';
    } else {
        userInfo.classList.add('hidden');
        qrContainer.classList.remove('hidden');
    }

    botToggle.checked = session.botEnabled || false;
    botStatusText.textContent = formatBotStatus(session);

    const provider = session.modelProvider || 'gemini';
    modelProviderSelect.value = provider;
    modelProviderSelect.dataset.prevProvider = provider;
    providerPill.textContent = provider === 'openai' ? 'OpenAI' : 'Gemini';
    modelNameInput.placeholder = DEFAULT_MODELS[provider];
    modelNameInput.value = session.modelName || DEFAULT_MODELS[provider];
    systemPromptInput.value = session.systemPrompt || '';

    // Actualizar input container si hay chat activo
    if (activeChat) {
        if (session.botEnabled) {
            chatInputContainer.classList.add('hidden');
            botActiveNotice.classList.remove('hidden');
        } else {
            chatInputContainer.classList.remove('hidden');
            botActiveNotice.classList.add('hidden');
        }
    }

    renderKanbanBoard(session.id);
}

function showWelcome() {
    welcomeScreen.classList.remove('hidden');
    sessionDetails.classList.add('hidden');
    currentSessionId = null;
    activeChat = null;
}

// API Keys Management
function loadApiKeys() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveApiKeys(apiKeys) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(apiKeys));
}

function getStoredApiKey(provider) {
    const keys = loadApiKeys();
    return keys[provider];
}

function syncApiKeyInputs() {
    const keys = loadApiKeys();
    openaiKeyInput.value = keys.openai || '';
    geminiKeyInput.value = keys.gemini || '';
}

function openSettingsModal() {
    syncApiKeyInputs();
    settingsModal.classList.remove('hidden');
    settingsOverlay.classList.remove('hidden');
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
    settingsOverlay.classList.add('hidden');
}

function handleSaveKey(provider) {
    const input = provider === 'openai' ? openaiKeyInput : geminiKeyInput;
    const value = input.value.trim();
    if (!value) {
        showAlertDialog('Ingresa una clave antes de guardar.');
        return;
    }
    const keys = loadApiKeys();
    keys[provider] = value;
    saveApiKeys(keys);
    showToast('Clave guardada');
}

function handleDeleteKey(provider) {
    const keys = loadApiKeys();
    if (keys[provider]) {
        const providerName = provider === 'openai' ? 'OpenAI' : 'Gemini';
        showConfirmDialog(
            `¿Eliminar la clave de ${providerName}?`,
            () => {
                delete keys[provider];
                saveApiKeys(keys);
                if (provider === 'openai') {
                    openaiKeyInput.value = '';
                } else {
                    geminiKeyInput.value = '';
                }
                showToast('Clave eliminada');
            }
        );
    }
}

function exportKeys() {
    const keys = loadApiKeys();
    const payload = {
        exportedAt: new Date().toISOString(),
        providers: keys
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wbot-api-keys.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Claves exportadas');
}

function exportConversation(conversation) {
    if (!conversation || !conversation.messages) return;
    
    const text = conversation.messages.map(msg => {
        const timestamp = formatTimestamp(msg.timestamp);
        const role = msg.direction === 'incoming' ? 'Usuario' : 'Bot';
        return `[${timestamp}] ${role}: ${msg.text}`;
    }).join('\n\n');
    
    const header = `Conversación: ${conversation.title}\nExportada: ${new Date().toLocaleString('es-ES')}\n${'='.repeat(60)}\n\n`;
    const fullText = header + text;
    
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Conversación exportada');
}

// ==================== FILE UPLOAD FUNCTIONS ====================

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Error al subir archivo');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Upload error:', error);
        showAlertDialog('Error al subir el archivo: ' + error.message);
        return null;
    }
}

function openImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        imageCaptionInput.value = '';
        imagePreviewModal.classList.remove('hidden');
        imagePreviewModalOverlay.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    pendingFileUpload = file;
}

function closeImagePreview() {
    imagePreviewModal.classList.add('hidden');
    imagePreviewModalOverlay.classList.add('hidden');
    pendingFileUpload = null;
    previewImage.src = '';
    imageCaptionInput.value = '';
}

function openDocPreview(file) {
    docNameEl.textContent = file.name;
    docSizeEl.textContent = formatFileSize(file.size);
    docCaptionInput.value = '';
    docPreviewModal.classList.remove('hidden');
    docPreviewModalOverlay.classList.remove('hidden');
    pendingFileUpload = file;
}

function closeDocPreview() {
    docPreviewModal.classList.add('hidden');
    docPreviewModalOverlay.classList.add('hidden');
    pendingFileUpload = null;
    docCaptionInput.value = '';
}

async function sendImage() {
    if (!pendingFileUpload || !activeChat || !currentSessionId) return;
    
    confirmSendImageBtn.disabled = true;
    confirmSendImageBtn.textContent = 'Enviando...';
    
    try {
        const uploadResult = await uploadFile(pendingFileUpload);
        if (!uploadResult || !uploadResult.success) {
            throw new Error('Error al subir imagen');
        }
        
        socket.emit('send_image', {
            sessionId: currentSessionId,
            chatId: activeChat.chatId,
            filePath: uploadResult.filePath,
            caption: imageCaptionInput.value.trim()
        });
        
        closeImagePreview();
        showToast('Imagen enviada');
    } catch (error) {
        showAlertDialog('Error al enviar imagen: ' + error.message);
    } finally {
        confirmSendImageBtn.disabled = false;
        confirmSendImageBtn.textContent = 'Enviar imagen';
    }
}

async function sendDocument() {
    if (!pendingFileUpload || !activeChat || !currentSessionId) return;
    
    confirmSendDocBtn.disabled = true;
    confirmSendDocBtn.textContent = 'Enviando...';
    
    try {
        const uploadResult = await uploadFile(pendingFileUpload);
        if (!uploadResult || !uploadResult.success) {
            throw new Error('Error al subir documento');
        }
        
        socket.emit('send_document', {
            sessionId: currentSessionId,
            chatId: activeChat.chatId,
            filePath: uploadResult.filePath,
            fileName: pendingFileUpload.name,
            caption: docCaptionInput.value.trim()
        });
        
        closeDocPreview();
        showToast('Documento enviado');
    } catch (error) {
        showAlertDialog('Error al enviar documento: ' + error.message);
    } finally {
        confirmSendDocBtn.disabled = false;
        confirmSendDocBtn.textContent = 'Enviar documento';
    }
}

// ==================== BUTTONS MANAGEMENT FUNCTIONS ====================

function openButtonsModal() {
    buttonsModal.classList.remove('hidden');
    buttonsModalOverlay.classList.remove('hidden');
    renderButtonsList();
    resetButtonForm();
}

function closeButtonsModal() {
    buttonsModal.classList.add('hidden');
    buttonsModalOverlay.classList.add('hidden');
}

function openSendButtonModal() {
    if (!currentSessionId) return;
    
    const buttons = sessionButtonsCache.get(currentSessionId) || [];
    
    if (buttons.length === 0) {
        showAlertDialog('No hay botones configurados. Configúralos primero desde el botón "Botones" en la barra superior.');
        return;
    }
    
    renderAvailableButtons(buttons);
    sendButtonModal.classList.remove('hidden');
    sendButtonModalOverlay.classList.remove('hidden');
}

function closeSendButtonModal() {
    sendButtonModal.classList.add('hidden');
    sendButtonModalOverlay.classList.add('hidden');
}

function renderButtonsList() {
    if (!currentSessionId) {
        buttonsList.innerHTML = '<p class="empty-buttons">Selecciona una sesión primero</p>';
        return;
    }
    
    const buttons = sessionButtonsCache.get(currentSessionId) || [];
    
    if (buttons.length === 0) {
        buttonsList.innerHTML = '<p class="empty-buttons">No hay botones configurados</p>';
        return;
    }
    
    buttonsList.innerHTML = buttons.map(btn => `
        <div class="button-config-card" data-id="${btn.id}">
            <div class="button-config-header">
                <span class="button-config-name">${btn.name}</span>
                <div class="button-config-actions">
                    <button class="btn-icon btn-delete-config" data-id="${btn.id}" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="button-config-preview">${btn.body || btn.title}</div>
            <div class="button-config-buttons">
                ${btn.buttons.map(b => `<span class="preview-button-tag">${b.text}</span>`).join('')}
            </div>
        </div>
    `).join('');
    
    // Añadir event listeners para eliminar
    buttonsList.querySelectorAll('.btn-delete-config').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const btnId = btn.dataset.id;
            showConfirmDialog('¿Eliminar este mensaje con botones?', () => {
                socket.emit('delete_session_button', {
                    sessionId: currentSessionId,
                    buttonId: btnId
                });
            });
        };
    });
}

function renderAvailableButtons(buttons) {
    if (buttons.length === 0) {
        availableButtonsList.innerHTML = '<p class="empty-buttons">No hay botones configurados. Configúralos primero.</p>';
        return;
    }
    
    availableButtonsList.innerHTML = buttons.map(btn => `
        <div class="available-button-item" data-id="${btn.id}">
            <div class="available-button-name">${btn.name}</div>
            <div class="available-button-preview">${btn.body || btn.title}</div>
            <div class="available-button-tags">
                ${btn.buttons.map(b => `<span class="preview-button-tag">${b.text}</span>`).join('')}
            </div>
        </div>
    `).join('');
    
    // Añadir event listeners para enviar
    availableButtonsList.querySelectorAll('.available-button-item').forEach(item => {
        item.onclick = () => {
            const btnId = item.dataset.id;
            const buttonConfig = buttons.find(b => b.id === btnId);
            if (buttonConfig) {
                sendButtonMessage(buttonConfig);
            }
        };
    });
}

function sendButtonMessage(buttonConfig) {
    if (!activeChat || !currentSessionId) {
        showAlertDialog('No hay chat activo');
        return;
    }
    
    socket.emit('send_button_message', {
        sessionId: currentSessionId,
        chatId: activeChat.chatId,
        buttonConfig: {
            title: buttonConfig.title,
            body: buttonConfig.body,
            footer: buttonConfig.footer,
            buttons: buttonConfig.buttons
        }
    });
    
    closeSendButtonModal();
    showToast('Enviando mensaje con botones...');
}

function resetButtonForm() {
    btnNameInput.value = '';
    btnTitleInput.value = '';
    btnBodyInput.value = '';
    btnFooterInput.value = '';
    
    buttonsInputs.innerHTML = `
        <div class="button-input-row">
            <input type="text" class="btn-text-input" placeholder="Texto del botón">
            <input type="text" class="btn-id-input" placeholder="ID único">
            <button class="btn-remove-row btn-icon" title="Eliminar">×</button>
        </div>
    `;
    
    setupButtonRowListeners();
}

function addButtonRow() {
    const rows = buttonsInputs.querySelectorAll('.button-input-row');
    if (rows.length >= 3) {
        showAlertDialog('Máximo 3 botones por mensaje');
        return;
    }
    
    const newRow = document.createElement('div');
    newRow.className = 'button-input-row';
    newRow.innerHTML = `
        <input type="text" class="btn-text-input" placeholder="Texto del botón">
        <input type="text" class="btn-id-input" placeholder="ID único">
        <button class="btn-remove-row btn-icon" title="Eliminar">×</button>
    `;
    
    buttonsInputs.appendChild(newRow);
    setupButtonRowListeners();
}

function setupButtonRowListeners() {
    buttonsInputs.querySelectorAll('.btn-remove-row').forEach(btn => {
        btn.onclick = (e) => {
            const rows = buttonsInputs.querySelectorAll('.button-input-row');
            if (rows.length > 1) {
                btn.parentElement.remove();
            }
        };
    });
}

function saveNewButton() {
    if (!currentSessionId) {
        showAlertDialog('Selecciona una sesión primero');
        return;
    }
    
    const name = btnNameInput.value.trim();
    const title = btnTitleInput.value.trim();
    const body = btnBodyInput.value.trim();
    const footer = btnFooterInput.value.trim();
    
    if (!name) {
        showAlertDialog('El nombre es requerido');
        return;
    }
    
    if (!body && !title) {
        showAlertDialog('El cuerpo o título del mensaje es requerido');
        return;
    }
    
    const buttonRows = buttonsInputs.querySelectorAll('.button-input-row');
    const buttons = [];
    
    buttonRows.forEach(row => {
        const text = row.querySelector('.btn-text-input').value.trim();
        const id = row.querySelector('.btn-id-input').value.trim();
        
        if (text && id) {
            buttons.push({ text, id, type: 'quick_reply' });
        }
    });
    
    if (buttons.length === 0) {
        showAlertDialog('Añade al menos un botón con texto e ID');
        return;
    }
    
    const newButtonConfig = {
        id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        title,
        body,
        footer,
        buttons
    };
    
    const existingButtons = sessionButtonsCache.get(currentSessionId) || [];
    existingButtons.push(newButtonConfig);
    
    socket.emit('save_session_buttons', {
        sessionId: currentSessionId,
        buttons: existingButtons
    });
    
    resetButtonForm();
    showToast('Botón guardado');
}

function requestSessionButtons(sessionId) {
    if (!sessionId) return;
    socket.emit('get_session_buttons', { sessionId });
}

// ==================== EDIT CHAT INFO FUNCTIONS ====================

function openEditChatModal(conversation) {
    if (!conversation || !currentSessionId) return;
    
    editingChatData = conversation;
    chatCustomNameInput.value = conversation.customName || '';
    chatDescriptionInput.value = conversation.description || '';
    
    editChatModal.classList.remove('hidden');
    editChatModalOverlay.classList.remove('hidden');
    chatCustomNameInput.focus();
}

function closeEditChatModal() {
    editChatModal.classList.add('hidden');
    editChatModalOverlay.classList.add('hidden');
    editingChatData = null;
    chatCustomNameInput.value = '';
    chatDescriptionInput.value = '';
}

function saveChatInfo() {
    if (!editingChatData || !currentSessionId) return;
    
    const customName = chatCustomNameInput.value.trim();
    const description = chatDescriptionInput.value.trim();
    
    socket.emit('update_conversation_info', {
        sessionId: currentSessionId,
        chatId: editingChatData.chatId,
        customName,
        description
    });
    
    closeEditChatModal();
    showToast('Información actualizada');
}

function selectSession(id) {
    currentSessionId = id;
    activeChat = null;
    
    // Cargar datos del funnel para esta sesión
    loadFunnelData();
    
    // Asegurar que el chat esté cerrado y el kanban visible
    if (activeChatEl) activeChatEl.classList.add('hidden');
    if (kanbanBoard) kanbanBoard.classList.remove('hidden');
    
    // Colapsar config panel
    configPanel.classList.add('collapsed');
    configPanel.classList.remove('expanded');
    toggleConfigBtn.querySelector('span:last-child').textContent = 'Configuración';
    
    renderSessionList();

    const session = getSessionById(id);
    if (session) {
        updateSessionDetails(session);
    }
    requestConversations(id);
    requestSessionButtons(id);
}

function handleAddSession() {
    const id = newSessionInput.value.trim();
    if (!id) return;

    if (getSessionById(id)) {
        showAlertDialog('La sesión ya existe.');
        return;
    }

    const optimisticSession = normalizeSessionPayload({ id, status: 'connecting' });
    sessions.push(optimisticSession);
    renderSessionList();
    selectSession(id);
    socket.emit('create_session', { id });
    newSessionInput.value = '';
}

function handleDeleteSession() {
    if (!currentSessionId) return;
    showConfirmDialog(
        `¿Eliminar la sesión "${currentSessionId}"?`,
        () => {
            socket.emit('delete_session', { id: currentSessionId });
        }
    );
}

function handleProviderChange() {
    const provider = modelProviderSelect.value;
    const prevProvider = modelProviderSelect.dataset.prevProvider;
    const currentValue = modelNameInput.value.trim();
    modelNameInput.placeholder = DEFAULT_MODELS[provider];
    providerPill.textContent = provider === 'openai' ? 'OpenAI' : 'Gemini';

    if (!currentValue || currentValue === DEFAULT_MODELS[prevProvider]) {
        modelNameInput.value = DEFAULT_MODELS[provider];
    }

    modelProviderSelect.dataset.prevProvider = provider;
}

function handleSaveSessionSettings() {
    if (!currentSessionId) return;
    
    try {
        const provider = normalizeProvider(modelProviderSelect.value);
        const modelName = modelNameInput.value.trim() || DEFAULT_MODELS[provider];
        const systemPrompt = systemPromptInput.value.trim();
        const session = getSessionById(currentSessionId);

        if (session) {
            session.modelProvider = provider;
            session.modelName = modelName;
            session.systemPrompt = systemPrompt;
            updateSessionDetails(session);
        }

        const payload = { id: currentSessionId, modelProvider: provider, modelName, systemPrompt };

        if (session?.botEnabled) {
            const apiKey = getStoredApiKey(provider);
            if (apiKey) {
                payload.apiKey = apiKey;
            }
        }

        socket.emit('update_session_config', payload);
        showSaveFeedback('Cambios guardados');
    } catch (error) {
        console.error('Error saving settings:', error);
        showAlertDialog('Error al guardar la configuración');
    }
}

function handleBotToggle(e) {
    if (!currentSessionId) return;
    const session = getSessionById(currentSessionId);
    if (!session) return;

    try {
        const enabled = e.target.checked;
        const provider = normalizeProvider(modelProviderSelect.value || session.modelProvider);
        const modelName = modelNameInput.value.trim() || session.modelName || DEFAULT_MODELS[provider];
        const systemPrompt = systemPromptInput.value;

        if (enabled) {
            const apiKey = getStoredApiKey(provider);
            if (!apiKey) {
                showAlertDialog(`No hay una clave guardada para ${provider === 'openai' ? 'OpenAI' : 'Gemini'}. Guárdala en el menú de configuración.`);
                e.target.checked = false;
                session.botEnabled = false;
                updateSessionDetails(session);
                return;
            }
            socket.emit('toggle_bot', { id: currentSessionId, enabled: true, apiKey, modelProvider: provider, modelName, systemPrompt });
        } else {
            socket.emit('toggle_bot', { id: currentSessionId, enabled: false });
        }

        session.modelProvider = provider;
        session.modelName = modelName;
        session.systemPrompt = systemPrompt;
        session.botEnabled = enabled;
        updateSessionDetails(session);
    } catch (error) {
        console.error('Error toggling bot:', error);
        showAlertDialog('Error al cambiar el estado del bot');
        e.target.checked = !e.target.checked;
    }
}

// Socket Events
socket.on('init', (data) => {
    sessions = (data || []).map((session) => normalizeSessionPayload(session));
    renderSessionList();
});

socket.on('session_qr', (data) => {
    const { id, qr } = data;
    if (currentSessionId === id) {
        qrImage.src = qr;
        qrContainer.classList.remove('hidden');
        connectionStatus.textContent = 'Escanea el QR';
    }
});

socket.on('session_status', (payload) => {
    const normalized = normalizeSessionPayload(payload);
    let session = getSessionById(normalized.id);

    if (session) {
        Object.assign(session, normalized);
    } else if (normalized.status === 'connected' || normalized.status === 'connecting') {
        sessions.push(normalized);
        session = normalized;
    }

    renderSessionList();

    if (currentSessionId === normalized.id && session) {
        updateSessionDetails(session);
    }
});

socket.on('conversations', (payload) => {
    const { id, conversations } = payload || {};
    if (!id) return;
    
    // Limpiar timeout de carga
    if (window.conversationTimeout) {
        clearTimeout(window.conversationTimeout);
        window.conversationTimeout = null;
    }
    
    try {
        const map = new Map();
        (conversations || []).forEach((conversation) => {
            const normalized = normalizeConversation(conversation);
            map.set(normalized.chatId, normalized);
            
            // Cargar stage desde el servidor si existe
            if (conversation.stage) {
                conversationStages.set(normalized.chatId, conversation.stage);
            }
        });
        conversationCache.set(id, map);

        if (id === currentSessionId) {
            renderKanbanBoard(id);
        }
    } catch (error) {
        console.error('Error processing conversations:', error);
        showAlertDialog('Error al procesar las conversaciones');
    }
});

socket.on('conversation_update', (payload) => {
    const { id, conversation } = payload || {};
    if (!id || !conversation) return;
    const normalized = upsertConversation(id, conversation);
    
    // Cargar stage si viene del servidor
    if (conversation.stage) {
        conversationStages.set(normalized.chatId, conversation.stage);
    }
    
    // Notificación de escritorio para mensajes entrantes
    if (normalized && normalized.messages.length > 0) {
        const lastMsg = normalized.messages[normalized.messages.length - 1];
        if (lastMsg.direction === 'incoming' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`Nuevo mensaje de ${normalized.title}`, {
                body: truncateText(lastMsg.text, 100),
                icon: '/favicon.ico',
                tag: `msg-${normalized.chatId}`,
                requireInteraction: false
            });
        }
    }
    
    if (id === currentSessionId && normalized) {
        renderKanbanBoard(id, conversationSearchInput?.value || '');
        
        // Si el chat activo es este, actualizar mensajes
        if (activeChat && activeChat.chatId === normalized.chatId) {
            activeChat = normalized;
            renderChatMessages(normalized);
            const stage = getConversationStage(normalized.chatId);
            chatContactStatus.textContent = `${normalized.messages.length} mensajes · ${funnelTitles[stage]}`;
            scrollToBottom(chatMessagesEl);
        }
    }
});

socket.on('session_deleted', (data) => {
    const { id } = data;
    sessions = sessions.filter((session) => session.id !== id);
    conversationCache.delete(id);
    renderSessionList();

    if (currentSessionId === id) {
        showWelcome();
    }
});

socket.on('bot_typing', (payload) => {
    const { id, chatId, typing } = payload || {};
    if (id !== currentSessionId) return;
    
    if (typing) {
        showTypingIndicator(chatId);
    } else {
        hideTypingIndicator(chatId);
    }
});

socket.on('message_sent', (payload) => {
    const { sessionId, chatId, success } = payload || {};
    if (!success) {
        showAlertDialog('Error al enviar el mensaje');
    }
});

socket.on('media_sent', (payload) => {
    const { sessionId, chatId, success, type, error } = payload || {};
    if (!success) {
        showAlertDialog(`Error al enviar ${type === 'image' ? 'imagen' : 'documento'}: ${error || 'Error desconocido'}`);
    }
});

socket.on('button_message_sent', (payload) => {
    const { sessionId, chatId, success, error } = payload || {};
    if (success) {
        showToast('Mensaje con botones enviado');
    } else {
        showAlertDialog(`Error al enviar botones: ${error || 'Error desconocido'}`);
    }
});

socket.on('session_buttons', (payload) => {
    const { sessionId, buttons } = payload || {};
    if (sessionId) {
        sessionButtonsCache.set(sessionId, buttons || []);
        if (sessionId === currentSessionId) {
            renderButtonsList();
        }
    }
});

socket.on('session_buttons_updated', (payload) => {
    const { sessionId, buttons } = payload || {};
    if (sessionId) {
        sessionButtonsCache.set(sessionId, buttons || []);
        if (sessionId === currentSessionId) {
            renderButtonsList();
        }
    }
});

socket.on('error', (data) => {
    showAlertDialog(data.message || 'Ha ocurrido un error');
});

// Event Listeners
addSessionBtn.onclick = handleAddSession;
newSessionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleAddSession();
});

deleteSessionBtn.onclick = handleDeleteSession;
toggleConfigBtn.onclick = toggleConfigPanel;
botToggle.onchange = handleBotToggle;
modelProviderSelect.onchange = handleProviderChange;
saveSettingsBtn.onclick = handleSaveSessionSettings;

closeChatBtn.onclick = closeChat;
exportChatBtn.onclick = () => {
    if (activeChat) exportConversation(activeChat);
};
sendMessageBtn.onclick = sendManualMessage;
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendManualMessage();
    }
});

openSettingsBtn.onclick = openSettingsModal;
closeSettingsBtn.onclick = closeSettingsModal;
settingsOverlay.onclick = closeSettingsModal;

refreshConversationsBtn.onclick = () => requestConversations(currentSessionId);

conversationSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (currentSessionId) {
        renderKanbanBoard(currentSessionId, query);
    }
});

// Setup Kanban
setupKanbanDragDrop();
setupTitleEditing();
loadFunnelData();

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeChat) {
            closeChat();
        } else {
            closeSettingsModal();
        }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        conversationSearchInput?.focus();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettingsModal();
    }
});

saveOpenaiKeyBtn.onclick = () => handleSaveKey('openai');
saveGeminiKeyBtn.onclick = () => handleSaveKey('gemini');
deleteOpenaiKeyBtn.onclick = () => handleDeleteKey('openai');
deleteGeminiKeyBtn.onclick = () => handleDeleteKey('gemini');
exportKeysBtn.onclick = exportKeys;

// Attachment Event Listeners
attachImageBtn.onclick = () => imageUpload.click();
attachDocBtn.onclick = () => docUpload.click();
sendButtonsBtn.onclick = openSendButtonModal;

imageUpload.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        openImagePreview(file);
        imageUpload.value = '';
    }
};

docUpload.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        openDocPreview(file);
        docUpload.value = '';
    }
};

// Image Preview Modal
closeImagePreviewBtn.onclick = closeImagePreview;
imagePreviewModalOverlay.onclick = closeImagePreview;
confirmSendImageBtn.onclick = sendImage;

// Doc Preview Modal
closeDocPreviewBtn.onclick = closeDocPreview;
docPreviewModalOverlay.onclick = closeDocPreview;
confirmSendDocBtn.onclick = sendDocument;

// Buttons Modal
manageButtonsBtn.onclick = openButtonsModal;
closeButtonsModalBtn.onclick = closeButtonsModal;
buttonsModalOverlay.onclick = closeButtonsModal;
addButtonRowBtn.onclick = addButtonRow;
saveNewButtonBtn.onclick = saveNewButton;

// Send Button Modal
closeSendButtonModalBtn.onclick = closeSendButtonModal;
sendButtonModalOverlay.onclick = closeSendButtonModal;

// Edit Chat Modal
closeEditChatBtn.onclick = closeEditChatModal;
editChatModalOverlay.onclick = closeEditChatModal;
saveChatInfoBtn.onclick = saveChatInfo;

// Initialize button row listeners
setupButtonRowListeners();

// Sidebar Functions
function openSidebar() {
    sidebar.classList.add('open');
    hamburgerBtn.classList.add('active');
    sidebarOverlay.classList.remove('hidden');
    setTimeout(() => sidebarOverlay.classList.add('visible'), 10);
}

function closeSidebar() {
    sidebar.classList.remove('open');
    hamburgerBtn.classList.remove('active');
    sidebarOverlay.classList.remove('visible');
    setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
}

function toggleSidebar() {
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

// Sidebar Event Listeners
hamburgerBtn.onclick = toggleSidebar;
closeSidebarBtn.onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;
