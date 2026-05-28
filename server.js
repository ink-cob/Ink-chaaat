const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Жесткая настройка CORS для работы с GitHub Pages
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://github.io');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// База данных в оперативной памяти
let users = [];
let messages = [];

// Генерация 5-значного ID
function generateUniqueId() {
    let id;
    do {
        id = Math.floor(10000 + Math.random() * 90000).toString();
    } while (users.some(u => u.userId === id));
    return id;
}

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Имя и пароль обязательны' });
    }

    const userId = generateUniqueId();
    const newUser = {
        userId,
        username,
        password,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ user: userWithoutPassword });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

// Поиск пользователя по ID
app.get('/api/user/:id', (req, res) => {
    const user = users.find(u => u.userId === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ userId: user.userId, username: user.username });
});

// Получение сообщений
app.get('/api/messages', (req, res) => {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) {
        return res.status(400).json({ error: 'Не указаны участники диалога' });
    }

    const chatHistory = messages.filter(m => 
        (m.senderId === user1 && m.receiverId === user2) || 
        (m.senderId === user2 && m.receiverId === user1)
    );
    res.json(chatHistory);
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
    const { senderId, receiverId, text } = req.body;
    if (!senderId || !receiverId || !text) {
        return res.status(400).json({ error: 'Не все поля заполнены' });
    }

    const newMessage = {
        id: Math.random().toString(36).substr(2, 9),
        senderId,
        receiverId,
        text,
        timestamp: new Date().toISOString(),
        edited: false
    };

    messages.push(newMessage);
    res.status(201).json(newMessage);
});

// Редактирование сообщения
app.put('/api/messages/:id', (req, res) => {
    const { text } = req.body;
    const msg = messages.find(m => m.id === req.params.id);
    
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
    
    msg.text = text;
    msg.edited = true;
    res.json(msg);
});

// Удаление сообщения
app.delete('/api/messages/:id', (req, res) => {
    messages = messages.filter(m => m.id !== req.params.id);
    res.json({ success: true });
});

// Обновление профиля
app.put('/api/user/:id', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.userId === req.params.id);

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (username) user.username = username;
    if (password) user.password = password;

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
});

// Удаление аккаунта
app.delete('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    users = users.filter(u => u.userId !== userId);
    messages = messages.filter(m => m.senderId !== userId && m.receiverId !== userId);
    res.json({ success: true });
});

// Запуск
app.listen(PORT, () => {
    console.log(`Сервер мессенджера Chat Ink успешно запущен на порту ${PORT}`);
});
