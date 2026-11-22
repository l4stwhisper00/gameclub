import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyMafiaAction, getMafiaPrivateState, getMafiaPublicState, startMafia } from "./engine.ts";

function playersWithRole(state: ReturnType<typeof startMafia>, role: string) {
  return Object.keys(state.roles).filter((id) => state.roles[id] === role);
}

Deno.test("assigns mafia, doctor and detective without duplicate roles", () => {
  const state = startMafia(["a","b","c","d","e","f","g","h"], () => 0.3);
  assertEquals(playersWithRole(state, "mafia").length, 2);
  assertEquals(playersWithRole(state, "doctor").length, 1);
  assertEquals(playersWithRole(state, "detective").length, 1);
  assertEquals(playersWithRole(state, "civilian").length, 4);
});

Deno.test("roles and mafia teammates are private", () => {
  const state = startMafia(["a","b","c","d","e","f"], () => 0.4);
  const mafia = playersWithRole(state, "mafia");
  assertEquals(getMafiaPrivateState(state, mafia[0]).role, "mafia");
  assertEquals(getMafiaPrivateState(state, mafia[0]).mafiaTeammates.includes(mafia[1]), true);
  assertEquals("roles" in getMafiaPublicState(state), false);
});

Deno.test("mafia votes only for a living non-mafia player", () => {
  const state = startMafia(["a","b","c","d","e"], () => 0.5);
  const mafia = playersWithRole(state, "mafia")[0];
  const civilian = playersWithRole(state, "civilian")[0];
  const otherMafia = playersWithRole(state, "mafia")[1];
  assertThrows(() => applyMafiaAction(state, civilian, { type: "mafia_vote", targetId: mafia }));
  assertThrows(() => applyMafiaAction(state, mafia, { type: "mafia_vote", targetId: otherMafia }));
  const next = applyMafiaAction(state, mafia, { type: "mafia_vote", targetId: civilian });
  assertEquals(next.nightTargetId, civilian);
});

Deno.test("doctor can save the mafia target and keep the city alive", () => {
  const state = startMafia(["a","b","c","d","e","f"], () => 0.5);
  const mafia = playersWithRole(state, "mafia");
  const doctor = playersWithRole(state, "doctor")[0];
  const detective = playersWithRole(state, "detective")[0];
  const target = playersWithRole(state, "civilian")[0];
  let next = state;
  for (const id of mafia) next = applyMafiaAction(next, id, { type: "mafia_vote", targetId: target });
  assertEquals(next.phase, "night_doctor");
  next = applyMafiaAction(next, doctor, { type: "doctor_save", targetId: target });
  assertEquals(next.phase, "night_detective");
  const suspect = next.alive.find((id) => id !== detective)!;
  next = applyMafiaAction(next, detective, { type: "detective_inspect", targetId: suspect });
  assertEquals(next.lastNightResult?.protected, true);
  assertEquals(next.alive.includes(target), true);
});

Deno.test("day vote eliminates a player and reveals their role", () => {
  const state = startMafia(["a","b","c","d","e"], () => 0.5);
  const mafia = playersWithRole(state, "mafia")[0];
  const target = playersWithRole(state, "civilian")[0];
  state.phase = "day";
  let next = applyMafiaAction(state, mafia, { type: "start_vote" });
  for (const id of next.alive) {
    if (id !== target) next = applyMafiaAction(next, id, { type: "vote", targetId: target });
  }
  assertEquals(next.revealedRoles[target], "civilian");
  assertEquals(next.alive.includes(target), false);
});

Deno.test("mafia wins when they reach parity with the town", () => {
  const state = startMafia(["a","b","c","d","e"], () => 0.5);
  const mafia = playersWithRole(state, "mafia")[0];
  const civilians = playersWithRole(state, "civilian");
  state.phase = "vote";
  state.alive = [mafia, civilians[0]];
  state.votes = {};
  let next = applyMafiaAction(state, mafia, { type: "vote", targetId: civilians[0] });
  next = applyMafiaAction(next, civilians[0], { type: "vote", targetId: mafia });
  assertEquals(next.winner, "mafia");
  assertEquals(next.status, "finished");
});
