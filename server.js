// НАСТРОЙКА SUPABASE (Замените своими данными)
const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Переменные состояния приложения
let currentUser = null;
let currentChatId = null;
let isSignUpMode = false;
let messageSubscription = null;

// DOM Элементы
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authNameInput = document.getElementById('auth-name');
const authIdInput = document.getElementById('auth-id');
const authPasswordInput = document.getElementById('auth-password');
const idGroup = document.getElementById('id-group');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');

// Переключение Вход / Регистрация
authToggleLink.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
        authTitle.innerText = "Регистрация в Chat Ink";
        idGroup.style.display = "none"; // ID генерируется автоматически
        authSubmitBtn.innerText = "Создать аккаунт";
        authToggleLink.innerText = "Войти";
    } else {
        authTitle.innerText = "Вход в Chat Ink";
        idGroup.style.display = "block"; // ID нужен для входа
        authSubmitBtn.innerText = "Войти";
        authToggleLink.innerText = "Зарегистрироваться";
    }
});

// Функция генерации уникального 5-значного ID
async function generateUniqueID() {
    let unique = false;
    let code = "";
    while (!unique) {
        code = Math.floor(10000 + Math.random() * 90000).toString();
        const { data } = await supabase.from('users').select('id').eq('id', code);
        if (!data || data.length === 0) unique = true;
    }
    return code;
}

// ОБРАБОТКА АВТОРИЗАЦИИ
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = authNameInput.value.trim();
    const password = authPasswordInput.value;

    if (isSignUpMode) {
        // РЕГИСТРАЦИЯ
        const uniqueId = await generateUniqueID();
        const { data, error } = await supabase.from('users').insert([
            { id: uniqueId, name: name, password: password, created_at: new Date() }
        ]).select();

        if (error) {
            alert("Ошибка регистрации: " + error.message);
        } else {
            alert(`Успешная регистрация! Ваш уникальный ID: ${uniqueId}. Запомните его для входа!`);
            currentUser = data[0];
            startApp();
        }
    } else {
        // ВХОД
        const userId = authIdInput.value.trim();
        if (!userId) return alert("Введите ваш 5-значный ID!");

        const { data, error } = await supabase.from('users').select('*').eq('id', userId).eq('password', password);

        if (error || !data || data.length === 0) {
            alert("Неверный ID или пароль!");
        } else {
            currentUser = data[0];
            startApp();
        }
    }
});

// Запуск основного интерфейса
function startApp() {
    authContainer.style.display = "none";
    appContainer.style.display = "flex";
    
    // Инициализация профиля и загрузка чатов
    loadChatsList();
    initProfileModal();
    initTheme();
}

// РАБОТА С ПРОФИЛЕМ ПОЛЬЗОВАТЕЛЯ
const profileModal = document.getElementById('profile-modal');
const myProfileBtn = document.getElementById('my-profile-btn');
const closeProfile = document.getElementById('close-profile');
const profileNameInput = document.getElementById('profile-name-input');
const profileIdSpan = document.getElementById('profile-id');
const profilePassInput = document.getElementById('profile-pass-input');
const profileDateSpan = document.getElementById('profile-date');
const saveProfileBtn = document.getElementById('save-profile-btn');
const deleteAccBtn = document.getElementById('delete-acc-btn');

function initProfileModal() {
    myProfileBtn.addEventListener('click', () => {
        profileNameInput.value = currentUser.name;
        profileIdSpan.innerText = currentUser.id;
        profilePassInput.value = currentUser.password;
        profileDateSpan.innerText = new Date(currentUser.created_at).toLocaleDateString();
        profileModal.style.display = "flex";
    });

    closeProfile.addEventListener('click', () => profileModal.style.display = "none");

    saveProfileBtn.addEventListener('click', async () => {
        const newName = profileNameInput.value.trim();
        const newPass = profilePassInput.value;
        
        const { error } = await supabase.from('users')
            .update({ name: newName, password: newPass })
            .eq('id', currentUser.id);

        if (error) alert("Ошибка сохранения!");
        else {
            currentUser.name = newName;
            currentUser.password = newPass;
            alert("Профиль обновлен!");
            profileModal.style.display = "none";
        }
    });

    deleteAccBtn.addEventListener('click', async () => {
        if (confirm("Вы уверены, что хотите удалить аккаунт? Все ваши сообщения исчезнут.")) {
            await supabase.from('users').delete().eq('id', currentUser.id);
            location.reload();
        }
    });
}

// ТЕМЫ (Светлая / Темная)
const themeToggle = document.getElementById('theme-toggle');
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.innerText = newTheme === 'dark' ? '☀️' : '🌙';
    });
}

// Обработка кнопки "Назад" на мобилках при клике на шапку чата
document.querySelector('.chat-header').addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && e.offsetX < 40) { // клик в районе левого края шапки
        appContainer.classList.remove('chat-open');
    }
});
