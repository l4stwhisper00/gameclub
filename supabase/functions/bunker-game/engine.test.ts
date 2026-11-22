import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyBunkerAction, getBunkerPrivateState, getBunkerPublicState, startBunker } from "./engine.ts";

Deno.test("creates private profiles and public catastrophe", () => {
  const state = startBunker(["a","b","c","d"],()=>0.1);
  assertEquals(state.players.length,4);
  assertEquals(typeof state.catastrophe,"string");
  assertEquals(Object.keys(getBunkerPrivateState(state,"a").attributes).length,7);
  assertEquals("secrets" in getBunkerPublicState(state),false);
});
Deno.test("only the player in reveal order can reveal one category", () => {
  const state = startBunker(["a","b","c"],()=>0.4);
  const first = state.revealOrder[0];
  assertThrows(()=>applyBunkerAction(state,state.revealOrder[1],{type:"reveal",category:"profession"}));
  const next = applyBunkerAction(state,first,{type:"reveal",category:"profession"});
  assertEquals(Boolean(next.players.find((p)=>p.id===first)?.revealed.profession),true);
});
Deno.test("after every player reveals, discussion and voting begin", () => {
  let state = startBunker(["a","b","c","d"],()=>0.4);
  for(const id of state.revealOrder) state=applyBunkerAction(state,id,{type:"reveal",category:"profession"});
  assertEquals(state.phase,"discussion");
  state=applyBunkerAction(state,"a",{type:"start_vote"});
  assertEquals(state.phase,"vote");
});
Deno.test("vote removes a player and ends when bunker capacity is reached", () => {
  let state = startBunker(["a","b","c","d"],()=>0.4);
  for(const id of state.revealOrder) state=applyBunkerAction(state,id,{type:"reveal",category:"profession"});
  state=applyBunkerAction(state,"a",{type:"start_vote"});
  const target="d";
  for(const id of ["a","b","c"]) state=applyBunkerAction(state,id,{type:"vote",targetId:target});
  state=applyBunkerAction(state,target,{type:"vote",targetId:"a"});
  assertEquals(state.status,"finished");
  assertEquals(state.winnerIds.length,3);
});
