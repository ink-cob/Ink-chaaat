// АКТИВАЦИЯ И ВЫБОР ЧАТА
function selectChat() {
    document.getElementById('no-chat-selected').classList.add('hidden');
    document.getElementById('active-chat-container').classList.remove('hidden');
    renderChatsList();
    renderChatHeader();
    renderMessages();
}

// ОБНОВЛЕНИЕ ИНФОРМАЦИИ В ШАПКЕ ЧАТА
function renderChatHeader() {
    const chat = getChats().find(c => c.id === currentChatId);
    let users = getUsers();
    const info = document.getElementById('chat-header-info');
    
    const partnerId = chat.members.find(m => m !== currentUser.id);
    const partner = users.find(u => u.id === partnerId);
    
    const statusText = partner && partner.isOnline ? 'в сети' : 'не в сети';
    info.innerHTML = `<h4>${partner ? partner.username : 'Чат'}</h4><span class="header-status">${statusText}</span>`;
}

// ОТОБРАЖЕНИЕ СООБЩЕНИЙ В ЛЕНТЕ
function renderMessages() {
    const chat = getChats().find(c => c.id === currentChatId);
    const display = document.getElementById('messages-display');
    display.innerHTML = '';

    chat.messages.forEach(msg => {
        const isMyMsg = msg.senderId === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isMyMsg ? 'outgoing' : 'incoming'}`;

        msgDiv.innerHTML = `
            <div class="msg-text">${msg.text}</div>
            <div class="msg-meta">
                <span>${msg.time}</span>
                ${msg.edited ? '<span>(изм.)</span>' : ''}
            </div>
            ${isMyMsg ? `
                <div class="msg-actions">
                    <button onclick="editMessage('${msg.id}', '${msg.text}')"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteMessage('${msg.id}')"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        `;
        display.appendChild(msgDiv);
    });
    display.scrollTop = display.scrollHeight;
}

// ОТПРАВКА НОВОГО СООБЩЕНИЯ
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    let chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);
    
    chat.messages.push({
        id: Date.now().toString(),
        senderId: currentUser.id,
        text: text,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        edited: false
    });
    
    saveChats(chats);
    input.value = '';
    selectChat();
}

// Привязка событий отправки
document.getElementById('send-msg-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ИСПРАВЛЕНИЕ СВОЕГО СООБЩЕНИЯ
function editMessage(msgId, oldText) {
    const newText = prompt("Редактировать сообщение:", oldText);
    if (newText === null || newText.trim() === '') return;
    
    let chats = getChats();
    const msg = chats.find(c => c.id === currentChatId).messages.find(m => m.id === msgId);
    msg.text = newText.trim();
    msg.edited = true;
    
    saveChats(chats);
    selectChat();
}

// УДАЛЕНИЕ СВОЕГО СООБЩЕНИЯ
function deleteMessage(msgId) {
    if (!confirm("Удалить это сообщение?")) return;
    
    let chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    
    saveChats(chats);
    selectChat();
}

// УДАЛЕНИЕ ДРУГА И ВСЕЙ ПЕРЕПИСКИ С НИМ
document.getElementById('delete-friend-btn').addEventListener('click', () => {
    if (!confirm("Удалить этого друга? Вся история переписки сотрется безвозвратно.")) return;
    
    let chats = getChats();
    chats = chats.filter(c => c.id !== currentChatId);
    saveChats(chats);
    
    currentChatId = null;
    document.getElementById('active-chat-container').classList.add('hidden');
    document.getElementById('no-chat-selected').classList.remove('hidden');
    renderChatsList();
});
