export type SHRole="liberal"|"fascist"|"hitler";
export type SHPolicy="liberal"|"fascist";
export type SHPhase="nominate"|"election"|"president_discard"|"chancellor_enact"|"investigate"|"execute"|"finished";
export interface SHState{
 gameId:"secret-hitler";status:"active"|"finished";hostId:string;players:string[];roles:Record<string,SHRole>;
 presidentIndex:number;chancellorId:string|null;previousChancellorId:string|null;phase:SHPhase;
 votes:Record<string,boolean>;policyDeck:SHPolicy[];discardPile:SHPolicy[];presidentHand:SHPolicy[];chancellorHand:SHPolicy[];
 liberalPolicies:number;fascistPolicies:number;electionTracker:number;winner:"liberal"|"fascist"|null;
 pendingPower:"investigate"|"execute"|null;investigationResults:Record<string,"liberal"|"fascist">;
 lastEvent:string;lastElection:"approved"|"rejected"|null;
}
export type SHAction=
 |{type:"nominate";targetId:string}
 |{type:"vote";approve:boolean}
 |{type:"president_discard";index:number}
 |{type:"chancellor_enact";index:number}
 |{type:"investigate";targetId:string}
 |{type:"execute";targetId:string}
 |{type:"end_game"};
function shuffle<T>(items:T[],random:()=>number):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function president(state:SHState){return state.players[state.presidentIndex];}
function activePlayers(state:SHState){return state.players.filter((id)=>state.roles[id]!=="dead" as never);}
function roleIsFascist(role:SHRole){return role==="fascist"||role==="hitler";}
function nextPresident(state:SHState){state.presidentIndex=(state.presidentIndex+1)%state.players.length;state.chancellorId=null;state.votes={};state.presidentHand=[];state.chancellorHand=[];state.pendingPower=null;state.phase="nominate";}
function powerFor(n:number,count:number):"investigate"|"execute"|null{
 if(n<=6)return count===3||count===4?"investigate":count===5?"execute":null;
 if(n<=8)return count===2||count===3?"investigate":count>=4&&count<=5?"execute":null;
 return count<=3?"investigate":count>=4&&count<=5?"execute":null;
}
function enactPolicy(state:SHState,policy:SHPolicy,random:()=>number){
 if(policy==="liberal")state.liberalPolicies++;else state.fascistPolicies++;
 state.electionTracker=0;state.lastElection="approved";state.lastEvent=policy==="liberal"?"Принят закон либералов.":"Принят закон фашистов.";
 if(state.liberalPolicies>=5){state.status="finished";state.phase="finished";state.winner="liberal";return;}
 if(state.fascistPolicies>=6){state.status="finished";state.phase="finished";state.winner="fascist";return;}
 if(policy==="fascist"){
  const power=powerFor(state.players.length,state.fascistPolicies);
  if(power){state.pendingPower=power;state.phase=power;return;}
 }
 nextPresident(state);
}
function drawPolicies(state:SHState,random:()=>number){
 if(state.policyDeck.length<3){state.policyDeck=shuffle([...state.policyDeck,...state.discardPile],random);state.discardPile=[];}
 return state.policyDeck.splice(0,3);
}
export function startSecretHitler(playerIds:string[],hostId:string,random:()=>number=Math.random):SHState{
 if(playerIds.length<5||playerIds.length>10)throw new Error("Для Secret Hitler нужно от 5 до 10 игроков.");
 if(new Set(playerIds).size!==playerIds.length||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
 const n=playerIds.length,fascists=n<=6?2:n<=8?3:4;
 const roles:SHRole[]=["hitler",...Array.from({length:fascists-1},()=>"fascist" as SHRole),...Array.from({length:n-fascists},()=>"liberal" as SHRole)];
 const shuffled=shuffle(roles,random),assigned:Record<string,SHRole>={};playerIds.forEach((id,index)=>assigned[id]=shuffled[index]);
 return {gameId:"secret-hitler",status:"active",hostId,players:[...playerIds],roles:assigned,presidentIndex:Math.floor(random()*n),chancellorId:null,previousChancellorId:null,phase:"nominate",votes:{},policyDeck:shuffle([...Array(11).fill("liberal" as SHPolicy),...Array(6).fill("fascist" as SHPolicy)],random),discardPile:[],presidentHand:[],chancellorHand:[],liberalPolicies:0,fascistPolicies:0,electionTracker:0,winner:null,pendingPower:null,investigationResults:{},lastEvent:"Роли розданы. Президент выдвигает канцлера.",lastElection:null};
}
export function applySecretHitlerAction(source:SHState,playerId:string,action:SHAction,random:()=>number=Math.random):SHState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Партия завершена.");if(!state.players.includes(playerId))throw new Error("Ты не участник партии.");
 if(action.type==="end_game"){if(playerId!==state.hostId)throw new Error("Завершить партию может только ведущий.");state.status="finished";state.phase="finished";state.winner=null;state.lastEvent="Ведущий завершил партию.";return state;}
 if(action.type==="nominate"){
  if(state.phase!=="nominate"||playerId!==president(state))throw new Error("Кандидата выдвигает президент.");
  if(action.targetId===playerId||!state.players.includes(action.targetId)||action.targetId===state.previousChancellorId)throw new Error("Этот кандидат сейчас не может стать канцлером.");
  state.chancellorId=action.targetId;state.votes={};state.phase="election";state.lastEvent="Президент выдвинул канцлера. Все голосуют.";return state;
 }
 if(action.type==="vote"){
  if(state.phase!=="election"||playerId in state.votes)throw new Error("Сейчас нельзя голосовать или голос уже подан.");
  state.votes[playerId]=Boolean(action.approve);
  if(Object.keys(state.votes).length===state.players.length){
   const yes=Object.values(state.votes).filter(Boolean).length>state.players.length/2;
   if(yes){
    state.lastElection="approved";
    if(state.roles[state.chancellorId!]==="hitler"&&state.fascistPolicies>=3){state.status="finished";state.phase="finished";state.winner="fascist";state.lastEvent="Гитлер избран канцлером после трёх фашистских законов. Побеждает фашизм.";return state;}
    state.phase="president_discard";state.presidentHand=drawPolicies(state,random);state.lastEvent="Правительство избрано. Президент получил три закона.";
   }else{
    state.lastElection="rejected";state.electionTracker++;state.lastEvent="Правительство отклонено.";
    if(state.electionTracker>=3){const policy=state.policyDeck.shift()||"liberal";state.lastEvent="Три выборы провалены. Автоматически принят закон.";enactPolicy(state,policy,random);}
    else nextPresident(state);
   }
  }else state.lastEvent="Голос принят. Ожидаем остальных.";
  return state;
 }
 if(action.type==="president_discard"){
  if(state.phase!=="president_discard"||playerId!==president(state))throw new Error("Законы может выбрать только президент.");
  if(!Number.isInteger(action.index)||action.index<0||action.index>=state.presidentHand.length)throw new Error("Некорректный выбор закона.");
  state.discardPile.push(state.presidentHand.splice(action.index,1)[0]);state.chancellorHand=[...state.presidentHand];state.presidentHand=[];state.phase="chancellor_enact";state.lastEvent="Президент передал канцлеру два закона.";return state;
 }
 if(action.type==="chancellor_enact"){
  if(state.phase!=="chancellor_enact"||playerId!==state.chancellorId)throw new Error("Закон выбирает только канцлер.");
  if(!Number.isInteger(action.index)||action.index<0||action.index>=state.chancellorHand.length)throw new Error("Некорректный выбор закона.");
  const policy=state.chancellorHand[action.index];state.discardPile.push(...state.chancellorHand.filter((_,i)=>i!==action.index));state.chancellorHand=[];
  state.previousChancellorId=state.chancellorId;enactPolicy(state,policy,random);return state;
 }
 if(action.type==="investigate"){
  if(state.phase!=="investigate"||playerId!==president(state))throw new Error("Расследование проводит президент.");
  if(!state.players.includes(action.targetId)||action.targetId===playerId)throw new Error("Выбери другого участника.");
  state.investigationResults[playerId+":"+action.targetId]=roleIsFascist(state.roles[action.targetId])?"fascist":"liberal";
  state.lastEvent="Президент завершил расследование.";
  nextPresident(state);return state;
 }
 if(action.type==="execute"){
  if(state.phase!=="execute"||playerId!==president(state))throw new Error("Казнь проводит президент.");
  if(!state.players.includes(action.targetId)||action.targetId===playerId)throw new Error("Выбери другого участника.");
  if(state.roles[action.targetId]==="hitler"){state.status="finished";state.phase="finished";state.winner="liberal";state.lastEvent="Гитлер устранён. Побеждают либералы.";return state;}
  state.roles[action.targetId]="dead" as SHRole;state.lastEvent="Игрок исключён из партии.";nextPresident(state);return state;
 }
 throw new Error("Неизвестное действие.");
}
export function getSecretHitlerPublicState(state:SHState){
 return {gameId:state.gameId,status:state.status,hostId:state.hostId,players:state.players.filter((id)=>state.roles[id]!=="dead").map((id)=>({id})),phase:state.phase,presidentId:president(state),chancellorId:state.chancellorId,liberalPolicies:state.liberalPolicies,fascistPolicies:state.fascistPolicies,electionTracker:state.electionTracker,votesCount:Object.keys(state.votes).length,missionVotesCount:state.chancellorHand.length,lastElection:state.lastElection,winner:state.winner,lastEvent:state.lastEvent,...(state.status==="finished"?{revealedRoles:state.roles}: {})};
}
export function getSecretHitlerPrivateState(state:SHState,playerId:string){
 if(!state.players.includes(playerId))throw new Error("Ты не участник партии.");
 const role=state.roles[playerId],allies=role==="fascist"?state.players.filter((id)=>id!==playerId&&state.roles[id]!=="liberal"&&state.roles[id]!=="dead"):[];
 const knowsHitler=role==="hitler"&&state.players.length<=6?state.players.filter((id)=>state.roles[id]==="fascist"):[];
 return {role,team:role==="liberal"?"liberal":"fascist",allies,knowsHitler,
 presidentPolicies:state.phase==="president_discard"&&president(state)===playerId?state.presidentHand:[],
 chancellorPolicies:state.phase==="chancellor_enact"&&state.chancellorId===playerId?state.chancellorHand:[],
 investigation:state.investigationResults[president(state)+":"+playerId]||null};
}
