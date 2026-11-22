export type BGColor="white"|"black";
export interface BGPoint{owner:BGColor|null;count:number;}
export interface BGMove{from:string;to:string;die:number;}
export interface BackgammonState{
 gameId:"backgammon";status:"active"|"finished";whiteId:string;blackId:string;currentPlayer:BGColor;
 board:BGPoint[];bar:Record<BGColor,number>;borneOff:Record<BGColor,number>;
 dice:number[];phase:"roll"|"move"|"finished";winner:BGColor|null;lastEvent:string;
}
export type BackgammonAction={type:"roll"}|{type:"move";from:string;to:string;die:number};
function emptyBoard():BGPoint[]{return Array.from({length:24},()=>({owner:null,count:0}));}
function put(board:BGPoint[],index:number,owner:BGColor,count:number){board[index]={owner,count};}
function other(color:BGColor):BGColor{return color==="white"?"black":"white";}
function playerId(state:BackgammonState,color:BGColor){return color==="white"?state.whiteId:state.blackId;}
function homeReady(state:BackgammonState,color:BGColor){
 if(state.bar[color]>0)return false;
 return state.board.every((point,index)=>point.owner!==color||(color==="white"?index<=5:index>=18));
}
function canBearOff(state:BackgammonState,color:BGColor,from:number,die:number){
 if(!homeReady(state,color))return false;
 if(color==="white"){
  const needed=from+1;if(die<needed)return false;
  if(die>needed&&state.board.some((point,index)=>index>from&&point.owner==="white"&&point.count>0))return false;
  return true;
 }
 const needed=24-from;if(die<needed)return false;
 if(die>needed&&state.board.some((point,index)=>index<from&&point.owner==="black"&&point.count>0))return false;
 return true;
}
function rawLegalMoves(state:BackgammonState):BGMove[]{
 if(state.phase!=="move"||state.status!=="active")return [];
 const color=state.currentPlayer,opponent=other(color),moves:BGMove[]=[];
 const sources=state.bar[color]>0?["bar"]:state.board.map((point,index)=>point.owner===color&&point.count>0?String(index):null).filter((value):value is string=>value!==null);
 for(const die of new Set(state.dice)){
  for(const from of sources){
   let to:number;
   if(from==="bar")to=color==="white"?24-die:die-1;
   else to=Number(from)+(color==="white"?-die:die);
   if(to<0||to>=24){
    if(from!=="bar"&&canBearOff(state,color,Number(from),die))moves.push({from,to:"off",die});
    continue;
   }
   const point=state.board[to];
   if(point.owner===opponent&&point.count>=2)continue;
   moves.push({from,to:String(to),die});
  }
 }
 return moves;
}
function simulateMove(source:BackgammonState,move:BGMove):BackgammonState{
 const state=structuredClone(source),color=state.currentPlayer,opponent=other(color);
 if(move.from==="bar")state.bar[color]--;
 else{const from=Number(move.from),point=state.board[from];point.count--;if(point.count===0)point.owner=null;}
 if(move.to==="off")state.borneOff[color]++;
 else{const to=Number(move.to),point=state.board[to];if(point.owner===opponent&&point.count===1){state.bar[opponent]++;point.owner=null;point.count=0;}if(point.count===0)point.owner=color;point.count++;}
 const index=state.dice.indexOf(move.die);if(index>=0)state.dice.splice(index,1);
 return state;
}
function maxPlayable(state:BackgammonState,memo:Map<string,number>):number{
 if(!state.dice.length)return 0;
 const key=JSON.stringify([state.board,state.bar,state.borneOff,state.dice,state.currentPlayer]);
 const cached=memo.get(key);if(cached!==undefined)return cached;
 const moves=rawLegalMoves(state);if(!moves.length){memo.set(key,0);return 0;}
 let max=0;
 for(const move of moves)max=Math.max(max,1+maxPlayable(simulateMove(state,move),memo));
 memo.set(key,max);return max;
}
export function getLegalBackgammonMoves(state:BackgammonState):BGMove[]{
 const raw=rawLegalMoves(state);if(!raw.length)return [];
 const memo=new Map<string,number>(),max=maxPlayable(state,memo);
 let legal=raw.filter((move)=>1+maxPlayable(simulateMove(state,move),memo)===max);
 if(max===1&&state.dice.length>1){
  const highest=Math.max(...state.dice),highMoves=legal.filter((move)=>move.die===highest);
  if(highMoves.length)legal=highMoves;
 }
 return legal;
}
function finishTurn(state:BackgammonState){
 state.currentPlayer=other(state.currentPlayer);state.dice=[];state.phase="roll";
 state.lastEvent="Ход завершён. Теперь ходит "+state.currentPlayer+".";
}
export function startBackgammon(playerIds:string[]):BackgammonState{
 if(playerIds.length!==2||new Set(playerIds).size!==2)throw new Error("Для нард нужны ровно два разных игрока.");
 const board=emptyBoard();
 put(board,23,"white",2);put(board,12,"white",5);put(board,7,"white",3);put(board,5,"white",5);
 put(board,0,"black",2);put(board,11,"black",5);put(board,16,"black",3);put(board,18,"black",5);
 return {gameId:"backgammon",status:"active",whiteId:playerIds[0],blackId:playerIds[1],currentPlayer:"white",board,bar:{white:0,black:0},borneOff:{white:0,black:0},dice:[],phase:"roll",winner:null,lastEvent:"Белые начинают. Брось кубики."};
}
export function applyBackgammonAction(source:BackgammonState,userId:string,action:BackgammonAction,random:()=>number=Math.random):BackgammonState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Партия завершена.");
 if(playerId(state,state.currentPlayer)!==userId)throw new Error("Сейчас ход другого игрока.");
 if(action.type==="roll"){
  if(state.phase!=="roll")throw new Error("Сначала используй текущие кубики.");
  const first=Math.floor(random()*6)+1,second=Math.floor(random()*6)+1;
  state.dice=first===second?[first,first,first,first]:[first,second];state.phase="move";
  if(!getLegalBackgammonMoves(state).length){finishTurn(state);state.lastEvent="Нет допустимых ходов. Ход автоматически передан сопернику.";}
  else state.lastEvent="Кубики: "+first+" и "+second+". Выбери допустимый ход.";
  return state;
 }
 const legal=getLegalBackgammonMoves(state);
 const move=legal.find((item)=>item.from===action.from&&item.to===action.to&&item.die===action.die);
 if(!move)throw new Error("Такой ход невозможен. Проверь кубики, блоки и правила выхода.");
 const color=state.currentPlayer,opponent=other(color);
 if(move.from==="bar")state.bar[color]--;
 else{
  const from=Number(move.from),point=state.board[from];point.count--;if(point.count===0)point.owner=null;
 }
 if(move.to==="off")state.borneOff[color]++;
 else{
  const to=Number(move.to),point=state.board[to];
  if(point.owner===opponent&&point.count===1){state.bar[opponent]++;point.owner=null;point.count=0;}
  if(point.count===0)point.owner=color;
  point.count++;
 }
 const dieIndex=state.dice.indexOf(move.die);state.dice.splice(dieIndex,1);
 if(state.borneOff[color]>=15){state.status="finished";state.phase="finished";state.winner=color;state.lastEvent="Все 15 шашек выведены. Победа "+color+"!";return state;}
 if(!state.dice.length||!getLegalBackgammonMoves(state).length){finishTurn(state);}
 else{state.phase="move";state.lastEvent="Ход выполнен. Используй оставшиеся кубики.";}
 return state;
}
export function getBackgammonPublicState(state:BackgammonState){
 return {gameId:state.gameId,status:state.status,whiteId:state.whiteId,blackId:state.blackId,currentPlayer:state.currentPlayer,currentPlayerId:playerId(state,state.currentPlayer),board:state.board,bar:state.bar,borneOff:state.borneOff,dice:state.dice,phase:state.phase,winner:state.winner,legalMoves:getLegalBackgammonMoves(state),lastEvent:state.lastEvent};
}
