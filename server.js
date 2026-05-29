const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Порт для развертывания на хостингах (Render, Railway, Amvera берут его из env)
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const DB_FILE = path.join(__dirname, 'database.json');

// ГЛОБАЛЬНАЯ БАЗА ДАННЫХ
let db = {
    users: [],  // { id, username, password, createdAt, isOnline }
    chats: []   // { id, isGroup, name, creatorId, members: [], messages: [] }
};

// Загрузка данных при старте сервера
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        // Сбрасываем статус сети всем при перезапуске сервера
        db.users.forEach(u => u.isOnline = false);
    } catch (e) {
        console.error("Ошибка чтения базы данных, создана новая:", e);
    }
}

// Функция сохранения базы данных в файл
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// Хранилище активных соединений (ключ: ws, значение: userId)
const activeConnections = new Map();

console.log(`Сервер Chat Ink запущен на порту ${PORT}`);

wss.on('connection', (ws) => {
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientMessage(ws, data);
        } catch (err) {
            console.error("Ошибка обработки пакета:", err);
        }
    });

    ws.on('close', () => {
        const userId = activeConnections.get(ws);
        if (userId) {
            const user = db.users.find(u => u.id === userId);
            if (user) {
                user.isOnline = false;
                broadcastStatusChange(userId);
            }
            activeConnections.delete(ws);
            console.log(`Пользователь ${userId} отключился.`);
        }
    });
});

