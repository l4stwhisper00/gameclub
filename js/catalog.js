import { GAMES, GAME_CATEGORIES } from "./games.js";

const STYLESHEET_ID = "nastolny-catalog-styles";
let selectedCategory = "Все игры";
let query = "";

const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function ensureStylesheet() {
  if (document.getElementById(STYLESHEET_ID)) return;
  const link = document.createElement("link");
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = "./css/catalog.css";
  document.head.append(link);
}

function createCard(game, index) {
  return `
    <article class="game-card" data-game-card="${game.id}"
      style="--game-tone:${game.palette[0]};--game-glow:${game.palette[1]};--card-index:${index}">
      <div class="game-card__art pattern-${game.pattern}">
        <div class="game-card__art-top">
          <span class="game-card__category">${escapeHTML(game.category)}</span>
          <span class="game-card__number">${String(index + 1).padStart(2, "0")} / 20</span>
        </div>
        <span class="game-card__orbit game-card__orbit--one"></span>
        <span class="game-card__orbit game-card__orbit--two"></span>
        <span class="game-card__emoji" aria-hidden="true">${game.emoji}</span>
        <span class="game-card__art-caption">${escapeHTML(game.short)}</span>
      </div>
      <div class="game-card__body">
        <div class="game-card__title-row">
          <h3 class="game-card__title">${escapeHTML(game.title)}</h3>
          <span class="game-card__spark" aria-hidden="true">✦</span>
        </div>
        <p class="game-card__tagline">${escapeHTML(game.tagline)}</p>
        <div class="game-card__stats">
          <span><i aria-hidden="true">♟</i> ${game.minPlayers}–${game.maxPlayers} игроков</span>
          <span><i aria-hidden="true">◷</i> ${escapeHTML(game.duration)}</span>
        </div>
        <div class="game-card__tags">${game.tags.slice(0, 3).map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}</div>
        <div class="game-card__actions">
          <button class="catalog-button catalog-button--primary" type="button" data-action="create" data-game-id="${game.id}">Создать комнату <span>↗</span></button>
          <button class="catalog-button catalog-button--quiet" type="button" data-action="details" data-game-id="${game.id}">Подробнее</button>
        </div>
      </div>
    </article>`;
}

function createDetails(game) {
  return `
    <div class="game-modal__backdrop" data-modal-close></div>
    <section class="game-modal__panel" role="dialog" aria-modal="true" aria-labelledby="game-modal-title">
      <button class="game-modal__close" type="button" data-modal-close aria-label="Закрыть окно">×</button>
      <div class="game-modal__hero" style="--game-tone:${game.palette[0]};--game-glow:${game.palette[1]}">
        <span class="game-modal__emoji" aria-hidden="true">${game.emoji}</span>
        <span class="game-modal__category">${escapeHTML(game.category)}</span>
      </div>
      <div class="game-modal__content">
        <p class="eyebrow">ИГРА ДЛЯ ТВОЕЙ КОМПАНИИ</p>
        <h2 id="game-modal-title">${escapeHTML(game.title)}</h2>
        <p class="game-modal__description">${escapeHTML(game.description)}</p>
        <div class="game-modal__quick-stats">
          <div><span>ИГРОКИ</span><strong>${game.minPlayers}–${game.maxPlayers}</strong></div>
          <div><span>ДЛИТЕЛЬНОСТЬ</span><strong>${escapeHTML(game.duration)}</strong></div>
        </div>
        <div class="game-modal__section"><h3>Как играется</h3>
          <ul>${game.mechanics.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </div>
        <div class="game-modal__section"><h3>Варианты правил для комнаты</h3>
          <ul>${game.rules.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </div>
        <div class="game-modal__tags">${game.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}</div>
        <button class="catalog-button catalog-button--primary game-modal__create" type="button" data-action="create" data-game-id="${game.id}">Создать комнату <span>↗</span></button>
      </div>
    </section>`;
}

function getMatches() {
  const normalized = query.trim().toLocaleLowerCase("ru");
  return GAMES.filter((game) => {
    const categoryMatches = selectedCategory === "Все игры" || game.category === selectedCategory;
    const haystack = [game.title, game.short, game.category, game.tagline, game.description, ...game.tags]
      .join(" ").toLocaleLowerCase("ru");
    return categoryMatches && (!normalized || haystack.includes(normalized));
  });
}

function toast(message) {
  let region = document.querySelector("#toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    document.body.append(region);
  }
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 3200);
}

