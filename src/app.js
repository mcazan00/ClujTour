import { distanceMeters, getCurrentPosition } from "./geo.js";
import { clearState, loadState, saveState } from "./storage.js";
import { byId, formatDistance, setProgress, setVisible, vibrate } from "./ui.js";

const DEFAULT_STATE = {
  currentIndex: 0,
  revealedStopIds: [],
  foundStopIds: [],
  settings: {
    dateMode: false,
    historyMode: false,
    testMode: false,
  },
};

const runtime = {
  config: null,
  stops: [],
  state: loadState(DEFAULT_STATE),
  geo: {
    coords: null,
    isAvailable: false,
    error: "",
  },
  geoTimer: null,
  ui: {
    menuOpen: false,
    activePanel: "story",
  },
  map: {
    instance: null,
    tileFailed: false,
    unavailable: false,
    markers: [],
  },
};

function freshState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

const els = {
  tourTitle: byId("tourTitle"),
  tourSubtitle: byId("tourSubtitle"),
  authorNote: byId("authorNote"),

  statusPanel: byId("statusPanel"),
  chapterLabel: byId("chapterLabel"),
  progressText: byId("progressText"),
  progressFill: byId("progressFill"),
  geoStatus: byId("geoStatus"),
  distanceText: byId("distanceText"),

  stopPanel: byId("stopPanel"),
  chapterTitle: byId("chapterTitle"),
  stopTitle: byId("stopTitle"),
  lockedNotice: byId("lockedNotice"),
  storyBlock: byId("storyBlock"),
  stopFigure: byId("stopFigure"),
  stopImage: byId("stopImage"),
  stopImageCaption: byId("stopImageCaption"),
  contextIstoricText: byId("contextIstoricText"),
  repereCheieList: byId("repereCheieList"),
  scriptGhidText: byId("scriptGhidText"),
  observatieText: byId("observatieText"),
  tranzitieText: byId("tranzitieText"),

  revealBtn: byId("revealBtn"),
  foundBtn: byId("foundBtn"),
  nextBtn: byId("nextBtn"),

  endingPanel: byId("endingPanel"),
  endingTitle: byId("endingTitle"),
  endingMessage: byId("endingMessage"),
  restartBtn: byId("restartBtn"),

  menuToggleBtn: byId("menuToggleBtn"),
  menuCloseBtn: byId("menuCloseBtn"),
  menuBackdrop: byId("menuBackdrop"),
  menuDrawer: byId("menuDrawer"),
  menuStoryBtn: byId("menuStoryBtn"),
  menuMapBtn: byId("menuMapBtn"),
  menuSettingsBtn: byId("menuSettingsBtn"),
  menuAdminBtn: byId("menuAdminBtn"),

  drawerStoryPanel: byId("drawerStoryPanel"),
  drawerMapPanel: byId("drawerMapPanel"),
  drawerSettingsPanel: byId("drawerSettingsPanel"),
  drawerAdminPanel: byId("drawerAdminPanel"),
  continueStoryBtn: byId("continueStoryBtn"),

  mapContainer: byId("mapContainer"),
  mapStatus: byId("mapStatus"),
  mapFallback: byId("mapFallback"),
  mapFallbackList: byId("mapFallbackList"),

  dateModeToggle: byId("dateModeToggle"),
  historyModeToggle: byId("historyModeToggle"),
  testModeToggle: byId("testModeToggle"),
  fullscreenBtn: byId("fullscreenBtn"),
  resetBtn: byId("resetBtn"),

  adminTitle: byId("adminTitle"),
  adminSubtitle: byId("adminSubtitle"),
  adminSettingsTitle: byId("adminSettingsTitle"),
  adminStopsTitle: byId("adminStopsTitle"),
  adminLandmarksTitle: byId("adminLandmarksTitle"),
  adminSettingsList: byId("adminSettingsList"),
  adminStopsList: byId("adminStopsList"),
  adminLandmarksList: byId("adminLandmarksList"),
};

