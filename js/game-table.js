const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function visualFor(game) {
  const id = game.id;
  if (id === "dnd-5e") return `
    <div class="gt-scene gt-scene--quest">
      <div class="gt-d20">D20</div><div class="gt-quest-copy"><span>ПРИКЛЮЧЕНИЕ</span><strong>История начинается здесь</strong><small>Соберите отряд, выберите персонажей и приготовьтесь к путешествию.</small></div>
      <div class="gt-rune-row"><i>⚔</i><i>✦</i><i>♜</i><i>☽</i><i>⌖</i></div>
    </div>`;
  if (id === "bunker") return `
    <div class="gt-card-row"><div class="gt-feature-card"><span>01 · УГРОЗА</span><b>☢</b><strong>Катастрофа</strong><small>Событие раскроется ведущим</small></div><div class="gt-feature-card"><span>02 · УБЕЖИЩЕ</span><b>⌂</b><strong>Места ограничены</strong><small>Решение принимается вместе</small></div><div class="gt-feature-card"><span>03 · ОТБОР</span><b>◉</b><strong>Обсуждение</strong><small>Каждый доказывает свою пользу</small></div></div>`;
  if (["mafia","secret-hitler","avalon","spy"].includes(id)) return `
    <div class="gt-role-table"><div class="gt-role-card"><span>РОЛЬ ИГРОКА</span><b>?</b><small>Скрытая информация</small></div><div class="gt-phase-track"><span class="is-current">Подготовка</span><i></i><span>Раунд</span><i></i><span>Голосование</span></div><div class="gt-role-card"><span>ОБЩИЙ СТОЛ</span><b>◉</b><small>Обсуждение команды</small></div></div>`;
  if (id === "codenames") return `
    <div class="gt-word-grid">${Array.from({length:25},(_,i)=>`<span class="gt-word-tile ${[2,6,11,18,22].includes(i)?"is-accent":""}">${["ЛУНА","МОСТ","КЛЮЧ","ШТОРМ","КОМЕТА"][i%5]}</span>`).join("")}</div><p class="gt-board-caption">Демонстрация поля · настоящие слова и команды появятся после запуска игровой механики.</p>`;
  if (["dixit","imaginarium"].includes(id)) return `
    <div class="gt-art-cards"><div class="gt-art-card art-one"><span>✧</span><small>ВОСПОМИНАНИЕ</small></div><div class="gt-art-card art-two"><span>☾</span><small>СОН</small></div><div class="gt-art-card art-three"><span>♧</span><small>ПУТЬ</small></div></div>`;
  if (["alias","ekivoki","crocodile"].includes(id)) return `
    <div class="gt-prompt-stage"><span class="gt-prompt-kicker">СЛОВЕСНЫЙ / ТВОРЧЕСКИЙ РАУНД</span><strong>${id==="crocodile"?"Покажи без слов":id==="ekivoki"?"Объясни, нарисуй или покажи":"Объясни слово команде"}</strong><div class="gt-prompt-masked">СЛОВО ПОЯВИТСЯ ЗДЕСЬ</div><small>Командное поле и раундовый таймер будут активированы вместе с механикой игры.</small></div>`;
  if (id === "uno") return `
    <div class="gt-card-fan"><span class="uno-red">7</span><span class="uno-blue">↻</span><span class="uno-yellow">2</span><span class="uno-green">＋2</span><span class="uno-wild">✦</span></div>`;
  if (id === "monopoly") return `
    <div class="gt-property-board"><span>СТАРТ</span><span>УЛИЦА</span><span>ШАНС</span><span>БАНК</span><span>ОТЕЛЬ</span><span>ВОКЗАЛ</span><span>НАЛОГ</span><span>ПАРК</span><b>⌂</b></div>`;
  if (["carcassonne","catan"].includes(id)) return `
    <div class="gt-hex-board">${Array.from({length:13},(_,i)=>`<span class="hex-${i%5}">${["🌲","🌾","⛰","🏰","🌊"][i%5]}</span>`).join("")}</div>`;
  if (id === "ticket-to-ride") return `
    <div class="gt-route-map"><svg viewBox="0 0 520 170" role="img" aria-label="Схема железнодорожных маршрутов"><path d="M45 125 L145 45 L250 110 L350 35 L470 100 M145 45 L175 145 L250 110 L365 145 L470 100 M45 125 L175 145 M250 110 L350 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 9"/><g fill="currentColor"><circle cx="45" cy="125" r="9"/><circle cx="145" cy="45" r="9"/><circle cx="250" cy="110" r="9"/><circle cx="350" cy="35" r="9"/><circle cx="470" cy="100" r="9"/><circle cx="175" cy="145" r="9"/><circle cx="365" cy="145" r="9"/></g></svg><span>МАРШРУТЫ МЕЖДУ ГОРОДАМИ</span></div>`;
  if (id === "munchkin") return `
    <div class="gt-duel-cards"><div class="gt-monster-card"><small>МОНСТР</small><b>🐉</b><strong>Страж подземелья</strong></div><div class="gt-loot-card"><small>СОКРОВИЩЕ</small><b>⚔</b><strong>Эпическая добыча</strong></div></div>`;
  if (id === "backgammon") return `
    <div class="gt-backgammon"><div class="gt-points">${Array.from({length:12},(_,i)=>`<i class="${i%2?"is-dark":""}"></i>`).join("")}</div><div class="gt-checkers"><b>⚫ ⚫ ⚫</b><b>⚪ ⚪ ⚪</b></div></div>`;
  return `
    <div class="gt-generic-board"><span>${escapeHTML(game.emoji)}</span><strong>${escapeHTML(game.short)}</strong><small>Игровой стол готовится</small></div>`;
}

