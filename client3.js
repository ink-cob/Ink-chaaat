// Отслеживание ввода в поисковую строку
document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const addBtn = document.getElementById('add-chat-btn');
    
    // Показываем кнопку «плюс», если введено ровно 5 цифр и это не личный ID
    if (/^\d{5}$/.test(query) && query !== currentUser.id) {
        addBtn.classList.remove('hidden');
    } else {
        addBtn.classList.add('hidden');
    }
});

// Создание нового чата при нажатии на кнопку «плюс»
document.getElementById('add-chat-btn').addEventListener('click', () => {
    const targetId = document.getElementById('search-input').value.trim();
    let users = getUsers();
    const targetUser = users.find(u => u.id === targetId);
    
    if (!targetUser) return alert('Пользователь с таким ID не найден!');

    let chats = getChats();
    // Проверяем, существует ли уже диалог с этим человеком
    const exists = chats.find(c => c.members.includes(currentUser.id) && c.members.includes(targetId));
    
    if (!exists) {
        chats.push({
            id: Date.now().toString(),
            members: [currentUser.id, targetId],
            messages: []
        });
        saveChats(chats);
    }

    document.getElementById('search-input').value = '';
    document.getElementById('add-chat-btn').classList.add('hidden');
    renderChatsList();
});

// Рендеринг списка контактов (слева)
function renderChatsList() {
    const container = document.getElementById('chats-list');
    container.innerHTML = '';
    
    let chats = getChats().filter(c => c.members.includes(currentUser.id));
    let users = getUsers();

    if (chats.length === 0) {
        container.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-muted);">Нет активных диалогов</div>';
        return;
    }

    chats.forEach(chat => {
        const partnerId = chat.members.find(m => m !== currentUser.id);
        const partner = users.find(u => u.id === partnerId);
        
        const title = partner ? partner.username : 'Удаленный аккаунт';
        const sub = `ID: ${partnerId}`;
        const statusClass = partner && partner.isOnline ? 'online' : 'offline';
        const statusDot = `<span class="status-badge ${statusClass}"></span>`;
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : 'Нет сообщений';
        
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="chat-avatar">${title.charAt(0).toUpperCase()}${statusDot}</div>
            <div class="chat-item-details">
                <div class="chat-item-top">
                    <span class="chat-item-name">${title}</span>
                    <span class="chat-item-id">${sub}</span>
                </div>
                <div class="chat-item-last">${lastMsg}</div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            currentChatId = chat.id;
            if (typeof selectChat === 'function') selectChat();
        });
        container.appendChild(item);
    });
}
