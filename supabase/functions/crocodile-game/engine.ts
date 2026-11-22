export type CrocodileTeam="red"|"blue";
export interface CrocodileWord{word:string;category:string;}
export interface CrocodileState{
 gameId:"crocodile";status:"active"|"finished";hostId:string;players:string[];
 teams:Record<string,CrocodileTeam>;teamPlayers:Record<CrocodileTeam,string[]>;
 scores:Record<CrocodileTeam,number>;scoreToWin:number;words:CrocodileWord[];wordIndex:number;
 currentActorId:string;turnIndexes:Record<CrocodileTeam,number>;winner:CrocodileTeam|null;lastEvent:string;
}
export type CrocodileAction={type:"guess";guess:string}|{type:"skip"}|{type:"end_game"};
const WORDS:CrocodileWord[]=[
{word:"Пингвин",category:"Животные"},{word:"Космонавт",category:"Профессии"},{word:"Водопад",category:"Природа"},{word:"Свадьба",category:"События"},{word:"Телефон",category:"Предметы"},{word:"Дирижёр",category:"Профессии"},{word:"Пирамида",category:"Места"},{word:"Пожар",category:"События"},{word:"Сёрфинг",category:"Спорт"},{word:"Бабочка",category:"Животные"},
{word:"Кофеварка",category:"Предметы"},{word:"Вулкан",category:"Природа"},{word:"Балерина",category:"Профессии"},{word:"Подводная лодка",category:"Транспорт"},{word:"Фокусник",category:"Профессии"},{word:"Мороженое",category:"Еда"},{word:"Парашют",category:"Предметы"},{word:"Снеговик",category:"Природа"},{word:"Рок-концерт",category:"События"},{word:"Черепаха",category:"Животные"},
{word:"Горнолыжник",category:"Спорт"},{word:"Пылесос",category:"Предметы"},{word:"Театр",category:"Места"},{word:"Ракета",category:"Транспорт"},{word:"Рыбалка",category:"Хобби"},{word:"Дракон",category:"Фантазия"},{word:"Пират",category:"Персонажи"},{word:"Маяк",category:"Места"},{word:"Скейтборд",category:"Спорт"},{word:"Гитара",category:"Музыка"}
];
function shuffle<T>(items:T[],random:()=>number):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function actor(state:CrocodileState):string{const team=state.teams[state.currentActorId];return state.teamPlayers[team][state.turnIndexes[team]%state.teamPlayers[team].length];}
function advance(state:CrocodileState,random:()=>number):void{
 const team=state.teams[state.currentActorId];state.turnIndexes[team]+=1;
 const nextTeam:CrocodileTeam=team==="red"?"blue":"red";
 state.currentActorId=state.teamPlayers[nextTeam][state.turnIndexes[nextTeam]%state.teamPlayers[nextTeam].length];
 state.wordIndex+=1;if(state.wordIndex>=state.words.length){state.words=shuffle(state.words,random);state.wordIndex=0;}
}
export function startCrocodile(playerIds:string[],hostId:string,random:()=>number=Math.random):CrocodileState{
 if(playerIds.length<3||playerIds.length>12)throw new Error("Для Крокодила нужно от 3 до 12 игроков.");
 if(new Set(playerIds).size!==playerIds.length||playerIds.some((id)=>!id)||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
 const teams:Record<string,CrocodileTeam>={},teamPlayers:Record<CrocodileTeam,string[]>={red:[],blue:[]};
 playerIds.forEach((id,index)=>{const team:CrocodileTeam=index%2===0?"red":"blue";teams[id]=team;teamPlayers[team].push(id);});
 const currentActorId=teamPlayers.red[0];
 return {gameId:"crocodile",status:"active",hostId,players:[...playerIds],teams,teamPlayers,scores:{red:0,blue:0},scoreToWin:15,words:shuffle(WORDS,random),wordIndex:0,currentActorId,turnIndexes:{red:0,blue:0},winner:null,lastEvent:"Красная команда начинает показывать слово."};
}
export function applyCrocodileAction(source:CrocodileState,playerId:string,action:CrocodileAction,random:()=>number=Math.random):CrocodileState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Партия завершена.");if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 if(action.type==="end_game"){if(playerId!==state.hostId)throw new Error("Завершить игру может только ведущий.");state.status="finished";state.winner=null;state.lastEvent="Ведущий завершил игру.";return state;}
 if(action.type==="skip"){if(state.currentActorId!==playerId)throw new Error("Пропустить слово может только показывающий.");state.lastEvent="Слово пропущено.";advance(state,random);return state;}
 if(action.type==="guess"){
   if(state.currentActorId===playerId)throw new Error("Показывающий не может угадывать своё слово.");
   const normalize=(value:string)=>String(value||"").trim().toLocaleLowerCase().replace(/ё/g,"е").replace(/[!?.,]/g,"").replace(/\s+/g," ");
   if(normalize(action.guess)!==normalize(state.words[state.wordIndex].word)){state.lastEvent="Ответ не совпал. Продолжайте угадывать.";return state;}
   const team=state.teams[state.currentActorId];state.scores[team]+=1;
   if(state.scores[team]>=state.scoreToWin){state.status="finished";state.winner=team;state.lastEvent="Команда "+team+" первой набрала "+state.scoreToWin+" очков.";return state;}
   state.lastEvent="Верно! Команда "+team+" получает очко.";advance(state,random);return state;
 }
 throw new Error("Неизвестное действие.");
}
export function getCrocodilePublicState(state:CrocodileState){
 return {gameId:state.gameId,status:state.status,hostId:state.hostId,players:state.players.map((id)=>({id,team:state.teams[id]})),scores:state.scores,scoreToWin:state.scoreToWin,currentActorId:state.currentActorId,currentTeam:state.teams[state.currentActorId],category:state.words[state.wordIndex]?.category,round:state.wordIndex,winner:state.winner,lastEvent:state.lastEvent};
}
export function getCrocodilePrivateState(state:CrocodileState,playerId:string){
 if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 const isActor=state.status==="active"&&state.currentActorId===playerId;
 return {isActor,word:isActor?state.words[state.wordIndex]?.word:null};
}
