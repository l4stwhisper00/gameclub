export type MafiaRole = "mafia" | "doctor" | "detective" | "civilian";
export type MafiaPhase = "night_mafia" | "night_doctor" | "night_detective" | "day" | "vote" | "finished";
export type MafiaWinner = "mafia" | "town";

export interface MafiaState {
  gameId: "mafia";
  status: "active" | "finished";
  players: string[];
  roles: Record<string, MafiaRole>;
  alive: string[];
  revealedRoles: Record<string, MafiaRole>;
  phase: MafiaPhase;
  round: number;
  mafiaVotes: Record<string, string>;
  nightTargetId: string | null;
  doctorSaveTargetId: string | null;
  lastDoctorSaveTargetId: string | null;
  votes: Record<string, string>;
  lastInspection: { detectiveId: string; targetId: string; isMafia: boolean } | null;
  lastNightResult: { eliminatedId: string | null; protected: boolean } | null;
  winner: MafiaWinner | null;
  lastEvent: { type: string; detail: string } | null;
}

export type MafiaAction =
  | { type: "mafia_vote"; targetId: string }
  | { type: "doctor_save"; targetId: string }
  | { type: "detective_inspect"; targetId: string }
  | { type: "start_vote" }
  | { type: "vote"; targetId: string };

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function livingRole(state: MafiaState, role: MafiaRole): string[] {
  return state.alive.filter((id) => state.roles[id] === role);
}
function checkWinner(state: MafiaState): boolean {
  const mafia = livingRole(state, "mafia").length;
  const town = state.alive.length - mafia;
  if (mafia === 0) state.winner = "town";
  else if (mafia >= town) state.winner = "mafia";
  if (state.winner) {
    state.status = "finished";
    state.phase = "finished";
    state.lastEvent = { type: "game_over", detail: state.winner === "town" ? "Мирные жители победили." : "Мафия получила численное преимущество." };
    return true;
  }
  return false;
}
function beginNight(state: MafiaState): void {
  state.round += 1;
  state.phase = "night_mafia";
  state.mafiaVotes = {};
  state.nightTargetId = null;
  state.doctorSaveTargetId = null;
  state.votes = {};
  state.lastEvent = { type: "night", detail: "Город засыпает. Мафия выбирает цель." };
}
function resolveNight(state: MafiaState): void {
  const targetId = state.nightTargetId;
  const protectedPlayer = Boolean(targetId && targetId === state.doctorSaveTargetId);
  let eliminatedId: string | null = null;
  if (targetId && !protectedPlayer && state.alive.includes(targetId)) {
    eliminatedId = targetId;
    state.alive = state.alive.filter((id) => id !== targetId);
    state.revealedRoles[targetId] = state.roles[targetId];
  }
  state.lastNightResult = { eliminatedId, protected: protectedPlayer };
  if (checkWinner(state)) return;
  state.phase = "day";
  state.lastEvent = {
    type: "day",
    detail: eliminatedId ? "Ночью погиб игрок. Его роль раскрыта." : protectedPlayer ? "Доктор спас выбранного игрока. Никто не погиб." : "Ночь прошла спокойно."
  };
}
function afterMafia(state: MafiaState): void {
  const doctor = livingRole(state, "doctor")[0];
  const detective = livingRole(state, "detective")[0];
  if (doctor) state.phase = "night_doctor";
  else if (detective) state.phase = "night_detective";
  else resolveNight(state);
}
function afterDoctor(state: MafiaState): void {
  if (livingRole(state, "detective").length) state.phase = "night_detective";
  else resolveNight(state);
}

export function startMafia(playerIds: string[], random: () => number = Math.random): MafiaState {
  if (playerIds.length < 5 || playerIds.length > 12) throw new Error("Для Мафии нужно от 5 до 12 игроков.");
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) throw new Error("Список игроков некорректен.");
  const shuffled = shuffle(playerIds, random);
  const mafiaCount = Math.max(1, Math.floor(playerIds.length / 4));
  const roleList: MafiaRole[] = [
    ...Array<MafiaRole>(mafiaCount).fill("mafia"),
    "doctor",
    "detective",
    ...Array<MafiaRole>(playerIds.length - mafiaCount - 2).fill("civilian")
  ];
  const roleOrder = shuffle(roleList, random);
  const roles: Record<string, MafiaRole> = {};
  shuffled.forEach((id, index) => { roles[id] = roleOrder[index]; });
  return {
    gameId: "mafia", status: "active", players: [...playerIds], roles, alive: [...playerIds],
    revealedRoles: {}, phase: "night_mafia", round: 1, mafiaVotes: {}, nightTargetId: null,
    doctorSaveTargetId: null, lastDoctorSaveTargetId: null, votes: {}, lastInspection: null,
    lastNightResult: null, winner: null,
    lastEvent: { type: "start", detail: "Город засыпает. Мафия выбирает первую цель." }
  };
}

