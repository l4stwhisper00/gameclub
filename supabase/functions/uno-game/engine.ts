export type UnoColor = "red" | "blue" | "green" | "yellow";
export type UnoKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: string;
  color: UnoColor | null;
  kind: UnoKind;
  value: number | string;
}

export interface UnoState {
  gameId: "uno";
  status: "active" | "finished";
  players: string[];
  hands: Record<string, UnoCard[]>;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  currentColor: UnoColor;
  pendingDrawnCardId: string | null;
  unoPenaltyPlayerId: string | null;
  unoCalledBy: string[];
  winnerId: string | null;
  lastAction: { type: string; playerId: string; card?: UnoCard; detail?: string } | null;
}

export type UnoAction =
  | { type: "play"; cardId: string; color?: UnoColor }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "call_uno" }
  | { type: "catch_uno" };

const COLORS: UnoColor[] = ["red", "blue", "green", "yellow"];
const isColor = (value: unknown): value is UnoColor => COLORS.includes(value as UnoColor);

export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0`, color, kind: "number", value: 0 });
    for (let n = 1; n <= 9; n++) {
      for (let copy = 1; copy <= 2; copy++) deck.push({ id: `${color}-${n}-${copy}`, color, kind: "number", value: n });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      for (let copy = 1; copy <= 2; copy++) deck.push({ id: `${color}-${kind}-${copy}`, color, kind, value: kind });
    }
  }
  for (let copy = 1; copy <= 4; copy++) {
    deck.push({ id: `wild-${copy}`, color: null, kind: "wild", value: "wild" });
    deck.push({ id: `wild4-${copy}`, color: null, kind: "wild4", value: "wild4" });
  }
  return deck;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function startUno(playerIds: string[], random: () => number = Math.random): UnoState {
  if (playerIds.length < 2 || playerIds.length > 10) throw new Error("Для Уно нужно от 2 до 10 игроков.");
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) throw new Error("Список игроков некорректен.");

  const deck = shuffled(createUnoDeck(), random);
  const hands: Record<string, UnoCard[]> = Object.fromEntries(playerIds.map((id) => [id, []]));
  for (let cardIndex = 0; cardIndex < 7; cardIndex++) {
    for (const playerId of playerIds) hands[playerId].push(deck.pop()!);
  }
  let firstCard = deck.pop()!;
  while (firstCard.kind !== "number") {
    deck.unshift(firstCard);
    firstCard = deck.pop()!;
  }

  return {
    gameId: "uno",
    status: "active",
    players: [...playerIds],
    hands,
    drawPile: deck,
    discardPile: [firstCard],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: firstCard.color!,
    pendingDrawnCardId: null,
    unoPenaltyPlayerId: null,
    unoCalledBy: [],
    winnerId: null,
    lastAction: { type: "start", playerId: playerIds[0], card: firstCard }
  };
}

export function isUnoCardPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  return card.kind === "wild" || card.kind === "wild4" || card.color === currentColor || card.value === top.value;
}

function nextIndex(state: UnoState, from = state.currentPlayerIndex, steps = 1): number {
  const count = state.players.length;
  return (from + state.direction * steps % count + count * 2) % count;
}

function drawCards(state: UnoState, playerId: string, count: number, random: () => number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (!state.drawPile.length && state.discardPile.length > 1) {
      const top = state.discardPile.pop()!;
      state.drawPile = shuffled(state.discardPile, random);
      state.discardPile = [top];
    }
    const card = state.drawPile.pop();
    if (!card) break;
    state.hands[playerId].push(card);
    drawn.push(card);
  }
  return drawn;
}

function advance(state: UnoState, steps = 1): void {
  state.currentPlayerIndex = nextIndex(state, state.currentPlayerIndex, steps);
  state.pendingDrawnCardId = null;
}

function assertCurrentPlayer(state: UnoState, playerId: string): void {
  if (state.status !== "active") throw new Error("Партия уже завершена.");
  if (!state.players.includes(playerId)) throw new Error("Ты не участник этой партии.");
  if (state.players[state.currentPlayerIndex] !== playerId) throw new Error("Сейчас ход другого игрока.");
}

export function applyUnoAction(
  source: UnoState,
  playerId: string,
  action: UnoAction,
  random: () => number = Math.random
): UnoState {
  const state: UnoState = structuredClone(source);
  const hand = state.hands[playerId];

  // UNO is announced immediately after the play that leaves one card.
  // The next player may catch the offender until their first action.
  if (action.type === "call_uno") {
    if (state.status !== "active" || !state.players.includes(playerId)) throw new Error("Ты не участник активной партии.");
    if (hand?.length !== 1 || state.unoPenaltyPlayerId !== playerId) throw new Error("Сейчас нельзя объявить UNO.");
    if (state.unoCalledBy.includes(playerId)) throw new Error("UNO уже объявлено.");
    state.unoCalledBy.push(playerId);
    state.unoPenaltyPlayerId = null;
    state.lastAction = { type: "call_uno", playerId };
    return state;
  }

  assertCurrentPlayer(state, playerId);

  if (action.type === "catch_uno") {
    const offender = state.unoPenaltyPlayerId;
    if (!offender || offender === playerId || state.unoCalledBy.includes(offender)) throw new Error("Сейчас некого ловить на UNO.");
    const drawn = drawCards(state, offender, 2, random);
    state.unoPenaltyPlayerId = null;
    state.lastAction = { type: "catch_uno", playerId, detail: `${offender} добирает 2 карты` };
    return state;
  }

  if (state.unoPenaltyPlayerId && state.unoPenaltyPlayerId !== playerId) state.unoPenaltyPlayerId = null;

  if (action.type === "draw") {
    if (state.pendingDrawnCardId) throw new Error("Сначала сыграй взятую карту или заверши ход.");
    const drawn = drawCards(state, playerId, 1, random);
    if (!drawn.length) throw new Error("В колоде больше нет карт.");
    const card = drawn[0];
    if (isUnoCardPlayable(card, state.discardPile.at(-1)!, state.currentColor)) {
      state.pendingDrawnCardId = card.id;
      state.lastAction = { type: "draw", playerId, card, detail: "Карту можно сыграть или пропустить ход." };
    } else {
      state.lastAction = { type: "draw", playerId, card };
      advance(state);
    }
    return state;
  }

  if (action.type === "pass") {
    if (!state.pendingDrawnCardId) throw new Error("Пропустить можно только после добора подходящей карты.");
    state.lastAction = { type: "pass", playerId };
    advance(state);
    return state;
  }

  if (action.type !== "play") throw new Error("Неизвестное действие.");
  const cardIndex = hand.findIndex((card) => card.id === action.cardId);
  if (cardIndex < 0) throw new Error("Этой карты нет в твоей руке.");
  const card = hand[cardIndex];
  if (state.pendingDrawnCardId && state.pendingDrawnCardId !== card.id) throw new Error("После добора можно сыграть только что взятую карту.");
  const top = state.discardPile.at(-1)!;
  if (!isUnoCardPlayable(card, top, state.currentColor)) throw new Error("Карта не подходит по цвету или значению.");
  if (card.kind === "wild4" && hand.some((held) => held.id !== card.id && held.color === state.currentColor)) {
    throw new Error("Дикий +4 нельзя сыграть, если у тебя есть карта текущего цвета.");
  }
  if ((card.kind === "wild" || card.kind === "wild4") && !isColor(action.color)) {
    throw new Error("Для джокера выбери новый цвет.");
  }

  hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.currentColor = card.color || action.color!;
  state.pendingDrawnCardId = null;
  state.unoCalledBy = state.unoCalledBy.filter((id) => id !== playerId);
  if (hand.length === 1) state.unoPenaltyPlayerId = playerId;
  else state.unoPenaltyPlayerId = null;
  state.lastAction = { type: "play", playerId, card };

  if (hand.length === 0) {
    state.status = "finished";
    state.winnerId = playerId;
    state.unoPenaltyPlayerId = null;
    return state;
  }

  let steps = 1;
  if (card.kind === "reverse") {
    if (state.players.length === 2) steps = 2;
    else state.direction = state.direction === 1 ? -1 : 1;
  } else if (card.kind === "skip") {
    steps = 2;
  } else if (card.kind === "draw2" || card.kind === "wild4") {
    const targetIndex = nextIndex(state);
    const targetId = state.players[targetIndex];
    drawCards(state, targetId, card.kind === "draw2" ? 2 : 4, random);
    steps = 2;
    state.lastAction.detail = `${targetId} берёт ${card.kind === "draw2" ? 2 : 4} карты и пропускает ход`;
  }
  advance(state, steps);
  return state;
}

export function getUnoPublicState(state: UnoState) {
  const topCard = state.discardPile.at(-1) || null;
  return {
    gameId: state.gameId,
    status: state.status,
    players: state.players.map((id) => ({ id, cardCount: state.hands[id]?.length || 0 })),
    currentPlayerId: state.players[state.currentPlayerIndex] || null,
    direction: state.direction,
    currentColor: state.currentColor,
    topCard,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    pendingDrawnCardId: state.pendingDrawnCardId,
    unoPenaltyPlayerId: state.unoPenaltyPlayerId,
    winnerId: state.winnerId,
    lastAction: state.lastAction
  };
}

export function getUnoPlayerHand(state: UnoState, playerId: string): UnoCard[] {
  if (!state.players.includes(playerId)) throw new Error("Ты не участник этой партии.");
  return structuredClone(state.hands[playerId]);
}
