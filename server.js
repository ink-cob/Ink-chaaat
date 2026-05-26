const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Пути к файлам нашей импровизированной БД
const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');

// Хелперы для чтения/записи файлов БД
function readData(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([]));
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        return [];
    }
}

function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Генерация уникального 5-значного ID
function generateUniqueId(users) {
    let id;
    do {
        id = Math.floor(10000 + Math.random() * 90000).toString();
    } while (users.some(u => u.id === id));
    return id;
}

// -------------------------------------------------------------
// РОУТЫ АВТОРИЗАЦИИ И ПРОФИЛЯ
// -------------------------------------------------------------

// Регистрация
app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const users = readData(USERS_FILE);
    const newId = generateUniqueId(users);

    const newUser = {
        id: newId,
        name,
        password, // В реальном проекте пароли хешируют, здесь оставляем для простоты
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeData(USERS_FILE, users);

    // Удаляем пароль из ответа для безопасности
    const { password: _, ...userResponse } = newUser;
    res.json({ user: userResponse });
});

// Вход
app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const users = readData(USERS_FILE);

    // Ищем пользователя по имени и паролю
    const user = users.find(u => u.name === name && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверное имя или пароль' });

    const { password: _, ...userResponse } = user;
    res.json({ user: userResponse });
});

// Обновление профиля
app.post('/api/profile/update', (req, res) => {
    const { userId, name, password } = req.body;
    const users = readData(USERS_FILE);

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'Пользователь не найден' });

    if (name) users[userIndex].name = name;
    if (password) users[userIndex].password = password;

    writeData(USERS_FILE, users);
    res.json({ success: true });
});

// Удаление аккаунта
app.post('/api/profile/delete', (req, res) => {
    const { userId } = req.body;
    let users = readData(USERS_FILE);
    let chats = readData(CHATS_FILE);

    // 1. Удаляем самого пользователя
    users = users.filter(u => u.id !== userId);
    writeData(USERS_FILE, users);

    // 2. Удаляем пользователя из всех чатов
    chats = chats.map(chat => {
        if (chat.members.includes(userId)) {
            chat.members = chat.members.filter(m => m !== userId);
            // Если это был приватный чат или группа без участников — он станет недоступен
        }
        return chat;
    });
    
    writeData(CHATS_FILE, chats);
    res.json({ success: true });
});
// -------------------------------------------------------------
// РОУТЫ ЧАТОВ И СООБЩЕНИЙ
// -------------------------------------------------------------

// Получение списка чатов конкретного пользователя
app.get('/api/chats', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Не указан userId' });

    const chats = readData(CHATS_FILE);
    const users = readData(USERS_FILE);

    // Фильтруем только те чаты, где состоит пользователь
    const userChats = chats.filter(chat => chat.members.includes(userId));

    // Дополняем каждый чат актуальной информацией об именах участников (для отображения)
    const enrichedChats = userChats.map(chat => {
        const membersInfo = chat.members.map(mId => {
            const u = users.find(user => user.id === mId);
            return { id: mId, name: u ? u.name : 'Удаленный аккаунт' };
        });
        return { ...chat, membersInfo };
    });

    res.json(enrichedChats);
});

// Создание приватного чата (поиск по ID)
app.post('/api/chats/create-private', (req, res) => {
    const { creatorId, targetId } = req.body;
    const users = readData(USERS_FILE);
    const chats = readData(CHATS_FILE);

    const targetUser = users.find(u => u.id === targetId);
    if (!targetUser) return res.status(404).json({ error: 'Пользователь с таким ID не найден' });

    // Проверяем, существует ли уже приватный чат между ними
    const existingChat = chats.find(c => !c.isGroup && c.members.includes(creatorId) && c.members.includes(targetId));
    if (existingChat) {
        return res.json({ chatId: existingChat.id });
    }

    const newChat = {
        id: Math.random().toString(36).substring(2, 9),
        name: 'Приватный чат',
        isGroup: false,
        creatorId: creatorId,
        members: [creatorId, targetId],
        messages: []
    };

    chats.push(newChat);
    writeData(CHATS_FILE, chats);

    res.json({ chatId: newChat.id });
});

