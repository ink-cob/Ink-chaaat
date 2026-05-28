const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Chat Ink Server is running\n');
});

const wss = new WebSocket.Server({ server });

// Внутриигровая база данных (в продакшене лучше использовать MongoDB/PostgreSQL)
let users = []; // { id, name, password, createdAt }
let chats = []; // { id, name, isGroup, creator, members: [], messages: [] }

// Хранилище активных соединений: userId -> ws
const clients = new Map();

function generateUniqueId() {
    let id;
    do {
        id = Math.floor(10000 + Math.random() * 90000).toString();
    } while (users.some(u => u.id === id));
    return id;
}

wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'REGISTER': {
                    const newId = generateUniqueId();
                    const newUser = {
                        id: newId,
                        name: data.name,
                        password: data.password,
                        createdAt: new Date().toISOString()
                    };
                    users.push(newUser);
                    ws.send(JSON.stringify({ type: 'REGISTER_SUCCESS', user: newUser }));
                    break;
                }

                case 'LOGIN': {
                    const user = users.find(u => u.id === data.id && u.password === data.password);
                    if (user) {
                        currentUserId = user.id;
                        clients.set(currentUserId, ws);
                        ws.send(JSON.stringify({ type: 'LOGIN_SUCCESS', user }));
                        sendUserChats(currentUserId);
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Неверный ID или пароль' }));
                    }
                    break;
                }

                case 'DELETE_ACCOUNT': {
                    users = users.filter(u => u.id !== data.id);
                    chats = chats.filter(c => {
                        c.members = c.members.filter(m => m !== data.id);
                        return c.members.length > 0;
                    });
                    clients.delete(data.id);
                    ws.send(JSON.stringify({ type: 'ACCOUNT_DELETED' }));
                    broadcastChatUpdate();
                    break;
                }

                case 'UPDATE_PROFILE': {
                    const user = users.find(u => u.id === data.id);
                    if (user) {
                        user.name = data.name;
                        user.password = data.password;
                        ws.send(JSON.stringify({ type: 'PROFILE_UPDATED', user }));
                    }
                    break;
                }

                case 'SEARCH_USER': {
                    const user = users.find(u => u.id === data.searchId);
                    if (user) {
                        ws.send(JSON.stringify({ type: 'SEARCH_RESULT', user: { id: user.id, name: user.name } }));
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Пользователь не найден' }));
                    }
                    break;
                }

                case 'CREATE_CHAT': {
                    const chatId = '_' + Math.random().toString(36).substr(2, 9);
                    const newChat = {
                        id: chatId,
                        name: data.name || 'Приватный чат',
                        isGroup: data.isGroup,
                        creator: data.creator,
                        members: data.members,
                        messages: []
                    };
                    chats.push(newChat);
                    data.members.forEach(memberId => sendUserChats(memberId));
                    break;
                }

                case 'SEND_MESSAGE': {
                    const chat = chats.find(c => c.id === data.chatId);
                    if (chat && chat.members.includes(data.senderId)) {
                        const msgId = '_' + Math.random().toString(36).substr(2, 9);
                        const msg = {
                            id: msgId,
                            senderId: data.senderId,
                            senderName: data.senderName,
                            text: data.text,
                            timestamp: new Date().toISOString(),
                            edited: false
                        };
                        chat.messages.push(msg);
                        chat.members.forEach(memberId => {
                            const clientWs = clients.get(memberId);
                            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({ type: 'NEW_MESSAGE', chatId: chat.id, message: msg }));
                            }
                        });
                    }
                    break;
                }

                case 'EDIT_MESSAGE': {
                    const chat = chats.find(c => c.id === data.chatId);
                    if (chat) {
                        const msg = chat.messages.find(m => m.id === data.messageId && m.senderId === data.senderId);
                        if (msg) {
                            msg.text = data.newText;
                            msg.edited = true;
                            chat.members.forEach(memberId => {
                                const clientWs = clients.get(memberId);
                                if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                                    clientWs.send(JSON.stringify({ type: 'MESSAGE_EDITED', chatId: chat.id, messageId: msg.id, text: msg.text }));
                                }
                            });
                        }
                    }
                    break;
                }

                case 'DELETE_MESSAGE': {
                    const chat = chats.find(c => c.id === data.chatId);
                    if (chat) {
                        chat.messages = chat.messages.filter(m => !(m.id === data.messageId && m.senderId === data.senderId));
                        chat.members.forEach(memberId => {
                            const clientWs = clients.get(memberId);
                            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({ type: 'MESSAGE_DELETED', chatId: chat.id, messageId: data.messageId }));
                            }
                        });
                    }
                    break;
                }

                case 'MANAGE_GROUP': {
                    const chat = chats.find(c => c.id === data.chatId && c.creator === data.userId);
                    if (chat) {
                        if (data.action === 'rename') chat.name = data.newName;
                        if (data.action === 'kick') chat.members = chat.members.filter(m => m !== data.targetId);
                        if (data.action === 'add' && !chat.members.includes(data.targetId)) chat.members.push(data.targetId);
                        if (data.action === 'delete') {
                            chats = chats.filter(c => c.id !== data.chatId);
                            chat.members.forEach(memberId => sendUserChats(memberId));
                            return;
                        }
                        chat.members.forEach(memberId => sendUserChats(memberId));
                    }
                    break;
                }
            }
        } catch (err) {
            console.error(err);
        }
    });

    ws.on('close', () => {
        if (currentUserId) clients.delete(currentUserId);
    });
});

function sendUserChats(userId) {
    const userChats = chats.filter(c => c.members.includes(userId));
    const clientWs = clients.get(userId);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'CHATS_LIST', chats: userChats }));
    }
}

function broadcastChatUpdate() {
    clients.forEach((ws, userId) => sendUserChats(userId));
}

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
