export type MonopolySpaceType = "go" | "property" | "railroad" | "utility" | "tax" | "chance" | "community" | "jail" | "free" | "go_to_jail";
export interface MonopolySpace {
  index: number; name: string; type: MonopolySpaceType; color?: string; price?: number;
  rent?: number[]; houseCost?: number; tax?: number;
}
export interface MonopolyPlayer {
  id: string; cash: number; position: number; jailed: boolean; jailTurns: number;
  jailCards: number; bankrupt: boolean;
}
export interface MonopolyProperty {
  ownerId: string | null; houses: number; mortgaged: boolean;
}
export interface MonopolyState {
  gameId: "monopoly"; status: "active" | "finished"; players: MonopolyPlayer[];
  board: MonopolySpace[]; properties: Record<number, MonopolyProperty>;
  currentPlayerIndex: number; phase: "roll" | "purchase" | "jail" | "finished";
  pendingSpace: number | null; lastDice: [number, number] | null; doublesCount: number;
  chanceIndex: number; communityIndex: number; winnerId: string | null;
  lastEvent: string;
}
export type MonopolyAction =
  | { type: "roll" }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "pay_jail" }
  | { type: "use_jail_card" }
  | { type: "roll_jail" }
  | { type: "build_house"; spaceIndex: number }
  | { type: "mortgage"; spaceIndex: number }
  | { type: "redeem"; spaceIndex: number };

