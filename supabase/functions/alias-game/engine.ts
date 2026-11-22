export type AliasTeam = "red" | "blue";
export interface AliasState {
  gameId: "alias"; status: "active" | "finished"; players: string[];
  teams: Record<string, AliasTeam>; teamPlayers: Record<AliasTeam, string[]>;
  scores: Record<AliasTeam, number>; scoreToWin: number;
  words: string[]; wordIndex: number; currentTeam: AliasTeam;
  explainerIndexes: Record<AliasTeam, number>; round: number;
  winnerTeam: AliasTeam | null; lastEvent: string;
}
export type AliasAction = { type: "correct" } | { type: "skip" } | { type: "end_turn" };
const WORDS = [
"Компас","Парус","Галактика","Кофемашина","Пианино","Вулкан","Лабиринт","Маяк","Снеговик","Самолёт",
"Карусель","Микроскоп","Подводная лодка","Библиотека","Крокодил","Парашют","Телескоп","Мороженое","Пират","Робот",
"Космонавт","Термометр","Бумеранг","Кинжал","Аквариум","Фейерверк","Пылесос","Коралл","Скейтборд","Черепаха",
"Молния","Секрет","Маскарад","Барабан","Гармония","Светофор","Фонтан","Корабль","Пирамида","Радуга",
"Почтальон","Сыр","Кинотеатр","Батут","Капкан","Дирижёр","Скрипка","Гейзер","Калейдоскоп","Трамвай",
"Садовник","Калькулятор","Фотограф","Гнездо","Сундук","Кора","Сапфир","Планетарий","Мельница","Медуза",
"Магнит","Салют","Палатка","Трактор","Лифт","Почта","Книга","Чемодан","Глобус","Ласточка",
"Кенгуру","Театр","Мост","Пещера","Велосипед","Молоко","Гитара","Бинокль","Шахматы","Медаль",
"Солнечные часы","Ракета","Фонарик","Печенье","Зеркало","Костёр","Скатерть","Водопад","Канат","Рояль",
"Бабочка","Туман","Скворечник","Стадион","Лопата","Варенье","Крыльцо","Паровоз","Кольцо","Серфинг",
"Моряк","Шоколад","Секундомер","Масло","Сова","Скала","Свадьба","Подарок","Сапоги","Портрет",
"Снежинка","Косичка","Ветеринар","Мороженица","Пружина","Кнопка","Пароход","Солнцезащитные очки","Пальма","Камертон"
];
function shuffle<T>(items:T[],random:()=>number):T[]{
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function activeExplainer(state:AliasState):string{
  const members=state.teamPlayers[state.currentTeam];
  return members[state.explainerIndexes[state.currentTeam]%members.length];
}
export function startAlias(playerIds:string[],random:()=>number=Math.random):AliasState{
  if(playerIds.length<4||playerIds.length>12)throw new Error("Для Alias нужно от 4 до 12 игроков.");
  if(new Set(playerIds).size!==playerIds.length||playerIds.some((id)=>!id))throw new Error("Список игроков некорректен.");
  const teams:Record<string,AliasTeam>={};
  const teamPlayers:Record<AliasTeam,string[]>={red:[],blue:[]};
  playerIds.forEach((id,index)=>{const team:AliasTeam=index%2===0?"red":"blue";teams[id]=team;teamPlayers[team].push(id);});
  return {
    gameId:"alias",status:"active",players:[...playerIds],teams,teamPlayers,scores:{red:0,blue:0},scoreToWin:30,
    words:shuffle(WORDS,random),wordIndex:0,currentTeam:"red",explainerIndexes:{red:0,blue:0},round:1,
    winnerTeam:null,lastEvent:"Красная команда начинает объяснять слова."
  };
}
export function applyAliasAction(source:AliasState,playerId:string,action:AliasAction):AliasState{
  const state=structuredClone(source);
  if(state.status!=="active")throw new Error("Партия завершена.");
  if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
  if(state.teams[playerId]!==state.currentTeam)throw new Error("Сейчас ход другой команды.");
  if(activeExplainer(state)!==playerId)throw new Error("Сейчас объясняет другой игрок твоей команды.");
  if(action.type==="correct"||action.type==="skip"){
    if(action.type==="correct")state.scores[state.currentTeam]+=1;
    state.wordIndex+=1;
    if(state.scores[state.currentTeam]>=state.scoreToWin){
      state.status="finished";state.winnerTeam=state.currentTeam;state.lastEvent="Команда "+state.currentTeam+" набрала "+state.scoreToWin+" очков и победила.";
      return state;
    }
    state.lastEvent=action.type==="correct"?"Слово угадано! +1 очко.":"Слово пропущено.";
    if(state.wordIndex>=state.words.length)state.words=shuffle(state.words,()=>0.37),state.wordIndex=0;
    return state;
  }
  if(action.type==="end_turn"){
    state.explainerIndexes[state.currentTeam]+=1;
    state.currentTeam=state.currentTeam==="red"?"blue":"red";
    if(state.currentTeam==="red")state.round+=1;
    state.lastEvent="Ход завершён. Теперь объясняет команда "+state.currentTeam+".";
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getAliasPublicState(state:AliasState){
  return {
    gameId:state.gameId,status:state.status,players:state.players.map((id)=>({id,team:state.teams[id]})),
    scores:state.scores,scoreToWin:state.scoreToWin,currentTeam:state.currentTeam,
    currentExplainerId:activeExplainer(state),round:state.round,wordsPlayed:state.wordIndex,
    winnerTeam:state.winnerTeam,lastEvent:state.lastEvent
  };
}
export function getAliasPrivateState(state:AliasState,playerId:string){
  if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
  const isExplainer=activeExplainer(state)===playerId;
  return {isExplainer,word:isExplainer?state.words[state.wordIndex]||null:null};
}
