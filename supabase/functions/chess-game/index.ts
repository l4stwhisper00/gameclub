import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function outcomeFor(chess) {
  if (chess.isCheckmate()) {
    return { status: "checkmate", winner: chess.turn() === "w" ? "black" : "white" };
  }
  if (chess.isStalemate() || chess.isDraw() || chess.isThreefoldRepetition()) {
    return { status: "draw", winner: null };
  }
  return null;
}

function stateFromChess(previous, chess, lastMove = null) {
  const outcome = outcomeFor(chess);
  return {
    ...previous,
    fen: chess.fen(),
    pgn: chess.pgn(),
    turn: chess.turn(),
    lastMove,
    outcome,
    status: outcome ? "finished" : "active",
    updatedAt: new Date().toISOString()
  };
}

const pieceValues = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };

function evaluate(chess) {
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = pieceValues[piece.type] || 0;
      const sign = piece.color === "w" ? 1 : -1;
      const file = "abcdefgh".indexOf(piece.square[0]);
      const rank = Number(piece.square[1]);
      const centerBonus = (3.5 - Math.abs(3.5 - file) + 3.5 - Math.abs(3.5 - (rank - 1))) * 2;
      score += sign * (value + (piece.type === "p" || piece.type === "n" ? centerBonus : 0));
    }
  }
  return score;
}

function chooseBotMove(chess, difficulty) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  if (difficulty === "easy") {
    const captures = moves.filter((move) => move.captured);
    const pool = captures.length && Math.random() < 0.35 ? captures : moves;
    const move = pool[Math.floor(Math.random() * pool.length)];
    return { from: move.from, to: move.to, promotion: move.promotion || "q" };
  }

  // Score only the resulting position. Searching every opponent reply caused
  // CPU-limit failures in the Edge Function and made otherwise valid moves fail.
  const scored = moves.map((move) => {
    const next = new Chess(chess.fen());
    next.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });

    let score = evaluate(next); // positive favours White; the bot plays Black.
    if (next.isCheckmate()) score = -100000;
    else if (next.isStalemate() || next.isDraw() || next.isThreefoldRepetition()) score = 0;
    else if (next.inCheck()) score -= 35;

    // Small deterministic preference for promotion/captures, with noise to
    // avoid repeating the exact same choice in equivalent positions.
    if (move.promotion) score -= 850;
    score += (Math.random() - 0.5) * (difficulty === "hard" ? 0.5 : 8);
    return { move, score };
  }).sort((a, b) => a.score - b.score);

  const choice = difficulty === "hard"
    ? scored[0]
    : scored[Math.floor(Math.random() * Math.min(4, scored.length))];
  return {
    from: choice.move.from,
    to: choice.move.to,
    promotion: choice.move.promotion || "q"
  };
}