const BOARD: MonopolySpace[] = [
  {index:0,name:"Старт",type:"go"},
  {index:1,name:"Старый город",type:"property",color:"brown",price:60,rent:[2,10,30,90,160,250],houseCost:50},
  {index:2,name:"Общественная казна",type:"community"},
  {index:3,name:"Рыночная улица",type:"property",color:"brown",price:60,rent:[4,20,60,180,320,450],houseCost:50},
  {index:4,name:"Налог на роскошь",type:"tax",tax:100},
  {index:5,name:"Северный вокзал",type:"railroad",price:200},
  {index:6,name:"Лазурный проспект",type:"property",color:"lightblue",price:100,rent:[6,30,90,270,400,550],houseCost:50},
  {index:7,name:"Шанс",type:"chance"},
  {index:8,name:"Набережная",type:"property",color:"lightblue",price:100,rent:[6,30,90,270,400,550],houseCost:50},
  {index:9,name:"Солнечная площадь",type:"property",color:"lightblue",price:120,rent:[8,40,100,300,450,600],houseCost:50},
  {index:10,name:"Тюрьма / посещение",type:"jail"},
  {index:11,name:"Театральная",type:"property",color:"pink",price:140,rent:[10,50,150,450,625,750],houseCost:100},
  {index:12,name:"Электростанция",type:"utility",price:150},
  {index:13,name:"Бульвар",type:"property",color:"pink",price:140,rent:[10,50,150,450,625,750],houseCost:100},
  {index:14,name:"Центральная улица",type:"property",color:"pink",price:160,rent:[12,60,180,500,700,900],houseCost:100},
  {index:15,name:"Южный вокзал",type:"railroad",price:200},
  {index:16,name:"Оранжевый квартал",type:"property",color:"orange",price:180,rent:[14,70,200,550,750,950],houseCost:100},
  {index:17,name:"Общественная казна",type:"community"},
  {index:18,name:"Парк фонтанов",type:"property",color:"orange",price:180,rent:[14,70,200,550,750,950],houseCost:100},
  {index:19,name:"Проспект победы",type:"property",color:"orange",price:200,rent:[16,80,220,600,800,1000],houseCost:100},
  {index:20,name:"Свободная стоянка",type:"free"},
  {index:21,name:"Красная площадь",type:"property",color:"red",price:220,rent:[18,90,250,700,875,1050],houseCost:150},
  {index:22,name:"Шанс",type:"chance"},
  {index:23,name:"Площадь искусств",type:"property",color:"red",price:220,rent:[18,90,250,700,875,1050],houseCost:150},
  {index:24,name:"Имперский проспект",type:"property",color:"red",price:240,rent:[20,100,300,750,925,1100],houseCost:150},
  {index:25,name:"Западный вокзал",type:"railroad",price:200},
  {index:26,name:"Золотая набережная",type:"property",color:"yellow",price:260,rent:[22,110,330,800,975,1150],houseCost:150},
  {index:27,name:"Садовая улица",type:"property",color:"yellow",price:260,rent:[22,110,330,800,975,1150],houseCost:150},
  {index:28,name:"Водоканал",type:"utility",price:150},
  {index:29,name:"Алмазный проспект",type:"property",color:"yellow",price:280,rent:[24,120,360,850,1025,1200],houseCost:150},
  {index:30,name:"Отправляйтесь в тюрьму",type:"go_to_jail"},
  {index:31,name:"Лесной квартал",type:"property",color:"green",price:300,rent:[26,130,390,900,1100,1275],houseCost:200},
  {index:32,name:"Университетская",type:"property",color:"green",price:300,rent:[26,130,390,900,1100,1275],houseCost:200},
  {index:33,name:"Общественная казна",type:"community"},
  {index:34,name:"Королевский парк",type:"property",color:"green",price:320,rent:[28,150,450,1000,1200,1400],houseCost:200},
  {index:35,name:"Восточный вокзал",type:"railroad",price:200},
  {index:36,name:"Шанс",type:"chance"},
  {index:37,name:"Парк авеню",type:"property",color:"darkblue",price:350,rent:[35,175,500,1100,1300,1500],houseCost:200},
  {index:38,name:"Городской сбор",type:"tax",tax:100},
  {index:39,name:"Площадь королей",type:"property",color:"darkblue",price:400,rent:[50,200,600,1400,1700,2000],houseCost:200}
];
const CHANCE = [
  {type:"go",value:0,text:"Продвиньтесь к старту и получите 200."},
  {type:"move",value:24,text:"Перейдите на Имперский проспект."},
  {type:"move",value:11,text:"Перейдите на Театральную."},
  {type:"jail",text:"Отправляйтесь в тюрьму."},
  {type:"cash",value:50,text:"Банк выплачивает дивиденды: +50."},
  {type:"pay",value:15,text:"Оплатите дорожный сбор: −15."},
  {type:"cash",value:100,text:"Вы выиграли конкурс: +100."},
  {type:"jail_card",text:"Получите карту освобождения из тюрьмы."}
];
const COMMUNITY = [
  {type:"go",value:0,text:"Продвиньтесь к старту и получите 200."},
  {type:"cash",value:200,text:"Возврат налога: +200."},
  {type:"pay",value:50,text:"Оплатите лечение: −50."},
  {type:"cash",value:50,text:"Подарок: +50."},
  {type:"jail",text:"Отправляйтесь в тюрьму."},
  {type:"jail_card",text:"Получите карту освобождения из тюрьмы."},
  {type:"pay",value:100,text:"Оплатите городской сбор: −100."},
  {type:"cash",value:25,text:"Банк выплачивает бонус: +25."}
];

