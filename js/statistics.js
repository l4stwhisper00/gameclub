import { supabase } from "./supabase.js";

function throwIfError(error) {
  if (error) throw new Error(error.message || "Не удалось выполнить запрос статистики.");
}

export async function getPlayerResults(userId) {
  const pageSize = 500;
  const results = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("club_game_results")
      .select("id, user_id, game_id, placement, players_count, outcome, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    throwIfError(error);
    results.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return results;
}

export async function addPlayerResult({ gameId, placement, playersCount }) {
  if (!gameId || !Number.isInteger(placement) || placement < 1 || placement > 30) {
    throw new Error("Укажи игру и корректное занятое место.");
  }
  if (!Number.isInteger(playersCount) || playersCount < 2 || playersCount > 30 || placement > playersCount) {
    throw new Error("Количество игроков должно быть от 2 до 30, а место не может быть больше их числа.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Войди в аккаунт, чтобы сохранить результат.");
  const { error } = await supabase.from("club_game_results").insert({
    user_id: user.id,
    game_id: gameId,
    placement,
    players_count: playersCount,
    outcome: placement === 1 ? "win" : "loss"
  });
  throwIfError(error);
}

export async function deletePlayerResult(resultId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Необходимо войти в аккаунт.");
  const { error } = await supabase.from("club_game_results")
    .delete().eq("id", resultId).eq("user_id", user.id);
  throwIfError(error);
}
