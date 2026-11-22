import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyCrocodileAction,getCrocodilePrivateState,getCrocodilePublicState,startCrocodile} from "./engine.ts";

Deno.test("only the actor receives the word",()=>{
 const state=startCrocodile(["a","b","c","d"],"a",()=>0.2);
 assertEquals(getCrocodilePrivateState(state,state.currentActorId).isActor,true);
 assertEquals(getCrocodilePrivateState(state,"b").word,null);
 assertEquals("words" in getCrocodilePublicState(state),false);
});
Deno.test("correct guesses award points to the actor team",()=>{
 let state=startCrocodile(["a","b","c","d"],"a",()=>0.2);
 const word=getCrocodilePrivateState(state,state.currentActorId).word!;
 const guesser=state.players.find((id)=>id!==state.currentActorId&&state.teams[id]===state.teams[state.currentActorId])!;
 state=applyCrocodileAction(state,guesser,{type:"guess",guess:word});
 assertEquals(state.scores.red,1);
 assertEquals(state.currentActorId,"b");
});
Deno.test("wrong guesses do not score and actor can skip",()=>{
 let state=startCrocodile(["a","b","c","d"],"a",()=>0.2);
 const actor=state.currentActorId;
 const guesser=state.players.find((id)=>id!==actor&&state.teams[id]===state.teams[actor])!;
 state=applyCrocodileAction(state,guesser,{type:"guess",guess:"не то"});
 assertEquals(state.scores.red,0);
 state=applyCrocodileAction(state,actor,{type:"skip"});
 assertEquals(state.currentActorId,"b");
});
Deno.test("only host can end the game",()=>{
 const state=startCrocodile(["a","b","c"],"a",()=>0.3);
 assertThrows(()=>applyCrocodileAction(state,"b",{type:"end_game"}));
 assertEquals(applyCrocodileAction(state,"a",{type:"end_game"}).status,"finished");
});
