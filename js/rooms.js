import { auth } from "./auth.js";
import { supabase } from "./supabase.js";
import { storage, createId } from "./storage.js";
import { GAMES, getGameById } from "./games.js";
import { renderRoomChat, addRoomSystemMessage } from "./chat.js";
import { renderGameRules } from "./game-rules.js";
import { renderChessGame, startOnlineChessGame } from "./chess-game.js";
import { renderGameTable } from "./game-table.js";
import { ensurePublicProfile, listOnlineRooms, getOnlineRoom, createOnlineRoom, joinOnlineRoom, leaveOnlineRoom, setOnlineRoomStatus, removeOnlineRoomMember, deleteOnlineRoom } from "./online-rooms.js";
let onlineRoomsCache = [];

const CSS_ID = "nastolny-rooms-styles";

const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function ensureStyles() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = "./css/rooms.css";
  document.head.append(link);
}

function notify(message, type = "success") {
  let region = document.querySelector("#toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    document.body.append(region);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast--error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function confirmRoomAction({ title, message, confirmLabel = "Подтвердить", danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "room-confirm-dialog";
    dialog.innerHTML = `
      <div class="room-confirm-dialog__content">
        <span class="eyebrow">НАСТОЛЬНЫЙ КЛУБ</span>
        <h2>${escapeHTML(title)}</h2>
        <p>${escapeHTML(message)}</p>
        <div class="room-confirm-dialog__actions">
          <button class="room-button room-button--soft" type="button" data-cancel>Отмена</button>
          <button class="room-button ${danger ? "room-button--danger" : "room-button--primary"}" type="button" data-confirm>${escapeHTML(confirmLabel)}</button>
        </div>
      </div>`;
    let accepted = false;
    const finish = () => {
      dialog.remove();
      resolve(accepted);
    };
    dialog.addEventListener("close", finish, { once: true });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
    });
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-confirm]").addEventListener("click", () => {
      accepted = true;
      dialog.close();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function runRoomAction(button, action, successMessage) {
  if (!button || button.disabled) return false;
  const originalText = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Выполняем…";
  try {
    await action();
    if (successMessage) notify(successMessage);
    return true;
  } catch (error) {
    notify(error?.message || "Не удалось выполнить действие. Попробуй ещё раз.", "error");
    return false;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalText;
    }
  }
}

async function confirmAndRunRoomAction(button, options, action, successMessage, renderSequence) {
  if (!button || button.disabled || !button.isConnected) return false;
  const originalText = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const accepted = await confirmRoomAction(options);
    if (!accepted || renderSequence !== roomRenderSequence || !button.isConnected) return false;
    button.textContent = "Выполняем…";
    await action();
    if (successMessage) notify(successMessage);
    return true;
  } catch (error) {
    notify(error?.message || "Не удалось выполнить действие. Попробуй ещё раз.", "error");
    return false;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalText;
    }
  }
}

function go(hash) {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = hash;
  }
}

function getCurrentUser() {
  return auth.getCurrentUser();
}

function getMember(room, userId) {
  return (room.members || []).find((member) => member.userId === userId) || null;
}

function getRoomById(id) {
  return storage.getRooms().find((room) => room.id === id) || null;
}

function updateRoom(roomId, updater) {
  const rooms = storage.getRooms();
  const index = rooms.findIndex((room) => room.id === roomId);
  if (index < 0) throw new Error("Комната больше не существует.");
  rooms[index] = updater(rooms[index]);
  storage.saveRooms(rooms);
  return rooms[index];
}

function avatar(user, className = "room-avatar") {
  const initial = escapeHTML((user?.username || "?").slice(0, 1).toUpperCase());
  return `<span class="${className}">${user?.avatar
    ? `<img src="${escapeHTML(user.avatar)}" alt="">`
    : initial}</span>`;
}

function getStatus(room) {
  if (room.status === "playing") return { label: "Идёт игра", className: "is-playing" };
  if (room.status === "closed") return { label: "Завершена", className: "is-closed" };
  return { label: "Открыта", className: "is-open" };
}

function formatDate(value) {
  if (!value) return "Время не назначено";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Время не назначено";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function getRoomUrl(room) {
  const invite = room.visibility === "private" && room.inviteCode
    ? `?invite=${encodeURIComponent(room.inviteCode)}`
    : "";
  return `${location.origin}${location.pathname}${location.search}#/rooms/${encodeURIComponent(room.id)}${invite}`;
}

function roomCard(room, user) {
  const game = getGameById(room.gameId);
  if (!game) return "";
  const host = room.host || storage.getUserById(room.hostId);
  const member = getMember(room, user.id);
  const status = getStatus(room);
  const count = (room.members || []).length;
  const full = count >= room.maxPlayers;
  const canJoin = !member && room.visibility === "public" && room.status === "open" && !full;
  const [tone, glow] = game.palette;
  return `
    <article class="room-card" style="--room-tone:${tone};--room-glow:${glow}">
      <div class="room-card__banner pattern-${escapeHTML(game.pattern)}">
        <span class="room-card__game-emoji">${game.emoji}</span>
        <span class="room-card__visibility">${room.visibility === "private" ? "◈ Приватная" : "◎ Публичная"}</span>
        <span class="room-card__status ${status.className}">${status.label}</span>
      </div>
      <div class="room-card__content">
        <div class="room-card__game">${escapeHTML(game.short)} <span>· ${escapeHTML(game.category)}</span></div>
        <h3>${escapeHTML(room.name)}</h3>
        <p class="room-card__description">${escapeHTML(room.description || "Ведущий пока не добавил описание комнаты.")}</p>
        <div class="room-card__meta">
          <span>♟ ${(room.members || []).length}/${room.maxPlayers}</span>
          <span>◷ ${escapeHTML(formatDate(room.scheduledAt))}</span>
        </div>
        <div class="room-card__host">${avatar(host, "room-avatar room-avatar--small")}<span>Ведущий <strong>${escapeHTML(host?.username || "Неизвестный игрок")}</strong></span></div>
        <div class="room-card__actions">
          <a class="room-button room-button--soft" href="#/rooms/${encodeURIComponent(room.id)}">Открыть комнату</a>
          ${canJoin ? `<button class="room-button room-button--primary" type="button" data-room-join="${escapeHTML(room.id)}">Присоединиться ↗</button>` : member ? `<span class="room-card__member-state">✓ Ты в комнате</span>` : `<span class="room-card__member-state">${full ? "Мест нет" : room.visibility === "private" ? "По приглашению" : "Недоступна"}</span>`}
        </div>
      </div>
    </article>`;
}

