// CHAT INK — ЛОКАЛЬНАЯ КЛИЕНТСКАЯ ЛОГИКА (ЛИЧНЫЕ ЧАТЫ)
let currentUser = null;
let currentChatId = null;

// Инициализация локальной базы данных
if (!localStorage.getItem('ink_db_users')) localStorage.setItem('ink_db_users', JSON.stringify([]));
if (!localStorage.getItem('ink_db_chats')) localStorage.setItem('ink_db_chats', JSON.stringify([]));

function getUsers() { return JSON.parse(localStorage.getItem('ink_db_users')); }
function saveUsers(users) { localStorage.setItem('ink_db_users', JSON.stringify(users)); }
function getChats() { return JSON.parse(localStorage.getItem('ink_db_chats')); }
function saveChats(chats) { localStorage.setItem('ink_db_chats', JSON.stringify(chats)); }

document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    tryAutoLogin();
    setupProfileEvents();
});

// УПРАВЛЕНИЕ ТЕМОЙ
function setupTheme() {
    const savedTheme = localStorage.getItem('ink_theme') || 'dark-theme';
    document.body.className = savedTheme;
    updateThemeIcon();
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.className = document.body.classList.contains('dark-theme') ? 'light-theme' : 'dark-theme';
    localStorage.setItem('ink_theme', document.body.className);
    updateThemeIcon();
});

function updateThemeIcon() {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = document.body.classList.contains('dark-theme') ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// РЕГИСТРАЦИЯ И ВХОД
let isSignUpMode = false;

document.getElementById('toggle-auth-mode').addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    const toggleSpan = document.getElementById('toggle-auth-mode');
    const idField = document.getElementById('reg-id-field');
    const idInput = document.getElementById('generated-id');

    if (isSignUpMode) {
        title.innerText = 'Регистрация';
        btn.innerText = 'Создать аккаунт';
        toggleSpan.innerText = 'Войти';
        idField.classList.remove('hidden');
        idInput.value = Math.floor(10000 + Math.random() * 90000).toString();
    } else {
        title.innerText = 'Вход';
        btn.innerText = 'Войти';
        toggleSpan.innerText = 'Зарегистрироваться';
        idField.classList.add('hidden');
    }
});

document.getElementById('auth-submit-btn').addEventListener('click', () => {
    const name = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    if (!name || !pass) return alert('Заполните все поля!');

    let users = getUsers();

    if (isSignUpMode) {
        const id = document.getElementById('generated-id').value;
        const newUser = { id, username: name, password: pass, createdAt: new Date().toLocaleDateString('ru-RU'), isOnline: true };
        users.push(newUser);
        saveUsers(users);
        loginSuccess(newUser);
    } else {
        const user = users.find(u => u.username === name && u.password === pass);
        if (!user) return alert('Неверное имя или пароль!');
        user.isOnline = true;
        saveUsers(users);
        loginSuccess(user);
    }
});

function tryAutoLogin() {
    const saved = localStorage.getItem('ink_current_session');
    if (saved) {
        const savedUser = JSON.parse(saved);
        let users = getUsers();
        const user = users.find(u => u.id === savedUser.id);
        if (user) {
            user.isOnline = true;
            saveUsers(users);
            loginSuccess(user);
        }
    }
}

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('ink_current_session', JSON.stringify(user));
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    renderChatsList();
}

// ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ
function setupProfileEvents() {
    document.getElementById('profile-menu-btn').addEventListener('click', () => {
        document.getElementById('prof-id').innerText = currentUser.id;
        document.getElementById('prof-date').innerText = currentUser.createdAt || 'Неизвестно';
        document.getElementById('prof-name').value = currentUser.username;
        document.getElementById('prof-pass').value = currentUser.password;
        toggleModal('modal-profile', true);
    });

    document.getElementById('close-profile-btn').addEventListener('click', () => toggleModal('modal-profile', false));

    document.getElementById('save-profile-btn').addEventListener('click', () => {
        let users = getUsers();
        const u = users.find(user => user.id === currentUser.id);
        u.username = document.getElementById('prof-name').value.trim();
        u.password = document.getElementById('prof-pass').value.trim();
        saveUsers(users);
        currentUser = u;
        localStorage.setItem('ink_current_session', JSON.stringify(u));
        toggleModal('modal-profile', false);
        alert('Профиль изменен!');
        if (currentChatId) selectChat();
    });

    document.getElementById('delete-acc-btn').addEventListener('click', () => {
        if (!confirm('Удалить аккаунт НАВСЕГДА? Все ваши переписки исчезнут.')) return;
        let users = getUsers().filter(u => u.id !== currentUser.id);
        saveUsers(users);
        
        let chats = getChats().filter(c => !c.members.includes(currentUser.id));
        saveChats(chats);

        localStorage.removeItem('ink_current_session');
        window.location.reload();
    });
}
// ПОИСК И ДОБАВЛЕНИЕ КОНТАКТОВ ПО ID
document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const addBtn = document.getElementById('add-chat-btn');
    
    // Если введено 5 цифр и это не собственный ID пользователя
    if (/^\d{5}$/.test(query) && query !== currentUser.id) {
        addBtn.classList.remove('hidden');
    } else {
        addBtn.classList.add('hidden');
    }
});

document.getElementById('add-chat-btn').addEventListener('click', () => {
    const targetId = document.getElementById('search-input').value.trim();
    let users = getUsers();
    const targetUser = users.find(u => u.id === targetId);
    
    if (!targetUser) return alert('Пользователь с таким ID не найден!');

    let chats = getChats();
    // Проверяем, существует ли уже диалог между пользователями
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

// РЕНДЕРИНГ СПИСКА ДИАЛОГОВ (СЛЕВА)
function renderChatsList() {
    const container = document.getElementById('chats-list');
    container.innerHTML = '';
    
    let chats = getChats().filter(c => c.members.includes(currentUser.id));
    let users = getUsers();

    if (chats.length === 0) {
        container.innerHTML = '<div style="padding:15px; color:var(--text-muted); text-align:center;">Нет активных диалогов</div>';
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
            selectChat();
        });
        container.appendChild(item);
    });
}

function selectChat() {
    document.getElementById('no-chat-selected').classList.add('hidden');
    document.getElementById('active-chat-container').classList.remove('hidden');
    renderChatsList();
    renderChatHeader();
    renderMessages();
}

// ОБНОВЛЕНИЕ ШАПКИ АКТИВНОГО ЧАТА
function renderChatHeader() {
    const chat = getChats().find(c => c.id === currentChatId);
    let users = getUsers();
    const info = document.getElementById('chat-header-info');
    
    const partnerId = chat.members.find(m => m !== currentUser.id);
    const partner = users.find(u => u.id === partnerId);
    
    const statusText = partner && partner.isOnline ? 'в сети' : 'не в сети';
    info.innerHTML = `<h4>${partner ? partner.username : 'Чат'}</h4><span class="header-status">${statusText}</span>`;
}

// ОТОБРАЖЕНИЕ ЛЕНТЫ СООБЩЕНИЙ
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

// ОТПРАВКА СООБЩЕНИЙ
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

document.getElementById('send-msg-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ИСПРАВЛЕНИЕ И УДАЛЕНИЕ СООБЩЕНИЙ
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

function deleteMessage(msgId) {
    if (!confirm("Удалить это сообщение?")) return;
    
    let chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    
    saveChats(chats);
    selectChat();
}

// УДАЛЕНИЕ ДРУГА И ДИАЛОГА
document.getElementById('delete-friend-btn').addEventListener('click', () => {
    if (!confirm("Удалить этого друга из контактов? Вся история сообщений сотрется навсегда.")) return;
    
    let chats = getChats();
    chats = chats.filter(c => c.id !== currentChatId);
    saveChats(chats);
    
    currentChatId = null;
    document.getElementById('active-chat-container').classList.add('hidden');
    document.getElementById('no-chat-selected').classList.remove('hidden');
    renderChatsList();
});
