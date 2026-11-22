export type CodenamesTeam = "red" | "blue";
export type CodenamesCardTeam = CodenamesTeam | "neutral" | "assassin";
export type CodenamesPhase = "clue" | "guess";
export interface CodenamesWord { id: string; word: string; revealed: boolean; team?: CodenamesCardTeam; }
export interface CodenamesState {
  gameId: "codenames"; status: "active" | "finished"; players: string[];
  teams: Record<string, CodenamesTeam>; captains: Record<CodenamesTeam, string>;
  words: CodenamesWord[]; key: CodenamesCardTeam[]; currentTeam: CodenamesTeam;
  phase: CodenamesPhase; clue: { text: string; count: number; by: string } | null;
  guessesThisTurn: number; remaining: Record<CodenamesTeam, number>;
  winnerTeam: CodenamesTeam | null;
  lastAction: { type: string; playerId: string; detail?: string } | null;
}
export type CodenamesAction =
  | { type: "clue"; text: string; count: number }
  | { type: "guess"; cardId: string }
  | { type: "end_turn" };

const WORDS = [
"Аврора","Бархан","Башня","Берег","Билет","Блик","Буря","Венера","Верфь","Ветер",
"Вишня","Вокзал","Волна","Галактика","Гараж","Гвоздь","Глина","Гром","Джаз","Дракон",
"Дуб","Жемчуг","Замок","Звезда","Зеркало","Зонт","Игла","Изумруд","Камень","Капитан",
"Карта","Кедр","Кино","Ключ","Комета","Корабль","Корона","Космос","Кран","Крепость",
"Кристалл","Лабиринт","Лампа","Легенда","Лёд","Лес","Лимон","Линия","Лист","Луна",
"Магнит","Маяк","Медь","Метеор","Мост","Музей","Музыка","Мышь","Небо","Нить",
"Облако","Океан","Орбита","Остров","Парус","Перо","Пещера","Планета","Плата","Поезд",
"Полюс","Порт","Почта","Радуга","Ракета","Река","Робот","Роза","Рубин","Ручей",
"Сахар","Свеча","Север","Сигнал","Сирена","Скала","Скрипка","Снег","Сокол","Солнце",
"Сосна","Спутник","Стекло","Стрела","Тайга","Танец","Театр","Тень","Тоннель","Трава",
"Туман","Ураган","Факел","Фара","Феникс","Фонарь","Холод","Цирк","Часы","Чернила",
"Шахматы","Шёлк","Шторм","Эхо","Якорь","Янтарь"
];
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function startCodenames(playerIds: string[], random: () => number = Math.random): CodenamesState {
  if (playerIds.length < 2 || playerIds.length > 8) throw new Error("Для Кодовых имён нужно от 2 до 8 игроков.");
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) throw new Error("Список игроков некорректен.");
  const captains: Record<CodenamesTeam, string> = { red: playerIds[0], blue: playerIds[1] };
  const teams: Record<string, CodenamesTeam> = { [playerIds[0]]: "red", [playerIds[1]]: "blue" };
  playerIds.slice(2).forEach((id, index) => { teams[id] = index % 2 === 0 ? "red" : "blue"; });
  const currentTeam: CodenamesTeam = random() < 0.5 ? "red" : "blue";
  const otherTeam: CodenamesTeam = currentTeam === "red" ? "blue" : "red";
  const key = shuffle<CodenamesCardTeam>([
    ...Array(9).fill(currentTeam), ...Array(8).fill(otherTeam), ...Array(7).fill("neutral"), "assassin"
  ], random);
  const words = shuffle(WORDS, random).slice(0, 25).map((word, index) => ({
    id: "word-" + (index + 1), word, revealed: false
  }));
  return {
    gameId: "codenames", status: "active", players: [...playerIds], teams, captains, words, key,
    currentTeam, phase: "clue", clue: null, guessesThisTurn: 0,
    remaining: { red: currentTeam === "red" ? 9 : 8, blue: currentTeam === "blue" ? 9 : 8 },
    winnerTeam: null,
    lastAction: { type: "start", playerId: captains[currentTeam], detail: "Капитан может дать первую подсказку." }
  };
}
function assertMember(state: CodenamesState, playerId: string): CodenamesTeam {
  const team = state.teams[playerId];
  if (!team) throw new Error("Ты не участник этой партии.");
  return team;
}
function assertActiveTeam(state: CodenamesState, team: CodenamesTeam): void {
  if (state.status !== "active") throw new Error("Партия уже завершена.");
  if (team !== state.currentTeam) throw new Error("Сейчас ход другой команды.");
}
function endTurn(state: CodenamesState, playerId: string, detail: string): void {
  state.currentTeam = state.currentTeam === "red" ? "blue" : "red";
  state.phase = "clue"; state.clue = null; state.guessesThisTurn = 0;
  state.lastAction = { type: "end_turn", playerId, detail };
}
export function applyCodenamesAction(source: CodenamesState, playerId: string, action: CodenamesAction): CodenamesState {
  const state = structuredClone(source);
  const team = assertMember(state, playerId);
  assertActiveTeam(state, team);
  if (action.type === "clue") {
    if (state.phase !== "clue") throw new Error("Подсказка уже дана.");
    if (state.captains[team] !== playerId) throw new Error("Подсказку может давать только капитан команды.");
    const text = String(action.text || "").trim().replace(/\s+/g, " ");
    if (!text || text.length > 32 || /\s/.test(text)) throw new Error("Подсказка должна состоять из одного слова до 32 символов.");
    if (!Number.isInteger(action.count) || action.count < 0 || action.count > 9) throw new Error("Число подсказки должно быть от 0 до 9.");
    state.clue = { text, count: action.count, by: playerId };
    state.phase = "guess"; state.guessesThisTurn = 0;
    state.lastAction = { type: "clue", playerId, detail: text + " · " + action.count };
    return state;
  }
  const operatives = state.players.filter((id) => state.teams[id] === team && state.captains[team] !== id);
  const canCaptainGuess = operatives.length === 0 && state.captains[team] === playerId;
  if (action.type === "guess") {
    if (state.phase !== "guess" || !state.clue) throw new Error("Сначала капитан должен дать подсказку.");
    if (state.captains[team] === playerId && !canCaptainGuess) throw new Error("Капитан не выбирает карточки — это делают оперативники.");
    const index = state.words.findIndex((word) => word.id === action.cardId);
    if (index < 0) throw new Error("Карточка не найдена.");
    const word = state.words[index];
    if (word.revealed) throw new Error("Эта карточка уже открыта.");
    const revealedTeam = state.key[index];
    word.revealed = true; word.team = revealedTeam; state.guessesThisTurn += 1;
    if (revealedTeam === "assassin") {
      state.status = "finished"; state.winnerTeam = team === "red" ? "blue" : "red";
      state.lastAction = { type: "assassin", playerId, detail: "Команда выбрала убийцу и проиграла." };
      return state;
    }
    if (revealedTeam === "red" || revealedTeam === "blue") {
      state.remaining[revealedTeam] -= 1;
      if (state.remaining[revealedTeam] === 0) {
        state.status = "finished"; state.winnerTeam = revealedTeam;
        state.lastAction = { type: "winning_guess", playerId, detail: "Все агенты команды найдены." };
        return state;
      }
    }
    if (revealedTeam !== team) {
      endTurn(state, playerId, revealedTeam === "neutral" ? "Открыта нейтральная карточка. Ход переходит соперникам." : "Найден агент соперников. Ход переходит соперникам.");
      return state;
    }
    state.lastAction = { type: "guess", playerId, detail: "Найден свой агент." };
    if (state.guessesThisTurn >= state.clue.count + 1) endTurn(state, playerId, "Лимит подсказки исчерпан.");
    return state;
  }
  if (action.type === "end_turn") {
    if (state.phase !== "guess" || !state.clue) throw new Error("Сейчас нечего завершать.");
    if (state.captains[team] === playerId && !canCaptainGuess) throw new Error("Завершить угадывание может оперативник.");
    endTurn(state, playerId, "Команда завершила ход.");
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getCodenamesPublicState(state: CodenamesState) {
  return {
    gameId: state.gameId, status: state.status,
    players: state.players.map((id) => ({ id, team: state.teams[id], isCaptain: state.captains[state.teams[id]] === id })),
    captains: state.captains, words: state.words, currentTeam: state.currentTeam, phase: state.phase,
    clue: state.clue, guessesThisTurn: state.guessesThisTurn, remaining: state.remaining,
    winnerTeam: state.winnerTeam, lastAction: state.lastAction
  };
}
export function getCodenamesPrivateState(state: CodenamesState, playerId: string) {
  const team = assertMember(state, playerId);
  return state.captains[team] === playerId ? { key: [...state.key] } : {};
}
