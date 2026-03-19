import { distanceMeters, getCurrentPosition } from "./geo.js";
import { clearState, loadState, saveState } from "./storage.js";
import { byId, formatDistance, setProgress, setVisible, vibrate } from "./ui.js";

const DEFAULT_STATE = {
  currentIndex: 0,
  revealedStopIds: [],
  foundStopIds: [],
  settings: {
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
    navigationOpenedStops: new Set(),
  },
  map: {
    story: {
      instance: null,
      marker: null,
      tileFailed: false,
      unavailable: false,
    },
    overview: {
      instance: null,
      tileFailed: false,
      unavailable: false,
      markers: [],
    },
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
  storyMapStatus: byId("storyMapStatus"),
  storyMapContainer: byId("storyMapContainer"),
  storyMapFallback: byId("storyMapFallback"),
  storyMapFallbackText: byId("storyMapFallbackText"),
  storyBlock: byId("storyBlock"),
  stopFigure: byId("stopFigure"),
  stopImage: byId("stopImage"),
  stopImageCaption: byId("stopImageCaption"),
  povesteText: byId("povesteText"),
  ceVeziText: byId("ceVeziText"),
  firCronologicText: byId("firCronologicText"),

  revealBtn: byId("revealBtn"),
  foundBtn: byId("foundBtn"),
  navigateBtn: byId("navigateBtn"),
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

  drawerStoryPanel: byId("drawerStoryPanel"),
  drawerMapPanel: byId("drawerMapPanel"),
  drawerSettingsPanel: byId("drawerSettingsPanel"),
  continueStoryBtn: byId("continueStoryBtn"),

  overviewMapContainer: byId("mapContainer"),
  mapStatus: byId("mapStatus"),
  mapFallback: byId("mapFallback"),
  mapFallbackList: byId("mapFallbackList"),

  testModeToggle: byId("testModeToggle"),
  resetBtn: byId("resetBtn"),
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

function setDrawerPanel(panel) {
  const valid = ["story", "map", "settings"];
  const safe = valid.includes(panel) ? panel : "story";
  runtime.ui.activePanel = safe;

  setVisible(els.drawerStoryPanel, safe === "story");
  setVisible(els.drawerMapPanel, safe === "map");
  setVisible(els.drawerSettingsPanel, safe === "settings");

  els.menuStoryBtn.classList.toggle("active", safe === "story");
  els.menuMapBtn.classList.toggle("active", safe === "map");
  els.menuSettingsBtn.classList.toggle("active", safe === "settings");

  if (safe === "map") {
    renderMapPanel();
  }
}

function getNextStop() {
  return runtime.stops[runtime.state.currentIndex + 1] || null;
}

function buildNavigationLinks(stop) {
  if (!stop) return null;
  const lat = Number(stop.coords?.lat);
  const lng = Number(stop.coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    apple: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
  };
}

function openExternalRoute() {
  const nextStop = getNextStop();
  const links = buildNavigationLinks(nextStop);
  if (!links) return false;

  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const primary = isiOS ? links.apple : links.google;
  const fallback = isiOS ? links.google : links.apple;

  const openedWindow = window.open(primary, "_blank", "noopener,noreferrer");
  if (!openedWindow) {
    window.location.href = fallback;
  }
  return true;
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

function attachOsmTileLayer(map, onLoad, onError) {
  const tileLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });

  tileLayer.on("load", onLoad);
  tileLayer.on("tileerror", onError);
  tileLayer.addTo(map);
}

function setStoryMapFallback(message) {
  els.storyMapFallbackText.textContent = message;
  setVisible(els.storyMapFallback, true);
}

function ensureOverviewMapReady() {
  buildMapFallbackList();

  if (runtime.map.overview.instance) {
    return true;
  }

  if (runtime.map.overview.unavailable) {
    setVisible(els.mapFallback, true);
    return false;
  }

  if (!window.L) {
    runtime.map.overview.unavailable = true;
    els.mapStatus.textContent = "Biblioteca hărții nu a putut fi încărcată. Folosește lista locațiilor.";
    setVisible(els.mapFallback, true);
    return false;
  }

  const first = runtime.stops[0];
  if (!first) {
    runtime.map.overview.unavailable = true;
    els.mapStatus.textContent = "Nu există locații pentru hartă.";
    setVisible(els.mapFallback, true);
    return false;
  }

  const map = window.L.map(els.overviewMapContainer, {
    zoomControl: true,
    attributionControl: true,
  }).setView([first.coords.lat, first.coords.lng], 14);

  attachOsmTileLayer(
    map,
    () => {
      if (!runtime.map.overview.tileFailed) {
        els.mapStatus.textContent = "Hartă OpenStreetMap activă.";
        setVisible(els.mapFallback, false);
      }
    },
    () => {
      runtime.map.overview.tileFailed = true;
      els.mapStatus.textContent = "Nu am putut încărca tile-urile hărții. Folosește lista locațiilor.";
      setVisible(els.mapFallback, true);
    }
  );

  runtime.map.overview.instance = map;
  return true;
}

function renderOverviewMapMarkers() {
  if (!ensureOverviewMapReady()) return;

  const map = runtime.map.overview.instance;
  runtime.map.overview.markers.forEach((marker) => marker.remove());
  runtime.map.overview.markers = [];

  runtime.stops.forEach((stop, index) => {
    const current = !isFinished() && runtime.state.currentIndex === index;
    const marker = window.L.marker([stop.coords.lat, stop.coords.lng], {
      icon: createMarkerIcon(index, current),
    });
    marker.bindPopup(buildPopup(stop, index));
    marker.addTo(map);
    runtime.map.overview.markers.push(marker);
  });

  if (!isFinished()) {
    const stop = getCurrentStop();
    map.setView([stop.coords.lat, stop.coords.lng], 14, { animate: false });
  }

  setTimeout(() => map.invalidateSize(), 40);
}

function renderMapPanel() {
  const ready = ensureOverviewMapReady();
  if (ready) {
    renderOverviewMapMarkers();
  } else {
    setVisible(els.mapFallback, true);
  }
}

function ensureStoryMapReady(stop) {
  if (runtime.map.story.instance) {
    return true;
  }

  if (runtime.map.story.unavailable) {
    setVisible(els.storyMapFallback, true);
    return false;
  }

  if (!window.L) {
    runtime.map.story.unavailable = true;
    els.storyMapStatus.textContent = "Biblioteca hărții nu a putut fi încărcată.";
    setStoryMapFallback("Harta punctului curent nu este disponibilă acum.");
    return false;
  }

  const initial = stop || runtime.stops[0];
  if (!initial) {
    runtime.map.story.unavailable = true;
    els.storyMapStatus.textContent = "Nu există locații pentru hartă.";
    setStoryMapFallback("Nu există date de traseu pentru hartă.");
    return false;
  }

  const map = window.L.map(els.storyMapContainer, {
    zoomControl: false,
    attributionControl: true,
  }).setView([initial.coords.lat, initial.coords.lng], 15);

  attachOsmTileLayer(
    map,
    () => {
      if (!runtime.map.story.tileFailed) {
        els.storyMapStatus.textContent = "Hartă focalizată pe oprirea curentă.";
        setVisible(els.storyMapFallback, false);
      }
    },
    () => {
      runtime.map.story.tileFailed = true;
      els.storyMapStatus.textContent = "Tile-urile nu au putut fi încărcate.";
      setStoryMapFallback("Harta punctului curent nu poate afișa tile-uri momentan.");
    }
  );

  runtime.map.story.instance = map;
  return true;
}

function renderStoryMap(stop) {
  if (!stop) return;
  if (!ensureStoryMapReady(stop)) return;

  const map = runtime.map.story.instance;
  const latLng = [stop.coords.lat, stop.coords.lng];
  const currentMarkerIndex = Math.min(runtime.state.currentIndex, runtime.stops.length - 1);

  if (runtime.map.story.marker) {
    runtime.map.story.marker.setLatLng(latLng);
    runtime.map.story.marker.setIcon(createMarkerIcon(currentMarkerIndex, true));
  } else {
    runtime.map.story.marker = window.L.marker(latLng, {
      icon: createMarkerIcon(currentMarkerIndex, true),
    }).addTo(map);
  }

  map.setView(latLng, 15, { animate: false });
  if (!runtime.map.story.tileFailed) {
    els.storyMapStatus.textContent = "Hartă focalizată pe oprirea curentă.";
    setVisible(els.storyMapFallback, false);
  }
  setTimeout(() => map.invalidateSize(), 40);
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

function renderStop(stop) {
  const revealed = isRevealed(stop.id);
  const found = isFound(stop.id);
  const distance = getDistanceToCurrentStop(stop);
  const unlocked = isStopUnlocked(stop, distance);

  els.chapterTitle.textContent = stop.chapterTitle;
  els.stopTitle.textContent = stop.title;
  els.lockedNotice.textContent = buildLockedNotice({ unlocked, revealed, distance });
  renderStoryMap(stop);

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

  const legacyStory = [stop.contextIstoric, stop.scriptGhid, stop.historyShort]
    .filter(Boolean)
    .join(" ");
  const povesteBase = stop.povesteScurta || legacyStory || stop.intro || "";
  els.povesteText.textContent = povesteBase;
  els.ceVeziText.textContent =
    stop.ceVeziAici || stop.observatieArhitecturala || stop.observationPrompt || "";
  els.firCronologicText.textContent =
    stop.firCronologic || stop.tranzitieUrmatorulPunct || stop.nextStopHint || "";

  setVisible(els.storyBlock, revealed);
  if (revealed) {
    els.storyBlock.classList.remove("fade-in");
    void els.storyBlock.offsetWidth;
    els.storyBlock.classList.add("fade-in");
  }

  const nextStop = getNextStop();
  const hasNext = Boolean(nextStop);
  const navigationOpened = runtime.ui.navigationOpenedStops.has(stop.id);
  const testMode = runtime.state.settings.testMode;

  // Reset action visibility first so only one relevant action can be shown.
  setVisible(els.revealBtn, false);
  setVisible(els.foundBtn, false);
  setVisible(els.navigateBtn, false);
  setVisible(els.nextBtn, false);
  els.revealBtn.disabled = true;
  els.foundBtn.disabled = true;
  els.navigateBtn.disabled = true;
  els.nextBtn.disabled = true;

  let actionState = "initial";
  if (revealed && !found) {
    actionState = "revealed";
  } else if (revealed && found) {
    if (!hasNext || testMode || navigationOpened) {
      actionState = "readyNext";
    } else {
      actionState = "readConfirmed";
    }
  }

  if (actionState === "initial") {
    setVisible(els.revealBtn, true);
    els.revealBtn.disabled = !unlocked;
  } else if (actionState === "revealed") {
    setVisible(els.foundBtn, true);
    els.foundBtn.disabled = false;
  } else if (actionState === "readConfirmed") {
    setVisible(els.navigateBtn, true);
    els.navigateBtn.disabled = false;
  } else if (actionState === "readyNext") {
    setVisible(els.nextBtn, true);
    els.nextBtn.disabled = false;
  }

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
  els.chapterLabel.textContent = "Progres";
  els.distanceText.textContent = "Traseu complet.";
}

function render() {
  const total = runtime.stops.length;
  const currentDisplay = Math.min(runtime.state.currentIndex + 1, total);
  const completed = runtime.state.foundStopIds.length;

  els.progressText.textContent = `${currentDisplay}/${total}`;
  setProgress(els.progressFill, total > 0 ? completed / total : 0);
  els.chapterLabel.textContent = "Progres";

  if (isFinished()) {
    renderEnding();
  } else {
    setVisible(els.endingPanel, false);
    setVisible(els.stopPanel, true);
    setVisible(els.statusPanel, true);
    renderStop(getCurrentStop());
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
    const currentStop = getCurrentStop();
    if (currentStop) {
      runtime.ui.navigationOpenedStops.delete(currentStop.id);
    }
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

  els.navigateBtn.addEventListener("click", () => {
    const stop = getCurrentStop();
    if (!stop || !isFound(stop.id)) return;
    const opened = openExternalRoute();
    if (opened) {
      runtime.ui.navigationOpenedStops.add(stop.id);
      render();
    }
  });

  els.testModeToggle.addEventListener("change", (event) => {
    runtime.state.settings.testMode = event.target.checked;
    persist();
    refreshLocation();
    render();
  });

  els.resetBtn.addEventListener("click", () => {
    const accepted = window.confirm("Sigur vrei să resetezi toată plimbarea?");
    if (!accepted) return;
    clearState();
    runtime.state = freshState();
    runtime.ui.navigationOpenedStops = new Set();
    applyStaticContent();
    render();
    refreshLocation();
  });

  els.restartBtn.addEventListener("click", () => {
    clearState();
    runtime.state = freshState();
    runtime.ui.navigationOpenedStops = new Set();
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
  if (els.tourTitle) {
    els.tourTitle.textContent = runtime.config.tourTitle;
  }
  if (els.tourSubtitle) {
    els.tourSubtitle.textContent = runtime.config.tourSubtitle || "";
  }
  if (els.authorNote) {
    els.authorNote.textContent = runtime.config.authorNote || "";
  }
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
