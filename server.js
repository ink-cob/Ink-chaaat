const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentChatId = null;
let isSignUpMode = false;
let messageSubscription = null;

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authNameInput = document.getElementById('auth-name');
const authIdInput = document.getElementById('auth-id');
const authPasswordInput = document.getElementById('auth-password');
const idGroup = document.getElementById('id-group');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');

authToggleLink.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
        authTitle.innerText = "Регистрация в Chat Ink";
        idGroup.style.display = "none";
        authSubmitBtn.innerText = "Создать аккаунт";
        authToggleLink.innerText = "Войти";
    } else {
        authTitle.innerText = "Вход в Chat Ink";
        idGroup.style.display = "block";
        authSubmitBtn.innerText = "Войти";
        authToggleLink.innerText = "Зарегистрироваться";
    }
});

async function generateUniqueID() {
    let unique = false;
    let code = "";
    while (!unique) {
        code = Math.floor(10000 + Math.random() * 90000).toString();
        const { data } = await supabase.from('users').select('id').eq('id', code);
        if (!data || data.length === 0) unique = true;
    }
    return code;
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = authNameInput.value.trim();
    const password = authPasswordInput.value;

    if (isSignUpMode) {
        const uniqueId = await generateUniqueID();
        const { data, error } = await supabase.from('users').insert([
            { id: uniqueId, name: name, password: password, created_at: new Date() }
        ]).select();

        if (error) {
            alert("Ошибка регистрации: " + error.message);
        } else {
            alert(`Успешная регистрация! Ваш ID: ${uniqueId}. Используйте его для входа.`);
            currentUser = data[0];
            startApp();
        }
    } else {
        const userId = authIdInput.value.trim();
        if (!userId) return alert("Введите ваш 5-значный ID!");

        const { data, error } = await supabase.from('users').select('*').eq('id', userId).eq('password', password);

        if (error || !data || data.length === 0) {
            alert("Неверный ID или пароль!");
        } else {
            currentUser = data[0];
            startApp();
        }
    }
});

function startApp() {
    authContainer.style.display = "none";
    appContainer.style.display = "flex";
    loadChatsList();
    initProfileModal();
    initTheme();
}

const themeToggle = document.getElementById('theme-toggle');
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.innerText = newTheme === 'dark' ? '☀️' : '🌙';
    });
}

document.querySelector('.chat-header').addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && e.offsetX < 40) {
        appContainer.classList.remove('chat-open');
    }
});
const profileModal = document.getElementById('profile-modal');
const myProfileBtn = document.getElementById('my-profile-btn');
const closeProfile = document.getElementById('close-profile');
const profileNameInput = document.getElementById('profile-name-input');
const profileIdSpan = document.getElementById('profile-id');
const profilePassInput = document.getElementById('profile-pass-input');
const profileDateSpan = document.getElementById('profile-date');
const saveProfileBtn = document.getElementById('save-profile-btn');
const deleteAccBtn = document.getElementById('delete-acc-btn');

function initProfileModal() {
    myProfileBtn.addEventListener('click', () => {
        profileNameInput.value = currentUser.name;
        profileIdSpan.innerText = currentUser.id;
        profilePassInput.value = currentUser.password;
        profileDateSpan.innerText = new Date(currentUser.created_at).toLocaleDateString();
        profileModal.style.display = "flex";
    });

    closeProfile.addEventListener('click', () => profileModal.style.display = "none");

    saveProfileBtn.addEventListener('click', async () => {
        const newName = profileNameInput.value.trim();
        const newPass = profilePassInput.value;
        
        const { error } = await supabase.from('users')
            .update({ name: newName, password: newPass })
            .eq('id', currentUser.id);

        if (error) alert("Ошибка сохранения!");
        else {
            currentUser.name = newName;
            currentUser.password = newPass;
            alert("Профиль изменен!");
            profileModal.style.display = "none";
        }
    });

    deleteAccBtn.addEventListener('click', async () => {
        if (confirm("Вы точно хотите удалить аккаунт? Все данные сотрутся.")) {
            await supabase.from('users').delete().eq('id', currentUser.id);
            location.reload();
        }
    });
}

const chatsListContainer = document.getElementById('chats-list');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

