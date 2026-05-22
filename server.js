const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// --- BAZA DANNYH V PAMYATI (In-Memory DB) ---
const users = {}; 
const messages = []; 
const groups = {}; 

// Раздача статического файла index.html из корня проекта
app.use(express.static(path.join(__dirname)));

// --- СЕРВЕРНАЯ ЛОГИКА (SOCKET.IO) ---
io.on('connection', (socket) => {
    let currentUserId = null;

    // Побудка сервера (Render оптимизация)
    socket.on('ping', () => socket.emit('pong'));

    // Регистрация / Вход
    socket.on('auth', ({ id, name, password, isRegister }) => {
        if (isRegister) {
            const newId = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const isAdmin = Object.keys(users).length === 0; // Первый пользователь автоматически админ
            users[newId] = { id: newId, name, password, isAdmin, isOnline: true };
            currentUserId = newId;
            socket.emit('auth_success', users[newId]);
        } else {
            if (users[id] && users[id].password === password) {
                users[id].isOnline = true;
                currentUserId = id;
                socket.emit('auth_success', users[id]);
            } else {
                socket.emit('auth_error', 'Неверный ID или пароль');
                return;
            }
        }
        socket.join(currentUserId);
        io.emit('user_status', { id: currentUserId, isOnline: true });
    });

    // Поиск контакта
    socket.on('search_contact', (targetId) => {
        if (users[targetId]) {
            socket.emit('contact_found', { id: targetId, name: users[targetId].name, isAdmin: users[targetId].isAdmin });
        } else {
            socket.emit('contact_error', 'Пользователь не найден');
        }
    });

    // Создание группы
    socket.on('create_group', ({ name, members }) => {
        const groupId = 'g_' + Math.random().toString(36).substr(2, 9);
        groups[groupId] = { id: groupId, name, members: [...members, currentUserId] };
        
        groups[groupId].members.forEach(mId => {
            io.to(mId).emit('group_created', groups[groupId]);
        });
    });

    // Запрос истории чатов
    socket.on('get_chats', () => {
        if (!currentUserId) return;
        const userChats = [];
        
        Object.values(users).forEach(u => {
            if (u.id !== currentUserId) {
                userChats.push({ id: u.id, name: u.name, isGroup: false, isOnline: u.isOnline, isAdmin: u.isAdmin });
            }
        });

        Object.values(groups).forEach(g => {
            if (g.members.includes(currentUserId)) {
                userChats.push({ id: g.id, name: g.name, isGroup: true });
            }
        });

        socket.emit('chats_list', userChats);
    });
    // Запрос сообщений конкретного чата
    socket.on('get_messages', ({ chatId, isGroup }) => {
        const filtered = messages.filter(m => {
            if (isGroup) return m.receiverId === chatId;
            return (m.senderId === currentUserId && m.receiverId === chatId) || 
                   (m.senderId === chatId && m.receiverId === currentUserId);
        });

        // Отметка о прочтении
        filtered.forEach(m => {
            if (m.senderId !== currentUserId && !m.readBy.includes(currentUserId)) {
                m.readBy.push(currentUserId);
                io.to(m.senderId).emit('msg_read', { msgId: m.id, chatId: isGroup ? chatId : currentUserId });
            }
        });

        socket.emit('messages_list', filtered.map(m => ({
            ...m,
            senderName: users[m.senderId]?.name || 'Удаленный аккаунт',
            senderIsAdmin: users[m.senderId]?.isAdmin || false,
            isRead: isGroup ? m.readBy.length > 0 : m.readBy.includes(chatId) || m.senderId === chatId
        })));
    });

    // Отправка сообщения
    socket.on('send_msg', ({ receiverId, isGroup, text }) => {
        const msg = {
            id: 'm_' + Math.random().toString(36).substr(2, 9),
            senderId: currentUserId,
            receiverId,
            isGroup,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            edited: false,
            readBy: []
        };
        messages.push(msg);

        if (isGroup) {
            groups[receiverId].members.forEach(mId => {
                io.to(mId).emit('new_msg', { ...msg, senderName: users[currentUserId].name, senderIsAdmin: users[currentUserId].isAdmin, isRead: false });
            });
        } else {
            socket.emit('new_msg', { ...msg, senderName: users[currentUserId].name, senderIsAdmin: users[currentUserId].isAdmin, isRead: false });
            io.to(receiverId).emit('new_msg', { ...msg, senderName: users[currentUserId].name, senderIsAdmin: users[currentUserId].isAdmin, isRead: false });
        }
    });

    // Редактирование сообщения
    socket.on('edit_msg', ({ msgId, newText }) => {
        const msg = messages.find(m => m.id === msgId && m.senderId === currentUserId);
        if (msg) {
            msg.text = newText;
            msg.edited = true;
            broadcastToChat(msg, 'msg_edited', { msgId, text: newText });
        }
    });

    // Удаление сообщения
    socket.on('delete_msg', ({ msgId }) => {
        const index = messages.findIndex(m => m.id === msgId && m.senderId === currentUserId);
        if (index !== -1) {
            const msg = messages[index];
            messages.splice(index, 1);
            broadcastToChat(msg, 'msg_deleted', { msgId });
        }
    });

    // Обновление профиля
    socket.on('update_profile', ({ name, password }) => {
        if (users[currentUserId]) {
            users[currentUserId].name = name;
            users[currentUserId].password = password;
            socket.emit('profile_updated', users[currentUserId]);
            io.emit('user_renamed', { id: currentUserId, name });
        }
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        if (currentUserId && users[currentUserId]) {
            users[currentUserId].isOnline = false;
            io.emit('user_status', { id: currentUserId, isOnline: false });
        }
    });

    function broadcastToChat(msg, event, data) {
        if (msg.isGroup) {
            groups[msg.receiverId].members.forEach(mId => io.to(mId).emit(event, data));
        } else {
            io.to(msg.senderId).emit(event, data);
            io.to(msg.receiverId).emit(event, data);
        }
    }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