async function renderList(container, user, renderSequence = roomRenderSequence) {
  await ensurePublicProfile(user);
  if (renderSequence !== roomRenderSequence) return;
  onlineRoomsCache = await listOnlineRooms();
  if (renderSequence !== roomRenderSequence) return;
  const visibleRooms = onlineRoomsCache
    .filter((room) => room.visibility === "public" || getMember(room, user.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = `
    <section class="rooms-page page-enter">
      <div class="rooms-hero">
        <div class="rooms-hero__copy">
          <span class="eyebrow">МЕСТО, ГДЕ СОБИРАЮТСЯ КОМАНДЫ</span>
          <h1 class="display-title">Найди свой<br><span class="gradient-text">игровой стол.</span></h1>
          <p class="lead">Загляни в открытые комнаты клуба или создай собственную — с любимой игрой, своими правилами и своей компанией.</p>
          <div class="rooms-hero__actions">
            <a class="room-button room-button--primary room-button--large" href="#/rooms/new">＋ Создать комнату</a>
            <a class="room-button room-button--soft room-button--large" href="#/">В каталог игр</a>
          </div>
        </div>
        <div class="rooms-hero__dice" aria-hidden="true"><span>🎲</span><i>✦</i><b>✧</b></div>
      </div>

      <div class="rooms-toolbar">
        <div><span class="eyebrow">ЖИЗНЬ КЛУБА</span><h2>Игровые комнаты</h2></div>
        <div class="rooms-toolbar__controls">
          <label class="rooms-search"><span>⌕</span><input id="rooms-search" type="search" placeholder="Название или игра…" aria-label="Поиск комнат"></label>
          <select class="rooms-select" id="rooms-filter" aria-label="Фильтр комнат">
            <option value="all">Все доступные</option>
            <option value="mine">Мои комнаты</option>
            <option value="open">Только открытые</option>
            <option value="playing">Уже играют</option>
          </select>
        </div>
      </div>

      <div class="rooms-grid" id="rooms-grid">
        ${visibleRooms.map((room) => roomCard(room, user)).join("")}
      </div>
      <div class="rooms-empty" id="rooms-empty" ${visibleRooms.length ? "hidden" : ""}>
        <span class="rooms-empty__icon">♧</span>
        <h3>Пока столы свободны</h3>
        <p>Создай первую комнату и пригласи игроков в свою партию.</p>
        <a class="room-button room-button--primary" href="#/rooms/new">Создать первую комнату ↗</a>
      </div>
      <p class="rooms-footnote">КОМНАТЫ И УЧАСТНИКИ СИНХРОНИЗИРУЮТСЯ ЧЕРЕЗ SUPABASE · ВОЙДИ В АККАУНТ, ЧТОБЫ ИГРАТЬ С ДРУГИМИ</p>
    </section>`;

  const search = container.querySelector("#rooms-search");
  const filter = container.querySelector("#rooms-filter");
  const grid = container.querySelector("#rooms-grid");
  const empty = container.querySelector("#rooms-empty");

  function refresh() {
    const query = search.value.trim().toLocaleLowerCase("ru");
    const mode = filter.value;
    const matches = onlineRoomsCache
      .filter((room) => room.visibility === "public" || getMember(room, user.id))
      .filter((room) => {
        if (mode === "mine" && !getMember(room, user.id)) return false;
        if (mode === "open" && room.status !== "open") return false;
        if (mode === "playing" && room.status !== "playing") return false;
        const game = getGameById(room.gameId);
        const haystack = `${room.name} ${room.description} ${game?.title || ""}`.toLocaleLowerCase("ru");
        return !query || haystack.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    grid.innerHTML = matches.map((room) => roomCard(room, user)).join("");
    grid.hidden = matches.length === 0;
    empty.hidden = matches.length !== 0;
    if (!matches.length) {
      empty.querySelector("h3").textContent = "Ничего не найдено";
      empty.querySelector("p").textContent = "Измени поисковый запрос или фильтр, либо создай собственную комнату.";
    } else {
      empty.querySelector("h3").textContent = "Пока столы свободны";
      empty.querySelector("p").textContent = "Создай первую комнату и пригласи игроков в свою партию.";
    }
  }

  search.addEventListener("input", refresh);
  filter.addEventListener("change", refresh);
  grid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-room-join]");
    if (!button) return;
    try {
      await joinOnlineRoom(button.dataset.roomJoin);
      notify("Ты присоединился к комнате.");
      go(`#/rooms/${encodeURIComponent(button.dataset.roomJoin)}`);
    } catch (error) {
      notify(error.message, "error");
    }
  });
}

function joinRoom(roomId, user, inviteCode = "") {
  updateRoom(roomId, (room) => {
    if (getMember(room, user.id)) return room;
    if (room.visibility === "private" && (!inviteCode || inviteCode !== room.inviteCode)) {
      throw new Error("Для входа в приватную комнату нужна действующая ссылка-приглашение.");
    }
    if (room.status !== "open") throw new Error("Комната больше не принимает игроков.");
    if (room.members.length >= room.maxPlayers) throw new Error("В комнате больше нет свободных мест.");
    room.members.push({
      userId: user.id,
      role: "player",
      joinedAt: new Date().toISOString()
    });
    return room;
  });
  addRoomSystemMessage(roomId, `${user.username} присоединился к комнате.`);
}

function renderGameRuleFields(game) {
  if (game.id === "bunker") {
    return `
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-catastrophe">КАТАСТРОФА</label>
          <select class="room-input" id="rule-catastrophe" name="catastrophe">
            <option>Глобальная пандемия</option><option>Ядерная зима</option><option>Падение астероида</option><option>Восстание ИИ</option><option>Неизвестная катастрофа</option><option>Случайная</option>
          </select>
        </div>
        <div class="room-form-field">
          <label for="rule-bunker-capacity">МЕСТ В БУНКЕРЕ</label>
          <select class="room-input" id="rule-bunker-capacity" name="bunkerCapacity">
            <option value="40">40% группы</option><option value="50" selected>50% группы</option><option value="60">60% группы</option>
          </select>
        </div>
      </div>
      <div class="room-rule-note">Карты персонажей: профессия, здоровье, хобби, багаж и дополнительные факты будут определяться ведущим во время партии.</div>`;
  }
  if (game.id === "mafia") {
    return `
      <div class="room-form-field">
        <label>ДОПОЛНИТЕЛЬНЫЕ РОЛИ</label>
        <div class="room-check-grid">
          <label><input type="checkbox" name="extraRoles" value="Доктор" checked> Доктор</label>
          <label><input type="checkbox" name="extraRoles" value="Комиссар" checked> Комиссар</label>
          <label><input type="checkbox" name="extraRoles" value="Маньяк"> Маньяк</label>
          <label><input type="checkbox" name="extraRoles" value="Любовница"> Любовница</label>
        </div>
      </div>
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-mafia-count">ЧИСЛО МАФИОЗИ</label>
          <select class="room-input" id="rule-mafia-count" name="mafiaCount"><option value="auto">Автоматически</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
        </div>
        <div class="room-form-field">
          <label for="rule-mafia-host">ВЕДУЩИЙ</label>
          <select class="room-input" id="rule-mafia-host" name="mafiaHost"><option value="host">Создатель комнаты</option><option value="player">Отдельный игрок</option></select>
        </div>
      </div>`;
  }
  if (game.id === "dnd-5e") {
    return `
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-level">УРОВЕНЬ ПЕРСОНАЖЕЙ</label>
          <select class="room-input" id="rule-level" name="characterLevel">
            ${Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}" ${index === 0 ? "selected" : ""}>${index + 1} уровень</option>`).join("")}
          </select>
        </div>
        <div class="room-form-field">
          <label for="rule-setting">СЕТТИНГ</label>
          <select class="room-input" id="rule-setting" name="setting">
            <option>Forgotten Realms</option><option>Ravenloft</option><option>Eberron</option><option>Собственный мир</option><option>Без привязки</option>
          </select>
        </div>
      </div>
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-dm-mode">МАСТЕР (DM)</label>
          <select class="room-input" id="rule-dm-mode" name="dmMode">
            <option value="host">Ведущий — создатель комнаты</option><option value="looking">Ищем Dungeon Master</option><option value="player">Мастер уже выбран</option>
          </select>
        </div>
        <div class="room-form-field">
          <label for="rule-campaign">ФОРМАТ ПРИКЛЮЧЕНИЯ</label>
          <select class="room-input" id="rule-campaign" name="campaign">
            <option>Короткое приключение</option><option>Кампания</option><option>Ваншот</option><option>Открытая песочница</option>
          </select>
        </div>
      </div>`;
  }
  if (game.id === "spy") {
    return `
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-spies">КОЛИЧЕСТВО ШПИОНОВ</label>
          <select class="room-input" id="rule-spies" name="spyCount"><option value="1">1 шпион</option><option value="2">2 шпиона</option></select>
        </div>
        <div class="room-form-field">
          <label for="rule-spy-timer">ВРЕМЯ РАУНДА</label>
          <select class="room-input" id="rule-spy-timer" name="spyTimer"><option value="5">5 минут</option><option value="6">6 минут</option><option value="8">8 минут</option><option value="10">10 минут</option></select>
        </div>
      </div>`;
  }
  if (game.id === "chess") {
    return `
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-time-control">КОНТРОЛЬ ВРЕМЕНИ</label>
          <select class="room-input" id="rule-time-control" name="timeControl"><option value="Без таймера">Без таймера</option></select>
          <small class="room-field-hint">Игровые часы добавим отдельным обновлением; сейчас партия идёт без таймера.</small>
        </div>
        <div class="room-form-field room-chess-opponent">
          <label for="rule-chess-opponent">СОПЕРНИК</label>
          <select class="room-input" id="rule-chess-opponent" name="opponentMode"><option value="human">Другой игрок</option><option value="bot">Компьютерный бот</option></select>
          <div class="room-chess-opponent__difficulty">
            <label for="rule-bot-difficulty">СЛОЖНОСТЬ БОТА</label>
            <select class="room-input" id="rule-bot-difficulty" name="botDifficulty"><option value="easy">Лёгкая</option><option value="medium" selected>Средняя</option><option value="hard">Сложная</option></select>
            <small class="room-field-hint">Настройка используется, если выбран компьютерный соперник.</small>
          </div>
        </div>
      </div>`;
  }
  if (game.id === "backgammon") {
    return `
      <div class="room-form-grid">
        <div class="room-form-field">
          <label for="rule-time-control">КОНТРОЛЬ ВРЕМЕНИ</label>
          <select class="room-input" id="rule-time-control" name="timeControl"><option value="Без таймера">Без таймера</option><option value="3+2">3 + 2</option><option value="5+0">5 минут</option><option value="10+0">10 минут</option><option value="15+10">15 + 10</option></select>
        </div>
        <div class="room-form-field"><label for="rule-backgammon-mode">ВИД НАРД</label><select class="room-input" id="rule-backgammon-mode" name="backgammonMode"><option>Короткие</option><option>Длинные</option></select></div>
      </div>`;
  }
  if (game.id === "codenames") {
    return `
      <div class="room-form-field">
        <label for="rule-captains">КАПИТАНЫ</label>
        <select class="room-input" id="rule-captains" name="captains"><option value="players">Капитаны выбираются игроками</option><option value="host">Создатель назначает капитанов</option></select>
      </div>`;
  }
  return `
    <div class="room-form-field">
      <label for="rule-round-format">ФОРМАТ ПАРТИИ</label>
      <select class="room-input" id="rule-round-format" name="roundFormat">
        <option>Стандартные правила</option><option>Быстрая партия</option><option>Свободный формат</option>
      </select>
    </div>`;
}

function renderCreate(container, user, presetGameId) {
  const initialGame = getGameById(presetGameId) ? presetGameId : GAMES[0].id;
  const game = getGameById(initialGame);
  container.innerHTML = `
    <section class="room-create-page page-enter">
      <div class="room-page-heading">
        <a class="room-back-link" href="#/rooms">← Все комнаты</a>
        <span class="eyebrow">СОБЕРИ СВОЮ КОМПАНИЮ</span>
        <h1 class="display-title">Создай<br><span class="gradient-text">свой игровой стол.</span></h1>
        <p class="lead">Выбери игру, настрой атмосферу и правила — клуб позаботится об остальном.</p>
      </div>
      <form class="room-form-card" id="room-create-form">
        <div class="room-form-section">
          <div class="room-form-section__heading"><span>01</span><div><h2>Основа комнаты</h2><p>Что будем играть и как назовём встречу?</p></div></div>
          <div class="room-form-field">
            <label for="room-game">ВЫБЕРИ ИГРУ</label>
            <select class="room-input" id="room-game" name="gameId" required>
              ${GAMES.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === initialGame ? "selected" : ""}>${escapeHTML(item.title)}</option>`).join("")}
            </select>
          </div>
          <div class="room-form-field">
            <label for="room-name">НАЗВАНИЕ КОМНАТЫ</label>
            <input class="room-input" id="room-name" name="name" maxlength="55" required placeholder="Например, Пятничная кампания">
          </div>
          <div class="room-form-field">
            <label for="room-description">ОПИСАНИЕ И ПРИГЛАШЕНИЕ</label>
            <textarea class="room-input room-textarea" id="room-description" name="description" maxlength="280" placeholder="Расскажи, какую компанию ищешь, какой у вас вайб и чего ждать от партии…"></textarea>
          </div>
          <div class="room-form-grid">
            <div class="room-form-field">
              <label for="room-max-players">МАКСИМУМ ИГРОКОВ</label>
              <select class="room-input" id="room-max-players" name="maxPlayers" required></select>
              <small id="room-player-limit" class="room-field-hint"></small>
            </div>
            <div class="room-form-field">
              <label for="room-date">ДАТА И ВРЕМЯ</label>
              <input class="room-input" id="room-date" name="scheduledAt" type="datetime-local">
              <small class="room-field-hint">Можно оставить пустым.</small>
            </div>
          </div>
          <div class="room-form-field">
            <label>ДОСТУП В КОМНАТУ</label>
            <div class="room-visibility-options">
              <label class="room-visibility-option is-selected"><input type="radio" name="visibility" value="public" checked><span class="room-visibility-icon">◎</span><span><strong>Публичная</strong><small>Видна в каталоге комнат</small></span></label>
              <label class="room-visibility-option"><input type="radio" name="visibility" value="private"><span class="room-visibility-icon">◈</span><span><strong>Приватная</strong><small>Только участники по ссылке</small></span></label>
            </div>
          </div>
        </div>

        <div class="room-form-section">
          <div class="room-form-section__heading"><span>02</span><div><h2>Общие правила</h2><p>Базовые настройки вашей игровой встречи.</p></div></div>
          <div class="room-form-grid">
            <div class="room-form-field">
              <label for="room-turn-timer">ТАЙМЕР ХОДА</label>
              <select class="room-input" id="room-turn-timer" name="turnTimer">
                <option value="0">Без ограничений</option><option value="30">30 секунд</option><option value="60">1 минута</option><option value="90">1,5 минуты</option><option value="120">2 минуты</option><option value="300">5 минут</option>
              </select>
            </div>
            <div class="room-form-field">
              <label for="room-observers">НАБЛЮДАТЕЛИ</label>
              <select class="room-input" id="room-observers" name="observers"><option value="yes">Разрешены</option><option value="no">Запрещены</option></select>
            </div>
          </div>
        </div>

        <div class="room-form-section">
          <div class="room-form-section__heading"><span>03</span><div><h2>Правила игры</h2><p id="game-rules-caption">${escapeHTML(game.short)} — особые условия партии.</p></div></div>
          <div id="game-rule-fields">${renderGameRuleFields(game)}</div>
        </div>

        <div class="room-create-footer">
          <p class="room-field-hint">Создавая комнату, ты становишься её ведущим и получаешь роль host.</p>
          <p class="form-error" id="room-create-error" role="alert"></p>
          <button class="room-button room-button--primary room-button--large room-submit" type="submit">Создать комнату <span>↗</span></button>
        </div>
      </form>
    </section>`;

  const form = container.querySelector("#room-create-form");
  const gameSelect = container.querySelector("#room-game");
  const maxPlayersSelect = container.querySelector("#room-max-players");
  const maxHint = container.querySelector("#room-player-limit");
  const ruleFields = container.querySelector("#game-rule-fields");
  const rulesCaption = container.querySelector("#game-rules-caption");
  const visibilityOptions = container.querySelectorAll(".room-visibility-option");

  function updatePlayerLimits() {
    const selectedGame = getGameById(gameSelect.value);
    const previous = Number(maxPlayersSelect.value) || selectedGame.maxPlayers;
    const options = [];
    for (let number = selectedGame.minPlayers; number <= selectedGame.maxPlayers; number += 1) {
      options.push(`<option value="${number}" ${number === Math.min(Math.max(previous, selectedGame.minPlayers), selectedGame.maxPlayers) ? "selected" : ""}>${number} ${number === 1 ? "игрок" : number < 5 ? "игрока" : "игроков"}</option>`);
    }
    maxPlayersSelect.innerHTML = options.join("");
    maxHint.textContent = `Для игры: от ${selectedGame.minPlayers} до ${selectedGame.maxPlayers} игроков.`;
    rulesCaption.textContent = `${selectedGame.short} — особые условия партии.`;
    ruleFields.innerHTML = renderGameRuleFields(selectedGame);
  }

  gameSelect.addEventListener("change", updatePlayerLimits);
  visibilityOptions.forEach((label) => {
    label.addEventListener("click", () => {
      visibilityOptions.forEach((option) => option.classList.toggle("is-selected", option === label));
    });
  });
  updatePlayerLimits();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = container.querySelector("#room-create-error");
    error.textContent = "";
    error.classList.remove("is-visible");
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const chosenGame = getGameById(String(data.get("gameId")));
    const name = String(data.get("name") || "").trim();
    const description = String(data.get("description") || "").trim();
    const maxPlayers = Number(data.get("maxPlayers"));
    const scheduledAt = String(data.get("scheduledAt") || "");

    if (!chosenGame) return;
    if (name.length < 3) {
      error.textContent = "Название должно содержать не менее 3 символов.";
      error.classList.add("is-visible");
      return;
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < chosenGame.minPlayers || maxPlayers > chosenGame.maxPlayers) {
      error.textContent = `Для этой игры допустимо от ${chosenGame.minPlayers} до ${chosenGame.maxPlayers} игроков.`;
      error.classList.add("is-visible");
      return;
    }
    if (scheduledAt && (Number.isNaN(new Date(scheduledAt).getTime()) || new Date(scheduledAt).getTime() < Date.now())) {
      error.textContent = "Дата встречи должна быть в будущем.";
      error.classList.add("is-visible");
      return;
    }

    const rules = {
      turnTimer: Number(data.get("turnTimer") || 0),
      observers: data.get("observers") === "yes",
      game: readGameRules(data, chosenGame)
    };

    const room = {
      gameId: chosenGame.id,
      name,
      description,
      maxPlayers,
      visibility: data.get("visibility") === "private" ? "private" : "public",
      scheduledAt,
      rules,
      hostId: user.id
    };

    try {
      await ensurePublicProfile(user);
      const roomId = await createOnlineRoom(room);
      notify("Комната создана. Добро пожаловать за стол!");
      go(`#/rooms/${encodeURIComponent(roomId)}`);
    } catch (saveError) {
      error.textContent = saveError.message || "Не удалось сохранить комнату.";
      error.classList.add("is-visible");
    }
  });
}