searchBtn.addEventListener('click', async () => {
    const targetId = searchInput.value.trim();
    if (!targetId || targetId === currentUser.id) return alert("Введите корректный ID!");

    const { data: user, error } = await supabase.from('users').select('name').eq('id', targetId).single();
    if (error || !user) return alert("Пользователь не найден!");

    const { data: myChats } = await supabase.from('chat_participants').select('chat_id').eq('user_id', currentUser.id);
    const { data: targetChats } = await supabase.from('chat_participants').select('chat_id').eq('user_id', targetId);

    let existingChatId = null;
    if (myChats && targetChats) {
        const myIds = myChats.map(c => c.chat_id);
        const targetIds = targetChats.map(c => c.chat_id);
        const common = myIds.filter(id => targetIds.includes(id));
        
        for (let cid of common) {
            const { data: chat } = await supabase.from('chats').select('is_group').eq('id', cid).single();
            if (chat && !chat.is_group) {
                existingChatId = cid;
                break;
            }
        }
    }

    if (existingChatId) {
        openChat(existingChatId, user.name);
    } else {
        const { data: newChat, error: chatErr } = await supabase.from('chats').insert([
            { title: user.name, is_group: false, creator_id: currentUser.id }
        ]).select().single();

        if (chatErr) return alert("Ошибка при создании чата.");

        await supabase.from('chat_participants').insert([
            { chat_id: newChat.id, user_id: currentUser.id },
            { chat_id: newChat.id, user_id: targetId }
        ]);

        loadChatsList();
        openChat(newChat.id, user.name);
    }
    searchInput.value = "";
});
const createGroupBtn = document.getElementById('create-group-btn');
const groupModal = document.getElementById('group-modal');
const closeGroup = document.getElementById('close-group');
const submitGroupBtn = document.getElementById('submit-group-btn');
const groupNameInput = document.getElementById('group-name-input');
const groupMembersInput = document.getElementById('group-members-input');
const chatBlank = document.getElementById('chat-blank');
const chatActive = document.getElementById('chat-active');
const currentChatTitle = document.getElementById('current-chat-title');
const currentChatStatus = document.getElementById('current-chat-status');
const chatSettingsBtn = document.getElementById('chat-settings-btn');

createGroupBtn.addEventListener('click', () => groupModal.style.display = "flex");
closeGroup.addEventListener('click', () => groupModal.style.display = "none");

submitGroupBtn.addEventListener('click', async () => {
    const title = groupNameInput.value.trim();
    const membersRaw = groupMembersInput.value.split(',').map(m => m.trim()).filter(m => m.length > 0);

    if (!title) return alert("Введите название группы!");

    const { data: newChat, error } = await supabase.from('chats').insert([
        { title: title, is_group: true, creator_id: currentUser.id }
    ]).select().single();

    if (error) return alert("Ошибка создания группы");

    await supabase.from('chat_participants').insert({ chat_id: newChat.id, user_id: currentUser.id });

    for (let id of membersRaw) {
        const { data } = await supabase.from('users').select('id').eq('id', id).single();
        if (data) {
            await supabase.from('chat_participants').insert({ chat_id: newChat.id, user_id: id });
        }
    }

    groupModal.style.display = "none";
    groupNameInput.value = "";
    groupMembersInput.value = "";
    loadChatsList();
    openChat(newChat.id, title);
});

