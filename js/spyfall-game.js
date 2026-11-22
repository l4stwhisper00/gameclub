import { supabase } from "./supabase.js";

function ensureSpyfallStyles(){if(document.getElementById("spyfall-game-styles"))return;const link=document.createElement("link");link.id="spyfall-game-styles";link.rel="stylesheet";link.href="./css/spyfall-game.css";document.head.append(link);}
function escapeHTML(value=""){return String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
async function invokeSpyfall(body){const {data,error}=await supabase.functions.invoke("spyfall-game",{body});if(error){let message=error.message||"Не удалось связаться со Spyfall.";try{const payload=await error.context?.json?.();if(payload?.error)message=payload.error;}catch{}const wrapped=new Error(message);wrapped.status=error.context?.status||0;throw wrapped;}return data;}
export async function startOnlineSpyfallGame(room){return invokeSpyfall({action:"start",room_id:room.id});}
export function renderSpyfallGame(container,room,user){
  ensureSpyfallStyles();
  let state=null,privateState={},revision=-1,busy=false,disposed=false,channel=null,notice="Перемешиваем роли…";
  const playerName=(id)=>(room.members||[]).find((entry)=>entry.userId===id)?.user?.username||"Игрок";
  const sendAction=async(action)=>{if(busy||disposed||!state)return;busy=true;notice="Проверяем действие…";render();try{const data=await invokeSpyfall({...action,room_id:room.id,revision});if(disposed)return;if(Number(data.revision)>=revision){state=data.state;privateState=data.privateState||{};revision=Number(data.revision);}notice="Действие сохранено.";}catch(error){notice=error.message;if(error.status===409)await loadState();}finally{busy=false;if(!disposed)render();}};
  const render=()=>{
    if(disposed)return;
    if(!state){container.innerHTML='<section class="spyfall-game spyfall-game--loading"><span>GAMECLUB · WHO IS THE SPY?</span><h2>Раздаём секретные роли</h2><p>'+escapeHTML(notice)+'</p></section>';return;}
    const isSpy=Boolean(privateState.isSpy),isFinished=state.status==="finished",myTurn=state.currentAskerId===user.id&&!isFinished;
    const suspects=state.players.filter((player)=>player.id!==user.id);
    const roster=state.players.map((player,index)=>'<div class="spyfall-player '+(player.id===state.currentAskerId?"is-turn":"")+'"><b>0'+(index+1)+'</b><span>'+escapeHTML(playerName(player.id))+(player.id===user.id?" · ты":"")+'</span><small>'+(player.id===state.currentAskerId?"СЛЕДУЮЩИЙ ВОПРОС":"В ИГРЕ")+'</small></div>').join("");
    const questions=(state.questions||[]).map((item)=>'<article class="spyfall-question"><div><strong>'+escapeHTML(playerName(item.from))+'</strong><span>спрашивает</span><strong>'+escapeHTML(playerName(item.to))+'</strong></div><p>'+escapeHTML(item.text)+'</p></article>').join("");
    let roleCard=isSpy
      ? '<div class="spyfall-role-card spyfall-role-card--spy"><span>ТВОЯ СЕКРЕТНАЯ РОЛЬ</span><strong>ТЫ — ШПИОН</strong><p>Ты не знаешь локацию. Слушай вопросы, не выдавай себя и попробуй угадать место.</p><small>КАТЕГОРИЯ: '+escapeHTML(privateState.category||state.category)+'</small></div>'
      : '<div class="spyfall-role-card"><span>ТВОЯ СЕКРЕТНАЯ РОЛЬ</span><strong>'+escapeHTML(privateState.role||"Участник")+'</strong><p>Ты знаешь место. Отвечай естественно, но не раскрывай локацию слишком явно.</p><small>ЛОКАЦИЯ: '+escapeHTML(privateState.location||"Скрыта")+'</small></div>';
    let actions="";
    if(isFinished){
      actions='<div class="spyfall-result"><span>РАУНД ЗАВЕРШЁН</span><strong>'+(state.winner==="spy"?"Победил шпион":"Победили агенты")+'</strong><p>Локация: '+escapeHTML(state.revealedLocation||"—")+'</p><p>Шпион: '+escapeHTML(playerName(state.spyId))+'</p></div>';
    }else{
      if(myTurn){
        actions+='<form class="spyfall-ask-form" data-spyfall-ask><span>ТВОЙ ВОПРОС</span><select name="target_id">'+suspects.map((p)=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(playerName(p.id))+'</option>').join("")+'</select><input name="text" maxlength="180" placeholder="Например: Ты часто сюда приходишь?" required><button type="submit" '+(busy?"disabled":"")+'>Задать вопрос ↗</button></form>';
      }else{
        actions+='<div class="spyfall-wait"><strong>Следующий вопрос задаёт '+escapeHTML(playerName(state.currentAskerId))+'</strong><p>Следи за ответами и ищи несоответствия.</p></div>';
      }
      actions+='<form class="spyfall-accuse-form" data-spyfall-accuse><span>ОБВИНИТЬ В ШПИОНАЖЕ</span><select name="suspect_id">'+suspects.map((p)=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(playerName(p.id))+'</option>').join("")+'</select><button type="submit" '+(busy?"disabled":"")+'>Обвинить</button></form>';
      if(isSpy)actions+='<form class="spyfall-guess-form" data-spyfall-guess><span>ПОПЫТКА ШПИОНА УГАДАТЬ ЛОКАЦИЮ</span><input name="guess" maxlength="64" placeholder="Какое это место?" required><button type="submit" '+(busy?"disabled":"")+'>Назвать локацию</button></form>';
      if(room.hostId===user.id)actions+='<button class="spyfall-end" type="button" data-spyfall-action="end_round" '+(busy?"disabled":"")+'>Завершить раунд</button>';
    }
    container.innerHTML='<section class="spyfall-game" aria-label="Игровой стол Spyfall"><header class="spyfall-header"><div><span class="spyfall-eyebrow">GAMECLUB · WHO IS THE SPY?</span><h2>Spyfall <i>／</i> Найди шпиона</h2><p>Один не знает локацию. Остальные должны вычислить его по вопросам.</p></div><span class="spyfall-live"><i></i>'+(isFinished?"РАУНД ЗАВЕРШЁН":"КАТЕГОРИЯ · "+escapeHTML(state.category))+'</span></header>'+
      '<div class="spyfall-layout"><main><section class="spyfall-role-wrap">'+roleCard+'</section><section class="spyfall-panel"><div class="spyfall-panel-head"><div><span class="spyfall-eyebrow">ДЕТЕКТИВНАЯ ЦЕПОЧКА</span><h3>Вопросы и ответы</h3></div><span>'+state.questions.length+' ВОПРОСОВ</span></div>'+(questions||'<p class="spyfall-empty">Раунд только начался. Первый вопрос может многое раскрыть.</p>')+'</section></main>'+
      '<aside class="spyfall-sidebar"><section class="spyfall-panel"><span class="spyfall-eyebrow">УЧАСТНИКИ</span><h3>Кто за столом</h3><div class="spyfall-roster">'+roster+'</div></section><section class="spyfall-panel spyfall-panel--actions"><span class="spyfall-eyebrow">ТВОИ ДЕЙСТВИЯ</span>'+actions+'<p class="spyfall-notice" role="status">'+escapeHTML(notice)+'</p></section><section class="spyfall-panel"><span class="spyfall-eyebrow">ПОСЛЕДНЕЕ СОБЫТИЕ</span><p>'+escapeHTML(state.lastEvent)+'</p></section></aside></div></section>';
  };
  const loadState=async()=>{try{const data=await invokeSpyfall({action:"state",room_id:room.id});if(disposed||Number(data.revision)<revision)return;state=data.state;privateState=data.privateState||{};revision=Number(data.revision);notice="";render();}catch(error){if(disposed)return;notice=error.message;render();}};
  const handleSubmit=async(event)=>{
    const form=event.target.closest("form");if(!form||!container.contains(form))return;event.preventDefault();const values=new FormData(form);
    if(form.matches("[data-spyfall-ask]"))await sendAction({action:"ask",target_id:values.get("target_id"),text:values.get("text")});
    else if(form.matches("[data-spyfall-accuse]"))await sendAction({action:"accuse",suspect_id:values.get("suspect_id")});
    else if(form.matches("[data-spyfall-guess]"))await sendAction({action:"guess_location",guess:values.get("guess")});
  };
  const handleClick=async(event)=>{const button=event.target.closest("[data-spyfall-action]");if(!button||!container.contains(button))return;await sendAction({action:button.dataset.spyfallAction});};
  container.addEventListener("submit",handleSubmit);container.addEventListener("click",handleClick);
  channel=supabase.channel("spyfall-session-"+room.id).on("postgres_changes",{event:"*",schema:"public",table:"club_room_game_sessions",filter:"room_id=eq."+room.id},loadState).subscribe();
  loadState();
  return()=>{disposed=true;container.removeEventListener("submit",handleSubmit);container.removeEventListener("click",handleClick);if(channel)supabase.removeChannel(channel);};
}
