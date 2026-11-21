import { auth } from "./auth.js";
import { storage } from "./storage.js";
import { bindAvatarCropper } from "./avatar.js";
import { renderCatalog } from "./catalog.js";
import { renderRooms } from "./rooms.js";

const app = document.querySelector("#app");
const topActions = document.querySelector("#top-actions");
const toastRegion = document.querySelector("#toast-region");
let routeCleanup = null;

const FAVORITE_GAMES = [
  "D&D 5e", "Бункер", "Мафия", "Кодовые имена", "Диксит",
  "Имаджинариум", "Алиас", "Шпион", "Секретный Гитлер", "Авалон",
  "Уно", "Монополия", "Каркассон", "Колонизаторы", "Билет на поезд",
  "Манчкин", "Экивоки", "Крокодил", "Шахматы", "Нарды"
];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function avatarMarkup(user, className = "profile-avatar") {
  const initial = escapeHTML((user.username || "?").slice(0, 1).toUpperCase());
  return `<div class="${className}">${user.avatar
    ? `<img src="${escapeHTML(user.avatar)}" alt="Аватар ${escapeHTML(user.username)}">`
    : initial}</div>`;
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
  const avatar = user.avatar
    ? `<span class="mini-avatar"><img src="${escapeHTML(user.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px"></span>`
    : `<span class="mini-avatar">${initial}</span>`;
  topActions.innerHTML = `
    <a class="button button--ghost button--small" href="#/profile">${avatar} ${escapeHTML(user.username)}</a>
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
      const query = location.hash.includes("?") ? location.hash.split("?").slice(1).join("?") : "";
      const next = new URLSearchParams(query).get("next");
      navigate(next && next.startsWith("/rooms") ? `#${next}` : "#/profile");
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
          <a class="button button--primary" href="#/games">Открыть каталог <span>↗</span></a>
          <a class="button button--ghost" href="#/rooms">${user ? "Комнаты клуба" : "Найти свою команду"} <span>⌁</span></a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true"><div class="hero-ring"></div><div class="hero-glyph"><span>🎲</span></div></div>
    </section>
    <div class="feature-strip">
      <div class="feature-tile"><strong>✦ 20+</strong><span>Настольных и ролевых игр</span></div>
      <div class="feature-tile"><strong>♧ Свои</strong><span>Комнаты и игровые правила</span></div>
      <div class="feature-tile"><strong>⌁ Вместе</strong><span>Общение и новые знакомства</span></div>
    </div>
    <p class="section-kicker" style="margin-top:28px">Выбирай игру, создавай комнату и собирай свою команду — таверна уже открыта.</p>`;
}

function renderProfile() {
  const user = auth.getCurrentUser();
  if (!user) return navigate("#/login");
  const joined = new Date(user.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const favoriteMarkup = (user.favoriteGames || []).length
    ? `<div class="game-chip-list">${user.favoriteGames.map((game) => `<span class="game-chip">✦ ${escapeHTML(game)}</span>`).join("")}</div>`
    : `<p class="section-kicker">Пока не выбраны. Добавь любимые игры в настройках профиля.</p>`;
  const publicUrl = `#/u/${encodeURIComponent(user.username)}`;

  app.innerHTML = `
    <section class="profile-wrap page-enter">
      <div class="profile-head">
        <div><span class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1 class="display-title">Твоё место<br><span class="gradient-text">в таверне.</span></h1></div>
        <div class="profile-actions">
          <a class="button button--ghost button--small" href="${publicUrl}">Публичная страница ↗</a>
          <a class="button button--primary button--small" href="#/settings">Настроить профиль <span>✧</span></a>
        </div>
      </div>
      <section class="profile-card">
        <div class="profile-identity">
          ${avatarMarkup(user)}
          <div style="min-width:0"><h2 class="profile-name">${escapeHTML(user.username)}</h2><p class="profile-status">${escapeHTML(user.status || "Новый участник клуба")}</p></div>
        </div>
        <div class="profile-meta-grid">
          <div class="profile-meta"><span class="profile-meta-label">Электронная почта</span><div class="profile-meta-value">${escapeHTML(user.email)}</div></div>
          <div class="profile-meta"><span class="profile-meta-label">В клубе с</span><div class="profile-meta-value">${escapeHTML(joined)}</div></div>
        </div>
        <div class="profile-section"><h3>Обо мне</h3><p class="profile-bio ${user.bio ? "" : "empty-bio"}">${escapeHTML(user.bio || "Расскажи другим игрокам немного о себе.")}</p></div>
        <div class="profile-section"><h3>Любимые игры</h3>${favoriteMarkup}</div>
      </section>
    </section>`;
}

