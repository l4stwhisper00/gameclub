import { storage, createId } from "./storage.js";

const MESSAGE_PREFIX = "nastolny-club:chat:";
const PRESENCE_PREFIX = "nastolny-club:presence:";
const PRESENCE_TTL = 24_000;
const PRESENCE_INTERVAL = 7_000;
const MAX_MESSAGES = 500;
const MAX_MESSAGE_LENGTH = 500;
const CHAT_STYLESHEET_ID = "nastolny-chat-styles";

function ensureChatStyles() {
  if (document.getElementById(CHAT_STYLESHEET_ID)) return;
  const link = document.createElement("link");
  link.id = CHAT_STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = "./css/chat.css";
  document.head.append(link);
}

const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function timestampLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function fullDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function messageKey(roomId, messageId) {
  return `${MESSAGE_PREFIX}${roomId}:${messageId}`;
}

function messageRoomPrefix(roomId) {
  return `${MESSAGE_PREFIX}${roomId}:`;
}

function readRoomMessages(roomId) {
  const prefix = messageRoomPrefix(roomId);
  const messages = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(prefix)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value && value.id && value.createdAt) messages.push(value);
    } catch (error) {
      console.warn("Пропущено повреждённое сообщение чата:", error);
    }
  }

  return messages
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-MAX_MESSAGES);
}

export function addRoomSystemMessage(roomId, text) {
  const message = {
    id: createId(),
    roomId,
    type: "system",
    text: String(text).slice(0, 220),
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(messageKey(roomId, message.id), JSON.stringify(message));
  trimRoomMessages(roomId);
  return message;
}

function addUserMessage(roomId, user, text) {
  const message = {
    id: createId(),
    roomId,
    type: "user",
    userId: user.id,
    text: String(text).trim().slice(0, MAX_MESSAGE_LENGTH),
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(messageKey(roomId, message.id), JSON.stringify(message));
  trimRoomMessages(roomId);
  return message;
}

function trimRoomMessages(roomId) {
  const messages = readRoomMessages(roomId);
  if (messages.length <= MAX_MESSAGES) return;
  const keep = new Set(messages.slice(-MAX_MESSAGES).map((message) => message.id));
  const prefix = messageRoomPrefix(roomId);
  const remove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix) && !keep.has(key.slice(prefix.length))) remove.push(key);
  }
  remove.forEach((key) => localStorage.removeItem(key));
}

function userAvatar(user, className = "chat-avatar") {
  if (!user) return `<span class="${className} chat-avatar--system">✦</span>`;
  const initial = escapeHTML((user.username || "?").slice(0, 1).toUpperCase());
  return `<span class="${className}">${user.avatar
    ? `<img src="${escapeHTML(user.avatar)}" alt="">`
    : initial}</span>`;
}

function messageMarkup(message, currentUserId) {
  if (message.type === "system") {
    return `
      <div class="chat-system-message" data-message-id="${escapeHTML(message.id)}">
        <span class="chat-system-message__spark">✦</span>
        <span>${escapeHTML(message.text)}</span>
        <time datetime="${escapeHTML(message.createdAt)}">${timestampLabel(message.createdAt)}</time>
      </div>`;
  }

  const sender = storage.getUserById(message.userId);
  if (!sender) return "";
  const own = message.userId === currentUserId;
  return `
    <article class="chat-message ${own ? "chat-message--own" : ""}" data-message-id="${escapeHTML(message.id)}">
      ${userAvatar(sender)}
      <div class="chat-message__body">
        <div class="chat-message__meta">
          <strong>${own ? "Ты" : escapeHTML(sender.username)}</strong>
          <time datetime="${escapeHTML(message.createdAt)}" title="${escapeHTML(fullDate(message.createdAt))}">${timestampLabel(message.createdAt)}</time>
        </div>
        <p>${escapeHTML(message.text).replace(/\n/g, "<br>")}</p>
      </div>
    </article>`;
}

function getPresenceKey(roomId, tabId) {
  return `${PRESENCE_PREFIX}${roomId}:${tabId}`;
}

