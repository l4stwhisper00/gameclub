import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyMonopolyAction, getMonopolyPublicState, startMonopoly } from "./engine.ts";

Deno.test("creates a 40-space board and gives each player 1500", () => {
  const state = startMonopoly(["a","b","c"]);
  assertEquals(state.board.length, 40);
  assertEquals(state.players.map((player) => player.cash), [1500,1500,1500]);
});
Deno.test("players cannot roll out of turn", () => {
  const state = startMonopoly(["a","b"]);
  assertThrows(() => applyMonopolyAction(state,"b",{type:"roll"},()=>0));
});
Deno.test("a landed unowned property can be bought", () => {
  let state = startMonopoly(["a","b"]);
  state.players[0].position = 0;
  let index = 0;
  const rolls = [0, 0.2];
  state = applyMonopolyAction(state,"a",{type:"roll"},()=>rolls[index++]);
  assertEquals(state.phase,"purchase");
  assertEquals(state.pendingSpace,3);
});
Deno.test("purchase transfers cash and ownership", () => {
  let state = startMonopoly(["a","b"]);
  state.players[0].position = 0;
  state.phase = "purchase";
  state.pendingSpace = 1;
  state = applyMonopolyAction(state,"a",{type:"buy"});
  assertEquals(state.players[0].cash,1440);
  assertEquals(state.properties[1].ownerId,"a");
});
Deno.test("mortgage and redeem update cash and state", () => {
  let state = startMonopoly(["a","b"]);
  state.properties[1].ownerId = "a";
  state = applyMonopolyAction(state,"a",{type:"mortgage",spaceIndex:1});
  assertEquals(state.players[0].cash,1530);
  assertEquals(state.properties[1].mortgaged,true);
  state = applyMonopolyAction(state,"a",{type:"redeem",spaceIndex:1});
  assertEquals(state.properties[1].mortgaged,false);
  assertEquals(state.players[0].cash,1497);
});
Deno.test("public state contains no hidden private data", () => {
  const state = startMonopoly(["a","b"]);
  const view = getMonopolyPublicState(state);
  assertEquals("secret" in view,false);
});

Deno.test("rent is transferred to the owner after passing GO", () => {
  let state = startMonopoly(["a","b"]);
  state.players[0].position = 39;
  state.properties[1].ownerId = "b";
  state = applyMonopolyAction(state,"a",{type:"roll"},()=>0);
  assertEquals(state.players[0].position,1);
  assertEquals(state.players[0].cash,1698);
  assertEquals(state.players[1].cash,1502);
});
