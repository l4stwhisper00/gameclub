export interface SpyfallLocation { name: string; category: string; roles: string[]; }
export interface SpyfallState {
  gameId: "spyfall"; status: "active" | "finished"; hostId: string; players: string[];
  spyId: string; location: SpyfallLocation; rolesByPlayer: Record<string,string>;
  turnOrder: string[]; currentAskerId: string; questions: { from: string; to: string; text: string }[];
  winner: "spy" | "agents" | null; lastEvent: string;
}
export type SpyfallAction =
  | { type: "ask"; targetId: string; text: string }
  | { type: "accuse"; suspectId: string }
  | { type: "guess_location"; guess: string }
  | { type: "end_round" };

const LOCATIONS: SpyfallLocation[] = [
  {name:"Аэропорт",category:"Путешествия",roles:["Пилот","Пассажир","Таможенник","Диспетчер","Бортпроводник","Инженер"]},
  {name:"Больница",category:"Медицина",roles:["Хирург","Пациент","Медсестра","Санитар","Посетитель","Главврач"]},
  {name:"Космическая станция",category:"Наука",roles:["Командир","Учёный","Инженер","Медик","Техник","Стажёр"]},
  {name:"Подводная лодка",category:"Транспорт",roles:["Капитан","Механик","Сонарщик","Матрос","Штурман","Офицер"]},
  {name:"Кинотеатр",category:"Развлечения",roles:["Кассир","Киномеханик","Зритель","Критик","Охранник","Уборщик"]},
  {name:"Отель",category:"Общественные места",roles:["Администратор","Горничная","Постоялец","Портье","Шеф-повар","Охранник"]},
  {name:"Полицейский участок",category:"Город",roles:["Детектив","Подозреваемый","Офицер","Адвокат","Секретарь","Начальник"]},
  {name:"Пиратский корабль",category:"Приключения",roles:["Капитан","Кок","Навигатор","Юнга","Канонир","Пленник"]},
  {name:"Университет",category:"Образование",roles:["Профессор","Студент","Декан","Библиотекарь","Лаборант","Охранник"]},
  {name:"Ресторан",category:"Еда",roles:["Шеф-повар","Официант","Клиент","Критик","Бармен","Курьер"]},
  {name:"Банк",category:"Финансы",roles:["Кассир","Клиент","Инкассатор","Менеджер","Охранник","Аудитор"]},
  {name:"Цирк",category:"Развлечения",roles:["Клоун","Акробат","Дрессировщик","Фокусник","Зритель","Директор"]},
  {name:"Секретная лаборатория",category:"Наука",roles:["Исследователь","Охранник","Испытуемый","Директор","Техник","Аналитик"]},
  {name:"Горнолыжный курорт",category:"Отдых",roles:["Инструктор","Лыжник","Спасатель","Турист","Врач","Механик"]},
  {name:"Посольство",category:"Политика",roles:["Посол","Дипломат","Переводчик","Охранник","Журналист","Гость"]},
  {name:"Свадьба",category:"События",roles:["Жених","Невеста","Фотограф","Гость","Ведущий","Музыкант"]},
  {name:"Музей",category:"Культура",roles:["Экскурсовод","Посетитель","Реставратор","Охранник","Куратор","Археолог"]},
  {name:"Стадион",category:"Спорт",roles:["Тренер","Игрок","Судья","Болельщик","Комментатор","Врач"]},
  {name:"Пожарная станция",category:"Службы",roles:["Пожарный","Диспетчер","Командир","Механик","Стажёр","Спасатель"]},
  {name:"Телестудия",category:"Медиа",roles:["Ведущий","Оператор","Режиссёр","Гость","Гримёр","Продюсер"]}
];
function shuffle<T>(items:T[],random:()=>number):T[]{
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function startSpyfall(playerIds:string[],hostId:string,random:()=>number=Math.random):SpyfallState{
  if(playerIds.length<3||playerIds.length>12)throw new Error("Для Spyfall нужно от 3 до 12 игроков.");
  if(new Set(playerIds).size!==playerIds.length||playerIds.some((id)=>!id)||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
  const location=LOCATIONS[Math.floor(random()*LOCATIONS.length)];
  const spyId=playerIds[Math.floor(random()*playerIds.length)];
  const turnOrder=shuffle(playerIds,random);
  const nonSpies=turnOrder.filter((id)=>id!==spyId);
  const rolesByPlayer:Record<string,string>={};
  nonSpies.forEach((id,index)=>{rolesByPlayer[id]=location.roles[index%location.roles.length];});
  return {
    gameId:"spyfall",status:"active",hostId,players:[...playerIds],spyId,location,rolesByPlayer,
    turnOrder,currentAskerId:turnOrder[0],questions:[],winner:null,lastEvent:"Раунд начался. Задавайте вопросы, чтобы вычислить шпиона."
  };
}
export function applySpyfallAction(source:SpyfallState,playerId:string,action:SpyfallAction):SpyfallState{
  const state=structuredClone(source);
  if(state.status!=="active")throw new Error("Раунд завершён.");
  if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
  if(action.type==="ask"){
    if(state.currentAskerId!==playerId)throw new Error("Сейчас задаёт вопрос другой игрок.");
    if(!state.players.includes(action.targetId)||action.targetId===playerId)throw new Error("Выбери другого участника.");
    const text=String(action.text||"").trim().slice(0,180);
    if(text.length<3)throw new Error("Вопрос должен содержать хотя бы 3 символа.");
    state.questions.unshift({from:playerId,to:action.targetId,text});
    state.questions=state.questions.slice(0,30);
    state.currentAskerId=action.targetId;
    state.lastEvent=playerId+" задал вопрос игроку "+action.targetId+".";
    return state;
  }
  if(action.type==="accuse"){
    if(action.suspectId===playerId||!state.players.includes(action.suspectId))throw new Error("Выбери другого участника.");
    state.status="finished";
    state.winner=action.suspectId===state.spyId?"agents":"spy";
    state.lastEvent=state.winner==="agents"?"Шпион раскрыт. Победили агенты.":"Обвинение оказалось ошибочным. Победил шпион.";
    return state;
  }
  if(action.type==="guess_location"){
    if(playerId!==state.spyId)throw new Error("Только шпион может угадать локацию.");
    const guess=String(action.guess||"").trim().toLocaleLowerCase().replace(/ё/g,"е");
    const answer=state.location.name.toLocaleLowerCase().replace(/ё/g,"е");
    state.status="finished";
    state.winner=guess===answer?"spy":"agents";
    state.lastEvent=state.winner==="spy"?"Шпион угадал локацию и победил.":"Шпион ошибся с локацией. Победили агенты.";
    return state;
  }
  if(action.type==="end_round"){
    if(playerId!==state.hostId)throw new Error("Завершить раунд может только ведущий.");
    state.status="finished";state.winner=null;state.lastEvent="Ведущий завершил раунд.";
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getSpyfallPublicState(state:SpyfallState){
  return {
    gameId:state.gameId,status:state.status,hostId:state.hostId,
    players:state.players.map((id)=>({id})),category:state.location.category,
    turnOrder:state.turnOrder,currentAskerId:state.currentAskerId,
    questions:state.questions,winner:state.winner,lastEvent:state.lastEvent
  };
}
export function getSpyfallPrivateState(state:SpyfallState,playerId:string){
  if(!state.players.includes(playerId))throw new Error("Ты не участник игры.");
  const isSpy=playerId===state.spyId;
  return isSpy?{isSpy:true,category:state.location.category,location:null,role:null}
    :{isSpy:false,category:state.location.category,location:state.location.name,role:state.rolesByPlayer[playerId]};
}
