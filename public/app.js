const API_URL = window.location.origin;
let currentUser = null;
let activeChatId = null;
let localContacts = [];
let pollInterval = null;

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
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
    document.getElementById('btn-close-profile').addEventListener('click', () => document.getElementById('profile-modal').classList.add('hidden'));
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-delete-account').addEventListener('click', deleteAccount);
    document.getElementById('btn-add-friend').addEventListener('click', addFriend);
    document.getElementById('btn-delete-friend').addEventListener('click', deleteFriend);
    document.getElementById('btn-send-message').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
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
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка входа');

        currentUser = data.user;
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
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');

        currentUser = data.user;
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
    
    const myId = currentUser.userId || currentUser.user_id;
    const storageKey = `ink_contacts_${myId}`;
    localContacts = JSON.parse(localStorage.getItem(storageKey)) || [];
    
    renderContacts();
    startPolling();
}

async function addFriend() {
    const idInput = document.getElementById('search-id');
    const friendId = idInput.value.trim();
    showError('search-error', '');

    const myId = currentUser.userId || currentUser.user_id;
    if (friendId.length !== 5) return showError('search-error', 'ID должен состоять из 5 цифр');
    if (friendId === myId) return showError('search-error', 'Нельзя добавить себя');
    if (localContacts.some(c => c.userId === friendId)) return showError('search-error', 'Контакт уже добавлен');

    try {
        const res = await fetch(`${API_URL}/api/user/${friendId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Пользователь не найден');

        localContacts.push({ userId: data.userId, username: data.username });
        localStorage.setItem(`ink_contacts_${myId}`, JSON.stringify(localContacts));
        idInput.value = '';
        renderContacts();
    } catch (err) {
        showError('search-error', err.message);
    }
}

function deleteFriend() {
    if (!activeChatId) return;
    if (confirm('Удалить этот контакт и историю диалога?')) {
        const myId = currentUser.userId || currentUser.user_id;
        localContacts = localContacts.filter(c => c.userId !== activeChatId);
        localStorage.setItem(`ink_contacts_${myId}`, JSON.stringify(localContacts));
        
        activeChatId = null;
        document.getElementById('chat-active').classList.add('hidden');
        document.getElementById('chat-welcome').classList.remove('hidden');
        renderContacts();
    }
}

function renderContacts() {
    const container = document.getElementById('contacts-container');
    container.innerHTML = '';

    localContacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = `contact-item ${activeChatId === contact.userId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="avatar">${contact.username.charAt(0).toUpperCase()}</div>
            <div class="contact-info">
                <div class="contact-name">${contact.username}</div>
                <div class="subtext">#${contact.userId}</div>
            </div>
        `;
        item.addEventListener('click', () => openChat(contact));
        container.appendChild(item);
    });
}

function openChat(contact) {
    activeChatId = contact.userId;
    document.getElementById('chat-welcome').classList.add('hidden');
    document.getElementById('chat-active').classList.remove('hidden');
    document.getElementById('active-chat-name').innerText = contact.username;
    document.getElementById('active-chat-id').innerText = `#${contact.userId}`;
    
    renderContacts();
    loadMessages();
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    const myId = currentUser.userId || currentUser.user_id;
    if (!text || !activeChatId || !myId) return;

    try {
        const res = await fetch(`${API_URL}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: myId,
                receiverId: activeChatId,
                text: text
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
    const myId = currentUser ? (currentUser.userId || currentUser.user_id) : null;
    if (!activeChatId || !myId) return;

    try {
        const res = await fetch(`${API_URL}/api/messages?user1=${myId}&user2=${activeChatId}`);
        const messages = await res.json();
        
        const container = document.getElementById('messages-container');
        container.innerHTML = '';

        messages.forEach(msg => {
            const isMy = msg.senderId === myId;
            const div = document.createElement('div');
            div.className = `msg ${isMy ? 'my' : 'other'}`;
            
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const metaText = msg.edited ? `изм. ${time}` : time;

            div.innerHTML = `
                <span class="msg-text">${escapeHtml(msg.text)}</span>
                <div class="msg-meta">${metaText}</div>
            `;

            if (isMy) {
                div.addEventListener('contextmenu', (e) => { e.preventDefault(); manageMessage(msg); });
                div.addEventListener('click', (e) => {
                    if(e.target.className !== 'msg-text' && e.target.className !== 'msg') return;
                    manageMessage(msg);
                });
            }

            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Ошибка загрузки сообщений:', err);
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
    await fetch(`${API_URL}/api/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
    });
    loadMessages();
}

async function deleteMessage(msgId) {
    await fetch(`${API_URL}/api/messages/${msgId}`, { method: 'DELETE' });
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
    const myId = currentUser.userId || currentUser.user_id;

    if (!newName) return showError('profile-error', 'Имя не может быть пустым');

    try {
        const res = await fetch(`${API_URL}/api/user/${myId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newName, password: newPass || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка обновления профиля');

        currentUser = data.user;
        document.getElementById('my-username-display').innerText = currentUser.username;
        document.getElementById('profile-modal').classList.add('hidden');
        alert('Профиль успешно изменен!');
        renderContacts();
    } catch (err) {
        showError('profile-error', err.message);
    }
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
        currentUser = null;
        activeChatId = null;
        if (pollInterval) clearInterval(pollInterval);
        location.reload();
    }
}

async function deleteAccount() {
    const myId = currentUser.userId || currentUser.user_id;
    if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить свой аккаунт?')) return;

    try {
        const res = await fetch(`${API_URL}/api/user/${myId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Не удалось удалить аккаунт');
        location.reload();
    } catch (err) {
        showError('profile-error', err.message);
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(loadMessages, 2000);
}

function showError(elementId, text) {
    const el = document.getElementById(elementId);
    if (text) {
        el.innerText = text;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