function readRoomPresence(roomId) {
  const prefix = `${PRESENCE_PREFIX}${roomId}:`;
  const now = Date.now();
  const online = new Map();
  const expired = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(prefix)) continue;
    try {
      const presence = JSON.parse(localStorage.getItem(key));
      if (!presence?.userId || now - presence.lastSeen > PRESENCE_TTL) {
        expired.push(key);
        continue;
      }
      const existing = online.get(presence.userId);
      if (!existing || existing.lastSeen < presence.lastSeen) {
        online.set(presence.userId, presence);
      }
    } catch {
      expired.push(key);
    }
  }

  expired.forEach((key) => localStorage.removeItem(key));
  return [...online.keys()].map((userId) => storage.getUserById(userId)).filter(Boolean);
}

function onlineMarkup(users, currentUserId) {
  if (!users.length) {
    return `<span class="chat-online-empty">Пока никого не видно онлайн</span>`;
  }
  return users.map((user) => `
    <span class="chat-online-user" title="${escapeHTML(user.username)}">
      ${userAvatar(user, "chat-avatar chat-avatar--online")}
      <span>${user.id === currentUserId ? "Ты" : escapeHTML(user.username)}</span>
      <i></i>
    </span>`).join("");
}

function scrollToBottom(list) {
  list.scrollTop = list.scrollHeight;
}

function ensureWelcomeMessage(room) {
  if (readRoomMessages(room.id).length) return;
  // Fixed key prevents two tabs from creating duplicate welcome messages on first open.
  const welcomeKey = messageKey(room.id, "welcome");
  if (localStorage.getItem(welcomeKey)) return;
  const welcome = {
    id: "welcome",
    roomId: room.id,
    type: "system",
    text: `Комната «${room.name}» открыта. Поздоровайтесь и обсудите детали партии.`,
    createdAt: room.createdAt || new Date().toISOString()
  };
  localStorage.setItem(welcomeKey, JSON.stringify(welcome));
}