function readGameRules(data, game) {
  switch (game.id) {
    case "bunker":
      return {
        catastrophe: String(data.get("catastrophe") || "Случайная"),
        bunkerCapacity: Number(data.get("bunkerCapacity") || 50),
        cards: ["Профессия", "Здоровье", "Хобби", "Багаж", "Факт"]
      };
    case "mafia":
      return {
        extraRoles: data.getAll("extraRoles").map(String),
        mafiaCount: String(data.get("mafiaCount") || "auto"),
        hostMode: String(data.get("mafiaHost") || "host")
      };
    case "dnd-5e":
      return {
        characterLevel: Number(data.get("characterLevel") || 1),
        setting: String(data.get("setting") || "Forgotten Realms"),
        dmMode: String(data.get("dmMode") || "host"),
        campaign: String(data.get("campaign") || "Короткое приключение")
      };
    case "spy":
      return { spyCount: Number(data.get("spyCount") || 1), spyTimer: Number(data.get("spyTimer") || 5) };
    case "chess":
      return {
        timeControl: String(data.get("timeControl") || "Без таймера"),
        opponentMode: String(data.get("opponentMode") || "human") === "bot" ? "bot" : "human",
        botDifficulty: ["easy", "medium", "hard"].includes(String(data.get("botDifficulty") || "medium"))
          ? String(data.get("botDifficulty") || "medium") : "medium"
      };
    case "backgammon":
      return {
        timeControl: String(data.get("timeControl") || "Без таймера"),
        backgammonMode: String(data.get("backgammonMode") || "Короткие")
      };
    case "codenames":
      return { captains: String(data.get("captains") || "players") };
    default:
      return { roundFormat: String(data.get("roundFormat") || "Стандартные правила") };
  }
}

