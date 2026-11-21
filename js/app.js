import { auth } from "./auth.js";
import { storage } from "./storage.js";

const app = document.querySelector("#app");
const topActions = document.querySelector("#top-actions");
const toastRegion = document.querySelector("#toast-region");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast--error" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function updateHeader() {
  const user = auth.getCurrentUser();
  if (!user) {
    topActions.innerHTML = `
      <a class="button button--ghost button--small" href="#/login">Войти</a>
      <a class="button button--primary button--small" href="#/register">Создать аккаунт <span>↗</span></a>`;
    return;
  }
  const initial = escapeHTML(user.username.slice(0, 1).toUpperCase());
  topActions.innerHTML = `
    <a class="button button--ghost button--small" href="#/profile">
      <span class="mini-avatar">${initial}</span> ${escapeHTML(user.username)}
    </a>
    <button class="button button--primary button--small" id="logout-button" type="button">Выйти ↗</button>`;
  document.querySelector("#logout-button")?.addEventListener("click", () => {
    auth.logout();
    showToast("Вы вышли из аккаунта.");
    navigate("#/");
  });
}

function authShell({ eyebrow, title, subtitle, submitLabel, fields, switchText, switchHref, switchLabel, mode }) {
  return `
    <section class="auth-layout page-enter">
      <div class="auth-story">
        <span class="eyebrow">${eyebrow}</span>
        <h1 class="display-title">${title}</h1>
        <p class="lead">${subtitle}</p>
        <div class="story-note">
          <span class="story-note-icon">✧</span>
          <span>Твоя компания. Твои правила.<br>Истории, которые захочется повторить.</span>
        </div>
        <div class="story-orb" aria-hidden="true"></div>
      </div>
      <section class="auth-card">
        <h2>${mode === "register" ? "Создать аккаунт" : "С возвращением"}</h2>
        <p class="auth-subtitle">${mode === "register" ? "Займи своё место за игровым столом." : "Твоя следующая игровая история уже ждёт."}</p>
        <form id="auth-form" novalidate>
          ${fields}
          <p id="form-error" class="form-error" role="alert"></p>
          <button class="button button--primary button--full" id="submit-button" type="submit">${submitLabel} <span>↗</span></button>
        </form>
        <div class="auth-divider">ИЛИ</div>
        <p class="auth-switch">${switchText}<a href="${switchHref}">${switchLabel}</a></p>
        <p class="legal-note">Продолжая, ты соглашаешься с правилами клуба.<br>Мы храним данные локально в этом браузере.</p>
      </section>
    </section>`;
}

function renderLogin() {
  app.innerHTML = authShell({
    mode: "login",
    eyebrow: "РАДЫ СНОВА ТЕБЯ ВИДЕТЬ",
    title: 'Вернись за<br><span class="gradient-text">игровой стол.</span>',
    subtitle: "Здесь собираются команды, рождаются легенды и каждый бросок кубика меняет ход истории.",
    submitLabel: "Войти в клуб",
    switchText: "Впервые у нас?",
    switchHref: "#/register",
    switchLabel: "Создать аккаунт",
    fields: `
      <div class="form-field">
        <label for="email">ЭЛЕКТРОННАЯ ПОЧТА</label>
        <div class="input-wrap"><span class="field-icon">✉</span><input class="form-input" id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>
      </div>
      <div class="form-field">
        <label for="password">ПАРОЛЬ</label>
        <div class="input-wrap"><span class="field-icon">⌑</span><input class="form-input" id="password" name="password" type="password" placeholder="Не менее 8 символов" autocomplete="current-password" required minlength="8"></div>
      </div>`
  });
  bindAuthForm("login");
}

function renderRegister() {
  app.innerHTML = authShell({
    mode: "register",
    eyebrow: "ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ",
    title: 'Найди свою<br><span class="gradient-text">игровую стаю.</span>',
    subtitle: "Создай аккаунт, выбери любимые игры и найди людей, с которыми даже обычный вечер станет приключением.",
    submitLabel: "Вступить в клуб",
    switchText: "Уже есть аккаунт?",
    switchHref: "#/login",
    switchLabel: "Войти",
    fields: `
      <div class="form-field">
        <label for="username">ИГРОВОЙ НИКНЕЙМ</label>
        <div class="input-wrap"><span class="field-icon">✧</span><input class="form-input" id="username" name="username" type="text" placeholder="Например, DiceMaster" autocomplete="nickname" minlength="3" maxlength="20" required></div>
      </div>
      <div class="form-field">
        <label for="email">ЭЛЕКТРОННАЯ ПОЧТА</label>
        <div class="input-wrap"><span class="field-icon">✉</span><input class="form-input" id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>
      </div>
      <div class="form-field">
        <label for="password">ПАРОЛЬ</label>
        <div class="input-wrap"><span class="field-icon">⌑</span><input class="form-input" id="password" name="password" type="password" placeholder="Придумай надёжный пароль" autocomplete="new-password" minlength="8" required></div>
      </div>
      <p class="form-hint">Минимум 8 символов. Пароль хранится в виде хэша с индивидуальной солью.</p>`
  });
  bindAuthForm("register");
}

function bindAuthForm(mode) {
  const form = document.querySelector("#auth-form");
  const errorBox = document.querySelector("#form-error");
  const submit = document.querySelector("#submit-button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    errorBox.classList.remove("is-visible");
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    submit.disabled = true;
    submit.innerHTML = "Подожди… <span>✧</span>";
    try {
      const credentials = {
        email: data.get("email"),
        password: data.get("password"),
        username: data.get("username")
      };
      const user = mode === "register"
        ? await auth.register(credentials)
        : await auth.login(credentials);
      showToast(mode === "register" ? `Добро пожаловать, ${user.username}!` : `С возвращением, ${user.username}!`);
      navigate("#/profile");
    } catch (error) {
      errorBox.textContent = error.message || "Не удалось выполнить действие.";
      errorBox.classList.add("is-visible");
      submit.disabled = false;
      submit.innerHTML = `${mode === "register" ? "Вступить в клуб" : "Войти в клуб"} <span>↗</span>`;
    }
  });
}

