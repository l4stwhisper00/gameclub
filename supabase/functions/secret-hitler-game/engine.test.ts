import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applySecretHitlerAction,getSecretHitlerPrivateState,getSecretHitlerPublicState,startSecretHitler} from "./engine.ts";

Deno.test("roles are private and public state hides the role map",()=>{
 const state=startSecretHitler(["a","b","c","d","e"],"a",()=>0.3);
 assertEquals("roles" in getSecretHitlerPublicState(state),false);
 assertEquals(typeof getSecretHitlerPrivateState(state,"a").role,"string");
});
Deno.test("only the president can nominate and players vote secretly",()=>{
 let state=startSecretHitler(["a","b","c","d","e"],"a",()=>0.3);
 const president=state.players[state.presidentIndex],candidate=state.players.find((id)=>id!==president)!;
 assertThrows(()=>applySecretHitlerAction(state,candidate,{type:"nominate",targetId:president}));
 state=applySecretHitlerAction(state,president,{type:"nominate",targetId:candidate});
 for(const id of state.players)state=applySecretHitlerAction(state,id,{type:"vote",approve:true});
 assertEquals(state.phase,"president_discard");
 assertEquals(getSecretHitlerPrivateState(state,president).presidentPolicies.length,3);
});
Deno.test("good players cannot see the president policy hand",()=>{
 const state=startSecretHitler(["a","b","c","d","e"],"a",()=>0.3);
 const president=state.players[state.presidentIndex];
 state.phase="president_discard";state.presidentHand=["liberal","fascist","liberal"];
 const other=state.players.find((id)=>id!==president)!;
 assertEquals(getSecretHitlerPrivateState(state,president).presidentPolicies.length,3);
 assertEquals(getSecretHitlerPrivateState(state,other).presidentPolicies.length,0);
});
Deno.test("only the chancellor can enact one of two policies",()=>{
 let state=startSecretHitler(["a","b","c","d","e"],"a",()=>0.3);
 const president=state.players[state.presidentIndex],chancellor=state.players.find((id)=>id!==president)!;
 state.phase="president_discard";state.chancellorId=chancellor;state.presidentHand=["liberal","fascist","liberal"];
 state=applySecretHitlerAction(state,president,{type:"president_discard",index:0});
 assertEquals(state.chancellorHand.length,2);
 assertThrows(()=>applySecretHitlerAction(state,president,{type:"chancellor_enact",index:0}));
});

Deno.test("executed players leave elections but keep their original hidden role",()=>{
 let state=startSecretHitler(["a","b","c","d","e"],"a",()=>0.3);
 const president=state.players[state.presidentIndex],target=state.players.find((id)=>id!==president&&state.roles[id]!=="hitler")!;
 state.phase="execute";
 state=applySecretHitlerAction(state,president,{type:"execute",targetId:target});
 assertEquals(getSecretHitlerPublicState(state).players.some((p)=>p.id===target),false);
 assertEquals(getSecretHitlerPrivateState(state,target).isAlive,false);
 assertEquals(state.roles[target]==="liberal"||state.roles[target]==="fascist",true);
});