async function saveState(admin, roomId, state, expectedRevision, userId) {
  const { data, error } = await admin
    .from("club_room_game_states")
    .update({
      state,
      revision: expectedRevision + 1,
      updated_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq("room_id", roomId)
    .eq("revision", expectedRevision)
    .select("state,revision")
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(409, "Позиция уже изменилась. Обновляю доску — повтори ход.");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Войди в аккаунт, чтобы играть.");
    const token = authorization.slice(7);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || publishableKeys.default || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !publishableKey || !serviceRoleKey) {
      throw new HttpError(500, "Сервер игры ещё не настроен. Попробуй позже.");
    }

    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData?.user) throw new HttpError(401, "Сессия истекла. Войди снова.");

    const user = authData.user;
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const body = await req.json();
    const roomId = String(body.room_id || "");
    const action = String(body.action || "");
    if (!roomId) throw new HttpError(400, "Не указана комната.");

    const [roomResult, membershipResult] = await Promise.all([
      admin.from("club_rooms")
        .select("id,game_id,host_id,status")
        .eq("id", roomId)
        .maybeSingle(),
      admin.from("club_room_members")
        .select("user_id,role")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle()
    ]);
    const { data: room, error: roomError } = roomResult;
    const { data: membership, error: membershipError } = membershipResult;
    if (roomError) throw new HttpError(500, roomError.message);
    if (!room || room.game_id !== "chess") throw new HttpError(404, "Шахматная комната не найдена.");
    if (membershipError) throw new HttpError(500, membershipError.message);
    if (!membership) throw new HttpError(403, "Только участники комнаты могут играть.");

    if (action === "start") {
      if (room.host_id !== user.id) throw new HttpError(403, "Начать партию может только ведущий.");
      if (room.status === "closed") throw new HttpError(409, "Сначала верни комнату в лобби.");
      const { data: existingGame, error: existingGameError } = await admin
        .from("club_room_game_states")
        .select("state")
        .eq("room_id", roomId)
        .maybeSingle();
      if (existingGameError) throw new HttpError(500, existingGameError.message);
      if (existingGame?.state?.status === "active" && room.status !== "open") {
        throw new HttpError(409, "Партия уже идёт. Сначала заверши её и верни комнату в лобби.");
      }
      const opponentMode = body.opponent_mode === "bot" ? "bot" : "human";
      const difficulty = ["easy", "medium", "hard"].includes(body.bot_difficulty) ? body.bot_difficulty : "medium";
      const { data: members, error: membersError } = await admin
        .from("club_room_members")
        .select("user_id")
        .eq("room_id", roomId);
      if (membersError) throw new HttpError(500, membersError.message);

      const otherPlayer = (members || []).find((member) => member.user_id !== user.id);
      if (opponentMode === "human" && !otherPlayer) {
        throw new HttpError(400, "Для игры с человеком нужен второй участник. Или выбери игру с ботом.");
      }
      if (opponentMode === "bot" && otherPlayer) {
        throw new HttpError(400, "Для игры с ботом начни партию в комнате, где пока только ты.");
      }

      const chess = new Chess();
      const state = {
        fen: chess.fen(),
        pgn: "",
        turn: "w",
        opponentMode,
        botDifficulty: difficulty,
        whiteUserId: user.id,
        blackUserId: otherPlayer?.user_id || null,
        lastMove: null,
        outcome: null,
        status: "active",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const { error: upsertError } = await admin.from("club_room_game_states").upsert({
        room_id: roomId,
        game_id: "chess",
        state,
        revision: 0,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "room_id" });
      if (upsertError) throw new HttpError(500, upsertError.message);

      const { error: statusError } = await admin.from("club_rooms")
        .update({ status: "playing" })
        .eq("id", roomId)
        .eq("host_id", user.id);
      if (statusError) throw new HttpError(500, statusError.message);
      return json({ state, revision: 0 });
    }

    if (action === "move") {
      if (room.status !== "playing") throw new HttpError(409, "Партия сейчас не активна.");
      const { data: gameRow, error: gameError } = await admin
        .from("club_room_game_states")
        .select("state,revision")
        .eq("room_id", roomId)
        .maybeSingle();
      if (gameError) throw new HttpError(500, gameError.message);
      if (!gameRow) throw new HttpError(404, "Партия ещё не началась.");

      const expectedRevision = Number(body.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(gameRow.revision)) {
        throw new HttpError(409, "Доска уже обновилась. Повтори ход.");
      }
      const state = gameRow.state;
      if (state.status !== "active") throw new HttpError(409, "Партия уже завершена.");
      const chess = new Chess();
      if (state.pgn) chess.loadPgn(state.pgn);
      else chess.load(state.fen);
      const movingColor = chess.turn();
      if (state.opponentMode === "bot") {
        if (movingColor !== "w" || state.whiteUserId !== user.id) {
          throw new HttpError(403, "Сейчас ход соперника.");
        }
      } else {
        const expectedUser = movingColor === "w" ? state.whiteUserId : state.blackUserId;
        if (expectedUser !== user.id) throw new HttpError(403, "Сейчас ход другого игрока.");
      }

      let move;
      try {
        move = chess.move({
          from: String(body.from || ""),
          to: String(body.to || ""),
          promotion: ["q", "r", "b", "n"].includes(body.promotion) ? body.promotion : "q"
        });
      } catch {
        throw new HttpError(400, "Такой ход невозможен.");
      }
      if (!move) throw new HttpError(400, "Такой ход невозможен.");

      let nextState = stateFromChess(state, chess, { san: move.san, from: move.from, to: move.to });

      // Resolve the bot reply before writing. One request now produces one atomic
      // revision, so clients never render the half-turn between human and bot.
      if (state.opponentMode === "bot" && nextState.status === "active" && chess.turn() === "b") {
        const botMove = chooseBotMove(chess, state.botDifficulty);
        if (botMove) {
          const reply = chess.move(botMove);
          nextState = stateFromChess(nextState, chess, { san: reply.san, from: reply.from, to: reply.to });
        }
      }

      const saved = await saveState(admin, roomId, nextState, expectedRevision, user.id);
      if (nextState.status === "finished") {
        const { error: roomStatusError } = await admin.from("club_rooms")
          .update({ status: "open" }).eq("id", roomId);
        if (roomStatusError) throw new HttpError(500, roomStatusError.message);
      }
      return json({ state: saved.state, revision: saved.revision });
    }

    if (action === "resign") {
      if (room.status !== "playing") throw new HttpError(409, "Партия сейчас не активна.");
      const { data: gameRow, error: gameError } = await admin
        .from("club_room_game_states")
        .select("state,revision")
        .eq("room_id", roomId)
        .maybeSingle();
      if (gameError) throw new HttpError(500, gameError.message);
      if (!gameRow) throw new HttpError(404, "Партия ещё не началась.");
      const state = gameRow.state;
      const isWhite = state.whiteUserId === user.id;
      const isBlack = state.blackUserId === user.id;
      if (!isWhite && !isBlack) throw new HttpError(403, "Ты не участвуешь в этой партии.");
      if (state.status !== "active") throw new HttpError(409, "Партия уже завершена.");
      const nextState = {
        ...state,
        status: "finished",
        outcome: { status: "resignation", winner: isWhite ? "black" : "white" },
        updatedAt: new Date().toISOString()
      };
      const saved = await saveState(admin, roomId, nextState, Number(gameRow.revision), user.id);
      // A resignation ends the match and returns everyone to the room lobby.
      const { error: roomStatusError } = await admin.from("club_rooms")
        .update({ status: "open" }).eq("id", roomId);
      if (roomStatusError) throw new HttpError(500, roomStatusError.message);
      return json({ state: saved.state, revision: saved.revision });
    }

    throw new HttpError(400, "Неизвестное действие.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error?.message || "Не удалось выполнить действие." }, status);
  }
});