export function renderRoomChat(container, room, currentUser) {
  ensureChatStyles();
  const isMember = (room.members || []).some((member) => member.userId === currentUser.id);
  ensureWelcomeMessage(room);

  container.innerHTML = `
    <section class="room-chat" aria-label="Чат комнаты">
      <header class="room-chat__header">
        <div class="room-chat__title">
          <span class="room-chat__icon">⌁</span>
          <div><span class="eyebrow">ОБЩЕНИЕ КОМАНДЫ</span><h2>Чат комнаты</h2></div>
        </div>
        <span class="room-chat__secure"><i></i> ЛОКАЛЬНЫЙ ЧАТ</span>
      </header>
      <div class="room-chat__online" id="chat-online">
        <span class="chat-online-label">СЕЙЧАС В КОМНАТЕ</span>
        <div class="chat-online-list" id="chat-online-list"><span class="chat-online-empty">Обновляем список…</span></div>
      </div>
      <div class="room-chat__messages" id="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="chat-loading">Загружаем историю сообщений…</div>
      </div>
      ${isMember ? `
        <form class="room-chat__composer" id="chat-form">
          <label class="chat-composer__field">
            <span class="chat-composer__spark">✧</span>
            <textarea id="chat-text" name="message" rows="1" maxlength="${MAX_MESSAGE_LENGTH}" placeholder="Напиши что-нибудь команде…" aria-label="Текст сообщения"></textarea>
            <span class="chat-composer__counter" id="chat-counter">0/${MAX_MESSAGE_LENGTH}</span>
          </label>
          <button class="chat-send-button" type="submit" aria-label="Отправить сообщение"><span>↗</span></button>
        </form>
        <p class="room-chat__hint">Enter — отправить · Shift + Enter — новая строка</p>
      ` : `
        <div class="room-chat__locked">
          <span>◈</span><p>Чтобы писать в чат, сначала присоединись к этой комнате.</p>
        </div>
      `}
    </section>`;

  const messageList = container.querySelector("#chat-messages");
  const onlineList = container.querySelector("#chat-online-list");
  const chatForm = container.querySelector("#chat-form");
  const textarea = container.querySelector("#chat-text");
  const counter = container.querySelector("#chat-counter");
  const roomPrefix = messageRoomPrefix(room.id);
  const presencePrefix = `${PRESENCE_PREFIX}${room.id}:`;
  const tabId = createId();
  const presenceKey = getPresenceKey(room.id, tabId);
  let cleaned = false;
  let heartbeatId = null;
  let observer = null;

  function renderMessages({ keepScroll = false } = {}) {
    const wasNearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 90;
    const messages = readRoomMessages(room.id);
    messageList.innerHTML = messages.length
      ? messages.map((message) => messageMarkup(message, currentUser.id)).join("")
      : `<div class="chat-empty-history"><span>✧</span><p>История пока пуста. Начни разговор!</p></div>`;
    if (!keepScroll || wasNearBottom) scrollToBottom(messageList);
  }

  function updatePresence() {
    if (cleaned || !isMember) return;
    const presence = {
      roomId: room.id,
      userId: currentUser.id,
      lastSeen: Date.now(),
      visibility: document.visibilityState
    };
    try {
      localStorage.setItem(presenceKey, JSON.stringify(presence));
    } catch (error) {
      console.warn("Не удалось обновить статус присутствия:", error);
    }
    renderOnline();
  }

  function renderOnline() {
    if (cleaned) return;
    const users = readRoomPresence(room.id);
    onlineList.innerHTML = onlineMarkup(users, currentUser.id);
    const label = container.querySelector(".chat-online-label");
    if (label) label.textContent = `СЕЙЧАС В КОМНАТЕ · ${users.length}`;
  }

  function sendMessage(text) {
    const clean = String(text || "").trim();
    if (!clean || clean.length > MAX_MESSAGE_LENGTH) return;
    if (!isMember) return;
    try {
      addUserMessage(room.id, currentUser, clean);
      renderMessages();
      textarea.value = "";
      updateCounter();
      textarea.focus();
    } catch (error) {
      container.querySelector(".room-chat__hint").textContent =
        error.message || "Не удалось сохранить сообщение. Возможно, хранилище заполнено.";
    }
  }

  function updateCounter() {
    if (!textarea || !counter) return;
    counter.textContent = `${textarea.value.length}/${MAX_MESSAGE_LENGTH}`;
    counter.classList.toggle("is-near-limit", textarea.value.length > MAX_MESSAGE_LENGTH - 50);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(textarea.value);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage(textarea.value);
    }
  }

  function handleStorage(event) {
    if (!event.key) return;
    if (event.key.startsWith(roomPrefix)) renderMessages({ keepScroll: true });
    if (event.key.startsWith(presencePrefix)) renderOnline();
    if (event.key === "nastolny-club:users") renderMessages({ keepScroll: true });
  }

  function handleVisibility() {
    if (document.visibilityState === "visible") updatePresence();
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (heartbeatId !== null) window.clearInterval(heartbeatId);
    window.removeEventListener("storage", handleStorage);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", updatePresence);
    window.removeEventListener("pagehide", cleanup);
    chatForm?.removeEventListener("submit", handleSubmit);
    textarea?.removeEventListener("input", updateCounter);
    textarea?.removeEventListener("keydown", handleKeyDown);
    localStorage.removeItem(presenceKey);
    observer?.disconnect();
  }

  renderMessages();
  renderOnline();

  if (isMember) {
    updatePresence();
    heartbeatId = window.setInterval(updatePresence, PRESENCE_INTERVAL);
    chatForm.addEventListener("submit", handleSubmit);
    textarea.addEventListener("input", updateCounter);
    textarea.addEventListener("keydown", handleKeyDown);
    updateCounter();

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", updatePresence);
    window.addEventListener("pagehide", cleanup);

    // Removed when the router replaces the room page.
    observer = new MutationObserver(() => {
      if (!container.isConnected) cleanup();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return cleanup;
  }

  observer = new MutationObserver(() => {
    if (!container.isConnected) cleanup();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", handleStorage);
  return cleanup;
}
