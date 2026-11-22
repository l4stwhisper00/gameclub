import { supabase } from "./supabase.js";

function ensureBunkerStyles() {
  if (document.getElementById("bunker-game-styles")) return;
  const link = document.createElement("link");
  link.id = "bunker-game-styles";
  link.rel = "stylesheet";
  link.href = "./css/bunker-game.css";
  document.head.append(link);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char] || char);
}
async function invokeBunker(body) {
  const { data, error } = await supabase.functions.invoke("bunker-game", { body });
  if (error) {
    let message = error.message || "Не удалось связаться с Бункером.";
    try { const payload = await error.context?.json?.(); if (payload?.error) message = payload.error; } catch {}
    const wrapped = new Error(message);
    wrapped.status = error.context?.status || 0;
    throw wrapped;
  }
  return data;
}
export async function startOnlineBunkerGame(room) {
  return invokeBunker({ action:"start", room_id:room.id });
}
export function renderBunkerGame(container, room, user) {
  ensureBunkerStyles();
  let state = null;
  let privateState = {};
  let revision = -1;
  let busy = false;
  let disposed = false;
  let channel = null;
  let notice = "Готовим убежище…";
  const playerName = (id) => (room.members || []).find((entry) => entry.userId === id)?.user?.username || "Игрок";
  const categories = [
    ["profession","Профессия"],["health","Здоровье"],["hobby","Хобби"],["phobia","Фобия"],
    ["trait","Характер"],["luggage","Багаж"],["fact","Факт"]
  ];
  const sendAction = async (action) => {
    if (busy || disposed || !state) return;
    busy = true; notice = "Сервер фиксирует решение…"; render();
    try {
      const data = await invokeBunker({ ...action, room_id:room.id, revision });
      if (disposed) return;
      if (Number(data.revision) >= revision) {
        state = data.state; privateState = data.privateState || {}; revision = Number(data.revision);
      }
      notice = "Действие сохранено.";
    } catch (error) {
      notice = error.message;
      if (error.status === 409) await loadState();
    } finally { busy = false; if (!disposed) render(); }
  };
  const render = () => {
    if (disposed) return;
    if (!state) {
      container.innerHTML = '<section class="bunker-game bunker-game--loading"><span>GAMECLUB · LAST SHELTER</span><h2>Строим убежище</h2><p>' + escapeHTML(notice) + '</p></section>';
      return;
    }
    const me = state.players.find((player) => player.id === user.id);
    const alive = state.players.filter((player) => player.alive);
    const myTurn = state.phase === "reveal" && state.currentRevealId === user.id && me?.alive;
    const myRevealed = me?.revealed || {};
    const secretAttributes = privateState.attributes || {};
    const phaseNames = { reveal:"Раскрытие характеристик",discussion:"Обсуждение",vote:"Голосование",finished:"Игра завершена" };
    const profileCards = state.players.map((player,index) => {
      const revealed = Object.entries(player.revealed || {}).map(([key,value]) => {
        const label = categories.find((item)=>item[0]===key)?.[1] || key;
        return '<div class="bunker-revealed"><span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(value) + '</strong></div>';
      }).join("");
      const hiddenCount = 7 - Object.keys(player.revealed || {}).length;
      return '<article class="bunker-profile ' + (player.alive ? "" : "is-eliminated") + (player.id === user.id ? " is-you" : "") + '"><header><span class="bunker-profile__number">0' + (index+1) + '</span><div><strong>' + escapeHTML(playerName(player.id)) + (player.id===user.id?" · ты":"") + '</strong><small>' + (player.alive ? "КАНДИДАТ В УБЕЖИЩЕ" : "ИСКЛЮЧЁН") + '</small></div><b>' + (player.alive ? "●" : "×") + '</b></header><div class="bunker-revealed-list">' + revealed + (player.alive && hiddenCount>0 ? '<small class="bunker-hidden">Ещё скрыто характеристик: ' + hiddenCount + '</small>' : "") + '</div></article>';
    }).join("");
    let actionPanel = "";
    if (state.phase === "finished") {
      actionPanel = '<div class="bunker-winner"><span>✦</span><strong>Убежище закрывается</strong><p>Выжили: ' + state.winnerIds.map(playerName).map(escapeHTML).join(", ") + '</p></div>';
    } else if (!me?.alive) {
      actionPanel = '<div class="bunker-wait"><strong>Ты исключён</strong><p>Наблюдай за финалом. Твои скрытые характеристики остаются приватными.</p></div>';
    } else if (myTurn) {
      const options = categories.filter(([key])=>!myRevealed[key]).map(([key,label])=>'<option value="' + key + '">' + escapeHTML(label) + '</option>').join("");
      actionPanel = '<div class="bunker-action-copy"><span>ТВОЙ ВЫХОД</span><h3>Раскрой одну характеристику</h3><p>Выбери, что показать остальным. Остальные пункты профиля останутся тайными.</p></div><form data-bunker-reveal class="bunker-form"><select name="category">' + options + '</select><button type="submit" ' + (busy ? "disabled" : "") + '>Раскрыть ↗</button></form>';
    } else if (state.phase === "reveal") {
      actionPanel = '<div class="bunker-wait"><strong>Сейчас раскрывает ' + escapeHTML(playerName(state.currentRevealId)) + '</strong><p>Посмотри, какие характеристики уже открыты, и готовь аргументы для обсуждения.</p></div>';
    } else if (state.phase === "discussion") {
      actionPanel = '<div class="bunker-action-copy"><span>СОВЕТ УБЕЖИЩА</span><h3>Кого взять с собой?</h3><p>Обсудите роли, полезность и риски. Ведущий голосование может открыть любой выживший.</p></div><button class="bunker-primary" type="button" data-bunker-action="start_vote" ' + (busy ? "disabled" : "") + '>Открыть голосование</button>';
    } else if (state.phase === "vote") {
      actionPanel = '<div class="bunker-action-copy"><span>ТАЙНОЕ ГОЛОСОВАНИЕ</span><h3>Кого исключить?</h3><p>Выбери одного другого участника. Результаты откроются после всех голосов.</p></div><div class="bunker-vote-list">' + alive.filter((player)=>player.id!==user.id).map((player)=>'<button type="button" data-bunker-action="vote" data-target="' + escapeHTML(player.id) + '" ' + (busy ? "disabled" : "") + '><span>' + escapeHTML(playerName(player.id)) + '</span><small>Отдать голос</small></button>').join("") + '</div><p class="bunker-vote-progress">Голосов принято: ' + state.votesCount + ' / ' + state.aliveCount + '</p>';
    }
    const privateCard = '<section class="bunker-private"><span class="bunker-eyebrow">ТВОЙ ЗАКРЫТЫЙ ПРОФИЛЬ</span><h3>Не показывай всё сразу</h3><div class="bunker-private-grid">' + categories.map(([key,label])=>'<div><span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(secretAttributes[key] || "—") + '</strong></div>').join("") + '</div><small>Секретные характеристики видны только тебе.</small></section>';
    container.innerHTML = '<section class="bunker-game" aria-label="Игровой стол Бункер"><header class="bunker-header"><div><span class="bunker-eyebrow">GAMECLUB · LAST SHELTER</span><h2>Бункер <i>／</i> Последний шанс</h2><p>Докажи, что именно ты достоин места среди выживших.</p></div><span class="bunker-live"><i></i>' + (state.status==="finished"?"ИГРА ЗАВЕРШЕНА":"РАУНД "+state.round) + '</span></header>' +
      '<div class="bunker-catastrophe"><span>СЦЕНАРИЙ КАТАСТРОФЫ</span><strong>' + escapeHTML(state.catastrophe) + '</strong><small>Вместимость убежища: ' + state.bunkerCapacity + ' · В игре осталось: ' + state.aliveCount + '</small></div>' +
      '<div class="bunker-layout"><main><div class="bunker-section-head"><div><span class="bunker-eyebrow">УЧАСТНИКИ</span><h3>Кандидаты на спасение</h3></div><span>' + alive.length + ' В ИГРЕ</span></div><div class="bunker-profiles">' + profileCards + '</div></main><aside class="bunker-sidebar"><section class="bunker-panel"><span class="bunker-eyebrow">ТЕКУЩАЯ ФАЗА</span><h3>' + escapeHTML(phaseNames[state.phase]) + '</h3>' + actionPanel + '<p class="bunker-notice" role="status">' + escapeHTML(notice) + '</p></section>' + privateCard + '<section class="bunker-panel bunker-event"><span class="bunker-eyebrow">СОБЫТИЯ</span><p>' + escapeHTML(state.lastEvent) + '</p></section></aside></div></section>';
  };
  const loadState = async () => {
    try {
      const data=await invokeBunker({action:"state",room_id:room.id});
      if(disposed||Number(data.revision)<revision)return;
      state=data.state;privateState=data.privateState||{};revision=Number(data.revision);notice="";render();
    } catch(error){if(disposed)return;notice=error.message;render();}
  };
  const handleSubmit = async (event) => {
    const form=event.target.closest("[data-bunker-reveal]");
    if(!form||!container.contains(form))return;
    event.preventDefault();
    const values=new FormData(form);
    await sendAction({action:"reveal",category:values.get("category")});
  };
  const handleClick = async (event) => {
    const button=event.target.closest("[data-bunker-action]");
    if(!button||!container.contains(button))return;
    if(button.dataset.bunkerAction==="vote")await sendAction({action:"vote",target_id:button.dataset.target});
    else await sendAction({action:button.dataset.bunkerAction});
  };
  container.addEventListener("submit",handleSubmit);
  container.addEventListener("click",handleClick);
  channel=supabase.channel("bunker-session-"+room.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"club_room_game_sessions",filter:"room_id=eq."+room.id},loadState)
    .subscribe();
  loadState();
  return()=>{disposed=true;container.removeEventListener("submit",handleSubmit);container.removeEventListener("click",handleClick);if(channel)supabase.removeChannel(channel);};
}
