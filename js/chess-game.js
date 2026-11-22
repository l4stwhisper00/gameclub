import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { supabase } from "./supabase.js";
import { leaveOnlineRoom } from "./online-rooms.js";

const PIECES = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚"
};
const FILES = "abcdefgh".split("");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function invokeChess(body) {
  const { data, error } = await supabase.functions.invoke("chess-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с игровым сервером.";
    try {
      const payload = await error.context?.json?.();
      if (payload?.error) message = payload.error;
    } catch { /* Keep the SDK error message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function startOnlineChessGame(room) {
  const rules = room.rules?.game || {};
  const opponentMode = rules.opponentMode === "bot"
    || (!rules.opponentMode && (room.members || []).length === 1) ? "bot" : "human";
  return invokeChess({
    action: "start",
    room_id: room.id,
    opponent_mode: opponentMode,
    bot_difficulty: rules.botDifficulty || "medium"
  });
}

export async function renderChessGame(container, room, user) {
  container.innerHTML = `
    <section class="chess-game" aria-label="Шахматная партия">
      <div class="chess-game__header">
        <div><span class="eyebrow">ИГРОВОЙ СТОЛ</span><h2>Шахматы</h2><p class="chess-game__subtitle">Каждый ход синхронизируется с комнатой.</p></div>
        <span class="chess-game__live"><i></i> Онлайн</span>
      </div>
      <div class="chess-game__layout">
        <div class="chess-game__board-wrap">
          <div class="chess-game__player chess-game__player--top" id="chess-opponent">Загрузка соперника…</div>
          <button class="room-button room-button--primary chess-game__init" id="chess-init" type="button" hidden>Создать шахматную партию</button>
          <div class="chess-board" id="chess-board" aria-label="Шахматная доска"></div>
          <div class="chess-game__player chess-game__player--bottom" id="chess-self">${escapeHTML(user.username)}</div>
        </div>
        <aside class="chess-game__side">
          <div class="chess-game__turn" id="chess-turn" aria-live="polite">Загружаем позицию…</div>
          <div class="chess-game__last" id="chess-last">Партия синхронизируется между участниками.</div>
          <div class="chess-game__moves"><h3>Ходы</h3><ol id="chess-moves"><li>Партия ещё не началась</li></ol></div>
          <button class="room-button room-button--soft room-button--full" type="button" id="chess-resign" hidden>Сдаться и завершить партию</button>
        </aside>
      </div>
      <p class="chess-game__notice" id="chess-notice" role="status"></p>
    </section>`;

  const boardElement = container.querySelector("#chess-board");
  const initButton = container.querySelector("#chess-init");
  const turnElement = container.querySelector("#chess-turn");
  const lastElement = container.querySelector("#chess-last");
  const movesElement = container.querySelector("#chess-moves");
  const opponentElement = container.querySelector("#chess-opponent");
  const selfElement = container.querySelector("#chess-self");
  const noticeElement = container.querySelector("#chess-notice");
  const resignButton = container.querySelector("#chess-resign");
  let gameState = null;
  let revision = -1;
  let selectedSquare = null;
  let legalTargets = [];
  let busy = false;
  let channel = null;
  let disposed = false;
  // Keep the finished result visible across transient realtime refreshes.
  let finishedResultRevision = null;

  function getChess() {
    const chess = new Chess();
    if (gameState?.pgn) chess.loadPgn(gameState.pgn);
    else if (gameState?.fen) chess.load(gameState.fen);
    return chess;
  }

  function currentPlayerId() {
    if (!gameState) return null;
    return gameState.turn === "w" ? gameState.whiteUserId : gameState.blackUserId;
  }

  function canMove(chess) {
    if (!gameState || gameState.status !== "active" || busy) return false;
    if (gameState.opponentMode === "bot") {
      return gameState.turn === "w" && gameState.whiteUserId === user.id;
    }
    return currentPlayerId() === user.id;
  }

  function statusText(chess) {
    if (gameState?.outcome) {
      if (gameState.outcome.status === "checkmate") {
        const winner = gameState.outcome.winner === "white" ? "Белые победили матом." : "Чёрные победили матом.";
        return winner;
      }
      if (gameState.outcome.status === "resignation") {
        return gameState.outcome.winner === "white" ? "Белые победили: соперник сдался." : "Чёрные победили: соперник сдался.";
      }
      return "Ничья.";
    }
    if (gameState?.status === "finished") return "Партия завершена.";
    if (chess.inCheck()) return gameState.turn === "w" ? "Шах белому королю!" : "Шах чёрному королю!";
    if (canMove(chess)) return gameState.turn === "w" ? "Твой ход — белые." : "Твой ход — чёрные.";
    return gameState.turn === "w" ? "Ход белых…" : "Ход чёрных…";
  }

  function render() {
    if (disposed || !gameState) return;
    const chess = getChess();
    const orientation = gameState.whiteUserId === user.id ? "white"
      : gameState.blackUserId === user.id ? "black" : "white";
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const files = orientation === "white" ? FILES : [...FILES].reverse();
    const moves = selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }) : [];
    legalTargets = moves.map((move) => move.to);
    const lastFrom = gameState.lastMove?.from;
    const lastTo = gameState.lastMove?.to;
    let html = "";

    for (const rank of ranks) {
      for (const file of files) {
        const square = file + rank;
        const piece = chess.get(square);
        const fileIndex = FILES.indexOf(file);
        const dark = (fileIndex + rank) % 2 === 0;
        const classes = [
          "chess-square",
          dark ? "is-dark" : "is-light",
          selectedSquare === square ? "is-selected" : "",
          legalTargets.includes(square) ? (piece ? "is-capture" : "is-target") : "",
          lastFrom === square || lastTo === square ? "is-last-move" : ""
        ].filter(Boolean).join(" ");
        const pieceSymbol = piece ? PIECES[piece.color + piece.type] : "";
        const label = piece
          ? `${square}, ${piece.color === "w" ? "белая" : "чёрная"} ${({p:"пешка",n:"конь",b:"слон",r:"ладья",q:"ферзь",k:"король"})[piece.type]}`
          : square;
        html += `<button class="${classes}" type="button" data-square="${square}" aria-label="${label}" ${canMove(chess) ? "" : "disabled"}><span>${pieceSymbol}</span><small>${square}</small></button>`;
      }
    }
    boardElement.innerHTML = html;

    const selfColor = orientation === "white" ? "Белые" : "Чёрные";
    const opponentColor = orientation === "white" ? "Чёрные" : "Белые";
    selfElement.textContent = `${user.username} · ${selfColor}`;
    opponentElement.textContent = gameState.opponentMode === "bot"
      ? `Клубный бот · ${({easy:"лёгкий",medium:"средний",hard:"сложный"})[gameState.botDifficulty] || "средний"}`
      : `${gameState.blackUserId === user.id ? "Белые" : "Чёрные"} · соперник`;

    turnElement.textContent = statusText(chess);
    lastElement.textContent = gameState.lastMove?.san
      ? `Последний ход: ${gameState.lastMove.san}`
      : "Первый ход за белыми.";
    const history = chess.history();
    if (!history.length) {
      movesElement.innerHTML = "<li>Ходы появятся здесь</li>";
    } else {
      const pairs = [];
      for (let i = 0; i < history.length; i += 2) {
        pairs.push(`<li><span>${Math.floor(i / 2) + 1}.</span> ${escapeHTML(history[i] || "")} <b>${escapeHTML(history[i + 1] || "")}</b></li>`);
      }
      movesElement.innerHTML = pairs.slice(-12).join("");
    }
    resignButton.hidden = gameState.status !== "active" || (gameState.whiteUserId !== user.id && gameState.blackUserId !== user.id);
    noticeElement.textContent = "";
    renderResultPanel();
  }

  function resultDetails() {
    const outcome = gameState?.outcome || {};
    const myColor = gameState?.whiteUserId === user.id ? "white"
      : gameState?.blackUserId === user.id ? "black" : null;
    if (outcome.status === "draw") {
      return { title: "НИЧЬЯ", subtitle: "На этот раз победителя нет.", kind: "draw" };
    }
    const won = Boolean(myColor && outcome.winner === myColor);
    let reason = "Партия завершена.";
    if (outcome.status === "checkmate") reason = "Мат — король соперника не смог избежать поражения.";
    else if (outcome.status === "resignation") reason = won ? "Соперник сдался." : "Ты сдал партию.";
    return {
      title: won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ",
      subtitle: reason,
      kind: won ? "win" : "loss"
    };
  }

  function renderResultPanel() {
    const existing = container.querySelector(".chess-result");
    if (gameState?.status !== "finished") {
      // A stale/intermediate active snapshot must not dismiss the result screen.
      // A genuinely newer revision (host started a replay) clears the latch.
      if (finishedResultRevision !== null && revision > finishedResultRevision) {
        finishedResultRevision = null;
        existing?.remove();
      }
      return;
    }
    finishedResultRevision = Math.max(finishedResultRevision ?? -1, revision);
    const result = resultDetails();
    const panel = document.createElement("section");
    panel.className = `chess-result chess-result--${result.kind}`;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "chess-result-title");
    panel.innerHTML = `
      <div class="chess-result__card">
        <span class="eyebrow">ПАРТИЯ ЗАВЕРШЕНА</span>
        <div class="chess-result__symbol" aria-hidden="true">${result.kind === "win" ? "♛" : result.kind === "loss" ? "♟" : "½"}</div>
        <h2 id="chess-result-title">${result.title}</h2>
        <p>${escapeHTML(result.subtitle)}</p>
        <div class="chess-result__actions">
          ${room.hostId === user.id ? '<button class="room-button room-button--primary" type="button" data-chess-replay>Сыграть ещё раз</button>' : '<p class="chess-result__hint">Новая партия доступна ведущему комнаты.</p>'}
          <button class="room-button room-button--soft" type="button" data-chess-leave>${room.hostId === user.id ? "К списку комнат" : "Покинуть комнату"}</button>
        </div>
      </div>`;
    existing?.replaceWith(panel);
    if (!existing) container.querySelector(".chess-game")?.append(panel);

    panel.querySelector("[data-chess-replay]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.textContent = "Запускаем…";
      try {
        const data = await invokeChess({
          action: "start",
          room_id: room.id,
          opponent_mode: gameState.opponentMode,
          bot_difficulty: gameState.botDifficulty || "medium"
        });
        gameState = data.state;
        revision = Number(data.revision);
        selectedSquare = null;
        render();
      } catch (error) {
        noticeElement.textContent = error.message;
        button.disabled = false;
        button.textContent = "Сыграть ещё раз";
      } finally {
        busy = false;
        render();
      }
    });

    panel.querySelector("[data-chess-leave]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.textContent = "Выходим…";
      try {
        // The room owner cannot leave their own room under the existing
        // membership rules; they can return to the room directory instead.
        if (room.hostId !== user.id) await leaveOnlineRoom(room.id);
        window.location.hash = "#/rooms";
      } catch (error) {
        noticeElement.textContent = error.message;
        button.disabled = false;
        button.textContent = "Покинуть комнату";
      } finally {
        busy = false;
      }
    });
  }

  async function loadState() {
    const { data, error } = await supabase.from("club_room_game_states")
      .select("state,revision")
      .eq("room_id", room.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      gameState = null;
      revision = -1;
      boardElement.innerHTML = "";
      turnElement.textContent = "Ожидаем начала партии.";
      noticeElement.textContent = user.id === room.hostId
        ? "Эта комната была запущена до появления шахматного модуля. Создай новую партию, чтобы открыть доску."
        : "Ожидаем, когда ведущий создаст шахматную партию.";
      initButton.hidden = user.id !== room.hostId;
      return;
    }
    initButton.hidden = true;
    if (Number(data.revision) <= revision) return;
    gameState = data.state;
    revision = Number(data.revision);
    selectedSquare = null;
    render();
  }

  function choosePromotion() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "chess-promotion-dialog";
      dialog.innerHTML = `
        <p>Во что превратить пешку?</p>
        <div class="chess-promotion-dialog__choices">
          <button type="button" data-promotion="q" aria-label="Ферзь">♕</button>
          <button type="button" data-promotion="r" aria-label="Ладья">♖</button>
          <button type="button" data-promotion="b" aria-label="Слон">♗</button>
          <button type="button" data-promotion="n" aria-label="Конь">♘</button>
        </div>
        <button class="chess-promotion-dialog__cancel" type="button">Отмена</button>`;
      let choice = null;
      dialog.querySelectorAll("[data-promotion]").forEach((button) => {
        button.addEventListener("click", () => {
          choice = button.dataset.promotion;
          dialog.close();
        });
      });
      dialog.querySelector(".chess-promotion-dialog__cancel").addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => {
        dialog.remove();
        resolve(choice);
      }, { once: true });
      container.append(dialog);
      dialog.showModal();
    });
  }

  async function submitMove(from, to, promotion = "q") {
    if (!gameState || busy) return;

    const previousState = gameState;
    const previousRevision = revision;
    const preview = getChess();
    let previewMove;
    try {
      previewMove = preview.move({ from, to, promotion });
    } catch {
      return;
    }
    if (!previewMove) return;

    // Render the player's legal move immediately. The server remains
    // authoritative: input is locked until it confirms the new revision.
    busy = true;
    selectedSquare = null;
    gameState = {
      ...previousState,
      fen: preview.fen(),
      pgn: preview.pgn(),
      turn: preview.turn(),
      lastMove: { san: previewMove.san, from: previewMove.from, to: previewMove.to },
      outcome: null,
      status: "active"
    };
    render();
    noticeElement.textContent = "Подтверждаем ход…";

    let moveError = null;
    try {
      const data = await invokeChess({
        action: "move",
        room_id: room.id,
        revision: previousRevision,
        from,
        to,
        promotion
      });
      gameState = data.state;
      revision = Number(data.revision);
    } catch (error) {
      gameState = previousState;
      revision = previousRevision;
      try {
        await loadState();
      } catch {
        // Keep the optimistic rollback and show the original request error.
      }
      moveError = error.message;
    } finally {
      busy = false;
      render();
      if (moveError) noticeElement.textContent = moveError;
    }
  }

  boardElement.addEventListener("click", async (event) => {
    const squareButton = event.target.closest("[data-square]");
    if (!squareButton || squareButton.disabled || !gameState || busy) return;
    const square = squareButton.dataset.square;
    const chess = getChess();

    if (selectedSquare && legalTargets.includes(square)) {
      const candidates = chess.moves({ square: selectedSquare, verbose: true }).filter((move) => move.to === square);
      const promotionMoves = candidates.filter((move) => move.promotion);
      const promotion = promotionMoves.length ? await choosePromotion() : "q";
      if (promotionMoves.length && !promotion) return;
      submitMove(selectedSquare, square, promotion);
      return;
    }

    const piece = chess.get(square);
    if (piece && piece.color === chess.turn() && canMove(chess)) {
      selectedSquare = square;
      render();
    } else {
      selectedSquare = null;
      render();
    }
  });

  initButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    initButton.disabled = true;
    initButton.textContent = "Создаём партию…";
    try {
      const data = await invokeChess({
        action: "start",
        room_id: room.id,
        opponent_mode: room.rules?.game?.opponentMode === "bot" || (!room.rules?.game?.opponentMode && (room.members || []).length === 1) ? "bot" : "human",
        bot_difficulty: room.rules?.game?.botDifficulty || "medium"
      });
      gameState = data.state;
      revision = Number(data.revision);
      initButton.hidden = true;
      render();
    } catch (error) {
      noticeElement.textContent = error.message;
      initButton.disabled = false;
      initButton.textContent = "Создать шахматную партию";
    } finally {
      busy = false;
      render();
    }
  });

  resignButton.addEventListener("click", async () => {
    if (!gameState || busy) return;
    busy = true;
    try {
      const data = await invokeChess({ action: "resign", room_id: room.id });
      gameState = data.state;
      revision = Number(data.revision);
      render();
    } catch (error) {
      noticeElement.textContent = error.message;
    } finally {
      busy = false;
      render();
    }
  });

  try {
    await loadState();
  } catch (error) {
    noticeElement.textContent = error.message || "Не удалось загрузить шахматную доску.";
  }

  channel = supabase.channel(`club-chess-${room.id}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "club_room_game_states", filter: `room_id=eq.${room.id}`
    }, () => loadState().catch((error) => { noticeElement.textContent = error.message; }))
    .subscribe();

  return () => {
    disposed = true;
    if (channel) supabase.removeChannel(channel);
  };
}
