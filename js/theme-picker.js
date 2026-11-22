const THEMES = [
  { id: "arcade", name: "Современный игровой", note: "Фиолетовый свет, аркадная энергия", mark: "🎮", colors: ["#111126", "#713cff", "#a78bfa"] },
  { id: "cozy", name: "Светлый и уютный", note: "Сливочный фон и мягкий шалфей", mark: "♟", colors: ["#f5f0e5", "#6f9e35", "#d8c59d"] },
  { id: "vivid", name: "Яркий и живой", note: "Электрический синий и апельсиновый", mark: "🎲", colors: ["#052b46", "#ff8618", "#14b8ff"] },
  { id: "minimal", name: "Тёмный минимализм", note: "Графит, тонкие линии, мята", mark: "♞", colors: ["#101312", "#91ad83", "#d9e3d4"] },
  { id: "fantasy", name: "Фэнтези стиль", note: "Сумеречное золото и магический лес", mark: "🏰", colors: ["#201a19", "#d5a45d", "#f2d6a2"] },
  { id: "cyberpunk", name: "Неоновый киберпанк", note: "Ночной мегаполис и неон", mark: "🌃", colors: ["#090d27", "#ec39cf", "#31eaff"] },
  { id: "nature", name: "Природный", note: "Глубокий лес, вода и свежий воздух", mark: "🌲", colors: ["#15251b", "#9acb58", "#91d6c1"] },
  { id: "classic", name: "Классический", note: "Тёплое дерево и ламповый свет", mark: "♜", colors: ["#21170f", "#c69b61", "#f1d5a4"] },
  { id: "sakura", name: "Японский стиль", note: "Розовый рассвет и летящие лепестки", mark: "🌸", colors: ["#fff0f1", "#c52e55", "#f5a5b5"] },
  { id: "dynamic", name: "Динамичный", note: "Скорость, синева и световые трассы", mark: "⚡", colors: ["#06172a", "#00c9f2", "#287dff"] }
];

const STORAGE_KEY = "gameclub:theme";
let activeTheme = "classic";
let drawer;
let trigger;
let petalsLayer;

function previewMarkup(theme) {
  return `<button class="theme-card" type="button" data-theme-choice="${theme.id}" aria-pressed="false">
    <span class="theme-preview theme-preview--${theme.id}" aria-hidden="true">
      <span class="theme-preview__sidebar"><i></i><i></i><i></i><i></i></span>
      <span class="theme-preview__content"><b>Хорошие игры.<br>Своя компания.</b><small>Собери друзей за одним столом</small><span class="theme-preview__buttons"><i></i><i></i></span></span>
      <span class="theme-preview__art">${theme.mark}</span>
    </span>
    <span class="theme-card__meta"><strong>${theme.name}</strong><small>${theme.note}</small></span>
    <span class="theme-card__swatches" aria-hidden="true">${theme.colors.map(color => `<i style="--swatch:${color}"></i>`).join("")}</span>
    <span class="theme-card__selected" aria-hidden="true">✓</span>
  </button>`;
}

function setTheme(id, persist = true) {
  if (!THEMES.some(theme => theme.id === id)) return;
  activeTheme = id;
  document.documentElement.dataset.theme = id;
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* Storage can be unavailable. */ }
  }
  drawer?.querySelectorAll("[data-theme-choice]").forEach(button => {
    const selected = button.dataset.themeChoice === id;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const label = drawer?.querySelector("[data-current-theme]");
  if (label) label.textContent = THEMES.find(theme => theme.id === id)?.name || "";
  trigger?.setAttribute("aria-label", `Открыть темы оформления. Сейчас: ${THEMES.find(theme => theme.id === id)?.name}`);
}

function closeDrawer() {
  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden", "true");
  trigger?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("theme-drawer-open");
}

function openDrawer() {
  drawer?.classList.add("is-open");
  drawer?.setAttribute("aria-hidden", "false");
  trigger?.setAttribute("aria-expanded", "true");
  document.body.classList.add("theme-drawer-open");
  drawer?.querySelector("[data-theme-choice]")?.focus({ preventScroll: true });
}

function addSakura() {
  petalsLayer?.remove();
  if (activeTheme !== "sakura" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  petalsLayer = document.createElement("div");
  petalsLayer.className = "sakura-petals";
  petalsLayer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 22; i += 1) {
    const petal = document.createElement("i");
    petal.style.setProperty("--left", `${(i * 37 + 11) % 100}%`);
    petal.style.setProperty("--delay", `${(i % 11) * -1.7}s`);
    petal.style.setProperty("--duration", `${9 + (i % 7) * 1.6}s`);
    petal.style.setProperty("--drift", `${((i * 19) % 120) - 60}px`);
    petal.style.setProperty("--size", `${7 + (i % 4) * 2}px`);
    petalsLayer.append(petal);
  }
  document.body.append(petalsLayer);
}

function mountThemePicker() {
  const topbar = document.querySelector(".topbar");
  if (!topbar || document.querySelector(".theme-picker-trigger")) return;
  trigger = document.createElement("button");
  trigger.className = "theme-picker-trigger";
  trigger.type = "button";
  trigger.innerHTML = '<span aria-hidden="true">✳</span><span>Темы оформления</span><span class="theme-picker-trigger__chevron" aria-hidden="true">↗</span>';
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "theme-drawer");

  drawer = document.createElement("aside");
  drawer.className = "theme-drawer";
  drawer.id = "theme-drawer";
  drawer.setAttribute("aria-label", "Выбор темы оформления");
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = `
    <div class="theme-drawer__header">
      <div><span class="theme-drawer__eyebrow">ТВОЯ АТМОСФЕРА</span><h2>Выбери настроение</h2><p>Меняй облик GameClub в один клик.</p></div>
      <button class="theme-drawer__close" type="button" aria-label="Закрыть темы">×</button>
    </div>
    <div class="theme-drawer__current">Сейчас выбрана: <strong data-current-theme></strong></div>
    <div class="theme-grid">${THEMES.map(previewMarkup).join("")}</div>
    <p class="theme-drawer__footnote">Выбор сохранится в этом браузере. Некоторые темы добавляют собственные фоновые эффекты.</p>`;
  topbar.append(trigger);
  document.body.append(drawer);

  trigger.addEventListener("click", () => drawer.classList.contains("is-open") ? closeDrawer() : openDrawer());
  drawer.querySelector(".theme-drawer__close").addEventListener("click", closeDrawer);
  drawer.addEventListener("click", event => {
    const choice = event.target.closest("[data-theme-choice]");
    if (choice) {
      setTheme(choice.dataset.themeChoice);
      addSakura();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      closeDrawer();
      trigger.focus();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (drawer.classList.contains("is-open") && !drawer.contains(event.target) && !trigger.contains(event.target)) closeDrawer();
  });
  let saved = "classic";
  try { saved = localStorage.getItem(STORAGE_KEY) || "classic"; } catch { /* Keep the default. */ }
  setTheme(saved, false);
  addSakura();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountThemePicker, { once: true });
} else {
  mountThemePicker();
}
