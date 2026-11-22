import { supabase } from "./supabase.js";

function ensureMonopolyStyles() {
  if (document.getElementById("monopoly-game-styles")) return;
  const link = document.createElement("link");
  link.id = "monopoly-game-styles";
  link.rel = "stylesheet";
  link.href = "./css/monopoly-game.css";
  document.head.append(link);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
async function invokeMonopoly(body) {
  const { data, error } = await supabase.functions.invoke("monopoly-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с сервером Монополии.";
    try { const payload = await error.context?.json?.(); if (payload?.error) message = payload.error; } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}
export async function startOnlineMonopolyGame(room) {
  return invokeMonopoly({ action: "start", room_id: room.id });
}
export function renderMonopolyGame(container, room, user) {
  ensureMonopolyStyles();
  let state = null;
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Раскладываем игровое поле…";
  const playerName = (id) => (room.members || []).find((entry) => entry.userId === id)?.user?.username || "Игрок";
  const current = () => state?.players?.[state.currentPlayerIndex];
  const isMyTurn = () => current()?.id === user.id;
  const positions = (index) => {
    if (index === 0) return [11,11];
    if (index <= 9) return [11,11-index];
    if (index === 10) return [11,1];
    if (index <= 19) return [21-index,1];
    if (index === 20) return [1,1];
    if (index <= 29) return [1,index-19];
    if (index === 30) return [1,11];
    return [index-29,11];
  };
  const sendAction = async (action) => {
    if (busy || disposed || !state) return;
    busy = true;
    notice = "Сервер проверяет ход…";
    render();
    try {
      const data = await invokeMonopoly({ ...action, room_id: room.id, revision });
      if (disposed) return;
      if (Number(data.revision) >= revision) {
        state = data.state;
        revision = Number(data.revision);
      }
      notice = "Ход сохранён.";
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
      container.innerHTML = '<section class="monopoly-game monopoly-game--loading"><span>GAMECLUB · PROPERTY EMPIRE</span><h2>Готовим город</h2><p>' + escapeHTML(notice) + '</p></section>';
      return;
    }
    const player = current();
    const isTurn = isMyTurn() && state.status === "active";
    const properties = state.properties || {};
    const boardTiles = state.board.map((space) => {
      const [row,col] = positions(space.index);
      const property = properties[space.index];
      const owner = property?.ownerId;
      const ownerPlayer = state.players.find((item) => item.id === owner);
      const tokens = state.players.filter((item) => !item.bankrupt && item.position === space.index).map((item) => '<i class="monopoly-token" title="' + escapeHTML(playerName(item.id)) + '">' + escapeHTML(playerName(item.id).slice(0,1).toUpperCase()) + '</i>').join("");
      const color = space.color ? '<i class="monopoly-tile__color monopoly-tile__color--' + space.color + '"></i>' : "";
      const typeLabel = space.type === "property" ? "УЧАСТОК" : space.type === "railroad" ? "ВОКЗАЛ" : space.type === "utility" ? "КОММУНАЛЬНОЕ" : space.type === "chance" ? "ШАНС" : space.type === "community" ? "КАЗНА" : "";
      const ownerLabel = ownerPlayer ? '<small class="monopoly-tile__owner">' + escapeHTML(playerName(owner)) + '</small>' : "";
      const houses = property?.houses ? '<small class="monopoly-tile__houses">' + (property.houses === 5 ? "★ ОТЕЛЬ" : "⌂".repeat(property.houses)) + '</small>' : "";
      const mortgaged = property?.mortgaged ? '<small class="monopoly-tile__mortgage">ЗАЛОЖЕНО</small>' : "";
      return '<div class="monopoly-tile monopoly-tile--' + space.type + (owner ? " is-owned" : "") + (property?.mortgaged ? " is-mortgaged" : "") + '" style="grid-row:' + row + ';grid-column:' + col + '" data-space="' + space.index + '">' + color + '<span class="monopoly-tile__type">' + typeLabel + '</span><strong>' + escapeHTML(space.name) + '</strong>' + (space.price ? '<small class="monopoly-tile__price">$' + space.price + '</small>' : "") + ownerLabel + houses + mortgaged + '<div class="monopoly-tile__tokens">' + tokens + '</div></div>';
    }).join("");
    const players = state.players.map((item,index) => '<div class="monopoly-player ' + (item.id === player?.id ? "is-current" : "") + (item.bankrupt ? " is-bankrupt" : "") + '"><span class="monopoly-player__number">' + (index+1) + '</span><div><strong>' + escapeHTML(playerName(item.id)) + '</strong><small>' + (item.bankrupt ? "БАНКРОТ" : item.jailed ? "В ТЮРЬМЕ" : "Позиция " + (item.position+1)) + '</small></div><b>$' + item.cash.toLocaleString("en-US") + '</b></div>').join("");
    const owned = state.board.filter((space) => properties[space.index]?.ownerId === user.id).map((space) => {
      const property = properties[space.index];
      return '<div class="monopoly-owned"><div><strong>' + escapeHTML(space.name) + '</strong><small>' + (property.mortgaged ? "Заложено" : property.houses ? (property.houses === 5 ? "Отель" : property.houses + " домов") : "Без улучшений") + '</small></div><div>' + (!property.mortgaged && space.type === "property" ? '<button type="button" data-monopoly-action="build_house" data-space="' + space.index + '" ' + (!isTurn || busy ? "disabled" : "") + '>＋</button>' : "") + (property.mortgaged ? '<button type="button" data-monopoly-action="redeem" data-space="' + space.index + '" ' + (!isTurn || busy ? "disabled" : "") + '>Выкупить</button>' : '<button type="button" data-monopoly-action="mortgage" data-space="' + space.index + '" ' + (!isTurn || busy ? "disabled" : "") + '>Залог</button>') + '</div></div>';
    }).join("");
    let controls = "";
    if (state.status === "finished") controls = '<div class="monopoly-result"><strong>Победитель: ' + escapeHTML(playerName(state.winnerId)) + '</strong><p>Империя построена. Партия завершена.</p></div>';
    else if (!isTurn) controls = '<div class="monopoly-wait"><strong>Ход игрока ' + escapeHTML(playerName(player?.id)) + '</strong><p>Твои активы и позиции обновляются в реальном времени.</p></div>';
    else if (state.phase === "roll") controls = '<div class="monopoly-control"><span>ТВОЙ ХОД</span><h3>Бросай кубики</h3><p>' + (state.lastDice ? "Последний бросок: " + state.lastDice.join(" + ") : "Пройди по полю и собери свою империю.") + '</p><button type="button" data-monopoly-action="roll" ' + (busy ? "disabled" : "") + '>🎲 Бросить кубики</button></div>';
    else if (state.phase === "purchase") {
      const space = state.board[state.pendingSpace];
      controls = '<div class="monopoly-control"><span>ВОЗМОЖНОСТЬ ПОКУПКИ</span><h3>' + escapeHTML(space.name) + '</h3><p>Цена участка — $' + space.price + '. Твой баланс — $' + player.cash + '.</p><div class="monopoly-choice"><button type="button" data-monopoly-action="buy" ' + (busy || player.cash < space.price ? "disabled" : "") + '>Купить за $' + space.price + '</button><button type="button" data-monopoly-action="decline" ' + (busy ? "disabled" : "") + '>Отказаться</button></div></div>';
    } else if (state.phase === "jail") {
      controls = '<div class="monopoly-control"><span>ТЮРЬМА · ПОПЫТКА ' + (player.jailTurns+1) + ' ИЗ 3</span><h3>Как выйти?</h3><p>Заплати $50, используй карту или попробуй выбросить дубль.</p><div class="monopoly-choice"><button type="button" data-monopoly-action="pay_jail" ' + (busy || player.cash < 50 ? "disabled" : "") + '>Заплатить $50</button><button type="button" data-monopoly-action="use_jail_card" ' + (busy || player.jailCards < 1 ? "disabled" : "") + '>Карта освобождения (' + player.jailCards + ')</button><button type="button" data-monopoly-action="roll_jail" ' + (busy ? "disabled" : "") + '>Бросить на дубль</button></div></div>';
    }
    const dice = state.lastDice ? '<div class="monopoly-dice"><span>' + state.lastDice[0] + '</span><span>' + state.lastDice[1] + '</span></div>' : "";
    container.innerHTML = '<section class="monopoly-game" aria-label="Игровой стол Монополия"><header class="monopoly-header"><div><span class="monopoly-eyebrow">GAMECLUB · PROPERTY EMPIRE</span><h2>Монополия <i>／</i> Город возможностей</h2><p>Покупай улицы, строй дома, управляй капиталом и обойди соперников.</p></div><span class="monopoly-live"><i></i>' + (state.status === "finished" ? "ИГРА ЗАВЕРШЕНА" : "ХОД " + (state.currentPlayerIndex+1)) + '</span></header>' +
      '<div class="monopoly-layout"><div class="monopoly-board">' + boardTiles + '<div class="monopoly-center"><span class="monopoly-eyebrow">PROPERTY EMPIRE</span><h3>' + (state.status === "finished" ? "Империя построена" : "Построй свою империю") + '</h3><p>' + escapeHTML(state.lastEvent) + '</p>' + dice + '<div class="monopoly-center__players">' + state.players.filter((item)=>!item.bankrupt).map((item)=>'<span>' + escapeHTML(playerName(item.id)) + ' · $' + item.cash.toLocaleString("en-US") + '</span>').join("") + '</div></div></div>' +
      '<aside class="monopoly-sidebar"><section class="monopoly-panel"><span class="monopoly-eyebrow">ИГРОКИ И КАПИТАЛ</span><h3>Состояние империй</h3><div class="monopoly-players">' + players + '</div></section><section class="monopoly-panel monopoly-panel--action">' + controls + '<p class="monopoly-notice" role="status">' + escapeHTML(notice) + '</p></section><section class="monopoly-panel"><span class="monopoly-eyebrow">ТВОЯ СОБСТВЕННОСТЬ</span><h3>Портфель</h3>' + (owned || '<p class="monopoly-empty">Пока нет собственности. Купи первый участок.</p>') + '</section></aside></div></section>';
  };
  const loadState = async () => {
    try {
      const data = await invokeMonopoly({ action:"state", room_id:room.id });
      if (disposed || Number(data.revision) < revision) return;
      state = data.state; revision = Number(data.revision); notice = ""; render();
    } catch (error) { if (disposed) return; notice = error.message; render(); }
  };
  const handleClick = async (event) => {
    const button = event.target.closest("[data-monopoly-action]");
    if (!button || !container.contains(button)) return;
    const action = button.dataset.monopolyAction;
    if (["build_house","mortgage","redeem"].includes(action)) await sendAction({ action, space_index:Number(button.dataset.space) });
    else await sendAction({ action });
  };
  container.addEventListener("click",handleClick);
  channel = supabase.channel("monopoly-session-"+room.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"club_room_game_sessions",filter:"room_id=eq."+room.id},loadState)
    .subscribe();
  loadState();
  return () => { disposed=true; container.removeEventListener("click",handleClick); if(channel) supabase.removeChannel(channel); };
}
