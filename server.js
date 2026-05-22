const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors'); // Добавили cors

const app = express();
const server = http.createServer(app);

// Настройка CORS для работы с GitHub Pages
const ALLOWED_ORIGIN = "https://ink-cob.github.io";

app.use(cors({
    origin: ALLOWED_ORIGIN,
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const db = new sqlite3.Database(':memory:'); 

app.use(express.json());
app.use(session({
    secret: 'secret-key-render-chat',
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'none', // Необходимо для работы сессий между разными доменами
        secure: true      // Обязательно для HTTPS
    }
}));

// Инициализация БД
db.serialize(() => {
    db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password TEXT)`);
    db.run(`CREATE TABLE rooms (id TEXT PRIMARY KEY, name TEXT, is_dm INT)`);
    db.run(`CREATE TABLE room_members (room_id TEXT, user_id TEXT)`);
    db.run(`CREATE TABLE messages (id TEXT PRIMARY KEY, room_id TEXT, user_id TEXT, username TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

function generateShortId(callback) {
    const id = Math.floor(10000 + Math.random() * 90000).toString();
    db.get("SELECT id FROM users WHERE id = ?", [id], (err, row) => {
        if (row) return generateShortId(callback);
        callback(id);
    });
}

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните поля' });
    
    generateShortId((userId) => {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.run("INSERT INTO users (id, username, password) VALUES (?, ?, ?)", [userId, username, hashedPassword], (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка регистрации' });
            req.session.userId = userId;
            req.session.username = username;
            res.json({ id: userId, username });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Неверные данные' });
        }
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ id: user.id, username: user.username });
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    res.json({ id: req.session.userId, username: req.session.username });
});

io.on('connection', (socket) => {
    // Удаление (выход из) чата или ЛС
    socket.on('delete_room', ({ roomId, userId }) => {
        // Удаляем пользователя из участников этой комнаты
        db.run("DELETE FROM room_members WHERE room_id = ? AND user_id = ?", [roomId, userId], () => {
            
            // Проверяем, остались ли еще участники в этой комнате
            db.get("SELECT COUNT(*) as count FROM room_members WHERE room_id = ?", [roomId], (err, row) => {
                if (!err && row.count === 0) {
                    // Если участников не осталось, полностью стираем чат и его сообщения
                    db.run("DELETE FROM rooms WHERE id = ?", [roomId]);
                    db.run("DELETE FROM messages WHERE room_id = ?", [roomId]);
                }
                
                // Обновляем список чатов у пользователя
                sendUserRooms(userId);
                socket.emit('room_deleted_success');
            });
        });
    });

    let currentUserId = null;

    socket.on('auth', (userId) => {
        currentUserId = userId;
        socket.join(`user_${userId}`);
        sendUserRooms(userId);
    });

    function sendUserRooms(userId) {
        db.all(`
            SELECT r.id, r.name, r.is_dm, 
            (SELECT username FROM users WHERE id = rm2.user_id AND rm2.user_id != ?) as dm_name
            FROM rooms r
            JOIN room_members rm ON r.id = rm.room_id
            LEFT JOIN room_members rm2 ON r.id = rm2.room_id AND r.is_dm = 1
            WHERE rm.user_id = ?
        `, [userId, userId], (err, rows) => {
            if (!err) socket.emit('rooms_list', rows);
        });
    }

    socket.on('create_room', ({ name, userId }) => {
        const roomId = Math.random().toString(36).substring(2, 9);
        db.run("INSERT INTO rooms (id, name, is_dm) VALUES (?, ?, 0)", [roomId, name], () => {
            db.run("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)", [roomId, userId], () => {
                sendUserRooms(userId);
            });
        });
    });

    socket.on('create_dm', ({ targetId, userId }) => {
        db.get("SELECT username FROM users WHERE id = ?", [targetId], (err, targetUser) => {
            if (!targetUser || targetId === userId) return socket.emit('error_msg', 'Пользователь не найден');
            
            const roomId = [userId, targetId].sort().join('_');
            db.get("SELECT id FROM rooms WHERE id = ?", [roomId], (err, exists) => {
                if (exists) return socket.emit('dm_created', roomId);

                db.run("INSERT INTO rooms (id, name, is_dm) VALUES (?, ?, 1)", [roomId, 'DM'], () => {
                    db.run("INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)", [roomId, userId, roomId, targetId], () => {
                        sendUserRooms(userId);
                        io.to(`user_${targetId}`).emit('refresh_rooms');
                        socket.emit('dm_created', roomId);
                    });
                });
            });
        });
    });

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        db.all("SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp ASC", [roomId], (err, rows) => {
            if (!err) socket.emit('messages_list', rows);
        });
    });

    socket.on('send_message', ({ roomId, userId, username, text }) => {
        const msgId = Math.random().toString(36).substring(2, 9);
        db.run("INSERT INTO messages (id, room_id, user_id, username, text) VALUES (?, ?, ?, ?, ?)", [msgId, roomId, userId, username, text], () => {
            io.to(roomId).emit('new_message', { id: msgId, room_id: roomId, user_id: userId, username, text });
        });
    });

    socket.on('edit_message', ({ msgId, roomId, userId, newText }) => {
        db.run("UPDATE messages SET text = ? WHERE id = ? AND user_id = ?", [newText, msgId, userId], () => {
            io.to(roomId).emit('message_edited', { id: msgId, text: newText });
        });
    });

    socket.on('delete_message', ({ msgId, roomId, userId }) => {
        db.run("DELETE FROM messages WHERE id = ? AND user_id = ?", [msgId, userId], () => {
            io.to(roomId).emit('message_deleted', msgId);
        });
    });
    
    socket.on('refresh_rooms', () => { if(currentUserId) sendUserRooms(currentUserId); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
