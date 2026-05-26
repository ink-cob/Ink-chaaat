
// Адрес вашего бэкенд-сервера (поменяйте после деплоя server.js)
const API_URL = 'https://ink-cob.github.io/Ink-chaaat'; 

let currentUser = null;
let currentChatId = null;
let activeTab = 'login';
let chatsData = [];
let pollInterval = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Восстановление сессии из LocalStorage (сохранение при перезагрузке)
    const savedUser = localStorage.getItem('ink_user');
    const savedTheme = localStorage.getItem('ink_theme') || 'light';
    
    // Применение темы
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-checkbox').checked = (savedTheme === 'dark');

    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showAppScreen();
    }
});

// Переключение вкладок Вход / Регистрация
function switchAuthTab(tab) {
    activeTab = tab;
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('auth-submit-btn').innerText = tab === 'login' ? 'Войти' : 'Зарегистрироваться';
}

// Авторизация и регистрация
async function handleAuth(e) {
    e.preventDefault();
    const name = document.getElementById('auth-name').value.trim();
    const password = document.getElementById('auth-pass').value;
    
    const endpoint = activeTab === 'login' ? '/api/login' : '/api/register';
    
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        const data = await res.json();
        
        if (!res.ok) return alert(data.error || 'Ошибка запроса');
        
        currentUser = data.user;
        localStorage.setItem('ink_user', JSON.stringify(currentUser));
        showAppScreen();
    } catch (err) {
        alert('Не удалось подключиться к серверу бэкенда');
    }
}

// Показ главного экрана мессенджера
function showAppScreen() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('remove', 'hidden');
    
    // Заполнение профиля в модалке
    document.getElementById('prof-id').innerText = currentUser.id;
    document.getElementById('prof-date').innerText = new Date(currentUser.createdAt).toLocaleDateString();
    document.getElementById('edit-name').value = currentUser.name;
    
    // Обновление аватарки (первые 2 буквы имени)
    document.querySelector('.profile-avatar').innerText = currentUser.name.substring(0,2).toUpperCase();

    // Запуск регулярного опроса сервера для получения новых сообщений/чатов (Long Polling альтренатива)
    loadChats();
    pollInterval = setInterval(loadChats, 2000);
}

// Управление модальными окнами
function toggleModal(modalId) {
    document.getElementById(modalId).classList.toggle('hidden');
}

// Переключение темы (Светлая / Темная)
function toggleTheme() {
    const isDark = document.getElementById('theme-checkbox').checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ink_theme', theme);
}

// Обновление профиля
async function updateProfile() {
    const name = document.getElementById('edit-name').value.trim();
    const password = document.getElementById('edit-pass').value;
    
    if(!name) return alert('Имя не может быть пустым');
    
    try {
        const res = await fetch(`${API_URL}/api/profile/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, name, password })
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error);
        
        currentUser.name = name;
        localStorage.setItem('ink_user', JSON.stringify(currentUser));
        document.querySelector('.profile-avatar').innerText = name.substring(0,2).toUpperCase();
        alert('Профиль успешно обновлен');
        toggleModal('profile-modal');
    } catch(err) {
        alert('Ошибка при обновлении профиля');
    }
}

// Выход из аккаунта
function logout() {
    clearInterval(pollInterval);
    localStorage.removeItem('ink_user');
    currentUser = null;
    currentChatId = null;
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    toggleModal('profile-modal');
}

// Полное удаление аккаунта
async function deleteAccount() {
    if(!confirm('Вы уверены, что хотите НАВСЕГДА удалить аккаунт?')) return;
    
    try {
        const res = await fetch(`${API_URL}/api/profile/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if(res.ok) {
            alert('Аккаунт удален');
            logout();
        }
    } catch(err) {
        alert('Ошибка удаления аккаунта');
    }
}
// Поиск пользователя по уникальному 5-значному ID
async function searchUser(e) {
    if (e.key !== 'Enter') return;
    const searchId = document.getElementById('search-contact').value.trim();
    if (searchId === currentUser.id) return alert('Вы не можете искать себя');
    if (searchId.length !== 5) return alert('ID должен состоять из 5 цифр');

    try {
        const res = await fetch(`${API_URL}/api/chats/create-private`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creatorId: currentUser.id, targetId: searchId })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error);

        document.getElementById('search-contact').value = '';
        await loadChats();
        selectChat(data.chatId);
    } catch (err) {
        alert('Ошибка при поиске пользователя');
    }
}

