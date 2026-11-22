import { supabase } from "./supabase.js";

function ensureDndStyles() {
  if (document.getElementById("dnd-game-styles")) return;
  const link = document.createElement("link");
  link.id = "dnd-game-styles";
  link.rel = "stylesheet";
  link.href = "./css/dnd-game.css";
  document.head.append(link);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
async function invokeDnd(body) {
  const { data, error } = await supabase.functions.invoke("dnd-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с кампанией.";
    try { const payload = await error.context?.json?.(); if (payload?.error) message = payload.error; } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}
export async function startOnlineDndGame(room) {
  return invokeDnd({ action: "start", room_id: room.id });
}
export function renderDndGame(container, room, user) {
  ensureDndStyles();
  let state = null;
  let privateState = {};
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Загружаем кампанию…";
  const isHost = () => state?.hostId === user.id;
  const nameFor = (id) => (room.members || []).find((entry) => entry.userId === id)?.user?.username || "Игрок";
  const sendAction = async (action) => {
    if (busy || disposed || !state) return;
    busy = true;
    notice = "Сохраняем действие…";
    render();
    try {
      const data = await invokeDnd({ ...action, room_id: room.id, revision });
      if (disposed) return;
      if (Number(data.revision) >= revision) {
        state = data.state;
        privateState = data.privateState || {};
        revision = Number(data.revision);
      }
      notice = "Сохранено.";
    } catch (error) {
      notice = error.message;
      if (error.status === 409) await loadState();
    } finally {
      busy = false;
      if (!disposed) render();
    }
  };
  const render = () => {
    if (disposed) return;
    if (!state) {
      container.innerHTML = '<section class="dnd-game dnd-game--loading"><span>GAMECLUB · THE ADVENTURERS’ GUILD</span><h2>Подготавливаем кампанию</h2><p>' + escapeHTML(notice) + '</p></section>';
      return;
    }
    const characters = Object.values(state.characters || {});
    const npcs = Object.values(state.npcs || {});
    const combatantCards = [...characters, ...npcs];
    const myCharacter = characters.find((character) => character.ownerId === user.id);
    const isDM = isHost();
    const currentTurn = state.turnOrder?.[state.currentTurnIndex];
    const characterCards = characters.map((character) => {
      const ownerName = nameFor(character.ownerId);
      const isCurrent = currentTurn === character.id;
      const isMine = character.ownerId === user.id;
      const controls = isDM
        ? '<form class="dnd-hp-form" data-dnd-hp data-target="' + escapeHTML(character.id) + '"><input name="amount" type="number" min="1" max="10000" value="5" aria-label="Количество HP"><button name="kind" value="damage" type="submit">− Урон</button><button name="kind" value="heal" type="submit">＋ Лечение</button></form>'
        : "";
      return '<article class="dnd-character ' + (isCurrent ? "is-current" : "") + (isMine ? " is-mine" : "") + '"><header><span>' + escapeHTML(character.ancestry) + ' · ' + escapeHTML(character.className) + '</span><b>Ур. ' + character.level + '</b></header><h3>' + escapeHTML(character.name) + '</h3><p class="dnd-character__owner">' + escapeHTML(ownerName) + (isMine ? " · ты" : "") + '</p><div class="dnd-character__stats"><span><b>' + character.hp + '/' + character.maxHp + '</b> HP</span><span><b>' + character.ac + '</b> КД</span><span><b>' + character.speed + '</b> фт.</span></div><div class="dnd-character__hp"><i style="width:' + Math.max(0, Math.min(100, character.hp / character.maxHp * 100)) + '%"></i></div><div class="dnd-character__meta"><span>Инициатива +' + character.initiativeBonus + '</span><span>Кости здоровья ' + character.hitDiceRemaining + '/' + character.level + '</span></div><div class="dnd-conditions">' + (character.conditions || []).map((item) => '<span>' + escapeHTML(item) + '</span>').join("") + (character.inspiration ? '<span class="is-inspiration">Вдохновение</span>' : "") + '</div>' + (isMine ? '<div class="dnd-character__rests"><button type="button" data-dnd-rest="long">Долгий отдых</button><button type="button" data-dnd-rest="short">Короткий отдых</button></div>' : "") + controls + '</article>';
    }).join("");
    const npcCards = npcs.map((npc) => '<article class="dnd-npc"><span>ПРОТИВНИК</span><strong>' + escapeHTML(npc.name) + '</strong><small>' + npc.hp + '/' + npc.maxHp + ' HP · КД ' + npc.ac + '</small>' + (isDM ? '<form class="dnd-hp-form" data-dnd-hp data-target="' + escapeHTML(npc.id) + '"><input name="amount" type="number" min="1" max="10000" value="5"><button name="kind" value="damage" type="submit">− Урон</button><button name="kind" value="heal" type="submit">＋ Лечение</button></form>' : "") + '</article>').join("");
    const initiative = (state.turnOrder || []).map((id, index) => {
      const item = state.characters[id] || state.npcs[id];
      if (!item) return "";
      return '<div class="dnd-initiative-item ' + (id === currentTurn ? "is-active" : "") + '"><b>' + (index + 1) + '</b><span>' + escapeHTML(item.name) + '</span><strong>' + state.initiative[id] + '</strong></div>';
    }).join("");
    const journal = (state.journal || []).map((entry) => '<article class="dnd-journal-entry"><span>' + escapeHTML(nameFor(entry.authorId)) + '</span><p>' + escapeHTML(entry.text) + '</p></article>').join("");
    const events = (state.events || []).slice(0, 14).map((event) => '<div class="dnd-event"><span>' + escapeHTML(event.type) + '</span><p>' + escapeHTML(event.text) + '</p></div>').join("");
    const dmControls = isDM
      ? '<section class="dnd-panel"><span class="dnd-eyebrow">ИНСТРУМЕНТЫ МАСТЕРА</span><div class="dnd-dm-actions">' + (state.status === "finished" ? '<p>Кампания завершена. Верни комнату в лобби, чтобы создать новую.</p>' : state.combatActive
        ? '<button type="button" data-dnd-action="next_turn" ' + (busy ? "disabled" : "") + '>Следующий ход →</button><button type="button" data-dnd-action="end_combat" ' + (busy ? "disabled" : "") + '>Завершить бой</button>'
        : '<button type="button" data-dnd-action="start_combat" ' + (busy ? "disabled" : "") + '>Начать бой ⚔</button>') + (state.status === "active" ? '<button type="button" data-dnd-action="end_campaign" ' + (busy ? "disabled" : "") + '>Завершить кампанию</button>' : "") + '</div><form class="dnd-inline-form" data-dnd-npc><input name="name" placeholder="Имя противника" required maxlength="40"><input name="max_hp" type="number" min="1" max="10000" placeholder="HP" value="12" required><input name="ac" type="number" min="1" max="40" placeholder="КД" value="13" required><input name="initiative_bonus" type="number" min="-5" max="20" placeholder="Инициатива" value="1" required><button type="submit">＋ Добавить NPC</button></form><form class="dnd-inline-form" data-dnd-journal><input name="text" placeholder="Запись в общий журнал…" maxlength="1000" required><button type="submit">В журнал</button></form><form class="dnd-inline-form" data-dnd-dm-note><input name="text" placeholder="Секретная заметка мастера…" maxlength="1000" required><button type="submit">Сохранить тайно</button></form><div class="dnd-private-notes">' + (privateState.dmNotes || []).map((item) => '<p>' + escapeHTML(item) + '</p>').join("") + '</div></section>'
      : "";
    const characterForm = myCharacter ? '<div class="dnd-owned-character"><span>ТВОЙ ПЕРСОНАЖ</span><strong>' + escapeHTML(myCharacter.name) + '</strong><small>Лист персонажа уже создан. Можно бросать кубы и отдыхать.</small></div>' : '<form class="dnd-create-character" data-dnd-character><span class="dnd-eyebrow">СОЗДАТЬ ПЕРСОНАЖА</span><div class="dnd-form-grid"><input name="name" placeholder="Имя героя" maxlength="32" required><input name="ancestry" placeholder="Народ / происхождение" maxlength="32" required><select name="class_name"><option value="fighter">Воин · d10</option><option value="barbarian">Варвар · d12</option><option value="paladin">Паладин · d10</option><option value="ranger">Следопыт · d10</option><option value="bard">Бард · d8</option><option value="cleric">Жрец · d8</option><option value="druid">Друид · d8</option><option value="monk">Монах · d8</option><option value="rogue">Плут · d8</option><option value="warlock">Колдун · d8</option><option value="sorcerer">Чародей · d6</option><option value="wizard">Волшебник · d6</option></select><input name="level" type="number" min="1" max="20" value="1" required><input name="max_hp" type="number" min="1" max="500" value="12" required><input name="ac" type="number" min="1" max="40" value="14" required><input name="initiative_bonus" type="number" min="-5" max="20" value="2" required><input name="speed" type="number" min="0" max="120" value="30" required><input name="con_modifier" type="number" min="-5" max="10" value="1" required></div><button type="submit" ' + (busy ? "disabled" : "") + '>Создать лист героя ↗</button></form>';
    const dmNote = isDM ? "" : "";
    container.innerHTML = '<section class="dnd-game" aria-label="Игровая кампания Dungeons and Dragons"><header class="dnd-header"><div><span class="dnd-eyebrow">GAMECLUB · THE ADVENTURERS’ GUILD</span><h2>Dungeons & Dragons <i>／</i> Кампания</h2><p>Листы героев, броски кубов, инициатива, бой и хроника приключения.</p></div><span class="dnd-campaign-status"><i></i>' + (state.status === "finished" ? "КАМПАНИЯ ЗАВЕРШЕНА" : state.combatActive ? "БОЙ · РАУНД " + state.round : "КАМПАНИЯ АКТИВНА") + '</span></header>' +
      '<div class="dnd-top-grid"><section class="dnd-panel dnd-dice-panel"><span class="dnd-eyebrow">АРСЕНАЛ КУБОВ</span><h3>Бросок судьбы</h3><form data-dnd-roll class="dnd-roll-form"><input name="label" placeholder="Проверка / атака / спасбросок" value="Проверка"><select name="notation"><option>d20</option><option>2d20</option><option>d20+5</option><option>2d6+3</option><option>4d8-2</option><option>d100</option><option>d12</option><option>d10</option><option>d8</option><option>d6</option><option>d4</option></select><button type="submit" ' + (busy ? "disabled" : "") + '>Бросить 🎲</button></form><p>Поддерживаются d4, d6, d8, d10, d12, d20 и d100 · до 20 кубов.</p></section>' + characterForm + '</div>' +
      '<div class="dnd-layout"><main class="dnd-main"><section class="dnd-section"><div class="dnd-section-head"><div><span class="dnd-eyebrow">ПЕРСОНАЖИ</span><h3>Герои кампании</h3></div><span>' + characters.length + ' героев</span></div><div class="dnd-character-grid">' + characterCards + '</div><div class="dnd-character-grid dnd-character-grid--npcs">' + npcCards + '</div></section>' +
      '<section class="dnd-panel dnd-initiative"><div class="dnd-section-head"><div><span class="dnd-eyebrow">БОЕВОЙ ТРЕКЕР</span><h3>Порядок инициативы</h3></div><span>' + (state.combatActive ? "РАУНД " + state.round : "НЕ АКТИВЕН") + '</span></div>' + (initiative || '<p class="dnd-empty">Начни бой, чтобы бросить инициативу всем участникам.</p>') + '</section>' +
      '<section class="dnd-panel dnd-journal"><span class="dnd-eyebrow">ХРОНИКА</span><h3>Журнал приключения</h3>' + (journal || '<p class="dnd-empty">Мастер ещё не добавил записи.</p>') + '</section></main>' +
      '<aside class="dnd-sidebar">' + dmControls + '<section class="dnd-panel dnd-private-panel"><span class="dnd-eyebrow">ЛИЧНЫЕ ЗАМЕТКИ</span><form data-dnd-private-note><input name="text" placeholder="Твоя секретная заметка…" maxlength="500" required><button type="submit">Сохранить</button></form>' + (privateState.notes || []).map((item) => '<p>' + escapeHTML(item) + '</p>').join("") + '</section><section class="dnd-panel dnd-events"><span class="dnd-eyebrow">ЛЕНТА СОБЫТИЙ</span><h3>Что произошло</h3>' + (events || '<p class="dnd-empty">Событий пока нет.</p>') + '</section></aside></div><p class="dnd-notice" role="status">' + escapeHTML(notice) + '</p></section>';
  };

  const loadState = async () => {
    try {
      const data = await invokeDnd({ action: "state", room_id: room.id });
      if (disposed || Number(data.revision) < revision) return;
      state = data.state;
      privateState = data.privateState || {};
      revision = Number(data.revision);
      notice = "";
      render();
    } catch (error) {
      if (disposed) return;
      notice = error.message;
      render();
    }
  };
  const handleSubmit = async (event) => {
    const form = event.target.closest("form");
    if (!form || !container.contains(form)) return;
    event.preventDefault();
    const values = new FormData(form);
    if (form.matches("[data-dnd-character]")) {
      const className = String(values.get("class_name"));
      const hitDie = ({ barbarian:12,fighter:10,paladin:10,ranger:10,bard:8,cleric:8,druid:8,monk:8,rogue:8,warlock:8,sorcerer:6,wizard:6 })[className];
      await sendAction({ action:"create_character", name:values.get("name"), ancestry:values.get("ancestry"), class_name:className, level:Number(values.get("level")), max_hp:Number(values.get("max_hp")), ac:Number(values.get("ac")), initiative_bonus:Number(values.get("initiative_bonus")), speed:Number(values.get("speed")), hit_die:hitDie, con_modifier:Number(values.get("con_modifier")) });
    } else if (form.matches("[data-dnd-roll]")) {
      await sendAction({ action:"roll", notation:values.get("notation"), label:values.get("label") });
    } else if (form.matches("[data-dnd-npc]")) {
      await sendAction({ action:"add_npc", name:values.get("name"), max_hp:Number(values.get("max_hp")), ac:Number(values.get("ac")), initiative_bonus:Number(values.get("initiative_bonus")) });
    } else if (form.matches("[data-dnd-journal]")) {
      await sendAction({ action:"journal", text:values.get("text") });
    } else if (form.matches("[data-dnd-dm-note]")) {
      await sendAction({ action:"dm_note", text:values.get("text") });
    } else if (form.matches("[data-dnd-private-note]")) {
      await sendAction({ action:"private_note", text:values.get("text") });
    } else if (form.matches("[data-dnd-hp]")) {
      const kind = event.submitter?.value || "damage";
      await sendAction({ action:kind, target_id:form.dataset.target, amount:Number(values.get("amount")) });
    }
  };
  const handleClick = async (event) => {
    const rest = event.target.closest("[data-dnd-rest]");
    if (rest && container.contains(rest)) {
      if (rest.dataset.dndRest === "long") await sendAction({ action:"rest", kind:"long" });
      else {
        const spent = Number(prompt("Сколько костей здоровья потратить?", "1") || 0);
        if (spent > 0) await sendAction({ action:"rest", kind:"short", hit_dice_spent:spent });
      }
      return;
    }
    const action = event.target.closest("[data-dnd-action]");
    if (action && container.contains(action)) await sendAction({ action:action.dataset.dndAction });
  };
  container.addEventListener("submit", handleSubmit);
  container.addEventListener("click", handleClick);
  channel = supabase.channel("dnd-session-" + room.id)
    .on("postgres_changes", { event:"*", schema:"public", table:"club_room_game_sessions", filter:"room_id=eq." + room.id }, loadState)
    .subscribe();
  loadState();
  return () => {
    disposed = true;
    container.removeEventListener("submit", handleSubmit);
    container.removeEventListener("click", handleClick);
    if (channel) supabase.removeChannel(channel);
  };
}