function sanitizeState() {
  const total = runtime.stops.length;
  const state = runtime.state;

  if (typeof state.currentIndex !== "number" || Number.isNaN(state.currentIndex)) {
    state.currentIndex = 0;
  }
  state.currentIndex = Math.max(0, Math.min(total, state.currentIndex));
  state.revealedStopIds = Array.isArray(state.revealedStopIds) ? state.revealedStopIds : [];
  state.foundStopIds = Array.isArray(state.foundStopIds) ? state.foundStopIds : [];

  const settings = typeof state.settings === "object" && state.settings ? state.settings : {};
  const legacyManual = Boolean(settings.manualMode);
  state.settings = {
    ...DEFAULT_STATE.settings,
    ...settings,
  };
  if (typeof settings.testMode !== "boolean") {
    state.settings.testMode = legacyManual;
  }
  state.settings.testMode = Boolean(state.settings.testMode);
  state.settings.dateMode = Boolean(state.settings.dateMode);
  state.settings.historyMode = Boolean(state.settings.historyMode);
}

function getCurrentStop() {
  return runtime.stops[runtime.state.currentIndex] || null;
}

function isFinished() {
  return runtime.state.currentIndex >= runtime.stops.length;
}

function isRevealed(stopId) {
  return runtime.state.revealedStopIds.includes(stopId);
}

function isFound(stopId) {
  return runtime.state.foundStopIds.includes(stopId);
}

function getDistanceToCurrentStop(stop) {
  if (!stop || !runtime.geo.coords) return NaN;
  return distanceMeters(runtime.geo.coords, stop.coords);
}

function isStopUnlocked(stop, distance) {
  if (runtime.state.settings.testMode) {
    return true;
  }
  if (!runtime.geo.isAvailable || !Number.isFinite(distance)) {
    return false;
  }
  const radius = stop.unlockRadiusMeters || runtime.config.defaultUnlockRadiusMeters || 80;
  return distance <= radius;
}

function persist() {
  saveState(runtime.state);
}

function shortText(text, max = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function renderAdminRows(listEl, rows) {
  listEl.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.textContent = "Nicio intrare.";
    listEl.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "admin-label";
    label.textContent = row.label;
    li.appendChild(label);

    const content = document.createElement("span");
    content.textContent = row.value;
    li.appendChild(content);
    listEl.appendChild(li);
  });
}