// Загрузка списка доступных чатов
async function loadChats() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/api/chats?userId=${currentUser.id}`);
        if (!res.ok) return;
        chatsData = await res.json();
        renderChatList();
        if (currentChatId) {
            renderActiveChat();
        }
    } catch (err) {
        console.error('Ошибка синхронизации данных с сервером');
    }
}

// Отображение списка чатов в боковой панели
function renderChatList() {
    const container = document.getElementById('chat-list-container');
    container.innerHTML = '';

    chatsData.forEach(chat => {
        const isGroup = chat.isGroup;
        let title = chat.name;
        let avatarText = '👥';

        if (!isGroup) {
            const partner = chat.membersInfo.find(m => m.id !== currentUser.id);
            title = partner ? `${partner.name} (${partner.id})` : 'Удаленный аккаунт';
            avatarText = partner ? partner.name.substring(0, 2).toUpperCase() : '??';
        } else {
            avatarText = chat.name.substring(0, 2).toUpperCase();
        }

        const lastMsg = chat.messages[chat.messages.length - 1];
        const lastMsgText = lastMsg ? `${lastMsg.authorName}: ${lastMsg.text}` : 'Нет сообщений';

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.onclick = () => selectChat(chat.id);
        item.innerHTML = `
            <div class="chat-item-avatar">${avatarText}</div>
            <div class="chat-item-info">
                <div class="chat-item-title">
                    <span>${title}</span>
                </div>
                <div class="chat-item-last">${lastMsgText}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Выбор конкретного чата
function selectChat(chatId) {
    currentChatId = chatId;
    document.getElementById('chat-empty-state').classList.add('hidden');
    document.getElementById('chat-active-state').classList.remove('hidden');
    renderChatList();
    renderActiveChat();
}

// ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ SCRIPT.JS
function renderActiveChat() {
    const chat = chatsData.find(c => c.id === currentChatId);
    if (!chat) return;

    // Кнопка управления группой для создателя
    const manageBtn = document.getElementById('group-manage-btn');
    if (chat.isGroup && chat.creatorId === currentUser.id) {
        manageBtn.classList.remove('hidden');
    } else {
        manageBtn.classList.add('hidden');
    }

    let chatTitle = chat.name;
    if (!chat.isGroup) {
        const partner = chat.membersInfo.find(m => m.id !== currentUser.id);
        chatTitle = partner ? `${partner.name} (ID: ${partner.id})` : 'Удаленный аккаунт';
    }

    document.getElementById('current-chat-title').innerText = chatTitle;
    document.getElementById('current-chat-status').innerText = `${chat.members.length} участников`;

    const container = document.getElementById('message-container');
    const scrollPos = container.scrollTop;
    const isAtBottom = container.scrollHeight - container.clientHeight <= scrollPos + 50;

    container.innerHTML = '';

    chat.messages.forEach(msg => {
        const isOwn = msg.authorId === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;

        msgDiv.innerHTML = `
            ${chat.isGroup && !isOwn ? `<div class="msg-author">${msg.authorName}</div>` : ''}
            <div class="msg-text"></div>
            <div class="msg-meta">
                <span>${msg.edited ? 'изм. ' : ''}${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="msg-actions-container"></span>
            </div>
        `;

        // Безопасно вставляем текст сообщения, защищая от XSS и синтаксических ошибок кавычек
        msgDiv.querySelector('.msg-text').innerText = msg.text;

        // Если сообщение наше — добавляем кнопки управления через DOM, чтобы избежать ошибок с кавычками
        if (isOwn) {
            const actionsContainer = msgDiv.querySelector('.msg-actions-container');
            actionsContainer.className = 'msg-actions';
            
            const editBtn = document.createElement('span');
            editBtn.innerText = '✏️ ';
            editBtn.style.cursor = 'pointer';
            editBtn.onclick = () => startEditMessage(msg.id, msg.text);
            
            const deleteBtn = document.createElement('span');
            deleteBtn.innerText = '🗑️';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.onclick = () => deleteMessage(msg.id);
            
            actionsContainer.appendChild(editBtn);
            actionsContainer.appendChild(deleteBtn);
        }

        container.appendChild(msgDiv);
    });

    if (isAtBottom || scrollPos === 0) {
        container.scrollTop = container.scrollHeight;
    }
}

