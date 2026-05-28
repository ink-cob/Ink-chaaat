// Создание группового чата (мульти-аккаунт)
function createNewGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    const userIdsInput = document.getElementById('new-group-users').value.trim();
    
    if (!name) {
        alert('Укажите название группы!');
        return;
    }

    const userIds = userIdsInput ? userIdsInput.split(',').map(id => id.trim()) : [];
    socket.emit('create-group-chat', { name, userIds });
    toggleModal('create-group-modal');
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-users').value = '';
}

// Отображение списка чатов на левой боковой панели
function renderChatsList() {
    const container = document.getElementById('chats-list');
    container.innerHTML = '';

    if (chats.length === 0) {
        container.innerHTML = '<p class="empty-msg">Список диалогов пуст. Найдите кого-нибудь по ID.</p>';
        return;
    }

    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
        item.onclick = () => selectChat(chat.id);

        let chatName = chat.name;
        if (chat.type === 'private') {
            const companion = chat.participants.find(p => p.id !== currentUser.id);
            chatName = companion ? `${companion.username} (${companion.id})` : 'Удаленный аккаунт';
        }

        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : { text: 'Сообщений нет', authorName: '' };
        const prefix = lastMsg.authorName ? `${lastMsg.authorName}: ` : '';

        item.innerHTML = `
            <div class="chat-item-avatar">${chat.type === 'group' ? '👥' : '👤'}</div>
            <div class="chat-item-details">
                <span class="chat-item-name">${chatName}</span>
                <span class="chat-item-lastmsg">${prefix}${lastMsg.text}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// Переключение на выбранный диалог / группу
function selectChat(chatId) {
    activeChatId = chatId;
    renderChatsList();

    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    document.getElementById('chat-header').classList.remove('hidden');
    document.getElementById('chat-input-panel').classList.remove('hidden');

    let chatName = chat.name;
    if (chat.type === 'private') {
        const companion = chat.participants.find(p => p.id !== currentUser.id);
        chatName = companion ? `${companion.username} (${companion.id})` : 'Удаленный аккаунт';
    }

    document.getElementById('active-chat-title').innerText = chatName;
    document.getElementById('active-chat-status').innerText = `${chat.participants.length} уч.`;

    const settingsBtn = document.getElementById('chat-settings-btn');
    if (chat.type === 'group' && chat.creatorId === currentUser.id) {
        settingsBtn.classList.remove('hidden');
    } else {
        settingsBtn.classList.add('hidden');
    }

    renderMessages(chat.messages);
}

// Отрисовка сообщений внутри активного чата
function renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    messages.forEach(msg => {
        const isMy = msg.authorId === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${isMy ? 'outgoing' : 'incoming'}`;

        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const editedLabel = msg.edited ? ' (изм.)' : '';

        let actionsHtml = '';
        if (isMy) {
            actionsHtml = `
                <div class="msg-actions">
                    <button onclick="editMessage('${msg.id}', '${msg.text}')">✏</button>
                    <button onclick="deleteMessage('${msg.id}')">🗑</button>
                </div>
            `;
        }

        msgDiv.innerHTML = `
            ${!isMy ? `<span class="msg-author">\${msg.authorName}</span>` : ''}
            <span class="msg-text">${msg.text}</span>
            <span class="msg-meta">${time}${editedLabel}</span>
            ${actionsHtml}
        `;
        container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
}

// Отслеживание клика по Enter в строке ввода
function handleMessageKey(e) {
    if (e.key === 'Enter') sendMessage();
}

// Отправка или сохранение отредактированного сообщения
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    if (editingMessageId) {
        socket.emit('edit-message', { chatId: activeChatId, msgId: editingMessageId, newText: text });
        editingMessageId = null;
        document.getElementById('send-msg-btn').innerText = 'Отправить';
    } else {
        socket.emit('send-message', { chatId: activeChatId, text });
    }
    input.value = '';
}