function collectLandmarks(stops) {
  const map = new Map();

  stops.forEach((stop) => {
    const landmarks = Array.isArray(stop.landmarks) ? stop.landmarks : [];
    landmarks.forEach((landmark) => {
      const key = `${String(landmark.name || "").trim().toLowerCase()}`;
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: landmark.name,
          category: landmark.category || "clădire",
          areas: new Set(),
          notes: new Set(),
        });
      }
      const entry = map.get(key);
      if (landmark.area) entry.areas.add(landmark.area);
      if (landmark.noteShort) entry.notes.add(landmark.noteShort);
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

function renderAdmin() {
  const adminCfg = runtime.config.admin || {};
  const subtitleFallback = "Aici vezi setările și datele traseului, fără editare din interfață.";

  els.adminTitle.textContent = adminCfg.title || "Admin local (read-only)";
  els.adminSubtitle.textContent = adminCfg.subtitle || subtitleFallback;
  els.adminSettingsTitle.textContent = adminCfg.settingsTitle || "Setări tur";
  els.adminStopsTitle.textContent = adminCfg.stopsTitle || "Locații";
  els.adminLandmarksTitle.textContent = adminCfg.landmarksTitle || "Palate / Clădiri indexate";

  const settingsRows = [
    { label: "Titlu tur", value: runtime.config.tourTitle || "-" },
    { label: "Subtitlu", value: runtime.config.tourSubtitle || "-" },
    {
      label: "Rază implicită de unlock",
      value: `${runtime.config.defaultUnlockRadiusMeters || 85} m`,
    },
    {
      label: "Interval refresh GPS",
      value: `${Math.round((runtime.config.distanceUpdateIntervalMs || 6000) / 1000)} sec`,
    },
    { label: "Epilog final", value: runtime.config.ending?.title || "-" },
    { label: "Număr locații", value: `${runtime.stops.length}` },
    { label: "Test mode", value: runtime.state.settings.testMode ? "Activ" : "Inactiv" },
  ];
  renderAdminRows(els.adminSettingsList, settingsRows);

  const stopRows = runtime.stops.map((stop, index) => {
    const radius = stop.unlockRadiusMeters || runtime.config.defaultUnlockRadiusMeters || 85;
    const coordsText = `${stop.coords.lat.toFixed(5)}, ${stop.coords.lng.toFixed(5)}`;
    const hint = stop.hintToFind || "-";
    const contextPreview = shortText(stop.contextIstoric || stop.historyShort || "", 130);
    const scriptPreview = shortText(stop.scriptGhid || stop.intro || "", 130);
    return {
      label: `${index + 1}. ${stop.title} (${stop.id})`,
      value: `Coordonate: ${coordsText} | Rază: ${radius} m | Capitol: ${stop.chapterTitle} | Hint: ${hint} | Context: ${contextPreview} | Script: ${scriptPreview}`,
    };
  });
  renderAdminRows(els.adminStopsList, stopRows);

  const landmarks = collectLandmarks(runtime.stops);
  const landmarkRows = landmarks.map((landmark) => {
    const areas = Array.from(landmark.areas).join(", ") || "zonă nespecificată";
    const firstNote = Array.from(landmark.notes)[0] || "fără notă";
    return {
      label: `${landmark.name} (${landmark.category})`,
      value: `Zonă: ${areas} | Notă: ${firstNote}`,
    };
  });
  renderAdminRows(els.adminLandmarksList, landmarkRows);
}

function setDrawerPanel(panel) {
  const valid = ["story", "map", "settings", "admin"];
  const safe = valid.includes(panel) ? panel : "story";
  runtime.ui.activePanel = safe;

  setVisible(els.drawerStoryPanel, safe === "story");
  setVisible(els.drawerMapPanel, safe === "map");
  setVisible(els.drawerSettingsPanel, safe === "settings");
  setVisible(els.drawerAdminPanel, safe === "admin");

  els.menuStoryBtn.classList.toggle("active", safe === "story");
  els.menuMapBtn.classList.toggle("active", safe === "map");
  els.menuSettingsBtn.classList.toggle("active", safe === "settings");
  els.menuAdminBtn.classList.toggle("active", safe === "admin");

  if (safe === "map") {
    renderMapPanel();
  }
  if (safe === "admin") {
    renderAdmin();
  }
}

function openDrawer(panel = runtime.ui.activePanel) {
  runtime.ui.menuOpen = true;
  setDrawerPanel(panel);
  setVisible(els.menuBackdrop, true);
  setVisible(els.menuDrawer, true);
  els.menuDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-open");
}

function closeDrawer() {
  runtime.ui.menuOpen = false;
  setVisible(els.menuBackdrop, false);
  setVisible(els.menuDrawer, false);
  els.menuDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
}

function buildMapFallbackList() {
  els.mapFallbackList.innerHTML = "";
  runtime.stops.forEach((stop, index) => {
    const li = document.createElement("li");
    const current = !isFinished() && runtime.state.currentIndex === index ? " (curent)" : "";
    li.textContent = `${index + 1}. ${stop.title}${current}`;
    els.mapFallbackList.appendChild(li);
  });
}

function createMarkerIcon(index, current) {
  return window.L.divIcon({
    className: "",
    html: `<div class=\"map-marker${current ? " current" : ""}\">${index + 1}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function buildPopup(stop, index) {
  const jump = runtime.state.settings.testMode
    ? `<button type=\"button\" class=\"map-jump-btn\" data-map-jump=\"${index}\">Setează ca oprire curentă</button>`
    : "<p class=\"map-jump-disabled\">Activează Test mode pentru salt rapid.</p>";

  return `
    <div class="map-popup">
      <h4>${index + 1}. ${stop.title}</h4>
      <p>${stop.chapterTitle}</p>
      <p>${shortText(stop.hintToFind, 95)}</p>
      ${jump}
    </div>
  `;
}

function ensureMapReady() {
  buildMapFallbackList();

  if (runtime.map.instance) {
    return true;
  }

  if (runtime.map.unavailable) {
    setVisible(els.mapFallback, true);
    return false;
  }

  if (!window.L) {
    runtime.map.unavailable = true;
    els.mapStatus.textContent = "Biblioteca hărții nu a putut fi încărcată. Folosește lista locațiilor.";
    setVisible(els.mapFallback, true);
    return false;
  }

  const first = runtime.stops[0];
  if (!first) {
    runtime.map.unavailable = true;
    els.mapStatus.textContent = "Nu există locații pentru hartă.";
    setVisible(els.mapFallback, true);
    return false;
  }

  const map = window.L.map(els.mapContainer, {
    zoomControl: true,
    attributionControl: true,
  }).setView([first.coords.lat, first.coords.lng], 14);

  const tileLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });

  tileLayer.on("load", () => {
    if (!runtime.map.tileFailed) {
      els.mapStatus.textContent = "Hartă OpenStreetMap activă.";
      setVisible(els.mapFallback, false);
    }
  });

  tileLayer.on("tileerror", () => {
    runtime.map.tileFailed = true;
    els.mapStatus.textContent = "Nu am putut încărca tile-urile hărții. Folosește lista locațiilor.";
    setVisible(els.mapFallback, true);
  });

  tileLayer.addTo(map);
  runtime.map.instance = map;
  return true;
}

function renderMapMarkers() {
  if (!ensureMapReady()) return;

  const map = runtime.map.instance;
  runtime.map.markers.forEach((marker) => marker.remove());
  runtime.map.markers = [];

  runtime.stops.forEach((stop, index) => {
    const current = !isFinished() && runtime.state.currentIndex === index;
    const marker = window.L.marker([stop.coords.lat, stop.coords.lng], {
      icon: createMarkerIcon(index, current),
    });
    marker.bindPopup(buildPopup(stop, index));
    marker.addTo(map);
    runtime.map.markers.push(marker);
  });

  if (!isFinished()) {
    const stop = getCurrentStop();
    map.setView([stop.coords.lat, stop.coords.lng], 14, { animate: false });
  }

  setTimeout(() => map.invalidateSize(), 40);
}

function renderMapPanel() {
  const ready = ensureMapReady();
  if (ready) {
    renderMapMarkers();
  } else {
    setVisible(els.mapFallback, true);
  }
}

function buildLockedNotice({ unlocked, revealed, distance }) {
  if (revealed) {
    return "Secțiunea informativă este deschisă pentru această oprire.";
  }
  if (runtime.state.settings.testMode) {
    return "Test mode activ: poți deschide oprirea fără validare GPS.";
  }
  if (unlocked) {
    return "Ai ajuns la punct. Poți deschide explicația istorică.";
  }
  if (!runtime.geo.isAvailable) {
    return "GPS indisponibil. Activează Test mode din meniu dacă vrei să continui.";
  }
  if (Number.isFinite(distance)) {
    return `Mai ai ${formatDistance(distance)} până la această oprire.`;
  }
  return "Căutăm locația actuală...";
}

function renderRepereCheie(stop) {
  els.repereCheieList.innerHTML = "";
  const allItems = Array.isArray(stop.repereCheie) ? stop.repereCheie : [];
  const items = runtime.state.settings.dateMode ? allItems.slice(0, 3) : allItems;

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "Nu sunt repere setate pentru acest punct.";
    els.repereCheieList.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.repereCheieList.appendChild(li);
  });
}

