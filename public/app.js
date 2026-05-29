const API_URL = 'https://onrender.com';
let currentUser = null;
let activeChatId = null;
let isGroupChat = false; 
let localContacts = JSON.parse(localStorage.getItem('ink_contacts')) || [];
let localRooms = JSON.parse(localStorage.getItem('ink_rooms')) || [
    { id: 'room_general', username: 'Общий чат', isRoom: true }
];
let pollInterval = null;

window.addEventListener('DOMContentLoaded', function() {
    initTheme();
    setupEventListeners();
    checkSavedSession();
});

function initTheme() {
    const savedTheme = localStorage.getItem('ink_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function setupEventListeners() {
    document.getElementById('btn-login').addEventListener('click', login);
    document.getElementById('btn-register').addEventListener('click', register);
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('open-profile').addEventListener('click', openProfile);
    document.getElementById('btn-close-profile').addEventListener('click', function() {
        document.getElementById('profile-modal').classList.add('hidden');
    });
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
    document.getElementById('btn-delete-account').addEventListener('click', deleteAccount);
    
    document.getElementById('btn-add-friend').addEventListener('click', handleAddButton);
    document.getElementById('btn-delete-friend').addEventListener('click', deleteFriendOrRoom);
    document.getElementById('btn-send-message').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
}

function checkSavedSession() {
    const savedUser = localStorage.getItem('ink_user') || sessionStorage.getItem('ink_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainScreen();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ink_theme', newTheme);
}
async function login() {
    const name = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    showError('auth-error', '');
    if (!name || !pass) return showError('auth-error', 'Заполните все поля');

    try {
        const res = await fetch(API_URL + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка входа');

        currentUser = data.user;
        localStorage.setItem('ink_user', JSON.stringify(currentUser));
        showMainScreen();
    } catch (err) {
        showError('auth-error', err.message);
    }
}

async function register() {
    const name = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    showError('auth-error', '');
    if (!name || !pass) return showError('auth-error', 'Заполните все поля');

    try {
        const res = await fetch(API_URL + '/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');

        currentUser = data.user;
        localStorage.setItem('ink_user', JSON.stringify(currentUser));
        showMainScreen();
    } catch (err) {
        showError('auth-error', err.message);
    }
}

function showMainScreen() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    document.getElementById('my-username-display').innerText = currentUser.username;
    document.getElementById('my-avatar').innerText = currentUser.username.charAt(0).toUpperCase();
    
    sendOnlinePing();
    renderContacts();
    startPolling();
}

function handleAddButton() {
    const inputVal = document.getElementById('search-id').value.trim();
    if (/^\d{5}$/.test(inputVal)) {
        addFriend(inputVal);
    } else if (inputVal.length > 0) {
        createRoom(inputVal);
    } else {
        showError('search-error', 'Введите 5-значный ID друга или название новой комнаты');
    }
}

async function addFriend(friendId) {
    showError('search-error', '');
    if (friendId === currentUser.userId) return showError('search-error', 'Нельзя добавить себя');
    if (localContacts.some(c => c.userId === friendId)) return showError('search-error', 'Контакт уже добавлен');

    try {
        const res = await fetch(API_URL + '/api/user/' + friendId);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Пользователь не найден');

        localContacts.push({ userId: data.userId, username: data.username });
        localStorage.setItem('ink_contacts', JSON.stringify(localContacts));
        document.getElementById('search-id').value = '';
        renderContacts();
    } catch (err) {
        showError('search-error', err.message);
    }
}

function createRoom(roomName) {
    showError('search-error', '');
    const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    
    if (localRooms.some(r => r.username.toLowerCase() === roomName.toLowerCase())) {
        return showError('search-error', 'Комната с таким названием уже существует');
    }

    localRooms.push({ id: roomId, username: roomName, isRoom: true });
    localStorage.setItem('ink_rooms', JSON.stringify(localRooms));
    document.getElementById('search-id').value = '';
    renderContacts();
}

function deleteFriendOrRoom() {
    if (!activeChatId) return;
    
    if (isGroupChat) {
        if (activeChatId === 'room_general') return alert('Нельзя удалить Общий чат');
        if (confirm('Выйти из этой комнаты и удалить её из списка?')) {
            localRooms = localRooms.filter(r => r.id !== activeChatId);
            localStorage.setItem('ink_rooms', JSON.stringify(localRooms));
            resetChatArea();
        }
    } else {
        if (confirm('Удалить этот контакт и историю диалога?')) {
            localContacts = localContacts.filter(c => c.userId !== activeChatId);
            localStorage.setItem('ink_contacts', JSON.stringify(localContacts));
            resetChatArea();
        }
    }
}

function resetChatArea() {
    activeChatId = null;
    document.getElementById('chat-active').classList.add('hidden');
    document.getElementById('chat-welcome').classList.remove('hidden');
    renderContacts();
}
async function renderContacts() {
    const container = document.getElementById('contacts-container');
    if (!container) return;
    container.innerHTML = '';

    localRooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'contact-item ' + (activeChatId === room.id ? 'active' : '');
        item.innerHTML = '<div class="avatar" style="background: var(--accent);">#</div><div class="contact-info"><div class="contact-name">' + escapeHtml(room.username) + '</div><div class="subtext">Групповой чат</div></div>';
        item.addEventListener('click', function() { openChat(room.id, room.username, true); });
        container.appendChild(item);
    });

    let onlineIds = [];
    try {
        const res = await fetch(API_URL + '/api/online');
        if (res.ok) {
            const data = await res.json();
            onlineIds = data.onlineUsers || [];
        }
    } catch (e) { console.error("Ошибка обновления статусов", e); }

    localContacts.forEach(contact => {
        const isOnline = onlineIds.includes(contact.userId);
        const statusColor = isOnline ? '#3ba55d' : '#7f91a4'; 
        
        const item = document.createElement('div');
        item.className = 'contact-item ' + (activeChatId === contact.userId ? 'active' : '');
        item.innerHTML = '<div class="avatar" style="position: relative;">' + contact.username.charAt(0).toUpperCase() + '<span class="status-dot" style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background-color: ' + statusColor + '; border: 2px solid var(--bg-sidebar); border-radius: 50%;"></span></div><div class="contact-info"><div class="contact-name">' + escapeHtml(contact.username) + '</div><div class="subtext">#' + contact.userId + '</div></div>';
        item.addEventListener('click', function() { openChat(contact.userId, contact.username, false); });
        container.appendChild(item);
    });
}

