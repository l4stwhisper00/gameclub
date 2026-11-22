import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applySpyfallAction, getSpyfallPrivateState, getSpyfallPublicState, startSpyfall } from "./engine.ts";

Deno.test("location and roles are hidden from the public state",()=>{
  const state=startSpyfall(["a","b","c","d"],"a",()=>0.2);
  const pub=getSpyfallPublicState(state);
  assertEquals("location" in pub,false);
  assertEquals(pub.category,state.location.category);
});
Deno.test("spy and agents receive different private information",()=>{
  const state=startSpyfall(["a","b","c","d"],"a",()=>0.3);
  assertEquals(getSpyfallPrivateState(state,state.spyId).isSpy,true);
  assertEquals(getSpyfallPrivateState(state,state.spyId).location,null);
  const agent=state.players.find((id)=>id!==state.spyId)!;
  assertEquals(getSpyfallPrivateState(state,agent).isSpy,false);
  assertEquals(getSpyfallPrivateState(state,agent).location,state.location.name);
});
Deno.test("only the current asker can ask a question and turn passes to target",()=>{
  const state=startSpyfall(["a","b","c","d"],"a",()=>0.3);
  const asker=state.currentAskerId;
  const target=state.players.find((id)=>id!==asker)!;
  assertThrows(()=>applySpyfallAction(state,target,{type:"ask",targetId:asker,text:"Где ты?"}));
  const next=applySpyfallAction(state,asker,{type:"ask",targetId:target,text:"Что ты здесь делаешь?"});
  assertEquals(next.currentAskerId,target);
});
Deno.test("correct accusation wins for agents and wrong accusation wins for spy",()=>{
  const state=startSpyfall(["a","b","c","d"],"a",()=>0.4);
  const accuser=state.players.find((id)=>id!==state.spyId)!;
  const won=applySpyfallAction(state,accuser,{type:"accuse",suspectId:state.spyId});
  assertEquals(won.winner,"agents");
  const wrong=applySpyfallAction(state,accuser,{type:"accuse",suspectId:state.players.find((id)=>id!==state.spyId&&id!==accuser)!});
  assertEquals(wrong.winner,"spy");
});
Deno.test("only spy can guess the location",()=>{
  const state=startSpyfall(["a","b","c"],"a",()=>0.2);
  const agent=state.players.find((id)=>id!==state.spyId)!;
  assertThrows(()=>applySpyfallAction(state,agent,{type:"guess_location",guess:state.location.name}));
  const next=applySpyfallAction(state,state.spyId,{type:"guess_location",guess:state.location.name});
  assertEquals(next.winner,"spy");
});