function renderStop(stop) {
  const revealed = isRevealed(stop.id);
  const found = isFound(stop.id);
  const distance = getDistanceToCurrentStop(stop);
  const unlocked = isStopUnlocked(stop, distance);

  els.chapterTitle.textContent = stop.chapterTitle;
  els.stopTitle.textContent = stop.title;
  els.lockedNotice.textContent = buildLockedNotice({ unlocked, revealed, distance });

  const image = stop.image || null;
  if (image?.src) {
    els.stopImage.src = image.src;
    els.stopImage.alt = image.alt || stop.title;
    els.stopImageCaption.textContent = image.caption || "";
    setVisible(els.stopFigure, true);
  } else {
    els.stopImage.removeAttribute("src");
    els.stopImage.alt = "";
    els.stopImageCaption.textContent = "";
    setVisible(els.stopFigure, false);
  }

  const contextBase = stop.contextIstoric || stop.historyShort || "";
  const historyExtra = runtime.state.settings.historyMode ? stop.historyExtra || "" : "";
  els.contextIstoricText.textContent = historyExtra
    ? `${contextBase} ${historyExtra}`
    : contextBase;

  renderRepereCheie(stop);
  const fullScript = stop.scriptGhid || stop.intro || "";
  els.scriptGhidText.textContent = runtime.state.settings.dateMode
    ? shortText(fullScript, 260)
    : fullScript;
  els.observatieText.textContent =
    stop.observatieArhitecturala || stop.observationPrompt || "";
  els.tranzitieText.textContent =
    stop.tranzitieUrmatorulPunct || stop.nextStopHint || "";

  setVisible(els.storyBlock, revealed);
  if (revealed) {
    els.storyBlock.classList.remove("fade-in");
    void els.storyBlock.offsetWidth;
    els.storyBlock.classList.add("fade-in");
  }

  els.revealBtn.disabled = !unlocked || revealed;
  els.foundBtn.disabled = !revealed || found;
  els.nextBtn.disabled = !found;

  if (runtime.state.settings.testMode) {
    els.distanceText.textContent = "Test mode activ: distanța este ignorată.";
  } else if (Number.isFinite(distance)) {
    els.distanceText.textContent = `Distanță până la oprire: ${formatDistance(distance)}`;
  } else {
    els.distanceText.textContent = "Distanță până la oprire: indisponibilă";
  }
}

