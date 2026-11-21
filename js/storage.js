const PREFIX = "nastolny-club:";
const KEYS = Object.freeze({
  users: `${PREFIX}users`,
  session: `${PREFIX}session`,
  rooms: `${PREFIX}rooms`,
  messages: `${PREFIX}messages`
});

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.error(`Не удалось прочитать ${key}:`, error);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Не удалось сохранить ${key}:`, error);
    throw new Error("Хранилище браузера недоступно или переполнено.");
  }
}

export const storage = {
  getUsers: () => read(KEYS.users, []),
  saveUsers: (users) => write(KEYS.users, users),
  getUserById(id) {
    return this.getUsers().find((user) => user.id === id) ?? null;
  },
  getUserByEmail(email) {
    const normalized = String(email).trim().toLowerCase();
    return this.getUsers().find((user) => user.email === normalized) ?? null;
  },
  getUserByUsername(username) {
    const normalized = String(username).trim().toLowerCase();
    return this.getUsers().find((user) => user.username.toLowerCase() === normalized) ?? null;
  },
  createUser(user) {
    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);
    return user;
  },
  updateUser(id, patch) {
    const users = this.getUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) throw new Error("Пользователь не найден.");
    users[index] = { ...users[index], ...patch, updatedAt: new Date().toISOString() };
    this.saveUsers(users);
    return users[index];
  },
  getSession: () => read(KEYS.session, null),
  saveSession: (session) => write(KEYS.session, session),
  clearSession: () => localStorage.removeItem(KEYS.session),
  getRooms: () => read(KEYS.rooms, []),
  saveRooms: (rooms) => write(KEYS.rooms, rooms),
  getMessages: () => read(KEYS.messages, {}),
  saveMessages: (messages) => write(KEYS.messages, messages)
};

export function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