export function applyMafiaAction(source: MafiaState, playerId: string, action: MafiaAction): MafiaState {
  const state = structuredClone(source);
  if (state.status !== "active") throw new Error("Партия уже завершена.");
  if (!state.alive.includes(playerId)) throw new Error("Выбывший игрок больше не может действовать.");
  const role = state.roles[playerId];

  if (action.type === "mafia_vote") {
    if (state.phase !== "night_mafia" || role !== "mafia") throw new Error("Сейчас голосует только живая мафия.");
    if (!state.alive.includes(action.targetId) || state.roles[action.targetId] === "mafia") throw new Error("Мафия может выбрать только живого игрока не из мафии.");
    if (state.mafiaVotes[playerId]) throw new Error("Ты уже проголосовал этой ночью.");
    state.mafiaVotes[playerId] = action.targetId;
    const mafia = livingRole(state, "mafia");
    if (mafia.every((id) => state.mafiaVotes[id])) {
      const counts: Record<string, number> = {};
      Object.values(state.mafiaVotes).forEach((target) => { counts[target] = (counts[target] || 0) + 1; });
      state.nightTargetId = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      state.lastEvent = { type: "mafia_choice", detail: "Мафия выбрала цель. Доктор просыпается." };
      afterMafia(state);
    } else {
      state.lastEvent = { type: "mafia_vote", detail: "Голос мафии принят. Ожидаем остальных." };
    }
    return state;
  }

  if (action.type === "doctor_save") {
    if (state.phase !== "night_doctor" || role !== "doctor") throw new Error("Сейчас действует только доктор.");
    if (!state.alive.includes(action.targetId)) throw new Error("Можно спасать только живого игрока.");
    if (state.lastDoctorSaveTargetId && state.lastDoctorSaveTargetId === action.targetId) throw new Error("Доктор не может спасать одного и того же игрока две ночи подряд.");
    state.doctorSaveTargetId = action.targetId;
    state.lastDoctorSaveTargetId = action.targetId;
    state.lastEvent = { type: "doctor", detail: "Доктор сделал свой выбор." };
    afterDoctor(state);
    return state;
  }

  if (action.type === "detective_inspect") {
    if (state.phase !== "night_detective" || role !== "detective") throw new Error("Сейчас действует только детектив.");
    if (!state.alive.includes(action.targetId) || action.targetId === playerId) throw new Error("Детектив может проверить другого живого игрока.");
    state.lastInspection = { detectiveId: playerId, targetId: action.targetId, isMafia: state.roles[action.targetId] === "mafia" };
    state.lastEvent = { type: "detective", detail: "Детектив завершил проверку." };
    resolveNight(state);
    return state;
  }

  if (action.type === "start_vote") {
    if (state.phase !== "day") throw new Error("Сейчас нельзя начинать голосование.");
    state.phase = "vote";
    state.votes = {};
    state.lastEvent = { type: "vote_started", detail: "Город голосует за исключение игрока." };
    return state;
  }

  if (action.type === "vote") {
    if (state.phase !== "vote") throw new Error("Голосование сейчас не открыто.");
    if (!state.alive.includes(action.targetId) || action.targetId === playerId) throw new Error("Нельзя голосовать за себя или за выбывшего игрока.");
    if (state.votes[playerId]) throw new Error("Ты уже проголосовал.");
    state.votes[playerId] = action.targetId;
    if (state.alive.every((id) => state.votes[id])) {
      const counts: Record<string, number> = {};
      Object.values(state.votes).forEach((target) => { counts[target] = (counts[target] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const eliminatedId = sorted.length > 1 && sorted[0][1] === sorted[1][1] ? null : sorted[0]?.[0] || null;
      if (eliminatedId) {
        state.alive = state.alive.filter((id) => id !== eliminatedId);
        state.revealedRoles[eliminatedId] = state.roles[eliminatedId];
      }
      if (!checkWinner(state)) beginNight(state);
      state.lastEvent = { type: "vote_result", detail: eliminatedId ? "Город исключил игрока. Его роль раскрыта." : "Голоса разделились. Никто не исключён." };
    } else {
      state.lastEvent = { type: "vote", detail: "Голос принят. Ожидаем остальных жителей." };
    }
    return state;
  }
  throw new Error("Неизвестное действие.");
}

export function getMafiaPublicState(state: MafiaState) {
  return {
    gameId: state.gameId, status: state.status, players: state.players.map((id) => ({
      id, alive: state.alive.includes(id), revealedRole: state.revealedRoles[id] || null
    })),
    phase: state.phase, round: state.round, mafiaVotesCount: Object.keys(state.mafiaVotes).length,
    mafiaCount: livingRole(state, "mafia").length, votesCount: Object.keys(state.votes).length,
    aliveCount: state.alive.length, lastNightResult: state.lastNightResult,
    winner: state.winner, lastEvent: state.lastEvent
  };
}
export function getMafiaPrivateState(state: MafiaState, playerId: string) {
  if (!state.players.includes(playerId)) throw new Error("Ты не участник этой партии.");
  const role = state.roles[playerId];
  return {
    role,
    mafiaTeammates: role === "mafia" ? livingRole(state, "mafia").filter((id) => id !== playerId) : [],
    hasMafiaVoted: Boolean(state.mafiaVotes[playerId]),
    hasVoted: Boolean(state.votes[playerId]),
    inspection: state.lastInspection?.detectiveId === playerId ? {
      targetId: state.lastInspection.targetId, isMafia: state.lastInspection.isMafia
    } : null
  };
}
