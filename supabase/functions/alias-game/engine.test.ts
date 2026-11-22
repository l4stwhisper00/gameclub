import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyAliasAction, getAliasPrivateState, getAliasPublicState, startAlias } from "./engine.ts";

Deno.test("creates two balanced teams and a hidden word deck", () => {
  const state=startAlias(["a","b","c","d"],()=>0.3);
  assertEquals(state.teamPlayers.red.length,2);
  assertEquals(state.teamPlayers.blue.length,2);
  assertEquals("words" in getAliasPublicState(state),false);
});
Deno.test("only the current explainer receives the active word", () => {
  const state=startAlias(["a","b","c","d"],()=>0.3);
  const explainer=getAliasPublicState(state).currentExplainerId;
  assertEquals(getAliasPrivateState(state,explainer).isExplainer,true);
  assertEquals(typeof getAliasPrivateState(state,explainer).word,"string");
  assertEquals(getAliasPrivateState(state,"b").word,null);
});
Deno.test("correct answers increase team score and skip does not", () => {
  let state=startAlias(["a","b","c","d"],()=>0.3);
  const explainer=getAliasPublicState(state).currentExplainerId;
  state=applyAliasAction(state,explainer,{type:"correct"});
  assertEquals(state.scores.red,1);
  state=applyAliasAction(state,explainer,{type:"skip"});
  assertEquals(state.scores.red,1);
  assertEquals(state.wordIndex,2);
});
Deno.test("only current explainer can act and teams alternate", () => {
  let state=startAlias(["a","b","c","d"],()=>0.3);
  assertThrows(()=>applyAliasAction(state,"c",{type:"correct"}));
  const explainer=getAliasPublicState(state).currentExplainerId;
  state=applyAliasAction(state,explainer,{type:"end_turn"});
  assertEquals(state.currentTeam,"blue");
  assertEquals(state.round,1);
});
Deno.test("first team to target score wins", () => {
  let state=startAlias(["a","b","c","d"],()=>0.3);
  const explainer=getAliasPublicState(state).currentExplainerId;
  state.scores.red=29;
  state=applyAliasAction(state,explainer,{type:"correct"});
  assertEquals(state.status,"finished");
  assertEquals(state.winnerTeam,"red");
});

Deno.test("only the host can end an Alias session", () => {
  const state=startAlias(["a","b","c","d"],()=>0.3,"a");
  assertThrows(()=>applyAliasAction(state,"b",{type:"end_game"}));
  const ended=applyAliasAction(state,"a",{type:"end_game"});
  assertEquals(ended.status,"finished");
  assertEquals(getAliasPrivateState(ended,"a").word,null);
});
