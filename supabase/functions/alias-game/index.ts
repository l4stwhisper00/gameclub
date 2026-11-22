import { createClient } from "npm:@supabase/supabase-js@2";
import { applyAliasAction, getAliasPrivateState, getAliasPublicState, startAlias, type AliasAction, type AliasState } from "./engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function asSession(data: unknown): { game_id: string; public_state: Record<string, unknown>; secret_state: AliasState; revision: number } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as { game_id: string; public_state: Record<string, unknown>; secret_state: AliasState; revision: number };
}
async function loadSession(admin: any, roomId: string) {
  const { data, error } = await (admin.rpc as any)("club_load_game_session", { p_room_id: roomId });
  if (error) throw new HttpError(500, "Не удалось загрузить партию.");
  return asSession(data);
}
async function commitSession(admin: any, roomId: string, userId: string, expectedRevision: number, state: AliasState, start = false) {
  const { data, error } = await (admin.rpc as any)("club_commit_game_session", {
    p_room_id: roomId, p_game_id: "alias", p_expected_revision: expectedRevision,
    p_public_state: getAliasPublicState(state), p_secret_state: state,
    p_updated_by: userId, p_room_status: start ? "playing" : null
  });
  if (error) {
    if (error.code === "40001" || error.code === "23505") throw new HttpError(409, "Партия уже обновилась. Перезагрузи стол.");
    throw new HttpError(500, "Не удалось сохранить ход.");
  }
  return Number(data);
}
function parseAction(body: Record<string, unknown>): AliasAction {
  const type = String(body.action || "");
  if (type === "correct" || type === "skip" || type === "end_turn" || type === "end_game") return { type };
  throw new HttpError(400, "Неизвестное действие.");
}
Deno.serve(async (req: Request) => {
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
    if (!url || !publishableKey || !serviceRoleKey) throw new HttpError(500, "Сервер Alias ещё не настроен.");
    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData?.user) throw new HttpError(401, "Сессия истекла. Войди снова.");
    const user = authData.user;
    const admin: any = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const roomId = String(body.room_id || "");
    const actionName = String(body.action || "");
    if (!roomId) throw new HttpError(400, "Не указана комната.");
    const [roomResult, membershipResult] = await Promise.all([
      admin.from("club_rooms").select("id,game_id,host_id,status").eq("id", roomId).maybeSingle(),
      admin.from("club_room_members").select("user_id").eq("room_id", roomId).eq("user_id", user.id).maybeSingle()
    ]);
    if (roomResult.error) throw new HttpError(500, "Не удалось проверить комнату.");
    if (!roomResult.data || roomResult.data.game_id !== "alias") throw new HttpError(404, "Комната Alias не найдена.");
    if (membershipResult.error) throw new HttpError(500, "Не удалось проверить участие в комнате.");
    if (!membershipResult.data) throw new HttpError(403, "Играть могут только участники комнаты.");
    const room = roomResult.data;
    if (actionName === "start") {
      if (room.host_id !== user.id) throw new HttpError(403, "Начать партию может только ведущий.");
      if (room.status !== "open") throw new HttpError(409, "Сначала верни комнату в лобби.");
      const { data: members, error: membersError } = await admin
        .from("club_room_members").select("user_id").eq("room_id", roomId).order("joined_at", { ascending: true });
      if (membersError) throw new HttpError(500, "Не удалось загрузить участников.");
      const playerIds = (members || []).map((member: { user_id: string }) => member.user_id);
      if (playerIds.length < 4 || playerIds.length > 12) throw new HttpError(400, "Для Alias нужно от 4 до 12 игроков.");
      const existing = await loadSession(admin, roomId);
      if (existing?.public_state?.status === "active") throw new HttpError(409, "Партия уже идёт.");
      const state = startAlias(playerIds, Math.random, room.host_id);
      const revision = await commitSession(admin, roomId, user.id, existing?.revision ?? -1, state, true);
      return json({ state: getAliasPublicState(state), privateState: getAliasPrivateState(state, user.id), revision });
    }
    const session = await loadSession(admin, roomId);
    if (!session || session.game_id !== "alias") throw new HttpError(404, "Партия ещё не началась.");
    if (actionName === "state") return json({
      state: session.public_state, privateState: getAliasPrivateState(session.secret_state, user.id), revision: session.revision
    });
    if (room.status !== "playing") throw new HttpError(409, "Партия сейчас не активна.");
    const expectedRevision = Number(body.revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== session.revision) throw new HttpError(409, "Поле уже обновилось.");
    let nextState: AliasState;
    try { nextState = applyAliasAction(session.secret_state, user.id, parseAction(body)); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Недопустимое действие."); }
    const revision = await commitSession(admin, roomId, user.id, expectedRevision, nextState);
    return json({ state: getAliasPublicState(nextState), privateState: getAliasPrivateState(nextState, user.id), revision });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Неизвестная ошибка сервера." }, status);
  }
});
