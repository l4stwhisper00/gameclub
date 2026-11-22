import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  applyUnoAction,
  createUnoDeck,
  getUnoPlayerHand,
  getUnoPublicState,
  isUnoCardPlayable,
  startUno,
  type UnoState
} from "./engine.ts";

Deno.test("standard deck has 108 unique cards", () => {
  const deck = createUnoDeck();
  assertEquals(deck.length, 108);
  assertEquals(new Set(deck.map((card) => card.id)).size, 108);
});

Deno.test("start deals seven cards and exposes no hands in public projection", () => {
  const state = startUno(["a", "b", "c"], () => 0.42);
  assertEquals(state.hands.a.length, 7);
  assertEquals(state.hands.b.length, 7);
  assertEquals(state.hands.c.length, 7);
  assertEquals(state.drawPile.length + state.discardPile.length + 21, 108);
  const view = getUnoPublicState(state);
  assertEquals(view.players.map((player) => player.cardCount), [7, 7, 7]);
  assertEquals("hands" in view, false);
  assertEquals(getUnoPlayerHand(state, "a").length, 7);
});

Deno.test("only matching color, value or wild cards can be played", () => {
  const top = { id: "r-4", color: "red" as const, kind: "number" as const, value: 4 };
  assertEquals(isUnoCardPlayable({ id: "b-4", color: "blue", kind: "number", value: 4 }, top, "red"), true);
  assertEquals(isUnoCardPlayable({ id: "g-7", color: "green", kind: "number", value: 7 }, top, "red"), false);
  assertEquals(isUnoCardPlayable({ id: "wild", color: null, kind: "wild", value: "wild" }, top, "red"), true);
});

function stateWith(handA: UnoState["hands"]["x"], handB: UnoState["hands"]["x"]): UnoState {
  return {
    gameId: "uno", status: "active", players: ["a", "b"],
    hands: { a: handA, b: handB },
    drawPile: [{ id: "draw", color: "green", kind: "number", value: 8 }],
    discardPile: [{ id: "top", color: "red", kind: "number", value: 3 }],
    currentPlayerIndex: 0, direction: 1, currentColor: "red",
    pendingDrawnCardId: null, unoPenaltyPlayerId: null, unoCalledBy: [],
    winnerId: null, lastAction: null
  };
}

Deno.test("rejects a move from the wrong player and an illegal card", () => {
  const state = stateWith(
    [{ id: "a1", color: "blue", kind: "number", value: 8 }],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  assertThrows(() => applyUnoAction(state, "b", { type: "play", cardId: "b1" }));
  assertThrows(() => applyUnoAction(state, "a", { type: "play", cardId: "a1" }));
});

Deno.test("a drawn playable card must be played or passed", () => {
  const state = stateWith(
    [{ id: "a1", color: "blue", kind: "number", value: 1 }],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  state.drawPile = [{ id: "draw", color: "red", kind: "number", value: 8 }];
  const drawn = applyUnoAction(state, "a", { type: "draw" }, () => 0);
  assertEquals(drawn.pendingDrawnCardId, "draw");
  assertThrows(() => applyUnoAction(drawn, "a", { type: "play", cardId: "a1" }));
  const played = applyUnoAction(drawn, "a", { type: "play", cardId: "draw" });
  assertEquals(played.currentPlayerIndex, 1);
});

Deno.test("wild cards require a valid chosen color", () => {
  const state = stateWith(
    [{ id: "wild", color: null, kind: "wild", value: "wild" }],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  assertThrows(() => applyUnoAction(state, "a", { type: "play", cardId: "wild" }));
  const next = applyUnoAction(state, "a", { type: "play", cardId: "wild", color: "green" });
  assertEquals(next.currentColor, "green");
});

Deno.test("wild draw four is illegal when the player holds current color", () => {
  const state = stateWith(
    [
      { id: "wild4", color: null, kind: "wild4", value: "wild4" },
      { id: "red2", color: "red", kind: "number", value: 2 }
    ],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  assertThrows(() => applyUnoAction(state, "a", { type: "play", cardId: "wild4", color: "blue" }));
});

Deno.test("playing the final card finishes the game and records the winner", () => {
  const state = stateWith(
    [{ id: "a1", color: "red", kind: "number", value: 3 }],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  const next = applyUnoAction(state, "a", { type: "play", cardId: "a1" });
  assertEquals(next.status, "finished");
  assertEquals(next.winnerId, "a");
});

Deno.test("reverse changes turn direction for three players", () => {
  const state = stateWith(
    [
      { id: "reverse", color: "red", kind: "reverse", value: "reverse" },
      { id: "extra", color: "blue", kind: "number", value: 7 }
    ],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  state.players.push("c");
  state.hands.c = [{ id: "c1", color: "blue", kind: "number", value: 1 }];
  const next = applyUnoAction(state, "a", { type: "play", cardId: "reverse" });
  assertEquals(next.direction, -1);
  assertEquals(next.players[next.currentPlayerIndex], "c");
});

Deno.test("UNO can be called in the catch window after the player turn advances", () => {
  const state = stateWith(
    [
      { id: "a1", color: "red", kind: "number", value: 3 },
      { id: "a2", color: "blue", kind: "number", value: 6 }
    ],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  const played = applyUnoAction(state, "a", { type: "play", cardId: "a1" });
  assertEquals(played.currentPlayerIndex, 1);
  assertEquals(played.unoPenaltyPlayerId, "a");
  const called = applyUnoAction(played, "a", { type: "call_uno" });
  assertEquals(called.unoPenaltyPlayerId, null);
  assertThrows(() => applyUnoAction(called, "b", { type: "catch_uno" }));
});

Deno.test("the next player can catch an uncalled UNO and draw a penalty", () => {
  const state = stateWith(
    [
      { id: "a1", color: "red", kind: "number", value: 3 },
      { id: "a2", color: "blue", kind: "number", value: 6 }
    ],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  state.drawPile = [
    { id: "draw1", color: "green", kind: "number", value: 1 },
    { id: "draw2", color: "yellow", kind: "number", value: 2 }
  ];
  const played = applyUnoAction(state, "a", { type: "play", cardId: "a1" });
  const caught = applyUnoAction(played, "b", { type: "catch_uno" });
  assertEquals(caught.hands.a.length, 3);
  assertEquals(caught.unoPenaltyPlayerId, null);
});

Deno.test("public state never reveals the identity of a privately drawn playable card", () => {
  const state = stateWith(
    [{ id: "a1", color: "blue", kind: "number", value: 1 }],
    [{ id: "b1", color: "red", kind: "number", value: 5 }]
  );
  state.drawPile = [{ id: "secret-red-8", color: "red", kind: "number", value: 8 }];
  const drawn = applyUnoAction(state, "a", { type: "draw" });
  const publicState = getUnoPublicState(drawn);
  assertEquals(publicState.hasPendingDrawnCard, true);
  assertEquals("pendingDrawnCardId" in publicState, false);
  assertEquals(publicState.lastAction?.type, "draw");
  assertEquals("card" in (publicState.lastAction || {}), false);
  assertEquals(getUnoPlayerHand(drawn, "a").some((card) => card.id === "secret-red-8"), true);
});
