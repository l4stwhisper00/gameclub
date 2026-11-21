import { supabase } from "./supabase.js";

function fail(error) {
  if (error) throw new Error(error.message || "Ошибка соединения с сервером.");
}

export async function ensurePublicProfile(user) {
  if (!user?.id) throw new Error("Необходимо войти в аккаунт.");
  const profile = {
    user_id: user.id,
    username: String(user.username || "Игрок").slice(0, 20),
    avatar: String(user.avatar || ""),
    status: String(user.status || "").slice(0, 120),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("club_public_profiles").upsert(profile, { onConflict: "user_id" });
  fail(error);
  return profile;
}

async function profilesFor(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from("club_public_profiles")
    .select("user_id,username,avatar,status").in("user_id", unique);
  fail(error);
  return new Map((data || []).map((p) => [p.user_id, {
    id: p.user_id, username: p.username, avatar: p.avatar || "", status: p.status || ""
  }]));
}

function mapRoom(row, profileMap) {
  const members = (row.club_room_members || []).map((m) => ({
    userId: m.user_id, role: m.role, joinedAt: m.joined_at,
    user: profileMap.get(m.user_id) || { id: m.user_id, username: "Игрок", avatar: "" }
  }));
  const host = profileMap.get(row.host_id) || { id: row.host_id, username: "Игрок", avatar: "" };
  return {
    id: row.id, code: row.room_code, inviteCode: row.visibility === "private" ? row.invite_code : "",
    gameId: row.game_id, name: row.name, description: row.description,
    maxPlayers: row.max_players, visibility: row.visibility, scheduledAt: row.scheduled_at || "",
    rules: row.rules || {}, hostId: row.host_id, host, status: row.status,
    createdAt: row.created_at, members, remote: true
  };
}

async function mapRooms(rows) {
  const ids = (rows || []).flatMap((r) => [r.host_id, ...(r.club_room_members || []).map((m) => m.user_id)]);
  const profiles = await profilesFor(ids);
  return (rows || []).map((row) => mapRoom(row, profiles));
}

export async function listOnlineRooms() {
  const { data, error } = await supabase.from("club_rooms")
    .select("*, club_room_members(room_id,user_id,role,joined_at)")
    .order("created_at", { ascending: false });
  fail(error);
  return mapRooms(data || []);
}

export async function getOnlineRoom(roomId) {
  const { data, error } = await supabase.from("club_rooms")
    .select("*, club_room_members(room_id,user_id,role,joined_at)")
    .eq("id", roomId).maybeSingle();
  fail(error);
  if (!data) return null;
  return (await mapRooms([data]))[0];
}

export async function createOnlineRoom(room) {
  const { data, error } = await supabase.rpc("club_create_room", {
    p_game_id: room.gameId, p_name: room.name, p_description: room.description,
    p_max_players: room.maxPlayers, p_visibility: room.visibility,
    p_scheduled_at: room.scheduledAt ? new Date(room.scheduledAt).toISOString() : null,
    p_rules: room.rules || {}
  });
  fail(error);
  return data;
}

export async function joinOnlineRoom(roomId, inviteCode = "") {
  const { error } = await supabase.rpc("club_join_room", {
    p_room_id: roomId, p_invite_code: inviteCode || null
  });
  fail(error);
}

export async function leaveOnlineRoom(roomId) {
  const { error } = await supabase.rpc("club_leave_room", { p_room_id: roomId });
  fail(error);
}

export async function setOnlineRoomStatus(roomId, status) {
  const { error } = await supabase.rpc("club_set_room_status", { p_room_id: roomId, p_status: status });
  fail(error);
}

export async function removeOnlineRoomMember(roomId, memberId) {
  const { error } = await supabase.rpc("club_remove_room_member", {
    p_room_id: roomId, p_member_id: memberId
  });
  fail(error);
}

export async function deleteOnlineRoom(roomId) {
  const { error } = await supabase.rpc("club_delete_room", { p_room_id: roomId });
  fail(error);
}

export async function listOnlineMessages(roomId) {
  const { data, error } = await supabase.from("club_room_messages")
    .select("id,room_id,user_id,message_type,body,created_at")
    .eq("room_id", roomId).order("created_at", { ascending: true }).limit(500);
  fail(error);
  const profiles = await profilesFor((data || []).map((m) => m.user_id));
  return (data || []).map((m) => ({
    id: String(m.id), roomId: m.room_id, type: m.message_type,
    userId: m.user_id, user: profiles.get(m.user_id) || null,
    text: m.body, createdAt: m.created_at
  }));
}

export async function sendOnlineMessage(roomId, userId, text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > 500) throw new Error("Сообщение должно содержать от 1 до 500 символов.");
  const { error } = await supabase.from("club_room_messages").insert({
    room_id: roomId, user_id: userId, message_type: "user", body: clean
  });
  fail(error);
}

export function subscribeOnlineRoom(roomId, onChange) {
  const channel = supabase.channel(`club-room-${roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_rooms", filter: `id=eq.${roomId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_room_members", filter: `room_id=eq.${roomId}` }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "club_room_messages", filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