function readableRuleSettings(room) {
  const rules = room.rules || {};
  const gameRules = rules.game || {};
  const rows = [
    ["Таймер хода", rules.turnTimer ? `${rules.turnTimer} сек.` : "Без ограничений"],
    ["Наблюдатели", rules.observers ? "Разрешены" : "Запрещены"]
  ];

  const game = getGameById(room.gameId);
  if (game?.id === "bunker") {
    rows.push(["Катастрофа", gameRules.catastrophe || "Случайная"]);
    rows.push(["Мест в бункере", `${gameRules.bunkerCapacity || 50}% группы`]);
    rows.push(["Карты персонажа", (gameRules.cards || []).join(", ")]);
  } else if (game?.id === "mafia") {
    rows.push(["Число мафии", gameRules.mafiaCount === "auto" ? "Автоматически" : gameRules.mafiaCount || "Автоматически"]);
    rows.push(["Дополнительные роли", (gameRules.extraRoles || []).join(", ") || "Нет"]);
    rows.push(["Ведущий", gameRules.hostMode === "player" ? "Отдельный игрок" : "Создатель комнаты"]);
  } else if (game?.id === "dnd-5e") {
    rows.push(["Уровень персонажей", `${gameRules.characterLevel || 1} уровень`]);
    rows.push(["Сеттинг", gameRules.setting || "Forgotten Realms"]);
    rows.push(["Мастер", ({ host: "Создатель комнаты", looking: "Ищем DM", player: "Мастер выбран" })[gameRules.dmMode] || "Создатель комнаты"]);
    rows.push(["Формат", gameRules.campaign || "Короткое приключение"]);
  } else if (game?.id === "spy") {
    rows.push(["Шпионов", String(gameRules.spyCount || 1)]);
    rows.push(["Время раунда", `${gameRules.spyTimer || 5} мин.`]);
  } else if (game?.id === "chess") {
    rows.push(["Контроль времени", gameRules.timeControl || "Без таймера"]);
    const legacySoloBot = !gameRules.opponentMode && (room.members || []).length === 1;
    const opponentMode = gameRules.opponentMode || (legacySoloBot ? "bot" : "human");
    rows.push(["Соперник", opponentMode === "bot" ? "Компьютерный бот" : "Другой игрок"]);
    if (opponentMode === "bot") {
      rows.push(["Сложность бота", ({ easy: "Лёгкая", medium: "Средняя", hard: "Сложная" })[gameRules.botDifficulty] || "Средняя"]);
    }
  } else if (game?.id === "backgammon") {
    rows.push(["Контроль времени", gameRules.timeControl || "Без таймера"]);
    rows.push(["Вид нард", gameRules.backgammonMode || "Короткие"]);
  } else if (game?.id === "codenames") {
    rows.push(["Капитаны", gameRules.captains === "host" ? "Назначает ведущий" : "Выбирают игроки"]);
  } else {
    rows.push(["Формат партии", gameRules.roundFormat || "Стандартные правила"]);
  }
  return rows;
}

