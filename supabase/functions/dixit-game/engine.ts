export interface DixitCard{id:string;emoji:string;title:string;vision:string;}
export interface DixitSubmission{id:string;cardId:string;ownerId:string;}
export interface DixitState{
 gameId:"dixit";status:"active"|"finished";hostId:string;players:string[];cards:Record<string,DixitCard>;
 hands:Record<string,string[]>;deck:string[];discard:string[];scores:Record<string,number>;
 round:number;storytellerIndex:number;phase:"story"|"choose"|"vote"|"results"|"finished";
 clue:string;storyCardId:string|null;submissions:DixitSubmission[];votes:Record<string,string>;
 correctSubmissionId:string|null;winnerIds:string[];lastEvent:string;
}
export type DixitAction=
 |{type:"story";cardId:string;clue:string}
 |{type:"submit";cardId:string}
 |{type:"vote";submissionId:string}
 |{type:"next_round"}
 |{type:"end_game"};
const CARDS:DixitCard[]=[
["moon","🌙","Лунный сад","Серебряная тишина над спящим миром"],["key","🗝️","Ключ от неба","Дверь, которую можно открыть только мечтой"],["whale","🐋","Небесный кит","Огромное существо плывёт сквозь облака"],["clock","⏳","Песочные часы","Время течёт сквозь пальцы"],["forest","🌲","Шёпот леса","Деревья хранят забытые истории"],["mirror","🪞","Зеркальный мир","Отражение живёт собственной жизнью"],["lantern","🏮","Одинокий огонёк","Маленький свет в бесконечной темноте"],["bird","🕊️","Птица-комета","Свобода оставляет светящийся след"],["island","🏝️","Остров воспоминаний","Место, которого больше нет"],["mask","🎭","Чужое лицо","Кто скрывается за улыбкой"],["ship","⛵","Бумажный корабль","Большое путешествие начинается с малого"],["rose","🌹","Последний лепесток","Красота и хрупкость одного мгновения"],["door","🚪","Дверь без стены","Выбор существует даже без преград"],["cloud","☁️","Комната облаков","Дом, который нельзя удержать"],["crown","👑","Тяжёлая корона","Цена власти выше золота"],["fish","🐠","Рыба в небе","Мир перевернулся вверх ногами"],["mountain","⛰️","Гора желаний","Самый трудный путь ведёт к себе"],["train","🚂","Поезд в детство","Можно ли вернуться назад"],["star","⭐","Пойманная звезда","Невозможное стало почти реальным"],["book","📖","Книга без слов","История, которую каждый читает по-своему"],["fox","🦊","Хитрый проводник","Доверяй тому, кто знает дорогу"],["bridge","🌉","Мост между мирами","Два берега ищут общий язык"],["garden","🌷","Сад на крыше","Жизнь находит путь сквозь камень"],["fire","🔥","Танец искр","Красота, которая может обжечь"],["planet","🪐","Маленькая планета","Целый мир помещается в ладони"],["umbrella","☂️","Защита от дождя","Иногда укрытие важнее победы"],["piano","🎹","Музыка тишины","Самая важная нота не звучит"],["castle","🏰","Замок из воздуха","Величие, построенное на мечте"],["butterfly","🦋","Крылья перемен","Новая жизнь начинается незаметно"],["compass","🧭","Север внутри","Путь не всегда показывает прибор"],["candle","🕯️","Последняя свеча","Надежда не обязана быть большой"],["rainbow","🌈","После бури","Обещание, которое появляется ненадолго"],["wolf","🐺","Зов стаи","Одиночество среди своих"],["balloon","🎈","Ускользающий праздник","Радость, которую нельзя привязать"],["desert","🏜️","Море песка","Там, где нет воды, рождаются миражи"],["heart","💗","Механическое сердце","Чувства можно собрать заново"],["theatre","🎪","Последний спектакль","Каждый играет свою роль"],["snow","❄️","Снежная память","Красота исчезает от прикосновения"],["ladder","🪜","Лестница в облака","Подъём без гарантии вершины"],["cave","🕳️","Голос из глубины","Ответ приходит изнутри"],["garden2","🌻","Солнце в кармане","Тепло можно носить с собой"],["boat","🛶","Тихая переправа","Нужно отпустить берег"],["fox2","🦝","Ночной гость","Не всё, что скрывается, опасно"],["feather","🪶","Лёгкое решение","Самое трудное иногда почти невесомо"],["hourglass","⌛","Песок судьбы","Один миг меняет всё"],["comet","☄️","Гость из космоса","Некоторые встречи случаются один раз"],["statue","🗿","Каменное ожидание","Терпение длиннее человеческой жизни"],["rain","🌧️","Дождь внутри","Погода зависит от мыслей"],["path","🛤️","Дорога домой","Самый длинный маршрут ведёт к началу"]
].map(([id,emoji,title,vision])=>({id,emoji,title,vision}));
function shuffle<T>(items:T[],random:()=>number):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function storyteller(state:DixitState){return state.players[state.storytellerIndex];}
function draw(state:DixitState,playerId:string,count:number,random:()=>number){for(let i=0;i<count;i++){if(!state.deck.length){state.deck=shuffle(state.discard,random);state.discard=[];}const id=state.deck.pop();if(id)state.hands[playerId].push(id);}}
function scoreRound(state:DixitState,random:()=>number){
 const votes=Object.values(state.votes),correct=state.correctSubmissionId!;
 const correctVotes=votes.filter((id)=>id===correct).length,guessers=state.players.filter((id)=>id!==storyteller(state)).length;
 if(correctVotes===0||correctVotes===guessers){for(const id of state.players){if(id!==storyteller(state))state.scores[id]+=2;}}
 else{state.scores[storyteller(state)]+=3;for(const id of state.players){if(id!==storyteller(state)&&state.votes[id]===correct)state.scores[id]+=3;}}
 for(const submission of state.submissions){if(submission.id!==correct){const count=votes.filter((id)=>id===submission.id).length;state.scores[submission.ownerId]+=count;}}
 state.discard.push(...state.submissions.map((item)=>item.cardId));
 for(const id of state.players)draw(state,id,6-state.hands[id].length,random);
 state.phase="results";
 state.lastEvent="Раунд завершён. Очки начислены, карты раскрыты.";
 if(state.round>=8||Object.values(state.scores).some((score)=>score>=30)){
   state.status="finished";state.phase="finished";const max=Math.max(...Object.values(state.scores));state.winnerIds=state.players.filter((id)=>state.scores[id]===max);
 }
}
export function startDixit(playerIds:string[],hostId:string,random:()=>number=Math.random):DixitState{
 if(playerIds.length<3||playerIds.length>8)throw new Error("Для Диксита нужно от 3 до 8 игроков.");
 if(new Set(playerIds).size!==playerIds.length||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
 const cards=Object.fromEntries(CARDS.map((card)=>[card.id,card]));
 const deck=shuffle(CARDS.map((card)=>card.id),random),hands:Record<string,string[]>={};
 for(const id of playerIds){hands[id]=deck.splice(0,6);}
 return {gameId:"dixit",status:"active",hostId,players:[...playerIds],cards,hands,deck,discard:[],scores:Object.fromEntries(playerIds.map((id)=>[id,0])),round:1,storytellerIndex:0,phase:"story",clue:"",storyCardId:null,submissions:[],votes:{},correctSubmissionId:null,winnerIds:[],lastEvent:"Первый рассказчик выбирает карту и придумывает подсказку."};
}
export function applyDixitAction(source:DixitState,playerId:string,action:DixitAction,random:()=>number=Math.random):DixitState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Игра завершена.");if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 if(action.type==="end_game"){if(playerId!==state.hostId)throw new Error("Завершить игру может только ведущий.");state.status="finished";state.phase="finished";const max=Math.max(...Object.values(state.scores));state.winnerIds=state.players.filter((id)=>state.scores[id]===max);state.lastEvent="Ведущий завершил игру.";return state;}
 if(action.type==="story"){
  if(state.phase!=="story"||playerId!==storyteller(state))throw new Error("Сейчас ход рассказчика.");
  if(!state.hands[playerId].includes(action.cardId))throw new Error("Этой карты нет в твоей руке.");
  const clue=String(action.clue||"").trim().slice(0,120);if(clue.length<2)throw new Error("Подсказка слишком короткая.");
  state.hands[playerId]=state.hands[playerId].filter((id)=>id!==action.cardId);state.storyCardId=action.cardId;state.clue=clue;
  state.submissions=[{id:"story-"+crypto.randomUUID(),cardId:action.cardId,ownerId:playerId}];state.phase="choose";state.lastEvent="Рассказчик дал подсказку. Остальные выбирают карты.";return state;
 }
 if(action.type==="submit"){
  if(state.phase!=="choose"||playerId===storyteller(state))throw new Error("Сейчас выбирают карты остальные игроки.");
  if(state.submissions.some((item)=>item.ownerId===playerId))throw new Error("Ты уже положил карту.");
  if(!state.hands[playerId].includes(action.cardId))throw new Error("Этой карты нет в твоей руке.");
  state.hands[playerId]=state.hands[playerId].filter((id)=>id!==action.cardId);
  state.submissions.push({id:"sub-"+crypto.randomUUID(),cardId:action.cardId,ownerId:playerId});
  if(state.submissions.length===state.players.length){state.phase="vote";state.lastEvent="Все карты выложены. Выберите карту рассказчика.";}
  else state.lastEvent="Карта принята. Ожидаем остальных.";
  return state;
 }
 if(action.type==="vote"){
  if(state.phase!=="vote"||playerId===storyteller(state))throw new Error("Сейчас голосуют остальные игроки.");
  if(state.votes[playerId])throw new Error("Ты уже проголосовал.");
  const submission=state.submissions.find((item)=>item.id===action.submissionId);
  if(!submission||submission.ownerId===playerId)throw new Error("Нельзя голосовать за свою карту.");
  state.votes[playerId]=action.submissionId;
  const voters=state.players.filter((id)=>id!==storyteller(state));
  if(voters.every((id)=>state.votes[id])){
    state.correctSubmissionId=state.submissions.find((item)=>item.cardId===state.storyCardId)!.id;
    scoreRound(state,random);
  }else state.lastEvent="Голос принят. Ожидаем остальных.";
  return state;
 }
 if(action.type==="next_round"){
  if(state.phase!=="results"||playerId!==storyteller(state))throw new Error("Следующий раунд запускает рассказчик.");
  state.round+=1;state.storytellerIndex=(state.storytellerIndex+1)%state.players.length;state.phase="story";
  state.clue="";state.storyCardId=null;state.submissions=[];state.votes={};state.correctSubmissionId=null;
  state.lastEvent="Новый раунд. Рассказчик меняется.";
  return state;
 }
 throw new Error("Неизвестное действие.");
}
export function getDixitPublicState(state:DixitState){
 const show=state.phase==="vote"||state.phase==="results"||state.phase==="finished";
 return {gameId:state.gameId,status:state.status,hostId:state.hostId,players:state.players,scores:state.scores,round:state.round,
 storytellerId:storyteller(state),phase:state.phase,clue:state.clue,submissionCount:state.submissions.length,
 submissions:show?state.submissions.map((item)=>({id:item.id,...state.cards[item.cardId],...(state.phase==="results"||state.phase==="finished"?{ownerId:item.ownerId}: {})})):[],
 votesCount:Object.keys(state.votes).length,correctSubmissionId:state.phase==="results"||state.phase==="finished"?state.correctSubmissionId:null,
 winnerIds:state.winnerIds,lastEvent:state.lastEvent};
}
export function getDixitPrivateState(state:DixitState,playerId:string){
 if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
 return {hand:state.hands[playerId].map((id)=>state.cards[id]),isStoryteller:storyteller(state)===playerId,
 hasSubmitted:state.submissions.some((item)=>item.ownerId===playerId),hasVoted:Boolean(state.votes[playerId])};
}
