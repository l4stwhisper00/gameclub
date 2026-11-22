export type DndHitDie = 6 | 8 | 10 | 12;
export interface DndCharacter {
  id: string; ownerId: string; name: string; ancestry: string; className: string; level: number;
  ac: number; maxHp: number; hp: number; tempHp: number; speed: number; initiativeBonus: number;
  hitDie: DndHitDie; hitDiceRemaining: number; conModifier: number; conditions: string[];
  inspiration: boolean; deathSaves: { successes: number; failures: number };
}
export interface DndNpc {
  id: string; name: string; ac: number; maxHp: number; hp: number; initiativeBonus: number;
  conditions: string[]; kind: "npc";
}
export interface DndState {
  gameId: "dnd-5e"; status: "active";
  hostId: string; players: string[];
  characters: Record<string, DndCharacter>; npcs: Record<string, DndNpc>;
  combatActive: boolean; turnOrder: string[]; initiative: Record<string, number>;
  currentTurnIndex: number; round: number;
  journal: { id: string; authorId: string; text: string; createdAt: string }[];
  privateNotesByPlayer: Record<string, string[]>;
  dmNotes: string[];
  events: { id: string; type: string; text: string; actorId: string; createdAt: string }[];
}
export type DndAction =
  | { type: "create_character"; name: string; ancestry: string; className: string; level: number; maxHp: number; ac: number; initiativeBonus: number; speed: number; hitDie: DndHitDie; conModifier: number }
  | { type: "roll"; notation: string; label?: string }
  | { type: "add_npc"; name: string; maxHp: number; ac: number; initiativeBonus: number }
  | { type: "start_combat" }
  | { type: "next_turn" }
  | { type: "end_combat" }
  | { type: "damage"; targetId: string; amount: number }
  | { type: "heal"; targetId: string; amount: number }
  | { type: "condition"; targetId: string; condition: string; enabled: boolean }
  | { type: "rest"; kind: "short" | "long"; hitDiceSpent?: number }
  | { type: "journal"; text: string }
  | { type: "private_note"; text: string }
  | { type: "dm_note"; text: string }
  | { type: "inspiration"; targetId: string; enabled: boolean };

const HIT_DICE: Record<string, DndHitDie> = { barbarian: 12, fighter: 10, paladin: 10, ranger: 10, bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8, sorcerer: 6, wizard: 6 };