let roomRenderSequence = 0;
let activeChessCleanup = null;
let activeRoomChannel = null;

function stopRoomRealtime() {
  if (activeRoomChannel) supabase.removeChannel(activeRoomChannel);
  activeRoomChannel = null;
}

async function renderRoom(container, roomId, user, inviteCode = "", renderSequence = roomRenderSequence) {
  if (renderSequence === roomRenderSequence) {
    activeChessCleanup?.();
    activeChessCleanup = null;
    stopRoomRealtime();
  }
  await ensurePublicProfile(user);
  if (renderSequence !== roomRenderSequence) return;
  let room = await getOnlineRoom(roomId);
  if (renderSequence !== roomRenderSequence) return;
  if (!room && inviteCode) {
    await joinOnlineRoom(roomId, inviteCode);
    notify("Ты присоединился к приватной комнате по приглашению.");
    room = await getOnlineRoom(roomId);
  }
  if (!room) {
    container.innerHTML = `
      <section class="room-not-found page-enter">
        <span class="eyebrow">КОМНАТА НЕ НАЙДЕНА</span>
        <h1 class="display-title">Похоже, этот<br><span class="gradient-text">стол пуст.</span></h1>
        <p class="lead">Комната могла быть удалена или ссылка содержит ошибку.</p>
        <a class="room-button room-button--primary room-button--large" href="#/rooms">К списку комнат</a>
      </section>`;
    return;
  }

  const game = getGameById(room.gameId);
  if (!game) {
    container.innerHTML = `<section class="room-not-found"><h1>Игра этой комнаты не найдена</h1><a href="#/rooms">К комнатам</a></section>`;
    return;
  }
  const member = getMember(room, user.id);
  if (room.visibility === "private" && !member) {
    const validInvite = Boolean(inviteCode && room.inviteCode && inviteCode === room.inviteCode);
    const hasSpace = (room.members || []).length < room.maxPlayers;
    if (validInvite && room.status === "open" && hasSpace) {
      container.innerHTML = `
        <section class="room-not-found page-enter">
          <span class="eyebrow">ПРИГЛАШЕНИЕ В КОМАНДУ</span>
          <h1 class="display-title">Тебя ждут<br><span class="gradient-text">за игровым столом.</span></h1>
          <p class="lead">Ведущий пригласил тебя в приватную комнату «${escapeHTML(room.name)}». Игра: ${escapeHTML(game.title)}.</p>
          <button class="room-button room-button--primary room-button--large" id="room-accept-invite" type="button">Принять приглашение ↗</button>
          <a class="room-back-link" style="display:block;margin-top:18px" href="#/rooms">Не сейчас · к комнатам</a>
        </section>`;
      container.querySelector("#room-accept-invite").addEventListener("click", async () => {
        try {
          await joinOnlineRoom(room.id, inviteCode);
          notify("Ты присоединился к приватной комнате.");
          await renderRoom(container, room.id, user);
        } catch (error) {
          notify(error.message, "error");
        }
      });
      return;
    }
    container.innerHTML = `
      <section class="room-not-found page-enter">
        <span class="eyebrow">ПРИВАТНАЯ КОМНАТА</span>
        <h1 class="display-title">Вход только<br><span class="gradient-text">по приглашению.</span></h1>
        <p class="lead">${validInvite && !hasSpace ? "В комнате больше нет свободных мест." : validInvite ? "Эта комната уже не принимает игроков." : "Для входа нужна персональная ссылка-приглашение от ведущего."}</p>
        <a class="room-button room-button--primary room-button--large" href="#/rooms">К открытым комнатам</a>
      </section>`;
    return;
  }

  const host = room.host || storage.getUserById(room.hostId);
  const status = getStatus(room);
  const members = (room.members || []).map((entry) => ({
    ...entry,
    user: entry.user || storage.getUserById(entry.userId)
  })).filter((entry) => entry.user);
  const full = members.length >= room.maxPlayers;
  const isHost = room.hostId === user.id;
  const canJoin = !member && room.visibility === "public" && room.status === "open" && !full;
  const canLeave = member && !isHost;
  const chessOpponentMode = room.rules?.game?.opponentMode === "bot"
    || (!room.rules?.game?.opponentMode && members.length === 1) ? "bot" : "human";
  const canStartChess = game.id === "chess" && (chessOpponentMode === "bot" ? members.length === 1 : members.length >= 2);
  const [tone, glow] = game.palette;

  container.innerHTML = `
    <section class="room-detail-page page-enter" style="--room-tone:${tone};--room-glow:${glow}">
      <a class="room-back-link" href="#/rooms">← Все комнаты</a>
      <header class="room-detail-hero pattern-${escapeHTML(game.pattern)}">
        <div class="room-detail-hero__glow"></div>
        <div class="room-detail-hero__game">${game.emoji} <span>${escapeHTML(game.title)}</span></div>
        <div class="room-detail-hero__main">
          <div><span class="room-detail-status ${status.className}">${status.label}</span><h1>${escapeHTML(room.name)}</h1><p>${escapeHTML(room.description || "Ведущий пока не добавил описание комнаты.")}</p></div>
          <div class="room-detail-hero__icon">${game.emoji}</div>
        </div>
        <div class="room-detail-hero__tools">
          <button class="room-button room-button--guide" type="button" id="open-game-rules">📖 Правила игры</button>
          <span class="room-detail-hero__hint">Краткая памятка и подробная инструкция</span>
        </div>
        <div class="room-detail-hero__facts">
          <span>♟ ${members.length} / ${room.maxPlayers} игроков</span>
          <span>◷ ${escapeHTML(formatDate(room.scheduledAt))}</span>
          <span>${room.visibility === "private" ? "◈ Приватная" : "◎ Публичная"}</span>
          <span>КОД ${escapeHTML(room.code || room.id.slice(0, 6).toUpperCase())}</span>
        </div>
      </header>

      <div class="room-detail-grid">
        <div class="room-detail-main">
          ${game.id === "chess"
            ? (room.status === "playing" ? `<div id="room-game-mount"></div>` : "")
            : `<div id="room-game-mount"></div>`}
          <section class="room-panel">
            <div class="room-panel__heading"><div><span class="eyebrow">КОМАНДА</span><h2>Участники</h2></div><span class="room-member-count">${members.length}/${room.maxPlayers}</span></div>
            <div class="room-members">
              ${members.map((entry, index) => `
                <div class="room-member">
                  ${avatar(entry.user)}
                  <div class="room-member__identity"><strong>${escapeHTML(entry.user.username)}</strong><span>${entry.role === "host" ? "Ведущий комнаты" : "Игрок"}</span></div>
                  ${entry.role === "host" ? `<span class="room-role room-role--host">HOST ✦</span>` : `<span class="room-role">PLAYER</span>`}
                  ${isHost && entry.userId !== user.id ? `<button class="room-kick" type="button" data-kick="${escapeHTML(entry.userId)}" aria-label="Удалить ${escapeHTML(entry.user.username)}">×</button>` : ""}
                </div>`).join("")}
              ${Array.from({ length: Math.max(0, room.maxPlayers - members.length) }, (_, index) => `
                <div class="room-member room-member--empty"><span class="room-avatar room-avatar--empty">＋</span><div class="room-member__identity"><strong>Свободное место</strong><span>Ожидает игрока</span></div><span class="room-role">OPEN</span></div>`).join("")}
            </div>
            ${canJoin ? `<button class="room-button room-button--primary room-join-main" type="button" id="room-join">Присоединиться к игре ↗</button>` : ""}
            ${canLeave ? `<button class="room-button room-button--soft room-join-main" type="button" id="room-leave">Покинуть комнату</button>` : ""}
            ${!member && room.visibility === "public" && full ? `<p class="room-detail-hint">Все места заняты. Следи за комнатой — возможно, кто-то освободит место.</p>` : ""}
          </section>

          <section class="room-panel">
            <div class="room-panel__heading"><div><span class="eyebrow">ПРАВИЛА СТОЛА</span><h2>Настройки партии</h2></div><span class="room-panel__icon">⚙</span></div>
            <div class="room-rules-list">
              ${readableRuleSettings(room).map(([label, value]) => `<div class="room-rule-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("")}
            </div>
          </section>
        </div>

        <aside class="room-detail-aside">
          <section class="room-panel room-host-panel">
            <span class="eyebrow">ВЕДУЩИЙ ВСТРЕЧИ</span>
            <div class="room-host-identity">${avatar(host, "room-avatar room-avatar--host")}<div><strong>${escapeHTML(host?.username || "Неизвестный игрок")}</strong><span>Создатель комнаты</span></div></div>
            ${isHost ? `<div class="room-host-tools"><p>Ты управляешь этой комнатой.</p>${room.status === "open" && game.id === "chess" ? `<button class="room-button room-button--primary room-button--full" type="button" id="room-start" ${canStartChess ? "" : "disabled"}>Начать шахматы</button>${canStartChess ? "" : `<p class="room-detail-hint">Для игры с человеком нужен второй участник. Чтобы играть одному, выбери бота в настройках комнаты.</p>`}` : ""}${room.status === "open" && game.id !== "chess" ? `<p class="room-detail-hint">Интерактивный стол для этой игры ещё в разработке. Комната, участники и чат уже доступны.</p>` : ""}${room.status === "playing" ? `<button class="room-button room-button--primary room-button--full" type="button" id="room-finish-game">Завершить партию · вернуться в лобби</button>` : ""}${room.status !== "closed" ? `<button class="room-button room-button--soft room-button--full" type="button" id="room-close">Закрыть комнату</button>` : `<button class="room-button room-button--soft room-button--full" type="button" id="room-reopen">Вернуть в лобби</button>`}<button class="room-button room-button--danger room-button--full" type="button" id="room-delete">Удалить комнату</button></div>` : `<p class="room-detail-hint">Роль: ${member ? member.role === "host" ? "ведущий" : "игрок" : "гость"}. По вопросам встречи обратись к ведущему.</p>`}
          </section>
          <section class="room-panel room-invite-panel">
            <span class="eyebrow">ПРИГЛАСИ ДРУЗЕЙ</span>
            <h3>Собирай свою команду</h3>
            <p>Поделись ссылкой на комнату. В приватную комнату друзья смогут войти по этой ссылке-приглашению.</p>
            <button class="room-button room-button--soft room-button--full" type="button" id="room-copy-link">Скопировать ссылку ↗</button>
          </section>
        </aside>
      </div>
      <dialog class="game-rules-dialog" id="game-rules-dialog" aria-labelledby="game-rules-title">
        <div class="game-rules-dialog__head">
          <div><span class="eyebrow">ПАМЯТКА ИГРОКА</span><h2 id="game-rules-title">${escapeHTML(game.title)} — правила</h2></div>
          <button class="game-rules-dialog__close" type="button" id="close-game-rules" aria-label="Закрыть правила">×</button>
        </div>
        <div class="game-rules-tabs" role="tablist" aria-label="Формат правил">
          <button class="game-rules-tab is-active" type="button" data-rules-mode="full" role="tab" aria-selected="true">Полные правила</button>
          <button class="game-rules-tab" type="button" data-rules-mode="quick" role="tab" aria-selected="false">Объяснить новичку</button>
        </div>
        <div class="game-rules-content" id="game-rules-content">${renderGameRules(game, 'full')}</div>
        <p class="game-rules-note">Это памятка для знакомства с игрой. Если правила конкретного издания отличаются, договоритесь о них с ведущим до начала партии.</p>
      </dialog>
      <div id="room-chat-mount"></div>
    </section>`;

  const rulesDialog = container.querySelector("#game-rules-dialog");
  const rulesContent = container.querySelector("#game-rules-content");
  container.querySelector("#open-game-rules")?.addEventListener("click", () => rulesDialog?.showModal());
  container.querySelector("#close-game-rules")?.addEventListener("click", () => rulesDialog?.close());
  rulesDialog?.addEventListener("click", (event) => {
    if (event.target === rulesDialog) rulesDialog.close();
  });
  rulesDialog?.querySelectorAll("[data-rules-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.rulesMode;
      rulesDialog.querySelectorAll("[data-rules-mode]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      rulesContent.innerHTML = renderGameRules(game, mode);
    });
  });

  const chatMount = container.querySelector("#room-chat-mount");
  if (chatMount) renderRoomChat(chatMount, room, user);
  const gameMount = container.querySelector("#room-game-mount");
  if (game.id === "chess" && room.status === "playing" && gameMount) {
    const cleanup = await renderChessGame(gameMount, room, user);
    if (renderSequence !== roomRenderSequence) cleanup();
    else activeChessCleanup = cleanup;
  } else if (game.id !== "chess" && gameMount) {
    renderGameTable(gameMount, room, game, user);
  }
  if (renderSequence !== roomRenderSequence) return;

  let refreshQueued = false;
  const refreshRoom = () => {
    if (refreshQueued || renderSequence !== roomRenderSequence) return;
    refreshQueued = true;
    Promise.resolve().then(() => {
      refreshQueued = false;
      if (renderSequence === roomRenderSequence) {
        renderRoom(container, room.id, user, "", renderSequence).catch((error) => notify(error.message, "error"));
      }
    });
  };
  activeRoomChannel = supabase.channel(`club-room-view-${room.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_room_members", filter: `room_id=eq.${room.id}` }, refreshRoom)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_rooms", filter: `id=eq.${room.id}` }, refreshRoom)
    .subscribe();

  container.querySelector("#room-join")?.addEventListener("click", async () => {
    try {
      stopRoomRealtime();
      await joinOnlineRoom(room.id);
      notify("Добро пожаловать за стол!");
      renderRoom(container, room.id, user);
    } catch (error) {
      notify(error.message, "error");
    }
  });

  container.querySelector("#room-leave")?.addEventListener("click", async () => {
    try {
      stopRoomRealtime();
      await leaveOnlineRoom(room.id);
      notify("Ты покинул комнату.");
      go("#/rooms");
    } catch (error) { notify(error.message, "error"); }
  });

  container.querySelector("#room-start")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const started = await runRoomAction(button, async () => {
      stopRoomRealtime();
      await startOnlineChessGame(room);
      await renderRoom(container, room.id, user, "", renderSequence);
    }, "Шахматная партия создана.");
    if (!started && button.isConnected) button.focus();
  });

  container.querySelector("#room-finish-game")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await confirmAndRunRoomAction(button, {
      title: "Завершить партию?",
      message: "Игра закончится, а комната вернётся в лобби. Участники и чат останутся на месте.",
      confirmLabel: "Завершить партию"
    }, async () => {
      stopRoomRealtime();
      await setOnlineRoomStatus(room.id, "open");
      await renderRoom(container, room.id, user, "", renderSequence);
    }, "Партия завершена. Комната снова в лобби.", renderSequence);
  });

  container.querySelector("#room-close")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await confirmAndRunRoomAction(button, {
      title: "Закрыть комнату?",
      message: "Комната станет недоступна для новых игроков. Ты сможешь вернуть её в лобби или удалить позже.",
      confirmLabel: "Закрыть комнату",
      danger: false
    }, async () => {
      stopRoomRealtime();
      await setOnlineRoomStatus(room.id, "closed");
      await renderRoom(container, room.id, user, "", renderSequence);
    }, "Комната завершена.", renderSequence);
  });

  container.querySelector("#room-reopen")?.addEventListener("click", async (event) => {
    await runRoomAction(event.currentTarget, async () => {
      await setOnlineRoomStatus(room.id, "open");
      await renderRoom(container, room.id, user);
    }, "Комната снова открыта.");
  });

  container.querySelector("#room-delete")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await confirmAndRunRoomAction(button, {
      title: "Удалить комнату?",
      message: "Комната, список участников и её сообщения будут удалены без возможности восстановления.",
      confirmLabel: "Удалить комнату",
      danger: true
    }, async () => {
      stopRoomRealtime();
      await deleteOnlineRoom(room.id);
      go("#/rooms");
    }, "Комната удалена.", renderSequence);
  });

  container.querySelectorAll("[data-kick]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        stopRoomRealtime();
        await removeOnlineRoomMember(room.id, button.dataset.kick);
        notify("Игрок удалён из комнаты.");
        await renderRoom(container, room.id, user);
      } catch (error) { notify(error.message, "error"); }
    });
  });

  container.querySelector("#room-copy-link")?.addEventListener("click", async () => {
    const link = getRoomUrl(room);
    try {
      await navigator.clipboard.writeText(link);
      notify("Ссылка скопирована.");
    } catch {
      window.prompt("Скопируй ссылку на комнату:", link);
    }
  });
}

