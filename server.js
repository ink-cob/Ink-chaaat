const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// НАСТРОЙКА CORS: Даем доступ вашему фронтенду на GitHub Pages
app.use(cors({
    origin: 'https://github.io',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Системные файлы для хранения данных во временной папке Render
const USERS_FILE = '/tmp/db_users.json';
const MESSAGES_FILE = '/tmp/db_messages.json';
const GROUPS_FILE = '/tmp/db_groups.json';

let db = { users: [], messages: [], groups: [] };

// Функция безопасного чтения и автосоздания файлов базы
const loadDatabase = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
        if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
        if (!fs.existsSync(GROUPS_FILE)) fs.writeFileSync(GROUPS_FILE, '[]', 'utf8');

        db.users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        db.messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
        db.groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
        
        console.log("ВЕЧНАЯ БАЗА ДАННЫХ УСПЕШНО ЗАГРУЖЕНА");
        
        if (db.users.length === 0) {
            db.users.push({ id: "1000000001", name: "Inker", pass: "admin", created_at: "16.02.2026", last_seen: Date.now(), isVerified: true });
            fs.writeFileSync(USERS_FILE, JSON.stringify(db.users, null, 2), 'utf8');
        }
    } catch (e) {
        console.error("Критический сбой базы данных:", e);
        db = { users: [], messages: [], groups: [] };
    }
};

const saveData = (filePath, dataArray) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(dataArray, null, 2), 'utf8');
    } catch (e) {
        console.error(`Не удалось сохранить файл ${filePath}:`, e);
    }
};

const updateHeartbeat = (username) => {
    if (!username) return;
    let user = db.users.find(u => u.name.toLowerCase() === username.toLowerCase());
    if (user) user.last_seen = Date.now();
};
// --- API: СЕССИЯ И АКТИВНОСТЬ ---
app.post('/api/heartbeat', (req, res) => {
    const { username } = req.body;
    updateHeartbeat(username);
    res.json({ success: true });
});

app.post('/api/register', (req, res) => {
    const { name, pass, id, created_at } = req.body;
    if (!name || !pass || !id) return res.status(400).json({ error: "Заполните все поля!" });
    if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: "Это имя уже занято!" });
    }
    
    const isVerified = (pass === "Ink_Admin_2552m");
    const newUser = { id, name, pass, created_at, last_seen: Date.now(), isVerified };
    db.users.push(newUser);
    
    saveData(USERS_FILE, db.users);
    res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = db.users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.pass === pass.trim());
    if (!user) return res.status(400).json({ error: "Неверные данные для входа!" });
    user.last_seen = Date.now();
    res.json({ success: true, user });
});

app.post('/api/profile/update', (req, res) => {
    const { userId, newName, newPass } = req.body;
    if (!userId || !newName || !newPass) return res.status(400).json({ error: "Поля не могут быть пустыми!" });
    
    let user = db.users.find(u => String(u.id) === String(userId));
    if (!user) return res.status(400).json({ error: "Пользователь не найден!" });
    
    if (user.name.toLowerCase() !== newName.toLowerCase() && db.users.some(u => u.name.toLowerCase() === newName.toLowerCase())) {
        return res.status(400).json({ error: "Это имя уже занято!" });
    }
    
    const oldName = user.name;
    db.messages.forEach(m => {
        if (m.sender === oldName) m.sender = newName;
        if (m.recipient === oldName) m.recipient = newName;
    });
    db.groups.forEach(g => {
        if (g.creator === oldName) g.creator = newName;
        g.members = g.members.map(m => m === oldName ? newName : m);
    });
    
    user.name = newName;
    user.pass = newPass;
    if (newPass === "Ink_Admin_2552m") user.isVerified = true;
    
    saveData(USERS_FILE, db.users);
    saveData(MESSAGES_FILE, db.messages);
    saveData(GROUPS_FILE, db.groups);
    
    res.json({ success: true, user });
});

