import { storage, createId } from "./storage.js";

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Для безопасной авторизации нужен HTTPS. Откройте сайт через GitHub Pages или localhost.");
  }
  const data = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function makeSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw new Error("Введите корректный адрес электронной почты.");
  }
  if (String(password).length < 8) {
    throw new Error("Пароль должен содержать не менее 8 символов.");
  }
}

export const auth = {
  async register({ email, password, username }) {
    validateCredentials(email, password);
    const normalizedEmail = normalizeEmail(email);
    const cleanUsername = String(username ?? "").trim();

    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      throw new Error("Никнейм должен содержать от 3 до 20 символов.");
    }
    if (!/^[\p{L}\p{N}_-]+$/u.test(cleanUsername)) {
      throw new Error("В никнейме допустимы буквы, цифры, дефис и подчёркивание.");
    }
    if (storage.getUserByEmail(normalizedEmail)) {
      throw new Error("Аккаунт с такой почтой уже существует.");
    }
    if (storage.getUserByUsername(cleanUsername)) {
      throw new Error("Этот никнейм уже занят.");
    }

    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    const user = {
      id: createId(),
      email: normalizedEmail,
      username: cleanUsername,
      passwordSalt: salt,
      passwordHash,
      status: "Ищу компанию для игры",
      bio: "",
      avatar: "",
      favoriteGames: [],
      createdAt: new Date().toISOString()
    };

    storage.createUser(user);
    this.startSession(user.id);
    return user;
  },

  async login({ email, password }) {
    const user = storage.getUserByEmail(normalizeEmail(email));
    if (!user) throw new Error("Неверная почта или пароль.");

    const candidateHash = await hashPassword(String(password), user.passwordSalt);
    if (candidateHash !== user.passwordHash) {
      throw new Error("Неверная почта или пароль.");
    }

    this.startSession(user.id);
    return user;
  },

  startSession(userId) {
    storage.saveSession({ userId, createdAt: new Date().toISOString() });
  },

  logout() {
    storage.clearSession();
  },

  getCurrentUser() {
    const session = storage.getSession();
    if (!session?.userId) return null;
    const user = storage.getUserById(session.userId);
    if (!user) storage.clearSession();
    return user;
  },

  isAuthenticated() {
    return Boolean(this.getCurrentUser());
  }
};
