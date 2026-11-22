import { supabase } from "./supabase.js";

function ensureMafiaStyles() {
  if (document.getElementById("mafia-game-styles")) return;
  const link = document.createElement("link");
  link.id = "mafia-game-styles";
  link.rel = "stylesheet";
  link.href = "./css/mafia-game.css";
  document.head.append(link);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
async function invokeMafia(body) {
  const { data, error } = await supabase.functions.invoke("mafia-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с сервером Мафии.";
    try { const payload = await error.context?.json?.(); if (payload?.error) message = payload.error; } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}
export async function startOnlineMafiaGame(room) {
  return invokeMafia({ action: "start", room_id: room.id });
}
export function renderMafiaGame(container, room, user) {
  ensureMafiaStyles();
  let state = null;
  let privateState = {};
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Город готовится к ночи…";

  const playerName = (id) => (room.members || []).find((entry) => entry.userId === id)?.user?.username || "Игрок";
  const roleNames = { mafia: "Мафия", doctor: "Доктор", detective: "Детектив", civilian: "Мирный житель" };
  const roleDescriptions = {
    mafia: "Ночью выбирай цель вместе с командой. Днём скрывай свою роль.",
    doctor: "Каждую ночь выбирай одного живого игрока, которого хочешь спасти.",
    detective: "Каждую ночь проверяй одного живого игрока и узнавай, состоит ли он в мафии.",
    civilian: "Обсуждай события и помогай городу найти мафию на дневном голосовании."
  };
  const actionButton = (label, target, action, disabled = false) =>
    '<button class="mafia-target" type="button" data-mafia-action="' + action + '" data-mafia-target="' + escapeHTML(target.id) + '" ' + (disabled || busy ? "disabled" : "") + '><span>' + escapeHTML(playerName(target.id)) + '</span><small>' + (target.revealedRole ? escapeHTML(roleNames[target.revealedRole]) : "ЖИВ") + '</small></button>';

  const render = () => {
    if (disposed) return;
    if (!state) {
      container.innerHTML = '<section class="mafia-game mafia-game--loading"><span>GAMECLUB · NIGHTFALL</span><h2>Город засыпает</h2><p>' + escapeHTML(notice) + '</p></section>';
      return;
    }
    const me = state.players.find((player) => player.id === user.id);
    const role = privateState.role || "civilian";
    const alive = Boolean(me?.alive);
    const isFinished = state.status === "finished";
    const living = state.players.filter((player) => player.alive);
    const teamMates = (privateState.mafiaTeammates || []).map(playerName).join(", ");
    const phaseNames = {
      night_mafia: "Мафия выбирает жертву",
      night_doctor: "Доктор спасает город",
      night_detective: "Детектив ведёт расследование",
      day: "Город просыпается",
      vote: "Дневное голосование",
      finished: "Партия завершена"
    };
    const roleCard = '<div class="mafia-role-card mafia-role-card--' + role + '"><span>ТВОЯ РОЛЬ</span><strong>' + escapeHTML(roleNames[role]) + '</strong><p>' + escapeHTML(roleDescriptions[role]) + '</p>' + (role === "mafia" ? '<small>СОЮЗНИКИ: ' + escapeHTML(teamMates || "ты один") + '</small>' : "") + '</div>';
    const roster = state.players.map((player) => {
      const isYou = player.id === user.id;
      const roleLabel = player.alive ? "В игре" : (player.revealedRole ? roleNames[player.revealedRole] : "Выбыл");
      return '<div class="mafia-player ' + (player.alive ? "is-alive" : "is-dead") + (isYou ? " is-you" : "") + '"><span class="mafia-player__status"></span><strong>' + escapeHTML(playerName(player.id)) + (isYou ? " · ты" : "") + '</strong><small>' + escapeHTML(roleLabel) + '</small></div>';
    }).join("");

    let phasePanel = "";
    if (isFinished) {
      phasePanel = '<div class="mafia-phase-result"><span>✦</span><strong>' + (state.winner === "town" ? "Победили мирные жители" : "Победила мафия") + '</strong><p>' + escapeHTML(state.lastEvent?.detail || "") + '</p></div>';
    } else if (!alive) {
      phasePanel = '<div class="mafia-wait-panel"><strong>Ты выбыл из игры</strong><p>Наблюдай за партией. Твоя роль раскрыта, но секреты оставшихся игроков сохраняются.</p></div>';
    } else if (state.phase === "night_mafia") {
      phasePanel = role === "mafia"
        ? '<div class="mafia-phase-copy"><span>НОЧЬ · МАФИЯ</span><h3>Выбери цель</h3><p>Команда согласует, кого устранить. Твой голос скрыт до завершения выбора.</p></div><div class="mafia-targets">' + living.filter((p) => state.players.find((x) => x.id === p.id)?.revealedRole !== "mafia" && p.id !== user.id && state.players.find((x) => x.id === p.id)?.id && privateState.role === "mafia" && state.players.find((x) => x.id === p.id)?.alive && state.players.find((x) => x.id === p.id)?.id && state.players.find((x) => x.id === p.id)?.id !== user.id && state.players.find((x) => x.id === p.id)?.revealedRole !== "mafia" && state.players.find((x) => x.id === p.id)?.id).map((p) => actionButton("Выбрать", p, "mafia_vote", Boolean(privateState.hasMafiaVoted))).join("") + '</div><p class="mafia-notice">' + (privateState.hasMafiaVoted ? "Твой голос принят. Ждём остальных участников мафии." : "Голосов мафии: " + state.mafiaVotesCount + " / " + state.mafiaCount) + '</p>'
        : '<div class="mafia-wait-panel"><strong>Город спит</strong><p>Мафия совещается. Не раскрывай свою роль.</p></div>';
    } else if (state.phase === "night_doctor") {
      phasePanel = role === "doctor"
        ? '<div class="mafia-phase-copy"><span>НОЧЬ · ДОКТОР</span><h3>Кого спасти?</h3><p>Выбери любого живого игрока. Можно спасти и себя.</p></div><div class="mafia-targets">' + living.map((p) => actionButton("Спасти", p, "doctor_save")).join("") + '</div>'
        : '<div class="mafia-wait-panel"><strong>Доктор проснулся</strong><p>Город ждёт, кого доктор решит защитить.</p></div>';
    } else if (state.phase === "night_detective") {
      phasePanel = role === "detective"
        ? '<div class="mafia-phase-copy"><span>НОЧЬ · ДЕТЕКТИВ</span><h3>Кого проверить?</h3><p>Узнай, состоит ли выбранный игрок в мафии. Результат увидишь только ты.</p></div><div class="mafia-targets">' + living.filter((p) => p.id !== user.id).map((p) => actionButton("Проверить", p, "detective_inspect")).join("") + '</div>' + (privateState.inspection ? '<p class="mafia-inspection">Последняя проверка: <b>' + escapeHTML(playerName(privateState.inspection.targetId)) + '</b> — ' + (privateState.inspection.isMafia ? "МАФИЯ" : "не мафия") + '</p>' : "")
        : '<div class="mafia-wait-panel"><strong>Детектив расследует</strong><p>Результат расследования известен только детективу.</p></div>';
    } else if (state.phase === "day") {
      phasePanel = '<div class="mafia-phase-copy"><span>ДЕНЬ · ОБСУЖДЕНИЕ</span><h3>Кого подозревает город?</h3><p>Обсудите ночные события в чате комнаты, затем откройте голосование.</p></div><button class="mafia-primary-action" type="button" data-mafia-action="start_vote" ' + (busy ? "disabled" : "") + '>Начать голосование</button>';
    } else if (state.phase === "vote") {
      phasePanel = '<div class="mafia-phase-copy"><span>ДЕНЬ · ГОЛОСОВАНИЕ</span><h3>Выбери подозреваемого</h3><p>Каждый живой игрок может отдать один голос. Результат откроется после всех голосов.</p></div><div class="mafia-targets">' + living.filter((p) => p.id !== user.id).map((p) => actionButton("Голосовать", p, "vote", Boolean(privateState.hasVoted))).join("") + '</div><p class="mafia-notice">' + (privateState.hasVoted ? "Твой голос принят." : "Проголосовало: " + state.votesCount + " / " + state.aliveCount) + '</p>';
    }

    const nightResult = state.lastNightResult
      ? state.lastNightResult.eliminatedId
        ? '<div class="mafia-night-result">Ночью выбыл <b>' + escapeHTML(playerName(state.lastNightResult.eliminatedId)) + '</b>. Роль раскрыта.'
        : state.lastNightResult.protected ? '<div class="mafia-night-result">Доктор спас цель мафии. Никто не выбыл.' : '<div class="mafia-night-result">Ночью никто не выбыл.'
      : "";
    container.innerHTML = '<section class="mafia-game" aria-label="Игровой стол Мафия">' +
      '<header class="mafia-header"><div><span class="mafia-eyebrow">GAMECLUB · NIGHTFALL</span><h2>Мафия <i>／</i> Город не спит</h2><p>Тайные роли, ночные решения и дневное расследование.</p></div><span class="mafia-live"><i></i>' + (isFinished ? "ИГРА ЗАВЕРШЕНА" : "РАУНД " + state.round) + '</span></header>' +
      '<div class="mafia-status"><div><span>ФАЗА</span><strong>' + escapeHTML(phaseNames[state.phase]) + '</strong></div><div><span>ЖИТЕЛЕЙ</span><strong>' + state.aliveCount + ' / ' + state.players.length + '</strong></div><div><span>МАФИИ ОСТАЛОСЬ</span><strong>' + state.mafiaCount + '</strong></div></div>' +
      '<div class="mafia-main"><div class="mafia-board"><div class="mafia-board-head"><span class="mafia-eyebrow">ГОРОДСКОЙ СПИСОК</span><h3>Кто ещё в игре?</h3></div><div class="mafia-roster">' + roster + '</div>' + nightResult + '</div>' +
      '<aside class="mafia-sidebar">' + roleCard + '<section class="mafia-panel"><span class="mafia-eyebrow">ХОД ПАРТИИ</span>' + phasePanel + '<p class="mafia-notice" role="status">' + escapeHTML(notice) + '</p></section></aside></div>' +
      '<footer class="mafia-event">' + escapeHTML(state.lastEvent?.detail || "Партия готова.") + '</footer></section>';
  };

  const loadState = async () => {
    try {
      const data = await invokeMafia({ action: "state", room_id: room.id });
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
  const sendAction = async (action) => {
    if (busy || disposed || !state) return;
    busy = true;
    notice = "Сервер проверяет действие…";
    render();
    try {
      const data = await invokeMafia({ ...action, room_id: room.id, revision });
      if (disposed) return;
      if (Number(data.revision) >= revision) {
        state = data.state;
        privateState = data.privateState || {};
        revision = Number(data.revision);
      }
      notice = "Действие сохранено.";
    } catch (error) {
      notice = error.message;
      if (error.status === 409) await loadState();
    } finally {
      busy = false;
      if (!disposed) render();
    }
  };
  const handleClick = async (event) => {
    const button = event.target.closest("[data-mafia-action]");
    if (!button || !container.contains(button)) return;
    const action = button.dataset.mafiaAction;
    if (action === "start_vote") await sendAction({ action });
    else await sendAction({ action, target_id: button.dataset.mafiaTarget });
  };
  container.addEventListener("click", handleClick);
  channel = supabase.channel("mafia-session-" + room.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_room_game_sessions", filter: "room_id=eq." + room.id }, loadState)
    .subscribe();
  loadState();
  return () => {
    disposed = true;
    container.removeEventListener("click", handleClick);
    if (channel) supabase.removeChannel(channel);
  };
}