export function renderRooms(container, route = "/rooms") {
  const renderSequence = ++roomRenderSequence;
  activeChessCleanup?.();
  activeChessCleanup = null;
  stopRoomRealtime();
  const cleanup = () => {
    if (renderSequence === roomRenderSequence) roomRenderSequence += 1;
    activeChessCleanup?.();
    activeChessCleanup = null;
    stopRoomRealtime();
  };
  ensureStyles();
  const user = getCurrentUser();
  if (!user) {
    location.hash = `#/login?next=${encodeURIComponent(route)}`;
    return cleanup;
  }

  const [path, query = ""] = route.split("?");
  if (path === "/rooms" || path === "/rooms/") {
    renderList(container, user, renderSequence).catch((error) => { if (renderSequence === roomRenderSequence) container.innerHTML = "<p>Не удалось загрузить комнаты: " + escapeHTML(error.message) + "</p>"; });
    return cleanup;
  }
  if (path === "/rooms/new") {
    const params = new URLSearchParams(query);
    renderCreate(container, user, params.get("game") || "");
    return cleanup;
  }

  const roomId = decodeURIComponent(path.slice("/rooms/".length));
  if (!roomId || roomId === "new") {
    renderList(container, user, renderSequence);
    return cleanup;
  }
  const params = new URLSearchParams(query);
  renderRoom(container, roomId, user, params.get("invite") || "", renderSequence).catch((error) => { container.innerHTML = "<p>Не удалось открыть комнату: " + escapeHTML(error.message) + "</p>"; });
  return cleanup;
}