// --- API: ПОИСК И СТАТУСЫ ---
app.get('/api/find-user', (req, res) => {
    const { searchId } = req.query;
    const match = db.users.find(u => String(u.id).trim() === String(searchId).trim());
    if (!match) return res.json({ matches: null });
    
    const isOnline = match.last_seen ? (Date.now() - match.last_seen) < 10000 : false;
    res.json({ matches: { ...match, isOnline } });
});

app.post('/api/users/status', (req, res) => {
    const { usernames } = req.body;
    if (!usernames || !Array.isArray(usernames)) return res.json({ statuses: {} });
    
    let statuses = {};
    usernames.forEach(name => {
        let u = db.users.find(user => user.name.toLowerCase() === name.toLowerCase());
        if (u) {
            statuses[name] = {
                isOnline: u.last_seen ? (Date.now() - u.last_seen) < 10000 : false,
                isVerified: u.isVerified || false
            };
        }
    });
    res.json({ statuses });
});

// --- API: КАТАЛОГ ДИАЛОГОВ ---
app.get('/api/active-dialogs', (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ dialogs: [] });

    let dialogPartners = new Set();
    db.messages.forEach(m => {
        if (m.target && !m.target.startsWith("Группа: ")) {
            if (m.sender.toLowerCase() === username.toLowerCase() && m.recipient) dialogPartners.add(m.recipient);
            if (m.recipient && m.recipient.toLowerCase() === username.toLowerCase()) dialogPartners.add(m.sender);
        }
    });

    let dialogs = Array.from(dialogPartners).map(name => {
        let u = db.users.find(user => user.name.toLowerCase() === name.toLowerCase());
        return { name: name, id: u ? u.id : "", isVerified: u ? u.isVerified : false };
    });

    res.json({ dialogs });
});

// --- API: СООБЩЕНИЯ И ГРУППЫ ---
app.get('/api/messages', (req, res) => res.json({ messages: db.messages }));

app.post('/api/messages/send', (req, res) => {
    const { sender, target, recipient, text } = req.body;
    updateHeartbeat(sender);
    const newMsg = { id: Date.now(), sender, target, recipient, text, read: false };
    db.messages.push(newMsg);
    
    saveData(MESSAGES_FILE, db.messages);
    res.json({ success: true });
});

app.post('/api/messages/read', (req, res) => {
    const { chatTarget, username } = req.body;
    updateHeartbeat(username);
    let changed = false;
    db.messages.forEach(m => {
        if (m.target === chatTarget && m.sender.toLowerCase() !== username.toLowerCase() && !m.read) {
            m.read = true;
            changed = true;
        }
    });
    if (changed) saveData(MESSAGES_FILE, db.messages);
    res.json({ success: true });
});

app.post('/api/messages/delete', (req, res) => {
    const { id, username } = req.body;
    let msg = db.messages.find(m => String(m.id) === String(id));
    if (msg && msg.sender === username) {
        db.messages = db.messages.filter(m => String(m.id) !== String(id));
        saveData(MESSAGES_FILE, db.messages);
        return res.json({ success: true });
    }
    res.status(400).json({ error: "Нельзя удалить это сообщение" });
});

app.post('/api/messages/edit', (req, res) => {
    const { id, username, newText } = req.body;
    let msg = db.messages.find(m => String(m.id) === String(id));
    if (msg && msg.sender === username) {
        msg.text = newText;
        saveData(MESSAGES_FILE, db.messages);
        return res.json({ success: true });
    }
    res.status(400).json({ error: "Нельзя изменить это сообщение" });
});

app.get('/api/groups', (req, res) => res.json({ groups: db.groups }));

app.post('/api/groups/create', (req, res) => {
    const { gName, creator, members } = req.body;
    if (db.groups.some(g => g.name.toLowerCase() === gName.toLowerCase())) {
        return res.status(400).json({ error: "Группа уже существует!" });
    }
    db.groups.push({ name: gName, creator, members });
    db.messages.push({ id: Date.now(), sender: "Система", target: "Группа: " + gName, recipient: null, text: `Группа создана пользователем ${creator}`, read: true });
    
    saveData(GROUPS_FILE, db.groups);
    saveData(MESSAGES_FILE, db.messages);
    res.json({ success: true });
});

// Запуск базы данных и прослушивания порта
loadDatabase();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
