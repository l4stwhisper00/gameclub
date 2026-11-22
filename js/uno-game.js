import { supabase } from "./supabase.js";

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_LABELS = { red: "Красный", blue: "Синий", green: "Зелёный", yellow: "Жёлтый" };

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function cardLabel(card) {
  if (card.kind === "skip") return "🚫";
  if (card.kind === "reverse") return "↔";
  if (card.kind === "draw2") return "+2";
  if (card.kind === "wild") return "✦";
  if (card.kind === "wild4") return "+4";
  return String(card.value);
}

function cardMarkup(card, options = {}) {
  const classes = ["uno-card", card.color ? `uno-card--${card.color}` : "uno-card--wild", options.small ? "uno-card--small" : "", options.disabled ? "is-disabled" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}"><i>${card.color ? COLOR_LABELS[card.color] : "WILD"}</i><strong>${escapeHTML(cardLabel(card))}</strong><i>${card.color ? COLOR_LABELS[card.color] : "UNO"}</i></span>`;
}

async function invokeUno(body) {
  const { data, error } = await supabase.functions.invoke("uno-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с сервером Уно.";
    try {
      const payload = await error.context?.json?.();
      if (payload?.error) message = payload.error;
    } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}

export async function startOnlineUnoGame(room) {
  return invokeUno({ action: "start", room_id: room.id });
}

export function renderUnoGame(container, room, user) {
  let state = null;
  let hand = [];
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Загружаем партию…";

  const render = () => {
    if (disposed) return;
    if (!state) {
      container.innerHTML = `<section class="uno-game uno-game--loading"><span class="uno-game__eyebrow">GAMECLUB · UNO</span><h2>Подготавливаем стол</h2><p>${escapeHTML(notice)}</p></section>`;
      return;
    }

    const players = state.players || [];
    const currentPlayerId = state.currentPlayerId;
    const isTurn = currentPlayerId === user.id && state.status === "active";
    const currentPlayer = players.find((player) => player.id === currentPlayerId);
    const topCard = state.topCard;
    const penalty = state.unoPenaltyPlayerId;
    const canCatch = isTurn && penalty && penalty !== user.id;
    const canCall = penalty === user.id;
    const playable = (card) => {
      if (state.pendingDrawnCardId && state.pendingDrawnCardId !== card.id) return false;
      if (!topCard) return true;
      return card.kind === "wild" || card.kind === "wild4" || card.color === state.currentColor || card.value === topCard.value;
    };
    const playerCards = hand.map((card) => `
      <button class="uno-hand-card" type="button" data-uno-card="${escapeHTML(card.id)}" aria-label="Сыграть карту ${escapeHTML(cardLabel(card))}" ${!isTurn || !playable(card) || busy ? "disabled" : ""}>
        ${cardMarkup(card, { disabled: !playable(card) || !isTurn })}
      </button>`).join("");
    const opponentMarkup = players.filter((player) => player.id !== user.id).map((player) => {
      const isCurrent = player.id === currentPlayerId;
      const member = (room.members || []).find((entry) => entry.userId === player.id);
      const username = member?.user?.username || (player.id === room.hostId ? "Ведущий" : "Игрок");
      return `<div class="uno-opponent ${isCurrent ? "is-current" : ""}">
        <span class="uno-opponent__avatar">${escapeHTML(username.slice(0, 1).toUpperCase())}</span>
        <span class="uno-opponent__name">${escapeHTML(username)}</span>
        <span class="uno-opponent__count">${player.cardCount} карт</span>
        <span class="uno-opponent__backs" aria-hidden="true">${Array.from({ length: Math.min(player.cardCount, 5) }, () => '<i></i>').join("")}</span>
      </div>`;
    }).join("");

    const isFinished = state.status === "finished";
    const status = isFinished
      ? `Победитель: ${state.winnerId === user.id ? "ты!" : escapeHTML(players.find((p) => p.id === state.winnerId)?.username || "соперник")}`
      : isTurn ? "Твой ход" : `Ходит ${escapeHTML(currentPlayer?.username || "соперник")}`;
    const colorLabel = COLOR_LABELS[state.currentColor] || state.currentColor;
    container.innerHTML = `
      <section class="uno-game" aria-label="Игровой стол Уно">
        <header class="uno-game__header">
          <div><span class="uno-game__eyebrow">GAMECLUB · КАРТОЧНАЯ АРЕНА</span><h2>UNO <span>／</span> Последняя карта решает всё</h2><p>Сопоставляй цвет или значение, используй карты действий и опереди соперников.</p></div>
          <div class="uno-game__live"><i></i>${isFinished ? "ПАРТИЯ ЗАВЕРШЕНА" : "ПАРТИЯ В ЭФИРЕ"}</div>
        </header>
        <div class="uno-game__opponents">${opponentMarkup}</div>
        <div class="uno-game__arena">
          <div class="uno-game__deck">
            <span class="uno-game__pile-label">КОЛОДА</span>
            <div class="uno-deck-card"><b>UNO</b><i>✦</i></div>
            <strong>${state.drawPileCount} <small>карт</small></strong>
          </div>
          <div class="uno-game__center">
            <span class="uno-game__turn">${escapeHTML(status)}</span>
            <div class="uno-game__discard">${topCard ? cardMarkup(topCard) : ""}</div>
            <span class="uno-game__color">АКТИВНЫЙ ЦВЕТ <b class="uno-color-dot uno-color-dot--${escapeHTML(state.currentColor)}"></b> ${escapeHTML(colorLabel)}</span>
            <span class="uno-game__direction">Направление: ${state.direction === 1 ? "по часовой ↻" : "против часовой ↺"}</span>
          </div>
          <div class="uno-game__side-info"><span>ХОД</span><strong>${players.findIndex((p) => p.id === currentPlayerId) + 1} / ${players.length}</strong><span>СБРОС</span><strong>${state.discardPileCount}</strong></div>
        </div>
        ${state.lastAction?.detail ? `<p class="uno-game__event">${escapeHTML(state.lastAction.detail)}</p>` : ""}
        <div class="uno-game__hand-panel">
          <div class="uno-game__hand-head"><div><span class="uno-game__eyebrow">ТВОЯ РУКА</span><h3>${hand.length} ${hand.length === 1 ? "карта" : hand.length < 5 ? "карты" : "карт"}</h3></div><span>${isTurn ? "ВЫБЕРИ КАРТУ" : "ОЖИДАНИЕ ХОДА"}</span></div>
          <div class="uno-game__hand">${playerCards || '<p class="uno-game__empty">Карт в руке нет.</p>'}</div>
        </div>
        <footer class="uno-game__controls">
          <div class="uno-game__actions">
            <button class="uno-action uno-action--draw" type="button" data-uno-action="draw" ${!isTurn || state.pendingDrawnCardId || busy || isFinished ? "disabled" : ""}>＋ Взять карту</button>
            <button class="uno-action" type="button" data-uno-action="pass" ${!isTurn || !state.pendingDrawnCardId || busy ? "disabled" : ""}>Пропустить ход</button>
            <button class="uno-action uno-action--uno" type="button" data-uno-action="call_uno" ${!canCall || busy ? "disabled" : ""}>UNO!</button>
            <button class="uno-action uno-action--catch" type="button" data-uno-action="catch_uno" ${!canCatch || busy ? "disabled" : ""}>Поймать на UNO</button>
          </div>
          <p class="uno-game__notice" role="status">${escapeHTML(notice)}</p>
        </footer>
        ${isFinished ? `<div class="uno-game__winner"><span>✦</span><strong>${escapeHTML(status)}</strong><small>Ведущий может завершить партию и начать новый раунд из панели комнаты.</small></div>` : ""}
      </section>`;
  };

  const loadState = async () => {
    try {
      const data = await invokeUno({ action: "state", room_id: room.id });
      if (disposed || Number(data.revision) < revision) return;
      state = data.state;
      hand = data.hand || [];
      revision = Number(data.revision);
      notice = "";
      render();
    } catch (error) {
      if (disposed) return;
      notice = error.message;
      render();
    }
  };

  const chooseColor = () => new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "uno-color-dialog";
    dialog.innerHTML = `<form method="dialog"><h3>Выбери новый цвет</h3><div>${COLORS.map((color) => `<button type="submit" value="${color}" class="uno-color-choice uno-color-choice--${color}">${COLOR_LABELS[color]}</button>`).join("")}</div><button class="uno-color-cancel" value="">Отмена</button></form>`;
    document.body.append(dialog);
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue;
      dialog.remove();
      resolve(value || null);
    }, { once: true });
    dialog.showModal();
  });

  const sendAction = async (action) => {
    if (busy || disposed || !state) return;
    busy = true;
    notice = "Сервер проверяет действие…";
    render();
    try {
      const data = await invokeUno({ ...action, room_id: room.id, revision });
      if (disposed) return;
      if (Number(data.revision) >= revision) {
        state = data.state;
        hand = data.hand || [];
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

  const handleClick = async (event) => {
    const cardButton = event.target.closest("[data-uno-card]");
    if (cardButton && container.contains(cardButton)) {
      const card = hand.find((item) => item.id === cardButton.dataset.unoCard);
      if (!card) return;
      let color;
      if (card.kind === "wild" || card.kind === "wild4") {
        color = await chooseColor();
        if (!color) return;
      }
      await sendAction({ action: "play", card_id: card.id, ...(color ? { color } : {}) });
      return;
    }
    const actionButton = event.target.closest("[data-uno-action]");
    if (actionButton && container.contains(actionButton)) {
      await sendAction({ action: actionButton.dataset.unoAction });
    }
  };
  container.addEventListener("click", handleClick);

  channel = supabase.channel(`uno-session-${room.id}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "club_room_game_sessions", filter: `room_id=eq.${room.id}`
    }, loadState)
    .subscribe();

  loadState();
  return () => {
    disposed = true;
    container.removeEventListener("click", handleClick);
    if (channel) supabase.removeChannel(channel);
  };
}