function openChat(id, name, isGroup) {
    activeChatId = id;
    isGroupChat = isGroup;
    
    document.getElementById('chat-welcome').classList.add('hidden');
    document.getElementById('chat-active').classList.remove('hidden');
    document.getElementById('active-chat-name').innerText = name;
    document.getElementById('active-chat-id').innerText = isGroup ? 'Публичный канал' : '#' + id;
    
    const deleteBtn = document.getElementById('btn-delete-friend');
    if (deleteBtn) {
        deleteBtn.style.display = (id === 'room_general') ? 'none' : 'block';
    }

    renderContacts();
    loadMessages();
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    try {
        const res = await fetch(API_URL + '/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: currentUser.userId,
                receiverId: activeChatId, 
                text: text,
                isRoom: isGroupChat
            })
        });
        if (res.ok) {
            input.value = '';
            loadMessages();
        }
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
    }
}

async function loadMessages() {
    if (!activeChatId || !currentUser) return;

    try {
        const url = isGroupChat 
            ? API_URL + '/api/messages?roomId=' + activeChatId
            : API_URL + '/api/messages?user1=' + currentUser.userId + '&user2=' + activeChatId;

        const res = await fetch(url);
        const messages = await res.json();
        
        const container = document.getElementById('messages-container');
        if (!container) return;
        container.innerHTML = '';

        messages.forEach(msg => {
            const isMy = msg.senderId === currentUser.userId;
            const div = document.createElement('div');
            div.className = 'msg ' + (isMy ? 'my' : 'other');
            
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const metaText = msg.edited ? 'изм. ' + time : time;

            const authorMarkup = (isGroupChat && !isMy) 
                ? '<div class="msg-author" style="font-size: 11px; color: var(--accent); font-weight: bold; margin-bottom: 2px;">' + escapeHtml(msg.senderName || 'Пользователь') + '</div>' 
                : '';

            div.innerHTML = authorMarkup + '<span class="msg-text">' + escapeHtml(msg.text) + '</span><div class="msg-meta">' + metaText + '</div>';

            if (isMy) {
                div.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    manageMessage(msg);
                });
                div.addEventListener('click', function(e) {
                    if(e.target.className !== 'msg-text' && e.target.className !== 'msg') return;
                    manageMessage(msg);
                });
            }

            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Ошибка загрузки сообщения:', err);
    }
}

function manageMessage(msg) {
    const action = prompt('Выберите действие:\n1 - Редактировать\n2 - Удалить сообщение');
    if (action === '1') {
        const newText = prompt('Редактировать сообщение:', msg.text);
        if (newText && newText.trim() !== msg.text) {
            editMessage(msg.id, newText.trim());
        }
    } else if (action === '2') {
        if (confirm('Удалить это сообщение для всех?')) {
            deleteMessage(msg.id);
        }
    }
}

async function editMessage(msgId, newText) {
    await fetch(API_URL + '/api/messages/' + msgId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
    });
    loadMessages();
}

async function deleteMessage(msgId) {
    await fetch(API_URL + '/api/messages/' + msgId, { method: 'DELETE' });
    loadMessages();
}

function openProfile() {
    showError('profile-error', '');
    const myId = currentUser.userId || currentUser.user_id;
    const myDate = currentUser.createdAt || currentUser.created_at;
    
    document.getElementById('prof-id').innerText = myId;
    document.getElementById('prof-date').innerText = new Date(myDate).toLocaleDateString();
    document.getElementById('prof-username').value = currentUser.username;
    document.getElementById('prof-password').value = '';
    document.getElementById('profile-modal').classList.remove('hidden');
}

async function saveProfile() {
    const newName = document.getElementById('prof-username').value.trim();
    const newPass = document.getElementById('prof-password').value.trim();
    showError('profile-error', '');

    if (!newName) return showError('profile-error', 'Имя не может быть пустым');

    try {
        const res = await fetch(API_URL + '/api/user/' + (currentUser.userId || currentUser.user_id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newName, password: newPass || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка обновления профиля');

        currentUser = data.user;
        localStorage.setItem('ink_user', JSON.stringify(currentUser));
        document.getElementById('my-username-display').innerText = currentUser.username;
        document.getElementById('profile-modal').classList.add('hidden');
        alert('Профиль успешно обновлен!');
        renderContacts();
    } catch (err) {
        showError('profile-error', err.message);
    }
}

async function deleteAccount() {
    if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить свой аккаунт?')) return;

    try {
        await fetch(API_URL + '/api/user/' + currentUser.userId, { method: 'DELETE' });
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    } catch (err) {
        showError('profile-error', err.message);
    }
}

async function sendOnlinePing() {
    if (!currentUser) return;
    try {
        await fetch(API_URL + '/api/online', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId })
        });
    } catch (e) { }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(function() {
        loadMessages();
        sendOnlinePing();
        renderContacts(); 
    }, 2000);
}

function showError(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (text) {
        el.innerText = text;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
