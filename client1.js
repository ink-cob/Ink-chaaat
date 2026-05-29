// Глобальное состояние приложения
let currentUser = null;
let currentChatId = null;

// Инициализация пустых таблиц базы данных в браузере
if (!localStorage.getItem('ink_db_users')) localStorage.setItem('ink_db_users', JSON.stringify([]));
if (!localStorage.getItem('ink_db_chats')) localStorage.setItem('ink_db_chats', JSON.stringify([]));

// Вспомогательные функции для чтения и записи данных
function getUsers() { return JSON.parse(localStorage.getItem('ink_db_users')); }
function saveUsers(users) { localStorage.setItem('ink_db_users', JSON.stringify(users)); }
function getChats() { return JSON.parse(localStorage.getItem('ink_db_chats')); }
function saveChats(chats) { localStorage.setItem('ink_db_chats', JSON.stringify(chats)); }

// Запуск при полной готовности страницы
document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    if (typeof tryAutoLogin === 'function') tryAutoLogin();
    if (typeof setupProfileEvents === 'function') setupProfileEvents();
});

// Настройка и переключение темы оформления
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
    if (icon) {
        icon.className = document.body.classList.contains('dark-theme') ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Показ и скрытие модальных окон
function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (modal) {
        if (show) modal.classList.remove('hidden');
        else modal.classList.add('hidden');
    }
}
