import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyDndAction, getDndPrivateState, getDndPublicState, rollDndDice, startDndCampaign } from "./engine.ts";

const players = ["host", "p2", "p3"];
function character(state, playerId, name) {
  return applyDndAction(state, playerId, {
    type: "create_character", name, ancestry: "Человек", className: "fighter",
    level: 3, maxHp: 28, ac: 16, initiativeBonus: 2, speed: 30, hitDie: 10, conModifier: 2
  }, () => 0.5);
}
Deno.test("dice parser supports d20 and modifiers", () => {
  assertEquals(rollDndDice("2d6+3", () => 0).total, 5);
  assertEquals(rollDndDice("d20", () => 0.99).total, 20);
  assertThrows(() => rollDndDice("100d20"));
  assertThrows(() => rollDndDice("2d7"));
});
Deno.test("players create one character each", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "host", "Ариан");
  assertEquals(Object.keys(state.characters).length, 1);
  assertThrows(() => character(state, "host", "Другой"));
});
Deno.test("private notes are not present in public campaign state", () => {
  let state = startDndCampaign(players, "host");
  state = applyDndAction(state, "p2", { type: "private_note", text: "Мой секрет" });
  state = applyDndAction(state, "host", { type: "dm_note", text: "Секрет мастера" });
  assertEquals("privateNotesByPlayer" in getDndPublicState(state), false);
  assertEquals(getDndPrivateState(state, "p2").notes[0], "Мой секрет");
  assertEquals(getDndPrivateState(state, "p2").dmNotes.length, 0);
  assertEquals(getDndPrivateState(state, "host").dmNotes[0], "Секрет мастера");
});
Deno.test("DM starts combat and initiative order is sorted", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "host", "Ариан");
  state = character(state, "p2", "Лира");
  state = applyDndAction(state, "host", { type: "add_npc", name: "Гоблин", maxHp: 7, ac: 15, initiativeBonus: 2 });
  assertThrows(() => applyDndAction(state, "p2", { type: "start_combat" }));
  state = applyDndAction(state, "host", { type: "start_combat" }, () => 0.99);
  assertEquals(state.combatActive, true);
  assertEquals(state.round, 1);
  assertEquals(state.turnOrder.length, 3);
  assertEquals(state.initiative[state.turnOrder[0]] >= state.initiative[state.turnOrder[1]], true);
});
Deno.test("DM damage absorbs temporary HP before reducing HP", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "p2", "Лира");
  state.characters["char-p2"].tempHp = 5;
  state = applyDndAction(state, "host", { type: "damage", targetId: "char-p2", amount: 8 });
  assertEquals(state.characters["char-p2"].tempHp, 0);
  assertEquals(state.characters["char-p2"].hp, 25);
});
Deno.test("short rest spends hit dice and long rest restores the character", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "p2", "Лира");
  state.characters["char-p2"].hp = 10;
  state = applyDndAction(state, "p2", { type: "rest", kind: "short", hitDiceSpent: 1 }, () => 0.5);
  assertEquals(state.characters["char-p2"].hp > 10, true);
  state = applyDndAction(state, "p2", { type: "rest", kind: "long" });
  assertEquals(state.characters["char-p2"].hp, 28);
});

Deno.test("initiative skips combatants at zero HP", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "host", "Ариан");
  state = character(state, "p2", "Лира");
  state = applyDndAction(state, "host", { type: "add_npc", name: "Гоблин", maxHp: 7, ac: 15, initiativeBonus: 2 });
  const npcId = Object.keys(state.npcs)[0];
  state = applyDndAction(state, "host", { type: "start_combat" }, () => 0.5);
  state.turnOrder = ["char-host", "char-p2", npcId];
  state.currentTurnIndex = 0;
  state.characters["char-p2"].hp = 0;
  state = applyDndAction(state, "host", { type: "next_turn" });
  assertEquals(state.turnOrder[state.currentTurnIndex], npcId);
});
Deno.test("rest is not available during combat", () => {
  let state = startDndCampaign(players, "host");
  state = character(state, "p2", "Лира");
  state.combatActive = true;
  assertThrows(() => applyDndAction(state, "p2", { type: "rest", kind: "long" }));
});