// Включение режима изменения текста сообщения
function editMessage(msgId, currentText) {
    editingMessageId = msgId;
    const input = document.getElementById('message-input');
    input.value = currentText;
    input.focus();
    document.getElementById('send-msg-btn').innerText = 'Сохранить';
}

// Запрос на удаление собственного сообщения
function deleteMessage(msgId) {
    if (confirm('Вы действительно хотите удалить это сообщение?')) {
        socket.emit('delete-message', { chatId: activeChatId, msgId });
    }
}

// Сохранение изменений личного профиля
function updateProfile() {
    const username = document.getElementById('edit-username').value.trim();
    const password = document.getElementById('edit-password').value.trim();

    if (!username) {
        alert('Имя пользователя не может быть пустым!');
        return;
    }

    socket.emit('update-profile', { username, password });
    toggleModal('profile-modal');
}

// Выход из профиля мессенджера
function logout() {
    localStorage.removeItem('ink_user');
    location.reload();
}

// Удаление аккаунта
function deleteAccount() {
    if (confirm('Внимание! Вы безвозвратно удалите свой аккаунт. Продолжить?')) {
        socket.emit('delete-account');
    }
}

// Настройки администрирования чата (для его создателя)
function openChatSettings() {
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    toggleModal('chat-management-modal');
    document.getElementById('manage-chat-title').value = chat.name;

    const usersListContainer = document.getElementById('manage-users-list');
    usersListContainer.innerHTML = '';

    chat.participants.forEach(user => {
        const userRow = document.createElement('div');
        userRow.className = 'manage-user-item';
        
        let kickBtn = (user.id !== currentUser.id) 
            ? `<button onclick="kickUserFromChat('${user.id}')">Выгнать</button>` 
            : '<span>(Создатель)</span>';

        userRow.innerHTML = `<span>${user.username} (${user.id})</span> ${kickBtn}`;
        usersListContainer.appendChild(userRow);
    });
}

function renameChat() {
    const newName = document.getElementById('manage-chat-title').value.trim();
    if (!newName) return;
    socket.emit('rename-chat', { chatId: activeChatId, newName });
}

function addUserToChat() {
    const userId = document.getElementById('manage-add-user').value.trim();
    if (!userId) return;
    socket.emit('add-user-to-chat', { chatId: activeChatId, targetId: userId });
    document.getElementById('manage-add-user').value = '';
}

function kickUserFromChat(targetId) {
    socket.emit('kick-user-from-chat', { chatId: activeChatId, targetId });
}

function deleteCurrentChat() {
    if (confirm('Удалить чат полностью для всех участников?')) {
        socket.emit('delete-chat', { chatId: activeChatId });
        toggleModal('chat-management-modal');
    }
}

// СЛУШАТЕЛИ И ОБРАБОТЧИКИ СОБЫТИЙ СЕРВЕРА
socket.on('auth-success', (user) => {
    currentUser = user;
    localStorage.setItem('ink_user', JSON.stringify(user));
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    socket.emit('get-chats');
});

socket.on('auth-error', (msg) => {
    document.getElementById('auth-error').innerText = msg;
});

socket.on('chats-data', (userChats) => {
    chats = userChats;
    renderChatsList();
    if (activeChatId) selectChat(activeChatId);
});

socket.on('chat-updated', () => {
    socket.emit('get-chats');
});

socket.on('chat-deleted', (chatId) => {
    if (activeChatId === chatId) {
        activeChatId = null;
        document.getElementById('chat-header').classList.add('hidden');
        document.getElementById('chat-input-panel').classList.add('hidden');
        document.getElementById('chat-messages').innerHTML = '';
    }
    socket.emit('get-chats');
});

socket.on('account-deleted-success', () => {
    alert('Ваш аккаунт был успешно удален из системы Chat Ink.');
    logout();
});

socket.on('app-error', (msg) => {
    alert(msg);
});
