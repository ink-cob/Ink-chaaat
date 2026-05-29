const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Пути к файлам нашей базы данных
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Функции для чтения и записи данных на диск
function readData(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        return content ? JSON.parse(content) : [];
    } catch (e) {
        return [];
    }
}

function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Жесткий обработчик главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Имя и пароль обязательны' });

    const users = readData(USERS_FILE);
    
    // Генерация уникального 5-значного ID
    let userId;
    do {
        userId = Math.floor(10000 + Math.random() * 90000).toString();
    } while (users.some(u => u.userId === userId));

    const newUser = { userId, username, password, createdAt: new Date().toISOString() };
    users.push(newUser);
    writeData(USERS_FILE, users);

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ user: userWithoutPassword });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) return res.status(401).json({ error: 'Неверное имя или пароль' });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

// Поиск пользователя по ID
app.get('/api/user/:id', (req, res) => {
    const users = readData(USERS_FILE);
    const user = users.find(u => u.userId === req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ userId: user.userId, username: user.username });
});

// Получение сообщений
app.get('/api/messages', (req, res) => {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) return res.status(400).json({ error: 'Не указаны участники' });

    const messages = readData(MESSAGES_FILE);
    const chatHistory = messages.filter(m => 
        (m.senderId === user1 && m.receiverId === user2) || 
        (m.senderId === user2 && m.receiverId === user1)
    );
    res.json(chatHistory);
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
    const { senderId, receiverId, text } = req.body;
    if (!senderId || !receiverId || !text) return res.status(400).json({ error: 'Заполните поля' });

    const messages = readData(MESSAGES_FILE);
    const newMessage = {
        id: Math.random().toString(36).substr(2, 9),
        senderId, receiverId, text,
        timestamp: new Date().toISOString(), edited: false
    };

    messages.push(newMessage);
    writeData(MESSAGES_FILE, messages);
    res.status(201).json(newMessage);
});

// Редактирование сообщения
app.put('/api/messages/:id', (req, res) => {
    const { text } = req.body;
    const messages = readData(MESSAGES_FILE);
    const msg = messages.find(m => m.id === req.params.id);
    
    if (!msg) return res.status(404).json({ error: 'Не найдено' });
    
    msg.text = text;
    msg.edited = true;
    writeData(MESSAGES_FILE, messages);
    res.json(msg);
});

// Удаление сообщения
app.delete('/api/messages/:id', (req, res) => {
    let messages = readData(MESSAGES_FILE);
    messages = messages.filter(m => m.id !== req.params.id);
    writeData(MESSAGES_FILE, messages);
    res.json({ success: true });
});

// Обновление профиля
app.put('/api/user/:id', (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.userId === req.params.id);

    if (!user) return res.status(404).json({ error: 'Не найден' });

    if (username) user.username = username;
    if (password) user.password = password;

    writeData(USERS_FILE, users);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

// Удаление аккаунта
app.delete('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    let users = readData(USERS_FILE);
    let messages = readData(MESSAGES_FILE);

    users = users.filter(u => u.userId !== userId);
    messages = messages.filter(m => m.senderId !== userId && m.receiverId !== userId);

    writeData(USERS_FILE, users);
    writeData(MESSAGES_FILE, messages);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