export function renderCatalog(container) {
  ensureStylesheet();
  selectedCategory = "Все игры";
  query = "";

  container.innerHTML = `
    <section class="catalog-page page-enter">
      <div class="catalog-hero">
        <div class="catalog-hero__copy">
          <span class="eyebrow">БИБЛИОТЕКА НАСТОЛЬНОГО КЛУБА</span>
          <h1 class="display-title">Выбери свою<br><span class="gradient-text">следующую историю.</span></h1>
          <p class="lead">От магических миров до психологических дуэлей. Найди игру под настроение и собери компанию за одним столом.</p>
        </div>
        <div class="catalog-hero__relic" aria-hidden="true">
          <div class="catalog-relic__ring catalog-relic__ring--outer"></div>
          <div class="catalog-relic__ring catalog-relic__ring--inner"></div>
          <span>🎲</span><i>✦</i>
        </div>
      </div>
      <div class="catalog-toolbar">
        <div class="catalog-toolbar__heading">
          <div><span class="eyebrow">ТВОЯ ПОЛКА ПРИКЛЮЧЕНИЙ</span><h2>Каталог игр</h2></div>
          <span class="catalog-count" id="catalog-count">20 ИГР</span>
        </div>
        <label class="catalog-search">
          <span aria-hidden="true">⌕</span>
          <input id="catalog-search" type="search" placeholder="Найти игру, жанр или настроение…" autocomplete="off" aria-label="Поиск по каталогу игр">
          <kbd>/</kbd>
        </label>
        <div class="catalog-filters" id="catalog-filters" aria-label="Фильтр по категориям">
          ${GAME_CATEGORIES.map((category) => `
            <button class="catalog-filter ${category === "Все игры" ? "is-active" : ""}" type="button"
              data-category="${escapeHTML(category)}" aria-pressed="${category === "Все игры"}">
              ${category === "Все игры" ? "✧ Все игры" : escapeHTML(category)}
            </button>`).join("")}
        </div>
      </div>
      <div class="catalog-results-line">
        <p id="catalog-results-label" aria-live="polite">20 игр ждут своих игроков</p>
        <span>ПОДБЕРИ СВОЙ ФОРМАТ</span>
      </div>
      <div class="game-grid" id="game-grid">${GAMES.map(createCard).join("")}</div>
      <div class="catalog-empty" id="catalog-empty" hidden>
        <span>✧</span><h3>Такой игры пока не видно</h3>
        <p>Попробуй изменить запрос или выбрать другую категорию.</p>
        <button class="catalog-button catalog-button--quiet" id="catalog-reset" type="button">Сбросить фильтры</button>
      </div>
      <p class="catalog-footnote">БИБЛИОТЕКА КЛУБА · <span>ВЫБЕРИ ИГРУ. СОБЕРИ КОМАНДУ. СОЗДАЙ ВОСПОМИНАНИЕ.</span></p>
    </section>
    <div class="game-modal" id="game-modal" hidden></div>`;

  const grid = container.querySelector("#game-grid");
  const count = container.querySelector("#catalog-count");
  const label = container.querySelector("#catalog-results-label");
  const empty = container.querySelector("#catalog-empty");
  const search = container.querySelector("#catalog-search");
  const filters = container.querySelector("#catalog-filters");
  const modal = container.querySelector("#game-modal");

  function bindTilt() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        window.matchMedia("(hover: none)").matches) return;
    grid.querySelectorAll(".game-card").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--tilt-x", `${(0.5 - y) * 5}deg`);
        card.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
        card.style.setProperty("--pointer-x", `${x * 100}%`);
        card.style.setProperty("--pointer-y", `${y * 100}%`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
        card.style.setProperty("--pointer-x", "50%");
        card.style.setProperty("--pointer-y", "50%");
      });
    });
  }

  function animateCards() {
    const cards = [...grid.querySelectorAll(".game-card")];
    if (!("IntersectionObserver" in window)) {
      cards.forEach((card) => card.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    cards.forEach((card, index) => {
      card.style.setProperty("--card-index", index);
      observer.observe(card);
    });
  }

  function refresh() {
    const matches = getMatches();
    grid.innerHTML = matches.map((game) => createCard(game, GAMES.indexOf(game))).join("");
    count.textContent = `${matches.length} ${matches.length === 1 ? "ИГРА" : matches.length >= 2 && matches.length <= 4 ? "ИГРЫ" : "ИГР"}`;
    label.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? "игра доступна" : "игр доступно"} для выбора`
      : "Ничего не найдено";
    empty.hidden = matches.length > 0;
    grid.hidden = matches.length === 0;
    bindTilt();
    animateCards();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.innerHTML = "";
    document.body.classList.remove("has-game-modal");
  }

  function openModal(game) {
    closeModal();
    modal.innerHTML = createDetails(game);
    modal.hidden = false;
    document.body.classList.add("has-game-modal");
    modal.querySelector(".game-modal__close")?.focus();
  }

  function handleAction(target) {
    const button = target.closest("[data-action]");
    if (!button) return;
    const game = GAMES.find((item) => item.id === button.dataset.gameId);
    if (!game) return;
    if (button.dataset.action === "details") openModal(game);
    if (button.dataset.action === "create") {
      location.hash = `#/rooms/new?game=${encodeURIComponent(game.id)}`;
    }
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    selectedCategory = button.dataset.category;
    filters.querySelectorAll(".catalog-filter").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    refresh();
  });
  search.addEventListener("input", () => {
    query = search.value;
    refresh();
  });
  grid.addEventListener("click", (event) => handleAction(event.target));
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-modal-close]")) closeModal();
    else handleAction(event.target);
  });
  container.querySelector("#catalog-reset").addEventListener("click", () => {
    selectedCategory = "Все игры";
    query = "";
    search.value = "";
    filters.querySelectorAll(".catalog-filter").forEach((item) => {
      const active = item.dataset.category === selectedCategory;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    refresh();
  });

  function onKeyDown(event) {
    if (event.key === "Escape") closeModal();
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      search.focus();
    }
  }
  document.addEventListener("keydown", onKeyDown);
  bindTilt();
  animateCards();

  return () => {
    closeModal();
    document.removeEventListener("keydown", onKeyDown);
  };
}