async function loadChatsList() {
    chatsListContainer.innerHTML = "";
    const { data: participantRecords } = await supabase.from('chat_participants').select('chat_id').eq('user_id', currentUser.id);
    if (!participantRecords || participantRecords.length === 0) return;

    const chatIds = participantRecords.map(p => p.chat_id);
    const { data: chats } = await supabase.from('chats').select('*').in('id', chatIds);
    if (!chats) return;

    for (let chat of chats) {
        let displayTitle = chat.title;

        if (!chat.is_group) {
            const { data: p } = await supabase.from('chat_participants')
                .select('user_id').eq('chat_id', chat.id).neq('user_id', currentUser.id).single();
            if (p) {
                const { data: u } = await supabase.from('users').select('name').eq('id', p.user_id).single();
                if (u) displayTitle = u.name;
            }
        }

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="user-avatar">${chat.is_group ? '👥' : '👤'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${displayTitle}</div>
                <div class="chat-item-id">${chat.is_group ? 'Группа' : 'Личный чат'}</div>
            </div>
        `;
        item.addEventListener('click', () => openChat(chat.id, displayTitle));
        chatsListContainer.appendChild(item);
    }
}
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const chatMgmtModal = document.getElementById('chat-mgmt-modal');
const closeMgmt = document.getElementById('close-mgmt');
const editChatTitle = document.getElementById('edit-chat-title');
const renameChatBtn = document.getElementById('rename-chat-btn');
const mgmtMembersList = document.getElementById('mgmt-members-list');
const addMemberId = document.getElementById('add-member-id');
const addMemberBtn = document.getElementById('add-member-btn');
const deleteChatBtn = document.getElementById('delete-chat-btn');

async function openChat(chatId, title) {
    currentChatId = chatId;
    chatBlank.style.display = "none";
    chatActive.style.display = "flex";
    currentChatTitle.innerText = title;

    appContainer.classList.add('chat-open');

    const { data: chat } = await supabase.from('chats').select('*').eq('id', chatId).single();
    chatSettingsBtn.style.display = (chat && chat.creator_id === currentUser.id && chat.is_group) ? "block" : "none";

    const { count } = await supabase.from('chat_participants').select('*', { count: 'exact', head: true }).eq('chat_id', chatId);
    currentChatStatus.innerText = `${count} участников`;

    loadMessages(chatId);

    if (messageSubscription) supabase.removeChannel(messageSubscription);
    messageSubscription = supabase.channel(`public:messages:chat_id=eq.${chatId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, () => {
            loadMessages(chatId);
        }).subscribe();
}

async function loadMessages(chatId) {
    const { data: messages, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) return;

    messagesContainer.innerHTML = "";
    for (let msg of messages) {
        const isMe = msg.sender_id === currentUser.id;
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${isMe ? 'outgoing' : 'incoming'}`;
        
        let senderName = "";
        if (!isMe) {
            const { data: u } = await supabase.from('users').select('name').eq('id', msg.sender_id).single();
            if (u) senderName = `<b style="font-size:12px; display:block; margin-bottom:2px; color:var(--accent);">${u.name}</b>`;
        }

        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msgDiv.innerHTML = `${senderName}<span class="msg-text">${msg.text}</span><div class="msg-meta">${msg.is_edited ? '<span>изм.</span>' : ''}<span>${time}</span></div>`;

        if (isMe) {
            const actions = document.createElement('div');
            actions.className = 'msg-actions';
            actions.innerHTML = `<span onclick="editMessage('${msg.id}', '${msg.text}')">✏️</span><span onclick="deleteMessage('${msg.id}')">🗑️</span>`;
            msgDiv.appendChild(actions);
        }
        messagesContainer.appendChild(msgDiv);
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatId) return;
    await supabase.from('messages').insert([{ chat_id: currentChatId, sender_id: currentUser.id, text: text, created_at: new Date() }]);
    messageInput.value = "";
}

sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

window.deleteMessage = async function(msgId) {
    if (confirm("Удалить сообщение?")) {
        await supabase.from('messages').delete().eq('id', msgId);
        loadMessages(currentChatId);
    }
};

window.editMessage = async function(msgId, oldText) {
    const newText = prompt("Редактировать:", oldText);
    if (newText && newText.trim() !== oldText) {
        await supabase.from('messages').update({ text: newText.trim(), is_edited: true }).eq('id', msgId);
        loadMessages(currentChatId);
    }
};

chatSettingsBtn.addEventListener('click', async () => {
    const { data: chat } = await supabase.from('chats').select('title').eq('id', currentChatId).single();
    editChatTitle.value = chat.title;
    loadMgmtMembers();
    chatMgmtModal.style.display = "flex";
});

closeMgmt.addEventListener('click', () => chatMgmtModal.style.display = "none");

async function loadMgmtMembers() {
    mgmtMembersList.innerHTML = "";
    const { data: participants } = await supabase.from('chat_participants').select('user_id').eq('chat_id', currentChatId);
    for (let p of participants) {
        const { data: u } = await supabase.from('users').select('name, id').eq('id', p.user_id).single();
        if (!u) continue;
        const item = document.createElement('div');
        item.className = 'mgmt-member-item';
        item.innerHTML = `<span>${u.name} (ID: ${u.id})</span>${u.id !== currentUser.id ? `<button onclick="kickUser('${u.id}')" class="btn-danger" style="padding:2px 6px; font-size:12px;">Выгнать</button>` : '<span>(Вы)</span>'}`;
        mgmtMembersList.appendChild(item);
    }
}

renameChatBtn.addEventListener('click', async () => {
    const newTitle = editChatTitle.value.trim();
    if (!newTitle) return;
    await supabase.from('chats').update({ title: newTitle }).eq('id', currentChatId);
    currentChatTitle.innerText = newTitle;
    alert("Название изменено!");
});

addMemberBtn.addEventListener('click', async () => {
    const targetId = addMemberId.value.trim();
    const { data: user } = await supabase.from('users').select('id').eq('id', targetId).single();
    if (!user) return alert("Пользователь не найден!");
    await supabase.from('chat_participants').insert({ chat_id: currentChatId, user_id: targetId });
    addMemberId.value = "";
    loadMgmtMembers();
});

window.kickUser = async function(userId) {
    if (confirm("Выгнать пользователя?")) {
        await supabase.from('chat_participants').delete().eq('chat_id', currentChatId).eq('user_id', userId);
        loadMgmtMembers();
    }
};

deleteChatBtn.addEventListener('click', async () => {
    if (confirm("Удалить чат полностью?")) {
        await supabase.from('chats').delete().eq('id', currentChatId);
        chatMgmtModal.style.display = "none";
        chatActive.style.display = "none";
        chatBlank.style.display = "flex";
        currentChatId = null;
        loadChatsList();
    }
});
