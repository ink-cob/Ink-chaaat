let isSignUpMode = false;

// Переключение режимов Вход / Регистрация
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
        
        // Генерация уникального 5-значного ID
        let users = getUsers();
        let newId;
        do {
            newId = Math.floor(10000 + Math.random() * 90000).toString();
        } while (users.some(u => u.id === newId));
        idInput.value = newId;
    } else {
        title.innerText = 'Вход';
        btn.innerText = 'Войти';
        toggleSpan.innerText = 'Зарегистрироваться';
        idField.classList.add('hidden');
    }
});

// Кнопка отправки формы
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
        if (!user) return alert('Неверное имя пользователя или пароль!');
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
    if (typeof renderChatsList === 'function') renderChatsList();
}

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
        alert('Профиль обновлен!');
        if (currentChatId && typeof selectChat === 'function') selectChat();
    });

    document.getElementById('delete-acc-btn').addEventListener('click', () => {
        if (!confirm('Удалить аккаунт НАВСЕГДА? Все переписки будут стёрты.')) return;
        let users = getUsers().filter(u => u.id !== currentUser.id);
        saveUsers(users);
        let chats = getChats().filter(c => !c.members.includes(currentUser.id));
        saveChats(chats);
        localStorage.removeItem('ink_current_session');
        window.location.reload();
    });
}
