import { supabase } from "./supabase.js";

function ensureCodenamesStyles() {
  if (document.getElementById("codenames-game-styles")) return;
  const link = document.createElement("link");
  link.id = "codenames-game-styles";
  link.rel = "stylesheet";
  link.href = "./css/codenames-game.css";
  document.head.append(link);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
async function invokeCodenames(body) {
  const { data, error } = await supabase.functions.invoke("codenames-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с сервером.";
    try { const payload = await error.context?.json?.(); if (payload?.error) message = payload.error; } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}
export async function startOnlineCodenamesGame(room) {
  return invokeCodenames({ action: "start", room_id: room.id });
}
export function renderCodenamesGame(container, room, user) {
  ensureCodenamesStyles();
  let state = null;
  let privateState = {};
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Загружаем игровое поле…";

  const render = () => {
    if (disposed) return;
    if (!state) {
      container.innerHTML = '<section class="codenames-game codenames-game--loading"><span>GAMECLUB · WORDS & WITS</span><h2>Собираем игровое поле</h2><p>' + escapeHTML(notice) + '</p></section>';
      return;
    }
    const players = state.players || [];
    const me = players.find((player) => player.id === user.id);
    const isCaptain = Boolean(me?.isCaptain);
    const myTeam = me?.team;
    const isMyTeamTurn = myTeam === state.currentTeam && state.status === "active";
    const hasOperatives = players.some((player) => player.team === myTeam && !player.isCaptain);
    const canCaptainGuess = isCaptain && !hasOperatives;
    const canGiveClue = isCaptain && isMyTeamTurn && state.phase === "clue";
    const canGuess = isMyTeamTurn && state.phase === "guess" && (!isCaptain || canCaptainGuess);
    const key = Array.isArray(privateState.key) ? privateState.key : [];
    const teamName = (team) => team === "red" ? "Красные" : "Синие";
    const teamClass = (team) => team === "red" ? "red" : "blue";
    const wordCards = (state.words || []).map((word, index) => {
      const visibleTeam = word.revealed ? word.team : (isCaptain ? key[index] : null);
      const classes = ["codenames-word", word.revealed ? "is-revealed" : "", visibleTeam ? "codenames-word--" + visibleTeam : "", !word.revealed && visibleTeam && isCaptain ? "is-key-visible" : ""].filter(Boolean).join(" ");
      const disabled = word.revealed || !canGuess || busy || state.status !== "active";
      return '<button class="' + classes + '" type="button" data-codenames-word="' + escapeHTML(word.id) + '" ' + (disabled ? "disabled" : "") + '><span>' + escapeHTML(word.word) + '</span>' + (word.revealed ? '<i>ОТКРЫТО</i>' : (isCaptain && visibleTeam ? '<i>КЛЮЧ</i>' : "")) + '</button>';
    }).join("");
    const myCaptainName = (team) => {
      const id = state.captains?.[team];
      return (room.members || []).find((entry) => entry.userId === id)?.user?.username || "Капитан";
    };
    const playersList = players.map((player) => {
      const member = (room.members || []).find((entry) => entry.userId === player.id);
      const name = member?.user?.username || "Игрок";
      return '<div class="codenames-player codenames-player--' + teamClass(player.team) + (player.id === user.id ? " is-you" : "") + '"><span class="codenames-player__dot"></span><strong>' + escapeHTML(name) + '</strong><small>' + (player.isCaptain ? "КАПИТАН" : "ОПЕРАТИВНИК") + '</small></div>';
    }).join("");
    const status = state.status === "finished"
      ? "Победили " + teamName(state.winnerTeam)
      : state.phase === "clue" ? "Капитан команды " + teamName(state.currentTeam) + " готовит подсказку" : "Команда " + teamName(state.currentTeam) + " ищет агентов";
    const cluePanel = canGiveClue
      ? '<form class="codenames-clue-form" data-codenames-clue><label>ТВОЯ ПОДСКАЗКА<input name="text" maxlength="32" placeholder="Например: Космос" required autocomplete="off"></label><label>ЧИСЛО<input name="count" type="number" min="1" max="9" value="2" required></label><button type="submit" ' + (busy ? "disabled" : "") + '>Дать подсказку ↗</button></form>'
      : state.phase === "guess" && isMyTeamTurn
        ? '<div class="codenames-clue-current"><span>ПОДСКАЗКА КАПИТАНА</span><strong>' + escapeHTML(state.clue?.text || "—") + '</strong><b>' + escapeHTML(state.clue?.count ?? "") + '</b><small>Найдено за ход: ' + state.guessesThisTurn + '</small></div>'
        : '<div class="codenames-clue-wait"><span>' + (state.phase === "clue" ? "ОЖИДАЕМ КАПИТАНА" : "ОЖИДАЕМ СВОЮ КОМАНДУ") + '</span><strong>' + escapeHTML(state.clue ? state.clue.text + " · " + state.clue.count : "Подсказка появится здесь") + '</strong></div>';
    const actionControls = canGuess
      ? '<button class="codenames-end-turn" type="button" data-codenames-action="end_turn" ' + (busy ? "disabled" : "") + '>Закончить угадывание</button>'
      : "";
    const winner = state.status === "finished"
      ? '<div class="codenames-winner codenames-winner--' + teamClass(state.winnerTeam) + '"><span>✦</span><strong>Победили ' + teamName(state.winnerTeam) + '!</strong><small>' + (state.lastAction?.detail || "Партия завершена") + '</small></div>'
      : "";
    container.innerHTML = '<section class="codenames-game" aria-label="Игровое поле Кодовые имена">' +
      '<header class="codenames-header"><div><span class="codenames-eyebrow">GAMECLUB · WORDS & WITS</span><h2>Кодовые имена <i>／</i> Codenames</h2><p>Найдите своих агентов по ассоциациям капитана. Остерегайтесь убийцы.</p></div><span class="codenames-live"><i></i>' + (state.status === "active" ? "ПАРТИЯ В ЭФИРЕ" : "ПАРТИЯ ЗАВЕРШЕНА") + '</span></header>' +
      '<div class="codenames-scoreboard"><div class="codenames-score codenames-score--red ' + (state.currentTeam === "red" && state.status === "active" ? "is-active" : "") + '"><span>КРАСНАЯ КОМАНДА</span><strong>' + state.remaining.red + '</strong><small>агентов осталось</small><em>Капитан: ' + escapeHTML(myCaptainName("red")) + '</em></div><div class="codenames-turn"><span>ТЕКУЩИЙ ЭТАП</span><strong>' + escapeHTML(status) + '</strong><small>' + (state.phase === "clue" ? "Фаза подсказки" : "Фаза угадывания") + '</small></div><div class="codenames-score codenames-score--blue ' + (state.currentTeam === "blue" && state.status === "active" ? "is-active" : "") + '"><span>СИНЯЯ КОМАНДА</span><strong>' + state.remaining.blue + '</strong><small>агентов осталось</small><em>Капитан: ' + escapeHTML(myCaptainName("blue")) + '</em></div></div>' +
      '<div class="codenames-main"><div class="codenames-board-wrap"><div class="codenames-board-head"><div><span class="codenames-eyebrow">СЛОВА НА ПОЛЕ</span><h3>25 секретов. Две команды.</h3></div><span>' + (isCaptain ? "ТЕБЕ ДОСТУПЕН КЛЮЧ" : "ИЩИ СВОИ СЛОВА") + '</span></div><div class="codenames-board">' + wordCards + '</div><div class="codenames-legend"><span><i class="codenames-legend__red"></i>Красные агенты</span><span><i class="codenames-legend__blue"></i>Синие агенты</span><span><i class="codenames-legend__neutral"></i>Нейтральные</span><span><i class="codenames-legend__assassin"></i>Убийца</span></div></div>' +
      '<aside class="codenames-sidebar"><section class="codenames-panel"><span class="codenames-eyebrow">ТВОЯ КОМАНДА</span><h3>' + (myTeam ? teamName(myTeam) : "Зритель") + '</h3><p>' + (isCaptain ? "Ты капитан. Видишь секретную карту и даёшь подсказки." : "Ты оперативник. Выбирай слова, опираясь на подсказку капитана.") + '</p><div class="codenames-players">' + playersList + '</div></section><section class="codenames-panel codenames-panel--clue"><span class="codenames-eyebrow">КОМАНДНЫЙ БРИФИНГ</span>' + cluePanel + actionControls + '<p class="codenames-notice" role="status">' + escapeHTML(notice) + '</p></section></aside></div>' +
      '<div class="codenames-last-action">' + escapeHTML(state.lastAction?.detail || "Партия готова к первому ходу.") + '</div>' + winner + '</section>';
  };

  const loadState = async () => {
    try {
      const data = await invokeCodenames({ action: "state", room_id: room.id });
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
    notice = "Сервер проверяет ход…";
    render();
    try {
      const data = await invokeCodenames({ ...action, room_id: room.id, revision });
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
    const word = event.target.closest("[data-codenames-word]");
    if (word && container.contains(word)) {
      await sendAction({ action: "guess", card_id: word.dataset.codenamesWord });
      return;
    }
    const action = event.target.closest("[data-codenames-action]");
    if (action && container.contains(action)) await sendAction({ action: action.dataset.codenamesAction });
  };
  const handleSubmit = async (event) => {
    const form = event.target.closest("[data-codenames-clue]");
    if (!form || !container.contains(form)) return;
    event.preventDefault();
    const values = new FormData(form);
    await sendAction({ action: "clue", text: String(values.get("text") || ""), count: Number(values.get("count")) });
  };
  container.addEventListener("click", handleClick);
  container.addEventListener("submit", handleSubmit);
  channel = supabase.channel("codenames-session-" + room.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_room_game_sessions", filter: "room_id=eq." + room.id }, loadState)
    .subscribe();
  loadState();
  return () => {
    disposed = true;
    container.removeEventListener("click", handleClick);
    container.removeEventListener("submit", handleSubmit);
    if (channel) supabase.removeChannel(channel);
  };
}