// КОРНЕВОЙ ОБРАБОТЧИК ЗАПРОСОВ КЛИЕНТА
function handleClientMessage(ws, data) {
    switch (data.type) {
        
        // РЕГИСТРАЦИЯ
        case 'register':
            const existingId = db.users.find(u => u.id === data.id);
            if (existingId) {
                return ws.send(JSON.stringify({ type: 'auth_error', message: 'Ошибка генерации ID. Попробуйте еще раз.' }));
            }
            
            const newUser = {
                id: data.id,
                username: data.username,
                password: data.password,
                createdAt: new Date().toLocaleDateString('ru-RU'),
                isOnline: true
            };
            
            db.users.push(newUser);
            saveDB();
            
            activeConnections.set(ws, newUser.id);
            sendAuthSuccess(ws, newUser);
            broadcastStatusChange(newUser.id);
            break;

        // ВХОД
        case 'login':
            const user = db.users.find(u => u.username === data.username && u.password === data.password);
            if (!user) {
                return ws.send(JSON.stringify({ type: 'auth_error', message: 'Неверное имя пользователя или пароль!' }));
            }
            
            user.isOnline = true;
            activeConnections.set(ws, user.id);
            sendAuthSuccess(ws, user);
            broadcastStatusChange(user.id);
            break;

        // ОБНОВЛЕНИЕ ПРОФИЛЯ
        case 'update_profile':
            const profUser = db.users.find(u => u.id === data.userId);
            if (profUser) {
                profUser.username = data.username;
                profUser.password = data.password;
                saveDB();
                pushChatsToParticipants(profUser.id);
            }
            break;

        // УДАЛЕНИЕ АККАУНТА
        case 'delete_account':
            db.users = db.users.filter(u => u.id !== data.userId);
            
            // Удаляем пользователя изо всех групп
            db.chats.forEach(chat => {
                chat.members = chat.members.filter(mId => mId !== data.userId);
                // Удаляем сообщения пользователя
                chat.messages = chat.messages.filter(m => m.senderId !== data.userId);
            });
            
            // Удаляем пустые личные чаты, где он участвовал
            db.chats = db.chats.filter(chat => !(!chat.isGroup && chat.members.length < 2));
            
            saveDB();
            activeConnections.delete(ws);
            // Оповещаем оставшихся о смене структуры чатов
            db.users.forEach(u => pushChatsToParticipants(u.id));
            break;

        // РУЧНАЯ СИНХРОНИЗАЦИЯ ЧАТОВ
        case 'sync_chats':
            const syncUserId = activeConnections.get(ws);
            if (syncUserId) pushChatsToParticipants(syncUserId);
            break;
        // СОЗДАНИЕ ЧАТА ИЛИ ГРУППЫ
        case 'create_chat':
            const targetUser = db.users.find(u => u.id === data.targetId);
            if (!targetUser) {
                return ws.send(JSON.stringify({ type: 'auth_error', message: 'Пользователь с таким ID не найден!' }));
            }

            // Проверяем, существует ли уже личный чат между этими пользователями
            if (!data.isGroup) {
                const existingChat = db.chats.find(c => !c.isGroup && c.members.includes(data.creatorId) && c.members.includes(data.targetId));
                if (existingChat) return; // Чат уже есть, просто игнорируем
            }

            const newChat = {
                id: Math.floor(100000 + Math.random() * 900000).toString(), // Уникальный ID чата (6 знаков)
                isGroup: data.isGroup,
                name: data.isGroup ? data.groupName : '',
                creatorId: data.creatorId,
                members: [data.creatorId, data.targetId],
                messages: []
            };

            db.chats.push(newChat);
            saveDB();

            // Обновляем список чатов у всех участников этого чата
            newChat.members.forEach(mId => pushChatsToParticipants(mId));
            break;

        // ОТПРАВКА СООБЩЕНИЯ
        case 'send_message':
            const chat = db.chats.find(c => c.id === data.chatId);
            if (!chat) return;

            const newMsg = {
                id: Math.floor(100000 + Math.random() * 900000).toString(),
                senderId: data.senderId,
                text: data.text,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                edited: false
            };

            chat.messages.push(newMsg);
            saveDB();

            // Рассылаем обновленный чат всем его участникам в сети
            chat.members.forEach(mId => pushChatsToParticipants(mId));
            break;

        // РЕДАКТИРОВАНИЕ СООБЩЕНИЯ
        case 'edit_message':
            const editChat = db.chats.find(c => c.id === data.chatId);
            if (!editChat) return;

            const msgToEdit = editChat.messages.find(m => m.id === data.messageId);
            if (msgToEdit) {
                msgToEdit.text = data.text;
                msgToEdit.edited = true;
                saveDB();
                editChat.members.forEach(mId => pushChatsToParticipants(mId));
            }
            break;

        // УДАЛЕНИЕ СООБЩЕНИЯ
        case 'delete_message':
            const delChat = db.chats.find(c => c.id === data.chatId);
            if (!delChat) return;

            delChat.messages = delChat.messages.filter(m => m.id !== data.messageId);
            saveDB();
            delChat.members.forEach(mId => pushChatsToParticipants(mId));
            break;

        // ПЕРЕИМЕНОВАНИЕ ГРУППЫ (ТОЛЬКО ДЛЯ СОЗДАТЕЛЯ)
        case 'update_group_name':
            const gChat = db.chats.find(c => c.id === data.chatId);
            if (gChat) {
                gChat.name = data.name;
                saveDB();
                gChat.members.forEach(mId => pushChatsToParticipants(mId));
            }
            break;

        // ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В ГРУППУ (ТОЛЬКО ДЛЯ СОЗДАТЕЛЯ)
        case 'group_add_user':
            const addChat = db.chats.find(c => c.id === data.chatId);
            const userToAdd = db.users.find(u => u.id === data.userId);
            
            if (!userToAdd) {
                return ws.send(JSON.stringify({ type: 'auth_error', message: 'Пользователь с таким ID не найден!' }));
            }
            if (addChat && !addChat.members.includes(data.userId)) {
                addChat.members.push(data.userId);
                saveDB();
                addChat.members.forEach(mId => pushChatsToParticipants(mId));
            }
            break;

        // КИК ПОЛЬЗОВАТЕЛЯ ИЗ ГРУППЫ (ТОЛЬКО ДЛЯ СОЗДАТЕЛЯ)
        case 'group_kick_user':
            const kickChat = db.chats.find(c => c.id === data.chatId);
            if (kickChat) {
                const kickedId = data.userId;
                kickChat.members = kickChat.members.filter(mId => mId !== kickedId);
                saveDB();
                
                // Оповещаем оставшихся участников и самого исключенного
                pushChatsToParticipants(kickedId); 
                kickChat.members.forEach(mId => pushChatsToParticipants(mId));
            }
            break;

        // ВЫХОД ИЗ ГРУППЫ ПО СОБСТВЕННОМУ ЖЕЛАНИЮ
        case 'group_leave':
            const leaveChat = db.chats.find(c => c.id === data.chatId);
            if (leaveChat) {
                leaveChat.members = leaveChat.members.filter(mId => mId !== data.userId);
                saveDB();
                
                pushChatsToParticipants(data.userId);
                leaveChat.members.forEach(mId => pushChatsToParticipants(mId));
            }
            break;

        // ПОЛНОЕ УДАЛЕНИЕ ЧАТА ИЛИ ГРУППЫ
        case 'delete_chat':
            const chatIndex = db.chats.findIndex(c => c.id === data.chatId);
            if (chatIndex !== -1) {
                const affectedMembers = db.chats[chatIndex].members;
                db.chats.splice(chatIndex, 1);
                saveDB();
                
                // Рассылаем пустоту/обновление всем, кто там состоял
                affectedMembers.forEach(mId => pushChatsToParticipants(mId));
            }
            break;
    }
}

