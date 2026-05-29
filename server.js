const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const pool = new Pool({
    connectionString: 'postgresql://postgres.mcwrrzxocnncikfnvvgy:max092010M_m@://supabase.com',
    ssl: { rejectUnauthorized: false }
});

// Проверка и создание таблиц
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(5) PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                password VARCHAR(100) NOT NULL,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS rooms (
                room_id VARCHAR(15) PRIMARY KEY,
                room_name VARCHAR(50) NOT NULL,
                created_by VARCHAR(5) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(20) PRIMARY KEY,
                sender_id VARCHAR(5) NOT NULL,
                receiver_id VARCHAR(15) NOT NULL, -- Теперь может быть и ID пользователя (5 знаков), и ID комнаты (начинается с room_)
                text TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("База данных Supabase успешно подключена и обновлена!");
    } catch (err) {
        console.error("Ошибка Supabase:", err);
    }
}
initDB();

// Фильтр-middleware для обновления статуса "В сети" при любом запросе пользователя
async function updateOnlineStatus(req, res, next) {
    const userId = req.headers['x-user-id'] || req.body.senderId || req.query.user1;
    if (userId && userId.length === 5) {
        try {
            await pool.query('UPDATE users SET last_seen = NOW() WHERE user_id = $1', [userId]);
        } catch (e) { console.error(e); }
    }
    next();
}
app.use(updateOnlineStatus);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Регистрация
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните поля' });
    try {
        let userId;
        let isUnique = false;
        while (!isUnique) {
            userId = Math.floor(10000 + Math.random() * 90000).toString();
            const check = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
            if (check.rows.length === 0) isUnique = true;
        }
        const result = await pool.query(
            'INSERT INTO users (user_id, username, password) VALUES ($1, $2, $3) RETURNING user_id, username, created_at',
            [userId, username, password]
        );
        res.status(201).json({ user: { userId: result.rows[0].user_id, username: result.rows[0].username, createdAt: result.rows[0].created_at } });
    } catch (err) { res.status(500).json({ error: 'Ошибка регистрации' }); }
});

// Вход
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT user_id, username, created_at FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Неверные данные' });
        res.json({ user: { userId: result.rows[0].user_id, username: result.rows[0].username, createdAt: result.rows[0].created_at } });
    } catch (err) { res.status(500).json({ error: 'Ошибка входа' }); }
});

// Поиск друга
app.get('/api/user/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, username, (last_seen > NOW() - INTERVAL \'10 seconds\') AS is_online FROM users WHERE user_id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Не найден' });
        res.json({ userId: result.rows[0].user_id, username: result.rows[0].username, isOnline: result.rows[0].is_online });
    } catch (err) { res.status(500).json({ error: 'Ошибка поиска' }); }
});

// Синхронизация статусов всех друзей
app.post('/api/users/status', async (req, res) => {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) return res.json([]);
    try {
        const result = await pool.query(
            `SELECT user_id AS "userId", (last_seen > NOW() - INTERVAL '15 seconds') AS "isOnline" 
             FROM users WHERE user_id = ANY($1)`, [userIds]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json([]); }
});

// Создание комнаты
app.post('/api/rooms', async (req, res) => {
    const { roomName, createdBy } = req.body;
    if (!roomName || !createdBy) return res.status(400).json({ error: 'Заполните поля' });
    try {
        const roomId = 'room_' + Math.floor(1000 + Math.random() * 9000).toString();
        await pool.query('INSERT INTO rooms (room_id, room_name, created_by) VALUES ($1, $2, $3)', [roomId, roomName, createdBy]);
        res.status(201).json({ roomId, roomName });
    } catch (err) { res.status(500).json({ error: 'Ошибка создания комнаты' }); }
});

// Получение списка комнат
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query('SELECT room_id AS "roomId", room_name AS "roomName" FROM rooms ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json([]); }
});

// Получение сообщений (универсальное)
app.get('/api/messages', async (req, res) => {
    const { user1, user2 } = req.query; 
    if (!user1 || !user2) return res.status(400).json({ error: 'Не указаны участники' });
    try {
        let result;
        if (user2.startsWith('room_')) {
            // Запрос сообщений из комнаты
            result = await pool.query(
                `SELECT m.id, m.sender_id AS "senderId", m.receiver_id AS "receiverId", m.text, m.timestamp, m.edited, u.username AS "senderName"
                 FROM messages m LEFT JOIN users u ON m.sender_id = u.user_id
                 WHERE m.receiver_id = $1 ORDER BY m.timestamp ASC`, [user2]
            );
        } else {
            // Запрос ЛС диалога
            result = await pool.query(
                `SELECT m.id, m.sender_id AS "senderId", m.receiver_id AS "receiverId", m.text, m.timestamp, m.edited, u.username AS "senderName"
                 FROM messages m LEFT JOIN users u ON m.sender_id = u.user_id
                 WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
                 ORDER BY m.timestamp ASC`, [user1, user2]
            );
        }
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Ошибка загрузки переписки' }); }
});

// Отправка сообщения
app.post('/api/messages', async (req, res) => {
    const { senderId, receiverId, text } = req.body;
    try {
        const msgId = Math.random().toString(36).substr(2, 9);
        const result = await pool.query(
            `INSERT INTO messages (id, sender_id, receiver_id, text) VALUES ($1, $2, $3, $4) 
             RETURNING id, sender_id AS "senderId", receiver_id AS "receiverId", text, timestamp, edited`,
            [msgId, senderId, receiverId, text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Ошибка отправки' }); }
});

// Редактирование, удаление, профиль
app.put('/api/messages/:id', async (req, res) => {
    try {
        const result = await pool.query('UPDATE messages SET text = $1, edited = true WHERE id = $2 RETURNING id, text, edited', [req.body.text, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});
app.delete('/api/messages/:id', async (req, res) => {
    try { await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});
app.put('/api/user/:id', async (req, res) => {
    const { username, password } = req.body;
    try {
        let result = password 
            ? await pool.query('UPDATE users SET username = $1, password = $2 WHERE user_id = $3 RETURNING user_id, username, created_at', [username, password, req.params.id])
            : await pool.query('UPDATE users SET username = $1 WHERE user_id = $2 RETURNING user_id, username, created_at', [username, req.params.id]);
        res.json({ user: { userId: result.rows[0].user_id, username: result.rows[0].username, createdAt: result.rows[0].created_at } });
    } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});
app.delete('/api/user/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE user_id = $1', [req.params.id]);
        await pool.query('DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
