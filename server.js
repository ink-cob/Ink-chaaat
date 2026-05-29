const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ВСТАВЬТЕ СЮДА ВАШУ ССЫЛКУ ИЗ SUPABASE (НЕ ЗАБУДЬТЕ ВПИСАТЬ СВОЙ ПАРОЛЬ ВНУТРЬ НЕЁ)
const pool = new Pool({
    connectionString: 'postgresql://postgres.mcwrrzxocnncikfnvvgy:max092010M_m@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    ssl: { rejectUnauthorized: false }
});

// Проверка и создание таблиц в облаке
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(5) PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                password VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(20) PRIMARY KEY,
                sender_id VARCHAR(5) NOT NULL,
                receiver_id VARCHAR(5) NOT NULL,
                text TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("База данных Supabase успешно подключена!");
    } catch (err) {
        console.error("Ошибка Supabase:", err);
    }
}
initDB();

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

        const user = result.rows[0];
        res.status(201).json({ 
            user: { userId: user.user_id, username: user.username, createdAt: user.created_at } 
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT user_id, username, created_at FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length === 0) return res.status(401).json({ error: 'Неверные данные' });

        const user = result.rows[0];
        res.json({ 
            user: { userId: user.user_id, username: user.username, createdAt: user.created_at } 
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Поиск друга по ID
app.get('/api/user/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, username FROM users WHERE user_id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Не найден' });
        
        const user = result.rows[0];
        res.json({ userId: user.user_id, username: user.username });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка поиска' });
    }
});
// Получение истории сообщений
app.get('/api/messages', async (req, res) => {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) return res.status(400).json({ error: 'Не указаны участники' });

    try {
        const result = await pool.query(
            `SELECT id, sender_id AS "senderId", receiver_id AS "receiverId", text, timestamp, edited 
             FROM messages 
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY timestamp ASC`,
            [user1, user2]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки переписки' });
    }
});

// Отправка нового сообщения
app.post('/api/messages', async (req, res) => {
    const { senderId, receiverId, text } = req.body;
    if (!senderId || !receiverId || !text) return res.status(400).json({ error: 'Заполните поля' });

    try {
        const msgId = Math.random().toString(36).substr(2, 9);
        const result = await pool.query(
            `INSERT INTO messages (id, sender_id, receiver_id, text) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, sender_id AS "senderId", receiver_id AS "receiverId", text, timestamp, edited`,
            [msgId, senderId, receiverId, text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

// Редактирование сообщения
app.put('/api/messages/:id', async (req, res) => {
    const { text } = req.body;
    try {
        const result = await pool.query(
            'UPDATE messages SET text = $1, edited = true WHERE id = $2 RETURNING id, text, edited',
            [text, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка редактирования' });
    }
});

// Удаление сообщения
app.delete('/api/messages/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления сообщения' });
    }
});

// Обновление профиля
app.put('/api/user/:id', async (req, res) => {
    const { username, password } = req.body;
    try {
        let result;
        if (password) {
            result = await pool.query(
                'UPDATE users SET username = $1, password = $2 WHERE user_id = $3 RETURNING user_id, username, created_at',
                [username, password, req.params.id]
            );
        } else {
            result = await pool.query(
                'UPDATE users SET username = $1 WHERE user_id = $2 RETURNING user_id, username, created_at',
                [username, req.params.id]
            );
        }

        if (result.rows.length === 0) return res.status(404).json({ error: 'Не найден' });
        
        const user = result.rows[0];
        res.json({ 
            user: { userId: user.user_id, username: user.username, createdAt: user.created_at } 
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка обновления профиля' });
    }
});

// Полное удаление аккаунта
app.delete('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $2', [userId, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления аккаунта' });
    }
});

// Запуск Node.js сервера
app.listen(PORT, () => {
    console.log(`Сервер мессенджера Chat Ink успешно запущен на порту ${PORT}`);
});
