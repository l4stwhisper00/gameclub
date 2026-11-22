export type BunkerCategory = "profession" | "health" | "hobby" | "phobia" | "trait" | "luggage" | "fact";
export type BunkerPhase = "reveal" | "discussion" | "vote" | "finished";
export type BunkerProfile = Record<BunkerCategory, string>;
export interface BunkerPlayer { id: string; alive: boolean; revealed: Partial<BunkerProfile>; }
export interface BunkerState {
  gameId: "bunker"; status: "active" | "finished"; players: BunkerPlayer[];
  secrets: Record<string, BunkerProfile>; catastrophe: string; bunkerCapacity: number;
  phase: BunkerPhase; round: number; revealOrder: string[]; currentRevealIndex: number;
  votes: Record<string, string>; eliminated: string[]; winnerIds: string[];
  lastEvent: string;
}
export type BunkerAction =
  | { type: "reveal"; category: BunkerCategory }
  | { type: "start_vote" }
  | { type: "vote"; targetId: string };

const CATASTROPHES = [
  "Глобальное похолодание: температура падает ниже −60 °C.",
  "Неизвестная пандемия: заражение распространяется через воздух.",
  "Падение метеорита: поверхность планеты стала опасной.",
  "Ядерная зима: радиация и пепел закрыли небо.",
  "Восстание машин: автономные системы охотятся на людей.",
  "Мировой потоп: большая часть суши ушла под воду.",
  "Биологическая катастрофа: флора и фауна мутировали.",
  "Солнечная вспышка: электроника и связь больше не работают."
];
const ATTRIBUTES: Record<BunkerCategory, string[]> = {
  profession: ["Хирург-травматолог","Инженер-энергетик","Агроном","Пилот гражданской авиации","Учитель химии","Повар","Сантехник","Психолог","Геолог","Военный связист","Ветеринар","Программист"],
  health: ["Полностью здоров","Аллергия на пыльцу","Плохое зрение","Диабет под контролем","Сломана рука","Астма лёгкой степени","Хроническая мигрень","Отличная физическая форма"],
  hobby: ["Выращивание растений","Радиолюбительство","Альпинизм","Кулинария","Ремонт техники","Настольные игры","Рыбалка","Первая помощь"],
  phobia: ["Боязнь темноты","Клаустрофобия","Боязнь высоты","Нет выраженных фобий","Боязнь крови","Страх открытой воды","Боязнь насекомых","Социофобия"],
  trait: ["Спокоен под давлением","Очень убедителен","Склонен к риску","Командный игрок","Не доверяет незнакомцам","Отличная память","Импульсивен","Умеет хранить секреты"],
  luggage: ["Аптечка и бинты","Набор инструментов","Семена овощей","Рация без батареи","Запас консервов на неделю","Книга по медицине","Портативная солнечная панель","Пустой рюкзак"],
  fact: ["Знает азбуку Морзе","Провёл месяц в экспедиции","Умеет обращаться с оружием","Никогда не жил за городом","Знает три языка","Выжил в кораблекрушении","Умеет ориентироваться по звёздам","Скрывает важную информацию"]
};
function pick<T>(items: T[], random: () => number): T { return items[Math.min(items.length-1,Math.floor(random()*items.length))]; }
function shuffle<T>(items: T[], random: () => number): T[] {
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function alive(state:BunkerState):BunkerPlayer[]{return state.players.filter((player)=>player.alive);}
export function startBunker(playerIds:string[],random:()=>number=Math.random):BunkerState{
  if(playerIds.length<3||playerIds.length>12)throw new Error("Для Бункера нужно от 3 до 12 игроков.");
  if(new Set(playerIds).size!==playerIds.length||playerIds.some((id)=>!id))throw new Error("Список игроков некорректен.");
  const secrets:Record<string,BunkerProfile>={};
  for(const id of playerIds){
    secrets[id]={
      profession:pick(ATTRIBUTES.profession,random),health:pick(ATTRIBUTES.health,random),
      hobby:pick(ATTRIBUTES.hobby,random),phobia:pick(ATTRIBUTES.phobia,random),
      trait:pick(ATTRIBUTES.trait,random),luggage:pick(ATTRIBUTES.luggage,random),
      fact:pick(ATTRIBUTES.fact,random)
    };
  }
  return {
    gameId:"bunker",status:"active",players:playerIds.map((id)=>({id,alive:true,revealed:{}})),
    secrets,catastrophe:pick(CATASTROPHES,random),bunkerCapacity:Math.max(2,Math.ceil(playerIds.length/2)),
    phase:"reveal",round:1,revealOrder:shuffle(playerIds,random),currentRevealIndex:0,
    votes:{},eliminated:[],winnerIds:[],lastEvent:"Катастрофа объявлена. Первый участник раскрывает характеристику."
  };
}
export function applyBunkerAction(source:BunkerState,playerId:string,action:BunkerAction):BunkerState{
  const state=structuredClone(source);
  if(state.status!=="active")throw new Error("Партия завершена.");
  const player=state.players.find((item)=>item.id===playerId);
  if(!player)throw new Error("Ты не участник этой игры.");
  if(!player.alive)throw new Error("Выбывший игрок больше не может действовать.");
  if(action.type==="reveal"){
    if(state.phase!=="reveal")throw new Error("Сейчас не фаза раскрытия.");
    if(state.revealOrder[state.currentRevealIndex]!==playerId)throw new Error("Сейчас раскрывает другой участник.");
    if(!(action.category in ATTRIBUTES))throw new Error("Неизвестная категория.");
    if(player.revealed[action.category])throw new Error("Эта характеристика уже раскрыта.");
    player.revealed[action.category]=state.secrets[playerId][action.category];
    state.currentRevealIndex+=1;
    state.lastEvent=playerId+" раскрыл характеристику: "+action.category+".";
    if(state.currentRevealIndex>=state.revealOrder.length){
      state.phase="discussion";
      state.lastEvent="Все раскрыли по одной характеристике. Время обсуждения.";
    }
    return state;
  }
  if(action.type==="start_vote"){
    if(state.phase!=="discussion")throw new Error("Сейчас нельзя начинать голосование.");
    state.phase="vote";state.votes={};state.lastEvent="Голосование открыто. Выберите участника для исключения.";
    return state;
  }
  if(action.type==="vote"){
    if(state.phase!=="vote")throw new Error("Голосование ещё не открыто.");
    const target=state.players.find((item)=>item.id===action.targetId);
    if(!target?.alive||target.id===playerId)throw new Error("Нельзя голосовать за себя или за выбывшего игрока.");
    if(state.votes[playerId])throw new Error("Ты уже проголосовал.");
    state.votes[playerId]=action.targetId;
    if(alive(state).every((item)=>state.votes[item.id])){
      const counts:Record<string,number>={};
      Object.values(state.votes).forEach((id)=>{counts[id]=(counts[id]||0)+1;});
      const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
      const eliminatedId=ranked.length>1&&ranked[0][1]===ranked[1][1]?null:ranked[0]?.[0]||null;
      if(eliminatedId){
        const eliminated=state.players.find((item)=>item.id===eliminatedId)!;
        eliminated.alive=false;state.eliminated.push(eliminatedId);
      }
      if(alive(state).length<=state.bunkerCapacity){
        state.status="finished";state.phase="finished";state.winnerIds=alive(state).map((item)=>item.id);
        state.lastEvent="Бункер заполнен. Выжившие определены.";
      }else{
        state.round+=1;state.phase="reveal";state.revealOrder=alive(state).map((item)=>item.id);
        state.currentRevealIndex=0;state.votes={};
        state.lastEvent=eliminatedId?"Участник исключён. Начинается следующий раунд раскрытия.":"Ничья. Никто не исключён; начинается следующий раунд.";
      }
    }else state.lastEvent="Голос принят. Ожидаем остальных.";
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getBunkerPublicState(state:BunkerState){
  return {
    gameId:state.gameId,status:state.status,
    players:state.players.map((player)=>({id:player.id,alive:player.alive,revealed:player.revealed})),
    catastrophe:state.catastrophe,bunkerCapacity:state.bunkerCapacity,phase:state.phase,round:state.round,
    revealOrder:state.revealOrder,currentRevealId:state.revealOrder[state.currentRevealIndex]||null,
    votesCount:Object.keys(state.votes).length,aliveCount:alive(state).length,
    eliminated:state.eliminated,winnerIds:state.winnerIds,lastEvent:state.lastEvent
  };
}
export function getBunkerPrivateState(state:BunkerState,playerId:string){
  if(!state.players.some((player)=>player.id===playerId))throw new Error("Ты не участник этой игры.");
  return {attributes:state.secrets[playerId],hasVoted:Boolean(state.votes[playerId])};
}