function renderSettings() {
  const user = auth.getCurrentUser();
  if (!user) return navigate("#/login");

  const initial = escapeHTML(user.username.slice(0, 1).toUpperCase());
  const favorites = Array.isArray(user.favoriteGames) ? user.favoriteGames : [];
  app.innerHTML = `
    <section class="profile-wrap page-enter">
      <div class="profile-head">
        <div><span class="eyebrow">ПЕРСОНАЛИЗАЦИЯ</span><h1 class="display-title">Настрой<br><span class="gradient-text">свой профиль.</span></h1></div>
        <div class="profile-actions"><a class="button button--ghost button--small" href="#/profile">← Назад в профиль</a></div>
      </div>
      <div class="settings-layout">
        <aside class="settings-aside">
          <div class="profile-card">
            ${avatarMarkup(user, "profile-avatar profile-avatar--edit")}
            <div><h2 class="profile-name">${escapeHTML(user.username)}</h2><p class="profile-status">Твоя игровая визитка</p></div>
          </div>
          <p class="settings-aside-copy">Заполни профиль так, чтобы другим игрокам было проще узнать тебя и пригласить за свой игровой стол.</p>
        </aside>
        <section class="profile-card settings-form-card">
          <h2 class="settings-section-title">Внешний вид и информация</h2>
          <p class="settings-section-subtitle">Эти данные будут отображаться на твоей публичной странице.</p>
          <form id="profile-form">
            <div class="avatar-edit-row">
              ${avatarMarkup(user, "profile-avatar profile-avatar--edit")}
              <div class="avatar-edit-copy">
                <strong>Аватар игрока</strong>
                <span>Квадратное изображение · JPG, PNG или WebP · до 10 МБ</span>
                <button class="button button--ghost button--small" id="change-avatar" type="button">Загрузить фото</button>
                <input class="avatar-file-input" id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Выбрать изображение для аватара">
              </div>
            </div>
            <div class="cropper" id="avatar-cropper" hidden>
              <h3 class="cropper-heading">КАДРИРОВАНИЕ АВАТАРА</h3>
              <div class="cropper-workspace">
                <div class="crop-viewport" id="crop-viewport" aria-label="Перетащите изображение, чтобы выбрать кадр">
                  <img id="crop-image" alt="Предпросмотр кадрирования">
                </div>
                <div class="crop-controls">
                  <label for="crop-zoom">МАСШТАБ</label>
                  <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1">
                  <p class="crop-help">Перетаскивай изображение внутри квадрата и меняй масштаб ползунком. Будет сохранён центральный квадрат выбранного кадра.</p>
                  <div class="crop-actions">
                    <button class="button button--primary" id="save-crop" type="button">Применить кадр</button>
                    <button class="button button--ghost" id="cancel-crop" type="button">Отмена</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="form-field">
              <label for="profile-username">ИГРОВОЙ НИКНЕЙМ</label>
              <input class="form-input form-input--plain" id="profile-username" name="username" type="text" minlength="3" maxlength="20" value="${escapeHTML(user.username)}" required>
            </div>
            <div class="form-field">
              <label for="profile-status">СТАТУС</label>
              <input class="form-input form-input--plain" id="profile-status" name="status" type="text" maxlength="60" value="${escapeHTML(user.status || "")}" placeholder="Например, Ищу группу в D&D">
            </div>
            <div class="form-field">
              <label for="profile-bio">О СЕБЕ</label>
              <textarea class="form-input form-input--plain" id="profile-bio" name="bio" maxlength="300" placeholder="Расскажи, какие игры любишь и кого ищешь за игровым столом…">${escapeHTML(user.bio || "")}</textarea>
              <p class="form-hint" style="margin:0">До 300 символов.</p>
            </div>
            <div class="settings-divider"></div>
            <div class="form-field">
              <label>ЛЮБИМЫЕ ИГРЫ</label>
              <p class="form-hint" style="margin:0 0 8px">Выбери игры, в которые любишь играть. Можно отметить несколько.</p>
              <div class="favorite-grid">
                ${FAVORITE_GAMES.map((game, index) => `
                  <label class="favorite-option">
                    <input type="checkbox" name="favoriteGames" value="${escapeHTML(game)}" ${favorites.includes(game) ? "checked" : ""}>
                    <span>${escapeHTML(game)}</span>
                  </label>`).join("")}
              </div>
            </div>
            <p class="form-error" id="settings-error" role="alert"></p>
            <button class="button button--primary button--full" id="save-profile" type="submit">Сохранить изменения <span>↗</span></button>
            <p class="profile-public-note">Почта и хэш пароля остаются приватными. На публичной странице будут показаны никнейм, статус, био, аватар и любимые игры.</p>
          </form>
        </section>
      </div>
    </section>`;

  let avatarDraft = user.avatar || "";
  const avatarInput = document.querySelector("#avatar-file");
  const cropper = bindAvatarCropper({
    fileInput: avatarInput,
    viewport: document.querySelector("#crop-viewport"),
    image: document.querySelector("#crop-image"),
    cropper: document.querySelector("#avatar-cropper"),
    zoomInput: document.querySelector("#crop-zoom"),
    saveButton: document.querySelector("#save-crop"),
    cancelButton: document.querySelector("#cancel-crop"),
    onSave(dataUrl) {
      avatarDraft = dataUrl;
      const previews = document.querySelectorAll(".avatar-edit-row .profile-avatar, .settings-aside .profile-avatar");
      previews.forEach((preview) => {
        preview.innerHTML = `<img src="${escapeHTML(dataUrl)}" alt="Новый аватар">`;
      });
      showToast("Кадр готов. Сохрани изменения профиля.");
    },
    onError(message) {
      showToast(message, "error");
    }
  });

  document.querySelector("#change-avatar").addEventListener("click", () => cropper.openFilePicker());

  document.querySelector("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = document.querySelector("#settings-error");
    const saveButton = document.querySelector("#save-profile");
    errorBox.textContent = "";
    errorBox.classList.remove("is-visible");
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const username = String(data.get("username")).trim();
    const status = String(data.get("status") || "").trim();
    const bio = String(data.get("bio") || "").trim();
    const favoriteGames = data.getAll("favoriteGames");

    if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) {
      errorBox.textContent = "Никнейм должен содержать 3–20 символов: буквы, цифры, дефис или подчёркивание.";
      errorBox.classList.add("is-visible");
      return;
    }
    if (status.length > 60 || bio.length > 300) {
      errorBox.textContent = "Проверь длину статуса и описания.";
      errorBox.classList.add("is-visible");
      return;
    }
    const duplicate = storage.getUserByUsername(username);
    if (duplicate && duplicate.id !== user.id) {
      errorBox.textContent = "Этот никнейм уже занят. Выбери другой.";
      errorBox.classList.add("is-visible");
      return;
    }

    saveButton.disabled = true;
    try {
      storage.updateUser(user.id, {
        username,
        status,
        bio,
        avatar: avatarDraft,
        favoriteGames
      });
      cropper.destroy();
      showToast("Профиль успешно обновлён.");
      navigate("#/profile");
    } catch (error) {
      errorBox.textContent = error.message || "Не удалось сохранить профиль.";
      errorBox.classList.add("is-visible");
      saveButton.disabled = false;
    }
  });
}

