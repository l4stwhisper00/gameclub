import { supabase } from "./supabase.js";

function ensureAliasStyles() {
  if (document.getElementById("alias-game-styles")) return;
  const link=document.createElement("link");link.id="alias-game-styles";link.rel="stylesheet";link.href="./css/alias-game.css";document.head.append(link);
}
function escapeHTML(value=""){return String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
async function invokeAlias(body){
  const {data,error}=await supabase.functions.invoke("alias-game",{body});
  if(error){let message=error.message||"Не удалось связаться с Alias.";try{const payload=await error.context?.json?.();if(payload?.error)message=payload.error;}catch{}const wrapped=new Error(message);wrapped.status=error.context?.status||0;throw wrapped;}
  return data;
}
export async function startOnlineAliasGame(room){return invokeAlias({action:"start",room_id:room.id});}
export function renderAliasGame(container,room,user){
  ensureAliasStyles();
  let state=null,privateState={},revision=-1,busy=false,disposed=false,channel=null,notice="Подбираем слова…";
  const playerName=(id)=>(room.members||[]).find((entry)=>entry.userId===id)?.user?.username||"Игрок";
  const sendAction=async(action)=>{
    if(busy||disposed||!state)return;
    busy=true;notice="Сохраняем ответ…";render();
    try{const data=await invokeAlias({...action,room_id:room.id,revision});if(disposed)return;if(Number(data.revision)>=revision){state=data.state;privateState=data.privateState||{};revision=Number(data.revision);}notice="Ответ принят.";}
    catch(error){notice=error.message;if(error.status===409)await loadState();}
    finally{busy=false;if(!disposed)render();}
  };
  const render=()=>{
    if(disposed)return;
    if(!state){container.innerHTML='<section class="alias-game alias-game--loading"><span>GAMECLUB · WORD RACE</span><h2>Готовим слова</h2><p>'+escapeHTML(notice)+'</p></section>';return;}
    const me=state.players.find((player)=>player.id===user.id);
    const myTurn=state.currentExplainerId===user.id&&state.currentTeam===me?.team&&state.status==="active";
    const teamName=(team)=>team==="red"?"Красная команда":"Синяя команда";
    const redPlayers=state.players.filter((player)=>player.team==="red").map((player)=>'<span class="'+(player.id===state.currentExplainerId?"is-explainer":"")+'">'+escapeHTML(playerName(player.id))+'</span>').join("");
    const bluePlayers=state.players.filter((player)=>player.team==="blue").map((player)=>'<span class="'+(player.id===state.currentExplainerId?"is-explainer":"")+'">'+escapeHTML(playerName(player.id))+'</span>').join("");
    let controls="";
    if(state.status==="finished"){
      controls='<div class="alias-winner"><span>✦</span><strong>Победила '+teamName(state.winnerTeam)+'</strong><p>Команда первой набрала '+state.scoreToWin+' очков.</p></div>';
    }else if(myTurn){
      controls='<div class="alias-word-card"><span>СЛОВО ДЛЯ ОБЪЯСНЕНИЯ</span><strong>'+escapeHTML(privateState.word||"Слово загружается…")+'</strong><small>Не называй слово, его части или однокоренные формы; нельзя показывать жестами или переводить.</small></div><div class="alias-actions"><button type="button" data-alias-action="correct" '+(busy?"disabled":"")+'>✓ Угадали</button><button type="button" data-alias-action="skip" '+(busy?"disabled":"")+'>Пропустить</button><button type="button" data-alias-action="end_turn" '+(busy?"disabled":"")+'>Закончить ход</button></div>';
    }else{
      controls='<div class="alias-wait"><span>СЕЙЧАС ОБЪЯСНЯЕТ</span><strong>'+escapeHTML(playerName(state.currentExplainerId))+'</strong><p>Команда '+teamName(state.currentTeam)+' объясняет слова. Помогай своей команде угадывать.</p></div>';
    }
    container.innerHTML='<section class="alias-game" aria-label="Игровой стол Alias"><header class="alias-header"><div><span class="alias-eyebrow">GAMECLUB · WORD RACE</span><h2>Alias <i>／</i> Скажи иначе</h2><p>Объясняй слова своей команде, не называя их напрямую.</p></div><span class="alias-live"><i></i>'+(state.status==="finished"?"ИГРА ЗАВЕРШЕНА":"РАУНД "+state.round)+'</span></header>'+
      '<div class="alias-scoreboard"><div class="alias-score alias-score--red '+(state.currentTeam==="red"&&state.status==="active"?"is-active":"")+'"><span>КРАСНЫЕ</span><strong>'+state.scores.red+'</strong><small>из '+state.scoreToWin+'</small><div class="alias-team-players">'+redPlayers+'</div></div><div class="alias-score-center"><span>ТЕКУЩИЙ ХОД</span><strong>'+escapeHTML(teamName(state.currentTeam))+'</strong><small>Объясняет: '+escapeHTML(playerName(state.currentExplainerId))+'</small></div><div class="alias-score alias-score--blue '+(state.currentTeam==="blue"&&state.status==="active"?"is-active":"")+'"><span>СИНИЕ</span><strong>'+state.scores.blue+'</strong><small>из '+state.scoreToWin+'</small><div class="alias-team-players">'+bluePlayers+'</div></div></div>'+
      '<div class="alias-main"><div class="alias-play-area">'+controls+'</div><aside class="alias-sidebar"><section class="alias-panel"><span class="alias-eyebrow">ТВОЯ КОМАНДА</span><h3>'+teamName(me?.team)+'</h3><p>'+(myTurn?"Ты объясняешь слово. Команда должна угадать его.":"Слушай объяснение и помогай угадывать.")+'</p></section><section class="alias-panel"><span class="alias-eyebrow">ПРАВИЛА ХОДА</span><ul><li>За верный ответ команда получает +1.</li><li>Можно пропустить сложное слово без штрафа.</li><li>Объясняющий меняется после завершения хода.</li><li>Игра идёт до '+state.scoreToWin+' очков; таймер пока не включён.</li></ul></section><section class="alias-panel"><span class="alias-eyebrow">ПОСЛЕДНЕЕ СОБЫТИЕ</span><p>'+escapeHTML(state.lastEvent)+'</p><p class="alias-notice" role="status">'+escapeHTML(notice)+'</p></section></aside></div></section>';
  };
  const loadState=async()=>{
    try{const data=await invokeAlias({action:"state",room_id:room.id});if(disposed||Number(data.revision)<revision)return;state=data.state;privateState=data.privateState||{};revision=Number(data.revision);notice="";render();}
    catch(error){if(disposed)return;notice=error.message;render();}
  };
  const handleClick=async(event)=>{const button=event.target.closest("[data-alias-action]");if(!button||!container.contains(button))return;await sendAction({action:button.dataset.aliasAction});};
  container.addEventListener("click",handleClick);
  channel=supabase.channel("alias-session-"+room.id).on("postgres_changes",{event:"*",schema:"public",table:"club_room_game_sessions",filter:"room_id=eq."+room.id},loadState).subscribe();
  loadState();
  return()=>{disposed=true;container.removeEventListener("click",handleClick);if(channel)supabase.removeChannel(channel);};
}
