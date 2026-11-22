import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyEkivokiAction,getEkivokiPrivateState,getEkivokiPublicState,startEkivoki} from "./engine.ts";

Deno.test("only the active player receives the card word",()=>{
 const state=startEkivoki(["a","b","c","d"],"a",()=>0.2);
 assertEquals(getEkivokiPrivateState(state,state.currentActorId).isActor,true);
 assertEquals(getEkivokiPrivateState(state,"b").word,null);
 assertEquals("cards" in getEkivokiPublicState(state),false);
});
Deno.test("correct answer scores only for the active team and rotates turn",()=>{
 let state=startEkivoki(["a","b","c","d"],"a",()=>0.2);
 const actor=state.currentActorId,teammate=state.players.find((id)=>id!==actor&&state.teams[id]===state.teams[actor])!;
 const word=getEkivokiPrivateState(state,actor).word!;
 state=applyEkivokiAction(state,teammate,{type:"guess",guess:word});
 assertEquals(state.scores.sun,1);
 assertEquals(state.currentActorId,"b");
});
Deno.test("opposing team cannot guess and actor can skip",()=>{
 let state=startEkivoki(["a","b","c","d"],"a",()=>0.2);
 const actor=state.currentActorId,opponent=state.players.find((id)=>state.teams[id]!==state.teams[actor])!;
 assertThrows(()=>applyEkivokiAction(state,opponent,{type:"guess",guess:"слово"}));
 state=applyEkivokiAction(state,actor,{type:"skip"});
 assertEquals(state.currentActorId,"b");
});