// Отправка или редактирование сообщения
async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const editIdInput = document.getElementById('edit-message-id');
    const text = input.value.trim();
    if (!text) return;

    const editId = editIdInput.value;

    try {
        let res;
        if (editId) {
            // Редактирование существующего
            res = await fetch(`${API_URL}/api/messages/edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: currentChatId, messageId: editId, authorId: currentUser.id, text })
            });
            editIdInput.value = '';
            document.getElementById('send-btn').innerText = 'Отправить';
        } else {
            // Новое сообщение
            res = await fetch(`${API_URL}/api/messages/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: currentChatId, authorId: currentUser.id, authorName: currentUser.name, text })
            });
        }

        if (res.ok) {
            input.value = '';
            loadChats();
        }
    } catch (err) {
        alert('Ошибка при работе с сообщением');
    }
}

function startEditMessage(id, text) {
    document.getElementById('edit-message-id').value = id;
    document.getElementById('message-input').value = text;
    document.getElementById('send-btn').innerText = 'Сохранить';
    document.getElementById('message-input').focus();
}

async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    try {
        const res = await fetch(`${API_URL}/api/messages/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChatId, messageId, authorId: currentUser.id })
        });
        if (res.ok) loadChats();
    } catch (err) {
        alert('Ошибка удаления');
    }
}

// УПРАВЛЕНИЕ ГРУППАМИ
function openCreateGroup() {
    toggleModal('group-create-modal');
}

async function submitCreateGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    const membersString = document.getElementById('new-group-members').value.trim();
    if (!name) return alert('Введите название группы');

    // Превращаем строку ID в массив
    const members = membersString ? membersString.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    members.push(currentUser.id); // Создатель всегда в группе

    try {
        const res = await fetch(`${API_URL}/api/chats/create-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, creatorId: currentUser.id, members })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error);

        toggleModal('group-create-modal');
        document.getElementById('new-group-name').value = '';
        document.getElementById('new-group-members').value = '';
        await loadChats();
        selectChat(data.chatId);
    } catch (err) {
        alert('Ошибка создания группы');
    }
}

function openGroupManagement() {
    const chat = chatsData.find(c => c.id === currentChatId);
    if (!chat) return;

    document.getElementById('manage-group-name').value = chat.name;
    const membersList = document.getElementById('group-members-list');
    membersList.innerHTML = '';

    chat.membersInfo.forEach(member => {
        const row = document.createElement('div');
        row.className = 'member-row';
        row.innerHTML = `
            <span>${member.name} (${member.id}) ${member.id === chat.creatorId ? '<b>(Владелец)</b>' : ''}</span>
            ${member.id !== chat.creatorId ? `<button class="btn-kick" onclick="kickGroupMember('${member.id}')">Выгнать</button>` : ''}
        `;
        membersList.appendChild(row);
    });

    toggleModal('group-manage-modal');
}

async function updateGroupName() {
    const newName = document.getElementById('manage-group-name').value.trim();
    if (!newName) return alert('Имя не может быть пустым');

    try {
        const res = await fetch(`${API_URL}/api/groups/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChatId, creatorId: currentUser.id, name: newName })
        });
        if (res.ok) {
            alert('Название изменено');
            loadChats();
        }
    } catch (err) {
        alert('Ошибка');
    }
}

async function addGroupMember() {
const targetId = document.getElementById('add-member-id').value.trim();
if (targetId.length !== 5) return alert('Введите корректный 5-значный ID');
try {
const res = await fetch(${API_URL}/api/groups/add-member, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ chatId: currentChatId,
 creatorId: currentUser.id, targetId })
});
const data = await res.json();
if (!res.ok) return alert(data.error);
document.getElementById('add-member-id').value = '';
alert('Пользователь добавлен');
await loadChats();openGroupManagement(); // Перерендерить список участников
} catch (err) {
alert('Ошибка при добавлении');
}
}
async function kickGroupMember(targetId) {
if (!confirm('Выгнать этого пользователя?')) return;
try {
const res = await fetch(${API_URL}/api/groups/kick,
 {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ chatId: currentChatId,
 creatorId: currentUser.id, targetId })
});
if (res.ok) {
alert('Пользователь исключен');
await loadChats();
openGroupManagement();
}
} catch (err) {
alert('Ошибка исключения');
}
}