function renderEnding() {
  setVisible(els.endingPanel, true);
  setVisible(els.stopPanel, false);
  els.endingTitle.textContent = runtime.config.ending.title;
  els.endingMessage.textContent = runtime.config.ending.message;
  els.progressText.textContent = `${runtime.stops.length}/${runtime.stops.length}`;
  setProgress(els.progressFill, 1);
  els.chapterLabel.textContent = "Capitol final";
  els.distanceText.textContent = "Traseu complet.";
}

function render() {
  const total = runtime.stops.length;
  const currentDisplay = Math.min(runtime.state.currentIndex + 1, total);
  const completed = runtime.state.foundStopIds.length;

  els.progressText.textContent = `${currentDisplay}/${total}`;
  setProgress(els.progressFill, total > 0 ? completed / total : 0);
  els.chapterLabel.textContent = `Capitol ${Math.min(currentDisplay, total)}`;

  if (isFinished()) {
    renderEnding();
  } else {
    setVisible(els.endingPanel, false);
    setVisible(els.stopPanel, true);
    setVisible(els.statusPanel, true);
    renderStop(getCurrentStop());
  }

  if (runtime.ui.activePanel === "admin") {
    renderAdmin();
  }
  if (runtime.ui.activePanel === "map") {
    renderMapPanel();
  }
}

async function refreshLocation() {
  if (runtime.state.settings.testMode) {
    runtime.geo.isAvailable = false;
    runtime.geo.error = "";
    runtime.geo.coords = null;
    els.geoStatus.textContent = "Test mode activ. GPS-ul este ignorat.";
    render();
    return;
  }

  try {
    const position = await getCurrentPosition();
    runtime.geo.coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    runtime.geo.isAvailable = true;
    runtime.geo.error = "";
    els.geoStatus.textContent = "GPS activ. Deblocare automată pe rază.";
  } catch (error) {
    runtime.geo.isAvailable = false;
    runtime.geo.error = error?.message || "Nu am putut citi locația.";
    els.geoStatus.textContent = "GPS indisponibil. Activează Test mode din meniu pentru continuare.";
  } finally {
    render();
  }
}

function markRevealed(stop) {
  if (!isRevealed(stop.id)) {
    runtime.state.revealedStopIds.push(stop.id);
    persist();
  }
}

function markFound(stop) {
  if (!isFound(stop.id)) {
    runtime.state.foundStopIds.push(stop.id);
    persist();
  }
}

function moveNext() {
  if (runtime.state.currentIndex < runtime.stops.length) {
    runtime.state.currentIndex += 1;
    persist();
    vibrate([18, 20, 18]);
  }
}

