import { supabase } from "./supabase.js";

let currentUser = null;
let initialized = false;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function mapUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    username: String(metadata.username ?? metadata.user_name ?? (user.email ?? "Игрок").split("@")[0]),
    status: metadata.status ?? "Ищу компанию для игры",
    bio: metadata.bio ?? "",
    avatar: metadata.avatar ?? "",
    favoriteGames: Array.isArray(metadata.favoriteGames) ? metadata.favoriteGames : [],
    createdAt: user.created_at ?? new Date().toISOString()
  };
}

function validateUsername(username) {
  const clean = String(username ?? "").trim();
  if (clean.length < 3 || clean.length > 20) {
    throw new Error("Никнейм должен содержать от 3 до 20 символов.");
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(clean)) {
    throw new Error("В никнейме допустимы буквы, цифры, дефис и подчёркивание.");
  }
  return clean;
}

function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw new Error("Введите корректный адрес электронной почты.");
  }
  if (String(password ?? "").length < 8) {
    throw new Error("Пароль должен содержать не менее 8 символов.");
  }
}

export const auth = {
  async initialize() {
    if (initialized) return;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = mapUser(data.session?.user);
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = mapUser(session?.user);
    });
    initialized = true;
  },

  async register({ email, password, username }) {
    validateCredentials(email, password);
    const cleanUsername = validateUsername(username);
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password: String(password),
      options: {
        data: { username: cleanUsername }
      }
    });
    if (error) throw error;
    currentUser = mapUser(data.session?.user ?? null);
    return {
      ...(mapUser(data.user) ?? { username: cleanUsername, email: normalizeEmail(email) }),
      needsEmailConfirmation: !data.session
    };
  },

  async login({ email, password }) {
    validateCredentials(email, password);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: String(password)
    });
    if (error) throw error;
    currentUser = mapUser(data.user);
    return currentUser;
  },

  async logout() {
    currentUser = null;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getCurrentUser() {
    return currentUser;
  },

  isAuthenticated() {
    return Boolean(currentUser);
  }
};

await auth.initialize();
