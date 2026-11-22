import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyAvalonAction,getAvalonPrivateState,getAvalonPublicState,startAvalon} from "./engine.ts";

Deno.test("secret roles are not exposed in public state",()=>{
 const state=startAvalon(["a","b","c","d","e","f","g"],"a",()=>0.3);
 assertEquals("roles" in getAvalonPublicState(state),false);
 assertEquals(typeof getAvalonPrivateState(state,"a").role,"string");
});
Deno.test("good players cannot fail a mission",()=>{
 let state=startAvalon(["a","b","c","d","e"],"a",()=>0.3);
 state.phase="mission_vote";state.proposal=["a","b"];
 const good=state.players.find((id)=>!["assassin","minion","morgana","mordred","oberon"].includes(state.roles[id]))!;
 assertThrows(()=>applyAvalonAction(state,good,{type:"vote_mission",choice:"fail"}));
});
Deno.test("team approval needs a majority",()=>{
 let state=startAvalon(["a","b","c","d","e"],"a",()=>0.3);
 state.phase="team_vote";state.proposal=["a","b"];
 for(const id of state.players)state=applyAvalonAction(state,id,{type:"vote_team",approve:id==="a"||id==="b"});
 assertEquals(state.phase,"propose");
 assertEquals(state.rejectedProposals,1);
});
Deno.test("mission voting counts fail votes and exposes no individual ballots",()=>{
 let state=startAvalon(["a","b","c","d","e"],"a",()=>0.3);
 const evilId=state.players.find((id)=>["assassin","minion"].includes(state.roles[id]))!;
 const goodIds=state.players.filter((id)=>id!==evilId).slice(0,1);
 state.phase="mission_vote";state.proposal=[evilId,...goodIds];
 state=applyAvalonAction(state,evilId,{type:"vote_mission",choice:"fail"});
 state=applyAvalonAction(state,goodIds[0],{type:"vote_mission",choice:"success"});
 assertEquals(state.missionResults[0],false);
 assertEquals("missionVotesCount" in getAvalonPublicState(state),true);
 assertEquals("missionVotes" in getAvalonPublicState(state),false);
});
Deno.test("assassin can identify Merlin after three successful missions",()=>{
 let state=startAvalon(["a","b","c","d","e"],"a",()=>0.3);
 const assassin=state.players.find((id)=>state.roles[id]==="assassin")!;
 const merlin=state.players.find((id)=>state.roles[id]==="merlin")!;
 state.phase="assassination";
 state=applyAvalonAction(state,assassin,{type:"assassinate",targetId:merlin});
 assertEquals(state.winner,"evil");
});