function renderHome() {
  const user = auth.getCurrentUser();
  app.innerHTML = `
    <section class="home-hero page-enter">
      <div class="home-hero-copy">
        <span class="eyebrow">МЕСТО ВСТРЕЧИ ИГРОКОВ</span>
        <h1 class="display-title">Один стол.<br> <span class="gradient-text">Тысячи историй.</span></h1>
        <p class="lead">От эпичных приключений в D&D до жарких партий в Мафию. Собирай друзей, открывай новые игры и создавай свои легенды.</p>
        <div class="home-actions">
          <a class="button button--primary" href="${user ? "#/profile" : "#/register"}">${user ? "Открыть профиль" : "Войти в клуб"} <span>↗</span></a>
          <a class="button button--ghost" href="#/login">Исследовать клуб <span>⌁</span></a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true"><div class="hero-ring"></div><div class="hero-glyph"><span>🎲</span></div></div>
    </section>
    <div class="feature-strip">
      <div class="feature-tile"><strong>✦ 20+</strong><span>Настольных и ролевых игр</span></div>
      <div class="feature-tile"><strong>♧ Свои</strong><span>Комнаты и игровые правила</span></div>
      <div class="feature-tile"><strong>⌁ Вместе</strong><span>Общение и новые знакомства</span></div>
    </div>
    <p class="section-kicker" style="margin-top:28px">Таверна открыта. Каталог игр и комнаты появятся на следующих этапах разработки.</p>`;
}

function renderProfile() {
  const user = auth.getCurrentUser();
  if (!user) return navigate("#/login");
  const joined = new Date(user.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  app.innerHTML = `
    <section class="page-enter" style="max-width:720px;margin:20px auto">
      <span class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
      <h1 class="display-title" style="font-size:clamp(32px,5vw,48px)">Твоё место<br><span class="gradient-text">в таверне.</span></h1>
      <div class="auth-card" style="margin-top:30px">
        <div style="display:flex;align-items:center;gap:18px;margin-bottom:24px">
          <div style="display:grid;place-items:center;width:66px;height:66px;border-radius:20px;background:linear-gradient(135deg,#7c3aed,#22d3ee);font:600 26px var(--font-display)">${escapeHTML(user.username.slice(0,1).toUpperCase())}</div>
          <div><h2 style="margin-bottom:7px">${escapeHTML(user.username)}</h2><p class="section-kicker" style="margin:0">${escapeHTML(user.status || "Новый участник клуба")}</p></div>
        </div>
        <p class="section-kicker">Электронная почта</p><p style="font-size:13px;margin:5px 0 20px">${escapeHTML(user.email)}</p>
        <p class="section-kicker">В клубе с</p><p style="font-size:13px;margin:5px 0 20px">${escapeHTML(joined)}</p>
        <p class="section-kicker">Профиль создан. На следующем этапе добавим редактирование данных и загрузку аватара.</p>
        <button class="button button--ghost button--full" id="profile-logout" style="margin-top:22px">Выйти из аккаунта</button>
      </div>
    </section>`;
  document.querySelector("#profile-logout").addEventListener("click", () => {
    auth.logout();
    showToast("Ты вышел из аккаунта.");
    navigate("#/");
  });
}

function navigate(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}

function renderRoute() {
  updateHeader();
  const hash = location.hash || "#/";
  const route = hash.replace(/^#/, "");
  const user = auth.getCurrentUser();

  if (route === "/login") {
    if (user) return navigate("#/profile");
    return renderLogin();
  }
  if (route === "/register") {
    if (user) return navigate("#/profile");
    return renderRegister();
  }
  if (route === "/profile" || route === "/settings") {
    if (!user) return navigate("#/login");
    return renderProfile();
  }
  if (route.startsWith("/rooms")) {
    if (!user) return navigate("#/login");
    app.innerHTML = `<section class="page-enter"><span class="eyebrow">ИГРОВЫЕ КОМНАТЫ</span><h1 class="display-title">Скоро за<br><span class="gradient-text">игровым столом.</span></h1><p class="lead">Создание комнат и игровые настройки появятся на четвёртом этапе.</p><a class="button button--ghost" href="#/">На главную</a></section>`;
    return;
  }
  if (route === "/") return renderHome();
  if (route.startsWith("/u/")) {
    const username = decodeURIComponent(route.slice(3));
    const profile = storage.getUserByUsername(username);
    app.innerHTML = profile
      ? `<section class="page-enter"><span class="eyebrow">УЧАСТНИК КЛУБА</span><h1 class="display-title">${escapeHTML(profile.username)}</h1><p class="lead">${escapeHTML(profile.bio || "Этот игрок пока ничего о себе не рассказал.")}</p><a class="button button--ghost" href="#/">На главную</a></section>`
      : `<h1 class="display-title">Игрок не найден</h1><a class="button button--ghost" href="#/">На главную</a>`;
    return;
  }
  renderHome();
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("storage", (event) => {
  if (event.key?.startsWith("nastolny-club:")) {
    updateHeader();
    if (location.hash === "#/profile") renderProfile();
  }
});

if (!location.hash) history.replaceState(null, "", `${location.pathname}${location.search}#/`);
renderRoute();
