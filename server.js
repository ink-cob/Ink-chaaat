const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// База данных в оперативной памяти сервера
let db = {
    users: [
        { id: "4829104952", name: "User1", pass: "1234", created_at: "16.02.2026", last_seen: Date.now(), isVerified: false },
        { id: "1000000001", name: "Inker", pass: "admin", created_at: "16.02.2026", last_seen: Date.now(), isVerified: true }
    ],
    messages: [],
    groups: []
};

const updateHeartbeat = (username) => {
    if (!username) return;
    let user = db.users.find(u => u.name.toLowerCase() === username.toLowerCase());
    if (user) user.last_seen = Date.now();
};

// --- API: СЕССИЯ, АКТИВНОСТЬ И СМЕНА ДАННЫХ ---
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
    
    // Проверка секретного админ-пароля для автоматической выдачи галочки
    const isVerified = (pass === "Ink_Admin_2552m");

    const newUser = { id, name, pass, created_at, last_seen: Date.now(), isVerified };
    db.users.push(newUser);
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
    if (newPass === "Ink_Admin_2552m") {
        user.isVerified = true;
    }
    
    res.json({ success: true, user });
});

// --- API: ПОИСК И СТАТУСЫ ПОЛЬЗОВАТЕЛЕЙ ---
app.get('/api/find-user', (req, res) => {
    const { searchId } = req.query;
    const match = db.users.find(u => String(u.id).trim() === String(searchId).trim());
    if (!match) return res.json({ matches: null });
    
    const isOnline = (Date.now() - match.last_seen) < 10000;
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
                isOnline: (Date.now() - u.last_seen) < 10000,
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
        if (!m.target.startsWith("Группа: ")) {
            if (m.sender.toLowerCase() === username.toLowerCase() && m.recipient) dialogPartners.add(m.recipient);
            if (m.recipient && m.recipient.toLowerCase() === username.toLowerCase()) dialogPartners.add(m.sender);
        }
    });

    let dialogs = Array.from(dialogPartners).map(name => {
        let u = db.users.find(user => user.name.toLowerCase() === name.toLowerCase());
        return {
            name: name,
            id: u ? u.id : "",
            isVerified: u ? u.isVerified : false
        };
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
    res.json({ success: true });
});

app.post('/api/messages/read', (req, res) => {
    const { chatTarget, username } = req.body;
    updateHeartbeat(username);
    db.messages.forEach(m => {
        if (m.target === chatTarget && m.sender.toLowerCase() !== username.toLowerCase()) {
            m.read = true;
        }
    });
    res.json({ success: true });
});

app.get('/api/groups', (req, res) => res.json({ groups: db.groups }));

app.post('/api/groups/create', (req, res) => {
    const { gName, creator, members } = req.body;
    if (db.groups.some(g => g.name.toLowerCase() === gName.toLowerCase())) {
        return res.status(400).json({ error: "Группа уже существует!" });
    }
    db.groups.push({ name: gName, creator, members });
    db.messages.push({ id: Date.now(), sender: "Система", target: "Группа: " + gName, recipient: null, text: `Группа создана пользователем ${creator}`, read: true });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен`));