export function renderGameTable(container, room, game, user) {
  const members = room.members || [];
  const host = room.hostId === user.id;
  const rules = room.rules?.game || {};
  const statusLabel = room.status === "playing" ? "Сессия открыта" : "Ожидание игроков";
  const tagList = (game.tags || []).slice(0,3).map(tag => `<span>${escapeHTML(tag)}</span>`).join("");
  const mechanics = (game.mechanics || []).map((item,index)=>`<li><i>${String(index+1).padStart(2,"0")}</i>${escapeHTML(item)}</li>`).join("");
  container.innerHTML = `
    <section class="game-table ${["dnd-5e","monopoly","catan","carcassonne","ticket-to-ride","backgammon","munchkin"].includes(game.id) ? "game-table--large" : ""} game-table--${escapeHTML(game.id)}" style="--gt-tone:${game.palette[0]};--gt-glow:${game.palette[1]}">
      <header class="game-table__head">
        <div><span class="eyebrow">ИГРОВОЙ СТОЛ · ${escapeHTML(game.category.toUpperCase())}</span><h2>${game.emoji} ${escapeHTML(game.title)}</h2><p>${escapeHTML(game.tagline || game.description)}</p></div>
        <span class="game-table__status"><i></i>${statusLabel}</span>
      </header>
      <div class="game-table__layout">
        <div class="game-table__main">
          <div class="game-table__surface">${visualFor(game)}</div>
          <div class="game-table__players"><div class="game-table__section-head"><span>ЗА СТОЛОМ</span><b>${members.length} / ${room.maxPlayers}</b></div>
            <div class="game-table__player-list">${members.map((m,index)=>`<div class="game-table__player"><span>${escapeHTML((m.user?.username || "Игрок").slice(0,1).toUpperCase())}</span><div><strong>${escapeHTML(m.user?.username || "Игрок")}</strong><small>${m.userId===room.hostId?"Ведущий":"Участник"}${m.userId===user.id?" · это ты":""}</small></div>${m.userId===room.hostId?'<em>HOST</em>':""}</div>`).join("") || '<p class="game-table__empty">Пока никто не занял место за столом.</p>'}</div>
          </div>
        </div>
        <aside class="game-table__aside">
          <section class="game-table__panel"><span class="game-table__section-head">КАК ИГРАЕМ</span><ol>${mechanics}</ol></section>
          <section class="game-table__panel"><span class="game-table__section-head">ПАРАМЕТРЫ</span><div class="game-table__facts"><div><span>Формат</span><b>${escapeHTML(rules.roundFormat || "По правилам игры")}</b></div><div><span>Игроки</span><b>${game.minPlayers}–${game.maxPlayers}</b></div><div><span>Длительность</span><b>${escapeHTML(game.duration)}</b></div><div><span>Твоя роль</span><b>${host?"Ведущий":members.some(m=>m.userId===user.id)?"Игрок":"Гость"}</b></div></div></section>
        </aside>
      </div>
      <footer class="game-table__foot"><span>Игровая площадка</span><p>Состояние партии синхронизируется через серверную игровую сессию; демонстрационные элементы пока не являются игровыми ходами.</p></footer>
    </section>`;
  const link = document.getElementById("game-table-styles");
  if (!link) {
    const stylesheet = document.createElement("link");
    stylesheet.id = "game-table-styles";
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./css/game-table.css";
    document.head.append(stylesheet);
  }
}