// Создание группового чата
app.post('/api/chats/create-group', (req, res) => {
    const { name, creatorId, members } = req.body;
    const chats = readData(CHATS_FILE);
    const users = readData(USERS_FILE);

    // Валидация: оставляем только реально существующие ID пользователей
    const validMembers = members.filter(mId => users.some(u => u.id === mId));

    const newGroup = {
        id: Math.random().toString(36).substring(2, 9),
        name,
        isGroup: true,
        creatorId,
        members: validMembers,
        messages: []
    };

    chats.push(newGroup);
    writeData(CHATS_FILE, chats);

    res.json({ chatId: newGroup.id });
});

// Отправка сообщения
app.post('/api/messages/send', (req, res) => {
    const { chatId, authorId, authorName, text } = req.body;
    const chats = readData(CHATS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });

    const newMessage = {
        id: Math.random().toString(36).substring(2, 9),
        authorId,
        authorName,
        text,
        timestamp: new Date().toISOString(),
        edited: false
    };

    chats[chatIndex].messages.push(newMessage);
    writeData(CHATS_FILE, chats);

    res.json({ success: true });
});

// Редактирование сообщения
app.post('/api/messages/edit', (req, res) => {
    const { chatId, messageId, authorId, text } = req.body;
    const chats = readData(CHATS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });

    const msgIndex = chats[chatIndex].messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

    // Проверяем авторство перед изменением
    if (chats[chatIndex].messages[msgIndex].authorId !== authorId) {
        return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });
    }

    chats[chatIndex].messages[msgIndex].text = text;
    chats[chatIndex].messages[msgIndex].edited = true;

    writeData(CHATS_FILE, chats);
    res.json({ success: true });
});

// Удаление сообщения
app.post('/api/messages/delete', (req, res) => {
    const { chatId, messageId, authorId } = req.body;
    const chats = readData(CHATS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });

    const msgIndex = chats[chatIndex].messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

    // Проверяем авторство перед удалением
    if (chats[chatIndex].messages[msgIndex].authorId !== authorId) {
        return res.status(403).json({ error: 'Можно удалять только свои сообщения' });
    }

    chats[chatIndex].messages.splice(msgIndex, 1);
    writeData(CHATS_FILE, chats);

    res.json({ success: true });
});

// Переименование группы (только создатель)
app.post('/api/groups/rename', (req, res) => {
    const { chatId, creatorId, name } = req.body;
    const chats = readData(CHATS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });
    if (chats[chatIndex].creatorId !== creatorId) return res.status(403).json({ error: 'Нет прав' });

    chats[chatIndex].name = name;
    writeData(CHATS_FILE, chats);
    res.json({ success: true });
});

// Добавление участника в группу (только создатель)
app.post('/api/groups/add-member', (req, res) => {
    const { chatId, creatorId, targetId } = req.body;
    const chats = readData(CHATS_FILE);
    const users = readData(USERS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });
    if (chats[chatIndex].creatorId !== creatorId) return res.status(403).json({ error: 'Нет прав' });

    if (!users.some(u => u.id === targetId)) {
        return res.status(404).json({ error: 'Пользователь с таким ID не существует' });
    }

    if (chats[chatIndex].members.includes(targetId)) {
        return res.status(400).json({ error: 'Пользователь уже в группе' });
    }

    chats[chatIndex].members.push(targetId);
    writeData(CHATS_FILE, chats);
    res.json({ success: true });
});

// Исключение из группы (только создатель)
app.post('/api/groups/kick', (req, res) => {
    const { chatId, creatorId, targetId } = req.body;
    const chats = readData(CHATS_FILE);

    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return res.status(404).json({ error: 'Чат не найден' });
    if (chats[chatIndex].creatorId !== creatorId) return res.status(403).json({ error: 'Нет прав' });
    if (creatorId === targetId) return res.status(400).json({ error: 'Нельзя выгнать самого себя' });

    chats[chatIndex].members = chats[chatIndex].members.filter(mId => mId !== targetId);
    writeData(CHATS_FILE, chats);
    res.json({ success: true });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер мессенджера Chat Ink запущен на порту ${PORT}`);
});
