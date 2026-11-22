import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyDndAction, getDndPrivateState, getDndPublicState, startDndCampaign,
  type DndAction, type DndState
} from "./engine.ts";

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
function asSession(data: unknown): { game_id: string; public_state: Record<string, unknown>; secret_state: DndState; revision: number } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as { game_id: string; public_state: Record<string, unknown>; secret_state: DndState; revision: number };
}
async function loadSession(admin: any, roomId: string) {
  const { data, error } = await (admin.rpc as any)("club_load_game_session", { p_room_id: roomId });
  if (error) throw new HttpError(500, "Не удалось загрузить кампанию.");
  return asSession(data);
}
async function commitSession(admin: any, roomId: string, userId: string, expectedRevision: number, state: DndState, start = false) {
  const { data, error } = await (admin.rpc as any)("club_commit_game_session", {
    p_room_id: roomId, p_game_id: "dnd-5e", p_expected_revision: expectedRevision,
    p_public_state: getDndPublicState(state), p_secret_state: state,
    p_updated_by: userId, p_room_status: start ? "playing" : null
  });
  if (error) {
    if (error.code === "40001" || error.code === "23505") throw new HttpError(409, "Кампания уже обновилась. Перезагрузи стол.");
    throw new HttpError(500, "Не удалось сохранить кампанию.");
  }
  return Number(data);
}
function parseAction(body: Record<string, unknown>): DndAction {
  const type = String(body.action || "");
  if (type === "create_character") return {
    type, name: String(body.name || ""), ancestry: String(body.ancestry || ""), className: String(body.class_name || ""),
    level: Number(body.level), maxHp: Number(body.max_hp), ac: Number(body.ac),
    initiativeBonus: Number(body.initiative_bonus), speed: Number(body.speed),
    hitDie: Number(body.hit_die) as 6 | 8 | 10 | 12, conModifier: Number(body.con_modifier || 0)
  };
  if (type === "roll") return { type, notation: String(body.notation || ""), label: String(body.label || "Проверка") };
  if (type === "add_npc") return {
    type, name: String(body.name || ""), maxHp: Number(body.max_hp), ac: Number(body.ac), initiativeBonus: Number(body.initiative_bonus)
  };
  if (type === "start_combat" || type === "next_turn" || type === "end_combat") return { type };
  if (type === "damage" || type === "heal") return { type, targetId: String(body.target_id || ""), amount: Number(body.amount) };
  if (type === "condition") return { type, targetId: String(body.target_id || ""), condition: String(body.condition || ""), enabled: Boolean(body.enabled) };
  if (type === "rest") return { type, kind: body.kind === "long" ? "long" : "short", hitDiceSpent: Number(body.hit_dice_spent || 0) };
  if (type === "journal" || type === "private_note" || type === "dm_note") return { type, text: String(body.text || "") };
  if (type === "inspiration") return { type, targetId: String(body.target_id || ""), enabled: Boolean(body.enabled) };
  throw new HttpError(400, "Неизвестное действие кампании.");
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
    if (!url || !publishableKey || !serviceRoleKey) throw new HttpError(500, "Сервер кампании ещё не настроен.");
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
    if (!roomResult.data || roomResult.data.game_id !== "dnd-5e") throw new HttpError(404, "Кампания не найдена.");
    if (membershipResult.error) throw new HttpError(500, "Не удалось проверить участие в комнате.");
    if (!membershipResult.data) throw new HttpError(403, "Участвовать могут только члены комнаты.");
    const room = roomResult.data;

    if (actionName === "start") {
      if (room.host_id !== user.id) throw new HttpError(403, "Создать кампанию может только ведущий комнаты.");
      if (room.status !== "open") throw new HttpError(409, "Сначала верни комнату в лобби.");
      const { data: members, error: membersError } = await admin
        .from("club_room_members").select("user_id").eq("room_id", roomId).order("joined_at", { ascending: true });
      if (membersError) throw new HttpError(500, "Не удалось загрузить участников.");
      const playerIds = (members || []).map((member: { user_id: string }) => member.user_id);
      if (playerIds.length < 1 || playerIds.length > 8) throw new HttpError(400, "Кампания поддерживает от 1 до 8 участников.");
      const existing = await loadSession(admin, roomId);
      if (existing?.public_state?.status === "active") throw new HttpError(409, "Кампания уже запущена.");
      const state = startDndCampaign(playerIds, room.host_id);
      const revision = await commitSession(admin, roomId, user.id, existing?.revision ?? -1, state, true);
      return json({ state: getDndPublicState(state), privateState: getDndPrivateState(state, user.id), revision });
    }

    const session = await loadSession(admin, roomId);
    if (!session || session.game_id !== "dnd-5e") throw new HttpError(404, "Кампания ещё не началась.");
    if (actionName === "state") {
      return json({ state: session.public_state, privateState: getDndPrivateState(session.secret_state, user.id), revision: session.revision });
    }
    if (room.status !== "playing") throw new HttpError(409, "Кампания сейчас не активна.");
    const expectedRevision = Number(body.revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== session.revision) {
      throw new HttpError(409, "Кампания уже обновилась. Перезагрузи стол.");
    }
    const action = parseAction(body);
    let nextState: DndState;
    try { nextState = applyDndAction(session.secret_state, user.id, action); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Недопустимое действие."); }
    const revision = await commitSession(admin, roomId, user.id, expectedRevision, nextState);
    return json({ state: getDndPublicState(nextState), privateState: getDndPrivateState(nextState, user.id), revision });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Неизвестная ошибка сервера." }, status);
  }
});
