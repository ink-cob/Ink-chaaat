const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Хранилища данных в оперативной памяти (ОЗУ)
let users = [];       // Массив пользователей: { id, username, password, createdAt }
let chats = [];       // Массив чатов: { id, name, type, creatorId, participants: [], messages: [] }

// Генерация гарантированно уникального 5-значного ID
function generateUniqueId() {
    let id;
    do {
        id = Math.floor(10000 + Math.random() * 90000).toString();
    } while (users.some(u => u.id === id));
    return id;
}

// Отдача фронтенд-файлов из текущей директории
app.use(express.static(path.join(__dirname, '')));

io.on('connection', (socket) => {
    let sessionUser = null;

    // Вспомогательная функция синхронизации участников чата
    function refreshChatUsers(chatId) {
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;
        chat.participants.forEach(p => {
            io.to(p.socketId).emit('chat-updated');
        });
    }

    // Регистрация нового аккаунта
    socket.on('user-register', ({ username, password }) => {
        const userId = generateUniqueId();
        const newUser = {
            id: userId,
            username,
            password,
            createdAt: new Date().toISOString(),
            socketId: socket.id
        };
        users.push(newUser);
        sessionUser = newUser;
        socket.emit('auth-success', { id: userId, username, createdAt: newUser.createdAt });
    });

    // Обычная авторизация по логину/паролю
    socket.on('user-login', ({ username, password }) => {
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) {
            return socket.emit('auth-error', 'Неверное имя или пароль!');
        }
        user.socketId = socket.id;
        sessionUser = user;
        socket.emit('auth-success', { id: user.id, username: user.username, createdAt: user.createdAt });
    });

    // Автоматическое восстановление сессии при перезагрузке страницы
    socket.on('auto-login', (savedUser) => {
        const user = users.find(u => u.id === savedUser.id);
        if (user) {
            user.socketId = socket.id;
            sessionUser = user;
            socket.emit('auth-success', { id: user.id, username: user.username, createdAt: user.createdAt });
        } else {
            // Если сервер был перезапущен, восстанавливаем пользователя по данным localStorage
            const reCreatedUser = {
                id: savedUser.id,
                username: savedUser.username,
                password: 'restored_session_pwd',
                createdAt: savedUser.createdAt || new Date().toISOString(),
                socketId: socket.id
            };
            users.push(reCreatedUser);
            sessionUser = reCreatedUser;
            socket.emit('auth-success', { id: reCreatedUser.id, username: reCreatedUser.username, createdAt: reCreatedUser.createdAt });
        }
    });

    // Запрос на получение списка доступных чатов
    socket.on('get-chats', () => {
        if (!sessionUser) return;
        const userChats = chats.filter(c => c.participants.some(p => p.id === sessionUser.id));
        socket.emit('chats-data', userChats);
    });
    // Создание приватного диалога (тет-а-тет) по 5-значному ID
    socket.on('create-private-chat', ({ targetId }) => {
        if (!sessionUser) return;
        const targetUser = users.find(u => u.id === targetId);
        if (!targetUser) return socket.emit('app-error', 'Пользователь с указанным ID не зарегистрирован.');

        // Проверяем, существует ли уже приватный чат между ними
        const existChat = chats.find(c => 
            c.type === 'private' && 
            c.participants.some(p => p.id === sessionUser.id) && 
            c.participants.some(p => p.id === targetId)
        );

        if (existChat) {
            return socket.emit('chats-data', chats.filter(c => c.participants.some(p => p.id === sessionUser.id)));
        }

        const newChat = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            name: 'Private',
            type: 'private',
            creatorId: sessionUser.id,
            participants: [
                { id: sessionUser.id, username: sessionUser.username, socketId: socket.id },
                { id: targetUser.id, username: targetUser.username, socketId: targetUser.socketId }
            ],
            messages: []
        };

        chats.push(newChat);
        socket.emit('chat-updated');
        if (targetUser.socketId) io.to(targetUser.socketId).emit('chat-updated');
    });

    // Создание группового чата (мульти-аккаунт)
    socket.on('create-group-chat', ({ name, userIds }) => {
        if (!sessionUser) return;

        const participants = [{ id: sessionUser.id, username: sessionUser.username, socketId: socket.id }];
        
        userIds.forEach(id => {
            const u = users.find(user => user.id === id);
            if (u && u.id !== sessionUser.id) {
                participants.push({ id: u.id, username: u.username, socketId: u.socketId });
            }
        });

        const newChat = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            name: name,
            type: 'group',
            creatorId: sessionUser.id,
            participants: participants,
            messages: []
        };

        chats.push(newChat);
        participants.forEach(p => {
            if (p.socketId) io.to(p.socketId).emit('chat-updated');
        });
    });

    // Обработка отправки нового сообщения
    socket.on('send-message', ({ chatId, text }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;

        const newMsg = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            authorId: sessionUser.id,
            authorName: sessionUser.username,
            text,
            timestamp: new Date().toISOString(),
            edited: false
        };

        chat.messages.push(newMsg);
        refreshChatUsers(chatId);
    });

    // Изменение текста сообщения (разрешено только автору)
    socket.on('edit-message', ({ chatId, msgId, newText }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;

        const msg = chat.messages.find(m => m.id === msgId);
        if (msg && msg.authorId === sessionUser.id) {
            msg.text = newText;
            msg.edited = true;
            refreshChatUsers(chatId);
        }
    });

    // Удаление отдельного сообщения (разрешено только автору)
    socket.on('delete-message', ({ chatId, msgId }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;

        const msgIndex = chat.messages.findIndex(m => m.id === msgId);
        if (msgIndex !== -1 && chat.messages[msgIndex].authorId === sessionUser.id) {
            chat.messages.splice(msgIndex, 1);
            refreshChatUsers(chatId);
        }
    });

    // Обновление личных настроек профиля (имя/пароль)
    socket.on('update-profile', ({ username, password }) => {
        if (!sessionUser) return;
        const user = users.find(u => u.id === sessionUser.id);
        if (user) {
            user.username = username;
            if (password) user.password = password;
            sessionUser.username = username;

            // Каскадное обновление имени пользователя во всех его активных чатах
            chats.forEach(chat => {
                chat.participants.forEach(p => {
                    if (p.id === user.id) p.username = username;
                });
                chat.messages.forEach(m => {
                    if (m.authorId === user.id) m.authorName = username;
                });
            });

            socket.emit('auth-success', { id: user.id, username: user.username, createdAt: user.createdAt });
            io.emit('chat-updated');
        }
    });

    // Переименование группы (только для создателя)
    socket.on('rename-chat', ({ chatId, newName }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId && c.creatorId === sessionUser.id);
        if (chat) {
            chat.name = newName;
            refreshChatUsers(chatId);
        }
    });

    // Приглашение нового участника по ID (только для создателя)
    socket.on('add-user-to-chat', ({ chatId, targetId }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId && c.creatorId === sessionUser.id);
        const targetUser = users.find(u => u.id === targetId);

        if (!chat || !targetUser) return socket.emit('app-error', 'Действие недоступно или ID не существует.');
        if (chat.participants.some(p => p.id === targetId)) return socket.emit('app-error', 'Этот пользователь уже состоит в группе.');

        chat.participants.push({ id: targetUser.id, username: targetUser.username, socketId: targetUser.socketId });
        refreshChatUsers(chatId);
    });

    // Исключение (кик) участника из группы (только для создателя)
    socket.on('kick-user-from-chat', ({ chatId, targetId }) => {
        if (!sessionUser) return;
        const chat = chats.find(c => c.id === chatId && c.creatorId === sessionUser.id);
        if (!chat) return;

        const targetIndex = chat.participants.findIndex(p => p.id === targetId);
        if (targetIndex !== -1) {
            const kickedUser = chat.participants[targetIndex];
            chat.participants.splice(targetIndex, 1);
            if (kickedUser.socketId) io.to(kickedUser.socketId).emit('chat-deleted', chatId);
            refreshChatUsers(chatId);
        }
    });

    // Полное удаление чата (только для создателя)
    socket.on('delete-chat', ({ chatId }) => {
        if (!sessionUser) return;
        const chatIndex = chats.findIndex(c => c.id === chatId && c.creatorId === sessionUser.id);
        if (chatIndex !== -1) {
            const chat = chats[chatIndex];
            chats.splice(chatIndex, 1);
            chat.participants.forEach(p => {
                if (p.socketId) io.to(p.socketId).emit('chat-deleted', chatId);
            });
        }
    });

    // Безвозвратное удаление аккаунта пользователем
    socket.on('delete-account', () => {
        if (!sessionUser) return;
        const uIndex = users.findIndex(u => u.id === sessionUser.id);
        if (uIndex !== -1) {
            users.splice(uIndex, 1);
            
            // Удаляем пользователя из участников всех чатов
            chats.forEach(chat => {
                const pIndex = chat.participants.findIndex(p => p.id === sessionUser.id);
                if (pIndex !== -1) chat.participants.splice(pIndex, 1);
            });

            socket.emit('account-deleted-success');
        }
    });

    // Обработка отключения от сети
    socket.on('disconnect', () => {
        if (sessionUser) {
            const user = users.find(u => u.id === sessionUser.id);
            if (user) user.socketId = null; // Статус: оффлайн
        }
    });
});

// Запуск прослушивания порта сервером
server.listen(PORT, () => {
    console.log(`Сервер мессенджера Chat Ink запущен на порту ${PORT}`);
});