function current(state: MonopolyState): MonopolyPlayer { return state.players[state.currentPlayerIndex]; }
function alive(state: MonopolyState): MonopolyPlayer[] { return state.players.filter((player) => !player.bankrupt); }
function finishTurn(state: MonopolyState): void {
  if (alive(state).length <= 1) {
    state.status = "finished"; state.phase = "finished"; state.winnerId = alive(state)[0]?.id || null;
    state.lastEvent = "Партия завершена. Победитель определён.";
    return;
  }
  let next = state.currentPlayerIndex;
  do { next = (next + 1) % state.players.length; } while (state.players[next].bankrupt);
  state.currentPlayerIndex = next;
  state.phase = state.players[next].jailed ? "jail" : "roll";
  state.pendingSpace = null; state.doublesCount = 0; state.lastDice = null;
}
function bankrupt(state: MonopolyState, player: MonopolyPlayer, creditorId: string | null): void {
  player.bankrupt = true;
  for (const [indexText, property] of Object.entries(state.properties)) {
    if (property.ownerId !== player.id) continue;
    if (creditorId) property.ownerId = creditorId;
    else { property.ownerId = null; property.houses = 0; property.mortgaged = false; }
  }
  if (state.players.filter((item) => !item.bankrupt).length <= 1) {
    state.status = "finished"; state.phase = "finished"; state.winnerId = state.players.find((item) => !item.bankrupt)?.id || null;
  }
}
function pay(state: MonopolyState, player: MonopolyPlayer, amount: number, creditorId: string | null): boolean {
  if (player.cash < amount) {
    bankrupt(state, player, creditorId);
    return false;
  }
  player.cash -= amount;
  if (creditorId) {
    const creditor = state.players.find((item) => item.id === creditorId);
    if (creditor && !creditor.bankrupt) creditor.cash += amount;
  }
  return true;
}
function goToJail(state: MonopolyState, player: MonopolyPlayer): void {
  player.position = 10; player.jailed = true; player.jailTurns = 0;
  state.phase = "roll"; state.pendingSpace = null; state.doublesCount = 0;
  state.lastEvent = player.id + " отправляется в тюрьму.";
  finishTurn(state);
}
function rentFor(state: MonopolyState, space: MonopolySpace, diceTotal: number): number {
  const property = state.properties[space.index];
  if (!property || property.mortgaged || !property.ownerId) return 0;
  if (space.type === "property") {
    const group = state.board.filter((item) => item.type === "property" && item.color === space.color);
    const monopoly = group.every((item) => state.properties[item.index].ownerId === property.ownerId);
    const rent = space.rent?.[property.houses] || 0;
    return property.houses === 0 && monopoly ? rent * 2 : rent;
  }
  if (space.type === "railroad") {
    const count = state.board.filter((item) => item.type === "railroad" && state.properties[item.index].ownerId === property.ownerId && !state.properties[item.index].mortgaged).length;
    return 25 * Math.pow(2, Math.max(0, count - 1));
  }
  if (space.type === "utility") {
    const count = state.board.filter((item) => item.type === "utility" && state.properties[item.index].ownerId === property.ownerId && !state.properties[item.index].mortgaged).length;
    return diceTotal * (count === 2 ? 10 : 4);
  }
  return 0;
}
function endLanding(state: MonopolyState, player: MonopolyPlayer, isDouble: boolean): void {
  if (state.status === "finished") return;
  if (player.bankrupt) { finishTurn(state); return; }
  if (isDouble && !player.jailed) {
    state.phase = "roll";
    state.lastEvent += " Дубль — дополнительный бросок.";
  } else finishTurn(state);
}
function resolveLanding(state: MonopolyState, player: MonopolyPlayer, diceTotal: number, isDouble: boolean, random: () => number): void {
  const space = state.board[player.position];
  if (space.type === "go_to_jail") { goToJail(state, player); return; }
  if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
    const property = state.properties[space.index];
    if (!property.ownerId) {
      state.phase = "purchase"; state.pendingSpace = space.index;
      state.lastEvent = player.id + " остановился на " + space.name + ". Можно купить за " + space.price + ".";
      return;
    }
    if (property.ownerId !== player.id) {
      const rent = rentFor(state, space, diceTotal);
      if (rent > 0) {
        const paid = pay(state, player, rent, property.ownerId);
        state.lastEvent = paid ? player.id + " платит аренду " + rent + "." : player.id + " обанкротился из-за аренды.";
      } else state.lastEvent = "Участок заложен — аренда не взимается.";
    } else state.lastEvent = "Ты на своей собственности: " + space.name + ".";
    endLanding(state, player, isDouble); return;
  }
  if (space.type === "tax") {
    const paid = pay(state, player, space.tax || 0, null);
    state.lastEvent = paid ? "Уплачен налог: " + space.tax + "." : "Банкротство из-за налога.";
    endLanding(state, player, isDouble); return;
  }
  if (space.type === "chance" || space.type === "community") {
    const deck = space.type === "chance" ? CHANCE : COMMUNITY;
    const index = space.type === "chance" ? state.chanceIndex++ % deck.length : state.communityIndex++ % deck.length;
    const card = deck[index];
    state.lastEvent = (space.type === "chance" ? "Шанс: " : "Казна: ") + card.text;
    if (card.type === "cash") player.cash += card.value || 0;
    if (card.type === "pay") pay(state, player, card.value || 0, null);
    if (card.type === "jail_card") player.jailCards += 1;
    if (card.type === "jail") { goToJail(state, player); return; }
    if (card.type === "go") {
      if (player.position > 0) player.cash += 200;
      player.position = 0;
    }
    if (card.type === "move") {
      if ((card.value || 0) < player.position) player.cash += 200;
      player.position = card.value || 0;
      resolveLanding(state, player, diceTotal, false, random); return;
    }
    endLanding(state, player, isDouble); return;
  }
  state.lastEvent = space.type === "go" ? "Ты на старте." : space.type === "free" ? "Свободная стоянка. Отдыхай." : "Посещение тюрьмы.";
  endLanding(state, player, isDouble);
}
function movePlayer(state: MonopolyState, player: MonopolyPlayer, steps: number, isDouble: boolean, random: () => number): void {
  const previous = player.position;
  player.position = (player.position + steps) % 40;
  if (player.position < previous) player.cash += 200;
  resolveLanding(state, player, steps, isDouble, random);
}
export function startMonopoly(playerIds: string[]): MonopolyState {
  if (playerIds.length < 2 || playerIds.length > 6) throw new Error("Для Монополии нужно от 2 до 6 игроков.");
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) throw new Error("Список игроков некорректен.");
  return {
    gameId:"monopoly",status:"active",players:playerIds.map((id)=>({id,cash:1500,position:0,jailed:false,jailTurns:0,jailCards:0,bankrupt:false})),
    board:BOARD.map((space)=>({...space})),
    properties:Object.fromEntries(BOARD.filter((space)=>["property","railroad","utility"].includes(space.type)).map((space)=>[space.index,{ownerId:null,houses:0,mortgaged:false}])),
    currentPlayerIndex:0,phase:"roll",pendingSpace:null,lastDice:null,doublesCount:0,chanceIndex:0,communityIndex:0,winnerId:null,lastEvent:"Партия началась. Первый игрок бросает кубики."
  };
}
export function applyMonopolyAction(source: MonopolyState, playerId: string, action: MonopolyAction, random:()=>number=Math.random): MonopolyState {
  const state=structuredClone(source);
  if(state.status!=="active") throw new Error("Партия завершена.");
  const player=current(state);
  if(player.id!==playerId||player.bankrupt) throw new Error("Сейчас ход другого игрока.");
  if(action.type==="roll") {
    if(state.phase!=="roll"||player.jailed) throw new Error("Сначала реши вопрос с тюрьмой.");
    const d1=Math.floor(random()*6)+1,d2=Math.floor(random()*6)+1,isDouble=d1===d2;
    state.lastDice=[d1,d2];
    if(isDouble) state.doublesCount+=1; else state.doublesCount=0;
    if(state.doublesCount>=3){goToJail(state,player);return state;}
    state.lastEvent="Бросок: "+d1+" + "+d2+" = "+(d1+d2)+".";
    movePlayer(state,player,d1+d2,isDouble,random);
    return state;
  }
  if(action.type==="buy") {
    if(state.phase!=="purchase"||state.pendingSpace===null) throw new Error("Сейчас нет доступной покупки.");
    const space=state.board[state.pendingSpace];
    if(player.cash<(space.price||0)) throw new Error("Недостаточно денег для покупки.");
    player.cash-=space.price||0;
    state.properties[space.index].ownerId=player.id;
    state.lastEvent="Куплено: "+space.name+".";
    const isDouble=state.doublesCount>0;
    state.pendingSpace=null;endLanding(state,player,isDouble);
    return state;
  }
  if(action.type==="decline") {
    if(state.phase!=="purchase") throw new Error("Сейчас нечего отклонять.");
    state.lastEvent="Игрок отказался от покупки.";
    const isDouble=Boolean(state.lastDice&&state.lastDice[0]===state.lastDice[1]);
    state.pendingSpace=null;endLanding(state,player,isDouble);
    return state;
  }
  if(action.type==="pay_jail"||action.type==="use_jail_card"||action.type==="roll_jail") {
    if(state.phase!=="jail"||!player.jailed) throw new Error("Ты не находишься в тюрьме.");
    if(action.type==="pay_jail") {
      if(!pay(state,player,50,null)) return state;
      player.jailed=false;player.jailTurns=0;state.phase="roll";state.lastEvent="Штраф 50 уплачен. Можно бросать кубики.";
    } else if(action.type==="use_jail_card") {
      if(player.jailCards<1) throw new Error("У тебя нет карты освобождения.");
      player.jailCards-=1;player.jailed=false;player.jailTurns=0;state.phase="roll";state.lastEvent="Карта освобождения использована.";
    } else {
      const d1=Math.floor(random()*6)+1,d2=Math.floor(random()*6)+1;
      state.lastDice=[d1,d2];player.jailTurns+=1;
      if(d1===d2){player.jailed=false;player.jailTurns=0;state.phase="roll";state.lastEvent="Дубль! Ты выходишь из тюрьмы и перемещаешься.";movePlayer(state,player,d1+d2,false,random);}
      else if(player.jailTurns>=3){pay(state,player,50,null);player.jailed=false;player.jailTurns=0;state.phase="roll";state.lastEvent="Третий неудачный бросок. Штраф уплачен, можно перемещаться.";movePlayer(state,player,d1+d2,false,random);}
      else {state.lastEvent="Не удалось выбросить дубль. Попробуй снова в следующий ход.";finishTurn(state);}
    }
    return state;
  }
  if(action.type==="build_house") {
    if(state.phase!=="roll") throw new Error("Строить можно между ходами.");
    const space=state.board[action.spaceIndex],property=state.properties[action.spaceIndex];
    if(!space||space.type!=="property"||!property||property.ownerId!==player.id||property.mortgaged) throw new Error("Ты не владеешь этим участком.");
    const group=state.board.filter((item)=>item.type==="property"&&item.color===space.color);
    if(!group.every((item)=>state.properties[item.index].ownerId===player.id)) throw new Error("Сначала собери всю цветовую группу.");
    const minHouses=Math.min(...group.map((item)=>state.properties[item.index].houses));
    if(property.houses!==minHouses||property.houses>=5) throw new Error("Строй дома равномерно по всей группе.");
    const cost=space.houseCost||0;
    if(player.cash<cost) throw new Error("Недостаточно денег на строительство.");
    player.cash-=cost;property.houses+=1;
    state.lastEvent="На участке «"+space.name+"» построено улучшение №"+property.houses+".";
    return state;
  }
  if(action.type==="mortgage"||action.type==="redeem") {
    if(state.phase!=="roll") throw new Error("Управлять залогом можно между ходами.");
    const space=state.board[action.spaceIndex],property=state.properties[action.spaceIndex];
    if(!space||!property||space.price===undefined||property.ownerId!==player.id) throw new Error("Это не твоя собственность.");
    if(action.type==="mortgage") {
      const group=state.board.filter((item)=>item.type==="property"&&item.color===space.color);
      if(property.houses>0||group.some((item)=>state.properties[item.index].houses>0)) throw new Error("Сначала продай все улучшения цветовой группы.");
      if(property.mortgaged) throw new Error("Участок уже заложен.");
      property.mortgaged=true;player.cash+=Math.floor(space.price/2);state.lastEvent="Участок заложен банку.";
    } else {
      if(!property.mortgaged) throw new Error("Участок не заложен.");
      const cost=Math.ceil(space.price/2*1.1);
      if(player.cash<cost) throw new Error("Недостаточно денег для выкупа.");
      player.cash-=cost;property.mortgaged=false;state.lastEvent="Залог погашен.";
    }
    return state;
  }
  throw new Error("Неизвестное действие.");
}
export function getMonopolyPublicState(state: MonopolyState) {
  return {
    gameId:state.gameId,status:state.status,players:state.players,board:state.board,properties:state.properties,
    currentPlayerId:state.players[state.currentPlayerIndex]?.id||null,currentPlayerIndex:state.currentPlayerIndex,
    phase:state.phase,pendingSpace:state.pendingSpace,lastDice:state.lastDice,doublesCount:state.doublesCount,
    winnerId:state.winnerId,lastEvent:state.lastEvent
  };
}
