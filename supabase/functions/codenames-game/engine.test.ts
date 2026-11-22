import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyCodenamesAction, getCodenamesPrivateState, getCodenamesPublicState, startCodenames } from "./engine.ts";

Deno.test("creates 25 unique words and a 9/8/7/1 key", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op", "blue-op"], () => 0.31);
  assertEquals(state.words.length, 25);
  assertEquals(new Set(state.words.map((word) => word.word)).size, 25);
  assertEquals(state.key.filter((team) => team === "red").length + state.key.filter((team) => team === "blue").length, 17);
  assertEquals(state.key.filter((team) => team === "neutral").length, 7);
  assertEquals(state.key.filter((team) => team === "assassin").length, 1);
});
Deno.test("only captains receive the hidden key", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op"], () => 0.4);
  assertEquals("key" in getCodenamesPrivateState(state, "red-cap"), true);
  assertEquals("key" in getCodenamesPrivateState(state, "blue-cap"), true);
  assertEquals("key" in getCodenamesPrivateState(state, "red-op"), false);
  assertEquals("key" in getCodenamesPublicState(state), false);
});
Deno.test("only the active captain can give a one-word clue", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op"], () => 0.2);
  const captain = state.captains[state.currentTeam];
  const other = state.captains[state.currentTeam === "red" ? "blue" : "red"];
  assertThrows(() => applyCodenamesAction(state, other, { type: "clue", text: "Солнце", count: 2 }));
  assertThrows(() => applyCodenamesAction(state, captain, { type: "clue", text: "два слова", count: 2 }));
  const next = applyCodenamesAction(state, captain, { type: "clue", text: "Космос", count: 2 });
  assertEquals(next.phase, "guess");
  assertEquals(next.clue?.count, 2);
});
Deno.test("operative can guess own agent and continue until clue limit", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op", "red-op-2"], () => 0.5);
  const team = state.currentTeam;
  const operative = state.players.find((id) => state.teams[id] === team && state.captains[team] !== id)!;
  let next = applyCodenamesAction(state, state.captains[team], { type: "clue", text: "Море", count: 1 });
  const ownIndex = next.key.findIndex((entry) => entry === team);
  next = applyCodenamesAction(next, operative, { type: "guess", cardId: next.words[ownIndex].id });
  assertEquals(next.phase, "guess");
  assertEquals(next.remaining[team], state.remaining[team] - 1);
});
Deno.test("assassin immediately awards victory to the opposing team", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op", "blue-op"], () => 0.6);
  const team = state.currentTeam;
  const operative = state.players.find((id) => state.teams[id] === team && id !== state.captains[team])!;
  let next = applyCodenamesAction(state, state.captains[team], { type: "clue", text: "Риск", count: 1 });
  const index = next.key.findIndex((entry) => entry === "assassin");
  next = applyCodenamesAction(next, operative, { type: "guess", cardId: next.words[index].id });
  assertEquals(next.status, "finished");
  assertEquals(next.winnerTeam, team === "red" ? "blue" : "red");
});
Deno.test("a neutral or opponent card ends the turn", () => {
  const state = startCodenames(["red-cap", "blue-cap", "red-op"], () => 0.3);
  const team = state.currentTeam;
  const operative = state.players.find((id) => state.teams[id] === team && id !== state.captains[team])!;
  let next = applyCodenamesAction(state, state.captains[team], { type: "clue", text: "Ключ", count: 2 });
  const index = next.key.findIndex((entry) => entry !== team);
  next = applyCodenamesAction(next, operative, { type: "guess", cardId: next.words[index].id });
  assertEquals(next.currentTeam, team === "red" ? "blue" : "red");
  assertEquals(next.phase, "clue");
});