// ФУНКЦИЯ ФОРМИРОВАНИЯ И ОТПРАВКИ СПИСКА ЧАТОВ КОНКРЕТНОМУ ПОЛЬЗОВАТЕЛЮ
function pushChatsToParticipants(userId) {
    // Ищем все веб-сокет соединения этого пользователя
    const userSockets = [];
    activeConnections.forEach((id, ws) => {
        if (id === userId && ws.readyState === WebSocket.OPEN) {
            userSockets.push(ws);
        }
    });

    if (userSockets.length === 0) return; // Пользователь не в сети

    // Фильтруем чаты, где этот пользователь состоит
    const userChats = db.chats.filter(chat => chat.members.includes(userId));

    // Для каждого чата подтягиваем безопасную информацию об участниках (имя, ID, статус сети)
    const enrichedChats = userChats.map(chat => {
        const memberDetails = chat.members.map(mId => {
            const u = db.users.find(user => user.id === mId);
            return u ? { id: u.id, username: u.username, isOnline: u.isOnline } : { id: mId, username: 'Удален', isOnline: false };
        });

        return {
            ...chat,
            memberDetails: memberDetails
        };
    });

    // Отправляем данные во все вкладки пользователя
    userSockets.forEach(ws => {
        ws.send(JSON.stringify({
            type: 'chats_update',
            chats: enrichedChats
        }));
    });
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ УСПЕШНОЙ АВТОРИЗАЦИИ И СМЕНЫ СТАТУСА
function sendAuthSuccess(ws, user) {
    const userChats = db.chats.filter(chat => chat.members.includes(user.id));
    const enrichedChats = userChats.map(chat => {
        const memberDetails = chat.members.map(mId => {
            const u = db.users.find(user => user.id === mId);
            return u ? { id: u.id, username: u.username, isOnline: u.isOnline } : { id: mId, username: 'Удален', isOnline: false };
        });
        return { ...chat, memberDetails };
    });

    ws.send(JSON.stringify({
        type: 'auth_success',
        user: { id: user.id, username: user.username, password: user.password, createdAt: user.createdAt },
        chats: enrichedChats
    }));
}

function broadcastStatusChange(userId) {
    activeConnections.forEach((id, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'user_status_change', userId: userId }));
        }
    });
}