function addEvent(state: DndState, type: string, text: string, actorId: string): void {
  state.events.unshift({ id: crypto.randomUUID(), type, text, actorId, createdAt: new Date().toISOString() });
  state.events = state.events.slice(0, 100);
}
function isHost(state: DndState, playerId: string): boolean { return state.hostId === playerId; }
function characterFor(state: DndState, playerId: string): DndCharacter {
  const character = Object.values(state.characters).find((item) => item.ownerId === playerId);
  if (!character) throw new Error("Сначала создай персонажа.");
  return character;
}
function combatant(state: DndState, id: string): DndCharacter | DndNpc {
  const item = state.characters[id] || state.npcs[id];
  if (!item) throw new Error("Участник боя не найден.");
  return item;
}
function parseDice(notation: string): { count: number; sides: number; modifier: number } {
  const match = String(notation || "").trim().toLowerCase().match(/^(\d{0,2})d(4|6|8|10|12|20|100)([+-]\d{1,3})?$/);
  if (!match) throw new Error("Формат кубов: d20, 2d6+3 или 4d8-2.");
  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const modifier = Number(match[3] || 0);
  if (count < 1 || count > 20 || Math.abs(modifier) > 100) throw new Error("Можно бросить от 1 до 20 кубов; модификатор от -100 до 100.");
  return { count, sides, modifier };
}
export function rollDndDice(notation: string, random: () => number = Math.random) {
  const { count, sides, modifier } = parseDice(notation);
  const rolls = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);
  return { notation, rolls, modifier, total: rolls.reduce((sum, value) => sum + value, 0) + modifier };
}
export function startDndCampaign(playerIds: string[], hostId: string): DndState {
  if (!playerIds.includes(hostId)) throw new Error("Ведущий должен быть участником комнаты.");
  return {
    gameId: "dnd-5e", status: "active", hostId, players: [...playerIds],
    characters: {}, npcs: {}, combatActive: false, turnOrder: [], initiative: {},
    currentTurnIndex: 0, round: 0, journal: [], privateNotesByPlayer: {}, dmNotes: [], events: []
  };
}
export function applyDndAction(source: DndState, playerId: string, action: DndAction, random: () => number = Math.random): DndState {
  const state = structuredClone(source);
  if (!state.players.includes(playerId)) throw new Error("Ты не участник этой кампании.");
  if (action.type === "create_character") {
    if (Object.values(state.characters).some((item) => item.ownerId === playerId)) throw new Error("У тебя уже есть персонаж в этой кампании.");
    const name = String(action.name || "").trim().slice(0, 32);
    const ancestry = String(action.ancestry || "").trim().slice(0, 32);
    const className = String(action.className || "").trim().slice(0, 32);
    if (!name || !ancestry || !className) throw new Error("Заполни имя, народ и класс персонажа.");
    if (!Number.isInteger(action.level) || action.level < 1 || action.level > 20) throw new Error("Уровень должен быть от 1 до 20.");
    if (!Number.isInteger(action.maxHp) || action.maxHp < 1 || action.maxHp > 500) throw new Error("Максимум HP должен быть от 1 до 500.");
    if (!Number.isInteger(action.ac) || action.ac < 1 || action.ac > 40) throw new Error("КД должен быть от 1 до 40.");
    if (!Number.isInteger(action.initiativeBonus) || action.initiativeBonus < -5 || action.initiativeBonus > 20) throw new Error("Бонус инициативы должен быть от -5 до 20.");
    if (!Number.isInteger(action.speed) || action.speed < 0 || action.speed > 120) throw new Error("Скорость должна быть от 0 до 120.");
    const expectedHitDie = HIT_DICE[className.toLowerCase()];
    if (!expectedHitDie || expectedHitDie !== action.hitDie) throw new Error("Кость здоровья не соответствует классу.");
    if (!Number.isInteger(action.conModifier) || action.conModifier < -5 || action.conModifier > 10) throw new Error("Модификатор Телосложения должен быть от -5 до 10.");
    const id = "char-" + playerId;
    state.characters[id] = {
      id, ownerId: playerId, name, ancestry, className, level: action.level, ac: action.ac,
      maxHp: action.maxHp, hp: action.maxHp, tempHp: 0, speed: action.speed,
      initiativeBonus: action.initiativeBonus, hitDie: action.hitDie, hitDiceRemaining: action.level,
      conModifier: action.conModifier, conditions: [], inspiration: false, deathSaves: { successes: 0, failures: 0 }
    };
    addEvent(state, "character", name + " вступает в кампанию.", playerId);
    return state;
  }
  if (action.type === "roll") {
    const result = rollDndDice(action.notation, random);
    const label = String(action.label || "Проверка").trim().slice(0, 48);
    addEvent(state, "dice", playerId + ": " + label + " — " + result.notation + " [" + result.rolls.join(", ") + "] " + (result.modifier >= 0 ? "+" : "") + result.modifier + " = " + result.total, playerId);
    return state;
  }
  if (action.type === "private_note") {
    const text = String(action.text || "").trim().slice(0, 500);
    if (!text) throw new Error("Заметка не может быть пустой.");
    state.privateNotesByPlayer[playerId] = [...(state.privateNotesByPlayer[playerId] || []), text].slice(-50);
    return state;
  }
  if (action.type === "dm_note") {
    if (!isHost(state, playerId)) throw new Error("Только ведущий может добавлять заметки мастера.");
    const text = String(action.text || "").trim().slice(0, 1000);
    if (!text) throw new Error("Заметка не может быть пустой.");
    state.dmNotes = [...state.dmNotes, text].slice(-100);
    return state;
  }
  if (action.type === "journal") {
    if (!isHost(state, playerId)) throw new Error("Запись в общий журнал добавляет ведущий.");
    const text = String(action.text || "").trim().slice(0, 1000);
    if (!text) throw new Error("Запись не может быть пустой.");
    state.journal.unshift({ id: crypto.randomUUID(), authorId: playerId, text, createdAt: new Date().toISOString() });
    state.journal = state.journal.slice(0, 100);
    addEvent(state, "journal", "Мастер добавил запись в журнал.", playerId);
    return state;
  }
  if (action.type === "rest") {
    if (state.combatActive) throw new Error("Нельзя отдыхать во время боя.");
    const character = characterFor(state, playerId);
    if (action.kind === "long") {
      character.hp = character.maxHp;
      character.hitDiceRemaining = Math.min(character.level, character.hitDiceRemaining + Math.max(1, Math.floor(character.level / 2)));
      character.deathSaves = { successes: 0, failures: 0 };
      addEvent(state, "rest", character.name + " завершает продолжительный отдых.", playerId);
    } else {
      const spent = Number(action.hitDiceSpent || 0);
      if (!Number.isInteger(spent) || spent < 1 || spent > character.hitDiceRemaining) throw new Error("Укажи число костей здоровья, которые потратишь.");
      let healing = 0;
      for (let i = 0; i < spent; i++) healing += Math.max(0, Math.floor(random() * character.hitDie) + 1 + character.conModifier);
      character.hitDiceRemaining -= spent;
      character.hp = Math.min(character.maxHp, character.hp + healing);
      addEvent(state, "rest", character.name + " отдыхает и восстанавливает " + healing + " HP.", playerId);
    }
    return state;
  }
  if (action.type === "add_npc") {
    if (!isHost(state, playerId)) throw new Error("Только ведущий может добавлять противников.");
    const name = String(action.name || "").trim().slice(0, 40);
    if (!name || !Number.isInteger(action.maxHp) || action.maxHp < 1 || action.maxHp > 10000 || !Number.isInteger(action.ac) || action.ac < 1 || action.ac > 40 || !Number.isInteger(action.initiativeBonus) || action.initiativeBonus < -5 || action.initiativeBonus > 20) {
      throw new Error("Проверь имя, HP, КД и бонус инициативы противника.");
    }
    const id = "npc-" + crypto.randomUUID();
    state.npcs[id] = { id, name, ac: action.ac, maxHp: action.maxHp, hp: action.maxHp, initiativeBonus: action.initiativeBonus, conditions: [], kind: "npc" };
    addEvent(state, "npc", name + " добавлен на поле.", playerId);
    return state;
  }
  if (action.type === "start_combat") {
    if (!isHost(state, playerId)) throw new Error("Начать бой может только ведущий.");
    if (state.combatActive) throw new Error("Бой уже идёт.");
    const combatants = [...Object.values(state.characters), ...Object.values(state.npcs)].filter((item) => item.hp > 0);
    if (!combatants.length) throw new Error("Сначала создай персонажей или добавь противников.");
    state.initiative = {};
    for (const item of combatants) state.initiative[item.id] = Math.floor(random() * 20) + 1 + item.initiativeBonus;
    state.turnOrder = combatants.sort((a,b) => state.initiative[b.id] - state.initiative[a.id] || a.name.localeCompare(b.name)).map((item) => item.id);
    state.combatActive = true; state.currentTurnIndex = 0; state.round = 1;
    addEvent(state, "combat", "Бой начался. Первый ход: " + combatant(state, state.turnOrder[0]).name + ".", playerId);
    return state;
  }
  if (action.type === "next_turn") {
    if (!isHost(state, playerId) || !state.combatActive) throw new Error("Перейти к следующему ходу может ведущий во время боя.");
    let nextIndex = -1;
    for (let step = 1; step <= state.turnOrder.length; step++) {
      const candidate = (state.currentTurnIndex + step) % state.turnOrder.length;
      if (combatant(state, state.turnOrder[candidate]).hp > 0) {
        nextIndex = candidate;
        if (candidate <= state.currentTurnIndex) state.round += 1;
        break;
      }
    }
    if (nextIndex < 0) {
      state.combatActive = false;
      state.turnOrder = [];
      addEvent(state, "combat", "Все участники боя выведены из строя. Бой завершён.", playerId);
      return state;
    }
    state.currentTurnIndex = nextIndex;
    const nextId = state.turnOrder[state.currentTurnIndex];
    addEvent(state, "turn", "Ход: " + combatant(state, nextId).name + ".", playerId);
    return state;
  }
  if (action.type === "end_combat") {
    if (!isHost(state, playerId) || !state.combatActive) throw new Error("Нет активного боя.");
    state.combatActive = false; state.turnOrder = []; state.initiative = {}; state.currentTurnIndex = 0;
    addEvent(state, "combat", "Бой завершён.", playerId);
    return state;
  }
  if (action.type === "damage" || action.type === "heal") {
    if (!isHost(state, playerId)) throw new Error("Только ведущий управляет HP участников.");
    const target = combatant(state, action.targetId);
    if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > 10000) throw new Error("Количество должно быть от 1 до 10000.");
    if (action.type === "damage") {
      const absorbed = Math.min(target.tempHp || 0, action.amount);
      target.tempHp = Math.max(0, (target.tempHp || 0) - absorbed);
      target.hp = Math.max(0, target.hp - (action.amount - absorbed));
      addEvent(state, "damage", target.name + " получает " + action.amount + " урона.", playerId);
    } else {
      target.hp = Math.min(target.maxHp, target.hp + action.amount);
      addEvent(state, "heal", target.name + " восстанавливает " + action.amount + " HP.", playerId);
    }
    return state;
  }
  if (action.type === "condition") {
    if (!isHost(state, playerId)) throw new Error("Только ведущий управляет состояниями участников.");
    const target = combatant(state, action.targetId);
    const condition = String(action.condition || "").trim().slice(0, 32);
    if (!condition) throw new Error("Укажи состояние.");
    target.conditions = action.enabled
      ? [...new Set([...target.conditions, condition])].slice(0, 12)
      : target.conditions.filter((item) => item !== condition);
    addEvent(state, "condition", target.name + (action.enabled ? " получает состояние: " : " теряет состояние: ") + condition + ".", playerId);
    return state;
  }
  if (action.type === "inspiration") {
    if (!isHost(state, playerId)) throw new Error("Только ведущий выдаёт вдохновение.");
    const target = state.characters[action.targetId];
    if (!target) throw new Error("Персонаж не найден.");
    target.inspiration = Boolean(action.enabled);
    addEvent(state, "inspiration", target.name + (target.inspiration ? " получает вдохновение." : " теряет вдохновение."), playerId);
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getDndPublicState(state: DndState) {
  return {
    gameId: state.gameId, status: state.status, hostId: state.hostId,
    players: state.players, characters: state.characters, npcs: state.npcs,
    combatActive: state.combatActive, turnOrder: state.turnOrder, initiative: state.initiative,
    currentTurnIndex: state.currentTurnIndex, currentTurnId: state.turnOrder[state.currentTurnIndex] || null,
    round: state.round, journal: state.journal, events: state.events
  };
}
export function getDndPrivateState(state: DndState, playerId: string) {
  return {
    notes: state.privateNotesByPlayer[playerId] || [],
    dmNotes: isHost(state, playerId) ? state.dmNotes : []
  };
}
