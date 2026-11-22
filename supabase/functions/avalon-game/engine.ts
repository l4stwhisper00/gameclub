export type AvalonRole="merlin"|"percival"|"assassin"|"morgana"|"mordred"|"oberon"|"minion"|"loyal";
export type AvalonPhase="propose"|"team_vote"|"mission_vote"|"mission_result"|"assassination"|"finished";
export interface AvalonState{
 gameId:"avalon";status:"active"|"finished";hostId:string;players:string[];roles:Record<string,AvalonRole>;
 phase:AvalonPhase;leaderIndex:number;mission:number;teamSize:number;proposal:string[];
 teamVotes:Record<string,boolean>;missionVotes:Record<string,"success"|"fail">;
 missionResults:boolean[];rejectedProposals:number;winner:"good"|"evil"|null;
 assassinationTarget:string|null;lastEvent:string;
}
export type AvalonAction=
 |{type:"propose";teamIds:string[]}
 |{type:"vote_team";approve:boolean}
 |{type:"vote_mission";choice:"success"|"fail"}
 |{type:"continue"}
 |{type:"assassinate";targetId:string}
 |{type:"end_game"};
const TEAM_SIZES:Record<number,number[]>={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
function shuffle<T>(items:T[],random:()=>number):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function evil(role:AvalonRole){return ["assassin","morgana","mordred","oberon","minion"].includes(role);}
function currentLeader(state:AvalonState){return state.players[state.leaderIndex];}
export function startAvalon(playerIds:string[],hostId:string,random:()=>number=Math.random):AvalonState{
 if(playerIds.length<5||playerIds.length>10)throw new Error("Для Авалона нужно от 5 до 10 игроков.");
 if(new Set(playerIds).size!==playerIds.length||!playerIds.includes(hostId))throw new Error("Список игроков некорректен.");
 const n=playerIds.length,evilCount=n<=6?2:n<=9?3:4;
 const roles:AvalonRole[]=["merlin"];
 if(n>=7)roles.push("percival");
 roles.push("assassin");
 if(n>=7)roles.push("morgana");
 if(n>=8)roles.push("mordred");
 if(n>=10)roles.push("oberon");
 while(roles.filter(evil).length<evilCount)roles.push("minion");
 while(roles.length<n)roles.push("loyal");
 const shuffled=shuffle(roles,random),assigned:Record<string,AvalonRole>={};
 playerIds.forEach((id,index)=>assigned[id]=shuffled[index]);
 return {gameId:"avalon",status:"active",hostId,players:[...playerIds],roles:assigned,phase:"propose",leaderIndex:Math.floor(random()*n),mission:1,teamSize:TEAM_SIZES[n][0],proposal:[],teamVotes:{},missionVotes:{},missionResults:[],rejectedProposals:0,winner:null,assassinationTarget:null,lastEvent:"Роли розданы. Лидер предлагает первую команду."};
}
export function applyAvalonAction(source:AvalonState,playerId:string,action:AvalonAction):AvalonState{
 const state=structuredClone(source);if(state.status!=="active")throw new Error("Партия завершена.");if(!state.players.includes(playerId))throw new Error("Ты не участник партии.");
 if(action.type==="end_game"){if(playerId!==state.hostId)throw new Error("Завершить партию может только ведущий.");state.status="finished";state.phase="finished";state.winner=null;state.lastEvent="Ведущий завершил партию.";return state;}
 if(action.type==="propose"){
  if(state.phase!=="propose"||playerId!==currentLeader(state))throw new Error("Команду предлагает текущий лидер.");
  if(action.teamIds.length!==state.teamSize||new Set(action.teamIds).size!==action.teamIds.length||action.teamIds.some((id)=>!state.players.includes(id)))throw new Error("Выбери ровно "+state.teamSize+" разных участников.");
  state.proposal=[...action.teamIds];state.teamVotes={};state.phase="team_vote";state.lastEvent="Лидер предложил команду. Все голосуют за её утверждение.";return state;
 }
 if(action.type==="vote_team"){
  if(state.phase!=="team_vote")throw new Error("Сейчас не голосование команды.");
  if(playerId in state.teamVotes)throw new Error("Ты уже проголосовал.");
  state.teamVotes[playerId]=Boolean(action.approve);
  if(Object.keys(state.teamVotes).length===state.players.length){
   const approvals=Object.values(state.teamVotes).filter(Boolean).length;
   if(approvals>state.players.length/2){state.phase="mission_vote";state.missionVotes={};state.lastEvent="Команда утверждена. Участники миссии тайно выбирают успех или провал.";}
   else{
    state.rejectedProposals+=1;state.proposal=[];state.leaderIndex=(state.leaderIndex+1)%state.players.length;
    if(state.rejectedProposals>=5){state.status="finished";state.phase="finished";state.winner="evil";state.lastEvent="Пять команд подряд отклонены. Побеждает зло.";}
    else{state.phase="propose";state.lastEvent="Команда отклонена. Лидер меняется.";}
   }
  }else state.lastEvent="Голос принят. Ожидаем остальных.";
  return state;
 }
 if(action.type==="vote_mission"){
  if(state.phase!=="mission_vote"||!state.proposal.includes(playerId))throw new Error("Голосовать за миссию могут только её участники.");
  if(playerId in state.missionVotes)throw new Error("Ты уже проголосовал.");
  if(action.choice==="fail"&&!evil(state.roles[playerId]))throw new Error("Верные слуги Артура обязаны голосовать за успех.");
  state.missionVotes[playerId]=action.choice;
  if(Object.keys(state.missionVotes).length===state.proposal.length){
   const fails=Object.values(state.missionVotes).filter((vote)=>vote==="fail").length;
   const requiredFails=state.mission===4&&state.players.length>=7?2:1;
   const success=fails<requiredFails;state.missionResults.push(success);
   const successes=state.missionResults.filter(Boolean).length,failed=state.missionResults.length-successes;
   if(failed>=3){state.status="finished";state.phase="finished";state.winner="evil";state.lastEvent="Три миссии провалены. Побеждает зло.";}
   else if(successes>=3){state.phase="assassination";state.lastEvent="Добро выполнило три миссии. Убийца пытается найти Мерлина.";}
   else{state.phase="mission_result";state.lastEvent=success?"Миссия успешна.":"Миссия провалена.";}
  }else state.lastEvent="Тайный голос принят. Ожидаем команду.";
  return state;
 }
 if(action.type==="continue"){
  if(state.phase!=="mission_result"||playerId!==currentLeader(state))throw new Error("Следующую миссию запускает текущий лидер.");
  state.mission+=1;state.leaderIndex=(state.leaderIndex+1)%state.players.length;
  state.teamSize=TEAM_SIZES[state.players.length][state.mission-1];state.proposal=[];state.teamVotes={};state.missionVotes={};state.rejectedProposals=0;state.phase="propose";
  state.lastEvent="Начинается миссия "+state.mission+". Лидер предлагает команду.";
  return state;
 }
 if(action.type==="assassinate"){
  if(state.phase!=="assassination"||state.roles[playerId]!=="assassin")throw new Error("Только убийца может выбрать цель.");
  if(!state.players.includes(action.targetId)||action.targetId===playerId)throw new Error("Выбери другого участника.");
  state.assassinationTarget=action.targetId;state.status="finished";state.phase="finished";
  state.winner=state.roles[action.targetId]==="merlin"?"evil":"good";
  state.lastEvent=state.winner==="evil"?"Убийца раскрыл Мерлина. Побеждает зло.":"Убийца ошибся. Побеждает добро.";
  return state;
 }
 throw new Error("Неизвестное действие.");
}
export function getAvalonPublicState(state:AvalonState){
 return {gameId:state.gameId,status:state.status,hostId:state.hostId,players:state.players,phase:state.phase,
 leaderId:currentLeader(state),mission:state.mission,teamSize:state.teamSize,proposal:state.proposal,
 teamVotesCount:Object.keys(state.teamVotes).length,missionVotesCount:Object.keys(state.missionVotes).length,
 missionResults:state.missionResults,rejectedProposals:state.rejectedProposals,winner:state.winner,
 assassinationTarget:state.assassinationTarget,lastEvent:state.lastEvent};
}
export function getAvalonPrivateState(state:AvalonState,playerId:string){
 if(!state.players.includes(playerId))throw new Error("Ты не участник партии.");
 const role=state.roles[playerId];
 const allies=evil(role)&&role!=="oberon"?state.players.filter((id)=>id!==playerId&&evil(state.roles[id])&&state.roles[id]!=="oberon"):[];
 const knownMerlin=role==="percival"?state.players.filter((id)=>state.roles[id]==="merlin"||state.roles[id]==="morgana"):[];
 const knownEvil=role==="merlin"?state.players.filter((id)=>evil(state.roles[id])&&state.roles[id]!=="mordred"):[];
 return {role,team:evil(role)?"evil":"good",allies,knownMerlin,knownEvil,
 hasTeamVoted:playerId in state.teamVotes,hasMissionVoted:playerId in state.missionVotes};
}