function bindEvents() {
  els.menuToggleBtn.addEventListener("click", () => {
    if (runtime.ui.menuOpen) {
      closeDrawer();
    } else {
      openDrawer(runtime.ui.activePanel);
    }
  });

  els.menuCloseBtn.addEventListener("click", () => closeDrawer());
  els.menuBackdrop.addEventListener("click", () => closeDrawer());

  els.menuStoryBtn.addEventListener("click", () => {
    setDrawerPanel("story");
    closeDrawer();
  });

  els.continueStoryBtn.addEventListener("click", () => closeDrawer());

  els.menuMapBtn.addEventListener("click", () => {
    if (!runtime.ui.menuOpen) openDrawer("map");
    setDrawerPanel("map");
  });

  els.menuSettingsBtn.addEventListener("click", () => {
    if (!runtime.ui.menuOpen) openDrawer("settings");
    setDrawerPanel("settings");
  });

  els.menuAdminBtn.addEventListener("click", () => {
    if (!runtime.ui.menuOpen) openDrawer("admin");
    setDrawerPanel("admin");
  });

  els.revealBtn.addEventListener("click", () => {
    const stop = getCurrentStop();
    if (!stop) return;
    const distance = getDistanceToCurrentStop(stop);
    if (!isStopUnlocked(stop, distance)) return;
    markRevealed(stop);
    render();
  });

  els.foundBtn.addEventListener("click", () => {
    const stop = getCurrentStop();
    if (!stop || !isRevealed(stop.id)) return;
    markFound(stop);
    render();
  });

  els.nextBtn.addEventListener("click", () => {
    const stop = getCurrentStop();
    if (!stop || !isFound(stop.id)) return;
    moveNext();
    render();
  });

  els.dateModeToggle.addEventListener("change", (event) => {
    runtime.state.settings.dateMode = event.target.checked;
    persist();
    render();
  });

  els.historyModeToggle.addEventListener("change", (event) => {
    runtime.state.settings.historyMode = event.target.checked;
    persist();
    render();
  });

  els.testModeToggle.addEventListener("change", (event) => {
    runtime.state.settings.testMode = event.target.checked;
    persist();
    refreshLocation();
    render();
  });

  els.fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  });

  els.resetBtn.addEventListener("click", () => {
    const accepted = window.confirm("Sigur vrei să resetezi toată plimbarea?");
    if (!accepted) return;
    clearState();
    runtime.state = freshState();
    applyStaticContent();
    render();
    refreshLocation();
  });

  els.restartBtn.addEventListener("click", () => {
    clearState();
    runtime.state = freshState();
    setVisible(els.endingPanel, false);
    applyStaticContent();
    render();
    refreshLocation();
  });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-map-jump]");
    if (!btn) return;
    if (!runtime.state.settings.testMode) return;

    const index = Number(btn.dataset.mapJump);
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= runtime.stops.length) return;

    runtime.state.currentIndex = index;
    persist();
    closeDrawer();
    render();
  });
}

function applyStaticContent() {
  els.tourTitle.textContent = runtime.config.tourTitle;
  els.tourSubtitle.textContent = runtime.config.tourSubtitle;
  els.authorNote.textContent = runtime.config.authorNote;
  els.dateModeToggle.checked = runtime.state.settings.dateMode;
  els.historyModeToggle.checked = runtime.state.settings.historyMode;
  els.testModeToggle.checked = runtime.state.settings.testMode;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Ignore registration errors in local fallback scenarios.
  }
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

async function init() {
  try {
    const [config, stops] = await Promise.all([
      loadJson("./data/config.json"),
      loadJson("./data/stops.json"),
    ]);
    runtime.config = config;
    runtime.stops = stops;
    sanitizeState();
    bindEvents();
    applyStaticContent();
    await registerServiceWorker();
    render();
    await refreshLocation();
    runtime.geoTimer = window.setInterval(
      refreshLocation,
      runtime.config.distanceUpdateIntervalMs || 6000
    );
  } catch (error) {
    els.geoStatus.textContent = "Nu am putut porni aplicația. Rulează dintr-un server local.";
    els.distanceText.textContent = error?.message || "Eroare necunoscută";
    els.stopTitle.textContent = "Pornire eșuată";
    els.lockedNotice.textContent = "Verifică fișierele JSON și încearcă din nou.";
  }
}

init();