function renderPublicProfile(usernameFromRoute) {
  const username = decodeURIComponent(usernameFromRoute);
  const user = storage.getUserByUsername(username);
  if (!user) {
    app.innerHTML = `
      <section class="page-enter" style="max-width:680px;margin:35px auto">
        <span class="eyebrow">ПОТЕРЯЛИ ИГРОКА?</span>
        <h1 class="display-title">Такого героя<br><span class="gradient-text">не нашли.</span></h1>
        <p class="lead">Похоже, этот профиль не существует или никнейм изменился.</p>
        <a class="button button--primary" href="#/">Вернуться на главную ↗</a>
      </section>`;
    return;
  }

  const joined = new Date(user.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const favorites = (user.favoriteGames || []).length
    ? `<div class="game-chip-list">${user.favoriteGames.map((game) => `<span class="game-chip">✦ ${escapeHTML(game)}</span>`).join("")}</div>`
    : `<p class="section-kicker">Игрок пока не выбрал любимые игры.</p>`;
  const current = auth.getCurrentUser();
  const isOwnProfile = current?.id === user.id;

  app.innerHTML = `
    <section class="profile-wrap page-enter" style="max-width:800px;margin:20px auto">
      <div class="profile-head">
        <div><span class="eyebrow">ПУБЛИЧНЫЙ ПРОФИЛЬ</span><h1 class="display-title" style="font-size:clamp(31px,5vw,46px)">Игрок клуба.</h1></div>
        ${isOwnProfile ? `<a class="button button--primary button--small" href="#/settings">Редактировать ↗</a>` : `<a class="button button--ghost button--small" href="#/">На главную</a>`}
      </div>
      <section class="profile-card">
        <div class="profile-identity">
          ${avatarMarkup(user)}
          <div style="min-width:0"><h2 class="profile-name">${escapeHTML(user.username)}</h2><p class="profile-status">${escapeHTML(user.status || "Участник Настольного клуба")}</p></div>
        </div>
        <div class="profile-meta-grid">
          <div class="profile-meta"><span class="profile-meta-label">В клубе с</span><div class="profile-meta-value">${escapeHTML(joined)}</div></div>
          <div class="profile-meta"><span class="profile-meta-label">Игровой статус</span><div class="profile-meta-value">${escapeHTML(user.status || "Открыт новым знакомствам")}</div></div>
        </div>
        <div class="profile-section"><h3>Обо мне</h3><p class="profile-bio ${user.bio ? "" : "empty-bio"}">${escapeHTML(user.bio || "Этот игрок пока ничего о себе не рассказал.")}</p></div>
        <div class="profile-section"><h3>Любимые игры</h3>${favorites}</div>
      </section>
    </section>`;
}

function navigate(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}

function renderRoute() {
  updateHeader();
  routeCleanup?.();
  routeCleanup = null;
  const hash = location.hash || "#/";
  const route = hash.replace(/^#/, "");
  const [routePath] = route.split("?");
  const user = auth.getCurrentUser();

  if (routePath === "/login") {
    if (user) return navigate("#/profile");
    return renderLogin();
  }
  if (routePath === "/register") {
    if (user) return navigate("#/profile");
    return renderRegister();
  }
  if (routePath === "/profile") {
    if (!user) return navigate("#/login");
    return renderProfile();
  }
  if (routePath === "/settings") {
    if (!user) return navigate("#/login");
    return renderSettings();
  }
  if (routePath === "/games" || routePath === "/catalog") {
    routeCleanup = renderCatalog(app);
    return;
  }
  if (routePath.startsWith("/rooms")) {
    if (!user) {
      location.hash = `#/login?next=${encodeURIComponent(route)}`;
      return;
    }
    renderRooms(app, route);
    return;
  }
  if (routePath.startsWith("/u/")) return renderPublicProfile(routePath.slice(3));
  if (routePath === "/") return renderHome();
  renderHome();
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("storage", (event) => {
  if (event.key?.startsWith("nastolny-club:")) {
    updateHeader();
    if (location.hash === "#/profile") renderProfile();
    if (location.hash === "#/settings") renderSettings();
    if (location.hash.startsWith("#/u/")) renderRoute();
  }
});

if (!location.hash) history.replaceState(null, "", `${location.pathname}${location.search}#/`);
renderRoute();
