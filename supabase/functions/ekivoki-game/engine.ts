export type EkivokiTeam="sun"|"moon";
export type EkivokiMode="explain"|"pantomime"|"draw"|"one_word"|"sound";
export interface EkivokiCard{word:string;category:string;mode:EkivokiMode;}
export interface EkivokiState{
 gameId:"ekivoki";status:"active"|"finished";hostId:string;players:string[];
 teams:Record<string,EkivokiTeam>;teamPlayers:Record<EkivokiTeam,string[]>;
 scores:Record<EkivokiTeam,number>;scoreToWin:number;cards:EkivokiCard[];cardIndex:number;
 currentActorId:string;turnIndexes:Record<EkivokiTeam,number>;winner:EkivokiTeam|null;lastEvent:string;
}
export type EkivokiAction={type:"guess";guess:string}|{type:"skip"}|{type:"end_game"};
const CARDS:EkivokiCard[]=[
["Пингвин","Животные","pantomime"],["Космонавт","Профессии","explain"],["Водопад","Природа","draw"],["Свадьба","События","sound"],["Телефон","Предметы","one_word"],["Дирижёр","Профессии","pantomime"],["Пирамида","Места","draw"],["Пожар","События","explain"],["Сёрфинг","Спорт","pantomime"],["Бабочка","Животные","draw"],
["Кофеварка","Предметы","explain"],["Вулкан","Природа","sound"],["Балерина","Профессии","pantomime"],["Подводная лодка","Транспорт","draw"],["Фокусник","Профессии","one_word"],["Мороженое","Еда","explain"],["Парашют","Предметы","pantomime"],["Снеговик","Природа","draw"],["Рок-концерт","События","sound"],["Черепаха","Животные","one_word"],
["Горнолыжник","Спорт","pantomime"],["Пылесос","Предметы","sound"],["Театр","Места","explain"],["Ракета","Транспорт","draw"],["Рыбалка","Хобби","pantomime"],["Дракон","Фантазия","draw"],["Пират","Персонажи","explain"],["Маяк","Места","one_word"],["Скейтборд","Спорт","pantomime"],["Гитара","Музыка","sound"],
["Садовник","Профессии","explain"],["Калейдоскоп","Предметы","draw"],["Медуза","Животные","pantomime"],["Планетарий","Места","one_word"],["Карусель","Развлечения","draw"],["Молния","Природа","sound"],["Кенгуру","Животные","pantomime"],["Почтальон","Профессии","explain"],["Бумеранг","Предметы","draw"],["Снежинка","Природа","one_word"]
].map(([word,category,mode])=>({word,category,mode:mode as EkivokiMode}));
function shuffle<T>(items:T[],random:()=>number):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function advance(state:EkivokiState,random:()=>number){const team=state.teams[state.currentActorId];state.turnIndexes[team]++;const next:EkivokiTeam=team==="sun"?"moon":"sun";state.currentActorId=state.teamPlayers[next][state.turnIndexes[next]%state.teamPlayers[next].length];state.cardIndex++;if(state.cardIndex>=state.cards.length){state.cards=shuffle(state.cards,random);state.cardIndex=0;}}
export function startEkivoki(playerIds:string[],hostId:string,random:()=>number=Math.random):EkivokiState{
 if(playerIds.length<3||playerIds.length>12)throw new Error("Для Экивоки нужно от 3 до 12 игроков.");
 if(new Set(playerIds).size!==playerIds.length||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
 const teams:Record<string,EkivokiTeam>={},teamPlayers:Record<EkivokiTeam,string[]>={sun:[],moon:[]};
 playerIds.forEach((id,index)=>{const team:EkivokiTeam=index%2===0?"sun":"moon";teams[id]=team;teamPlayers[team].push(id);});
 return {gameId:"ekivoki",status:"active",hostId,players:[...playerIds],teams,teamPlayers,scores:{sun:0,moon:0},scoreToWin:20,cards:shuffle(CARDS,random),cardIndex:0,currentActorId:teamPlayers.sun[0],turnIndexes:{sun:0,moon:0},winner:null,lastEvent:"Солнечная команда начинает первый ход."};
}
export function applyEkivokiAction(source:EkivokiState,playerId:string,action:EkivokiAction,random:()=>number=Math.random):EkivokiState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Игра завершена.");if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 if(action.type==="end_game"){if(playerId!==state.hostId)throw new Error("Завершить игру может только ведущий.");state.status="finished";state.winner=null;state.lastEvent="Ведущий завершил игру.";return state;}
 if(action.type==="skip"){if(state.currentActorId!==playerId)throw new Error("Пропустить карточку может только ведущий ход.");state.lastEvent="Карточка пропущена.";advance(state,random);return state;}
 if(action.type==="guess"){
  if(state.currentActorId===playerId)throw new Error("Показывающий не может угадывать свою карточку.");
  if(state.teams[playerId]!==state.teams[state.currentActorId])throw new Error("Отвечать может только команда показывающего.");
  const norm=(v:string)=>String(v||"").trim().toLocaleLowerCase().replace(/ё/g,"е").replace(/[!?.,]/g,"").replace(/\s+/g," ");
  if(norm(action.guess)!==norm(state.cards[state.cardIndex].word)){state.lastEvent="Пока неверно. Продолжайте.";return state;}
  const team=state.teams[state.currentActorId];state.scores[team]++;
  if(state.scores[team]>=state.scoreToWin){state.status="finished";state.winner=team;state.lastEvent="Команда "+team+" первой набрала "+state.scoreToWin+" очков.";return state;}
  state.lastEvent="Верно! +1 очко команде.";advance(state,random);return state;
 }
 throw new Error("Неизвестное действие.");
}
export function getEkivokiPublicState(state:EkivokiState){
 return {gameId:state.gameId,status:state.status,hostId:state.hostId,players:state.players.map((id)=>({id,team:state.teams[id]})),scores:state.scores,scoreToWin:state.scoreToWin,currentActorId:state.currentActorId,currentTeam:state.teams[state.currentActorId],category:state.cards[state.cardIndex]?.category,mode:state.cards[state.cardIndex]?.mode,cardIndex:state.cardIndex,winner:state.winner,lastEvent:state.lastEvent};
}
export function getEkivokiPrivateState(state:EkivokiState,playerId:string){
 if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 const isActor=state.status==="active"&&state.currentActorId===playerId;
 return {isActor,word:isActor?state.cards[state.cardIndex]?.word:null,mode:isActor?state.cards[state.cardIndex]?.mode:null};
}
