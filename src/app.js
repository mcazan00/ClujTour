import { distanceMeters, getCurrentPosition } from "./geo.js";
import { clearState, loadState, saveState } from "./storage.js";
import { byId, formatDistance, setProgress, setVisible, vibrate } from "./ui.js";

const DEFAULT_STATE = {
  currentIndex: 0,
  revealedStopIds: [],
  foundStopIds: [],
  answers: {},
  score: 0,
  settings: {
    dateMode: true,
    historyMode: false,
    manualMode: false,
    viewMode: "story",
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
  hintOpen: false,
  geoTimer: null,
};

function freshState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

const els = {
  storyView: byId("storyView"),
  adminView: byId("adminView"),
  storyViewBtn: byId("storyViewBtn"),
  adminViewBtn: byId("adminViewBtn"),
  tourTitle: byId("tourTitle"),
  tourSubtitle: byId("tourSubtitle"),
  authorNote: byId("authorNote"),
  adminTitle: byId("adminTitle"),
  adminSubtitle: byId("adminSubtitle"),
  adminSettingsTitle: byId("adminSettingsTitle"),
  adminStopsTitle: byId("adminStopsTitle"),
  adminLandmarksTitle: byId("adminLandmarksTitle"),
  adminSettingsList: byId("adminSettingsList"),
  adminStopsList: byId("adminStopsList"),
  adminLandmarksList: byId("adminLandmarksList"),
  chapterLabel: byId("chapterLabel"),
  progressText: byId("progressText"),
  progressFill: byId("progressFill"),
  geoStatus: byId("geoStatus"),
  distanceText: byId("distanceText"),
  scoreText: byId("scoreText"),
  chapterTitle: byId("chapterTitle"),
  stopTitle: byId("stopTitle"),
  lockedNotice: byId("lockedNotice"),
  storyBlock: byId("storyBlock"),
  introText: byId("introText"),
  historyText: byId("historyText"),
  historyExtraText: byId("historyExtraText"),
  observationText: byId("observationText"),
  forUsText: byId("forUsText"),
  clueText: byId("clueText"),
  hintBox: byId("hintBox"),
  revealBtn: byId("revealBtn"),
  foundBtn: byId("foundBtn"),
  hintBtn: byId("hintBtn"),
  nextBtn: byId("nextBtn"),
  challengePanel: byId("challengePanel"),
  challengeQuestion: byId("challengeQuestion"),
  challengeOptions: byId("challengeOptions"),
  challengeFeedback: byId("challengeFeedback"),
  endingPanel: byId("endingPanel"),
  endingTitle: byId("endingTitle"),
  endingMessage: byId("endingMessage"),
  stopPanel: byId("stopPanel"),
  statusPanel: byId("statusPanel"),
  dateModeToggle: byId("dateModeToggle"),
  historyModeToggle: byId("historyModeToggle"),
  manualModeToggle: byId("manualModeToggle"),
  fullscreenBtn: byId("fullscreenBtn"),
  resetBtn: byId("resetBtn"),
  restartBtn: byId("restartBtn"),
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
  state.answers = typeof state.answers === "object" && state.answers ? state.answers : {};
  state.score = Number.isFinite(state.score) ? state.score : 0;
  state.settings = {
    ...DEFAULT_STATE.settings,
    ...(state.settings || {}),
  };
  state.settings.viewMode = state.settings.viewMode === "admin" ? "admin" : "story";
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
  if (runtime.state.settings.manualMode) {
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

function isAdminMode() {
  return runtime.state.settings.viewMode === "admin";
}

function setViewMode(mode) {
  runtime.state.settings.viewMode = mode === "admin" ? "admin" : "story";
  persist();
  render();
}

function renderViewMode() {
  const admin = isAdminMode();
  setVisible(els.storyView, !admin);
  setVisible(els.adminView, admin);
  els.storyViewBtn.classList.toggle("active", !admin);
  els.adminViewBtn.classList.toggle("active", admin);
  els.storyViewBtn.setAttribute("aria-selected", String(!admin));
  els.adminViewBtn.setAttribute("aria-selected", String(admin));
}

function updateScoreUI() {
  els.scoreText.textContent = `Scor explorare: ${runtime.state.score}`;
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
  ];
  renderAdminRows(els.adminSettingsList, settingsRows);

  const stopRows = runtime.stops.map((stop, index) => {
    const radius = stop.unlockRadiusMeters || runtime.config.defaultUnlockRadiusMeters || 85;
    const coordsText = `${stop.coords.lat.toFixed(5)}, ${stop.coords.lng.toFixed(5)}`;
    const hint = stop.hintToFind || "-";
    return {
      label: `${index + 1}. ${stop.title} (${stop.id})`,
      value: `Coordonate: ${coordsText} | Rază: ${radius} m | Capitol: ${stop.chapterTitle} | Hint: ${hint}`,
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

function renderChallenge(stop) {
  const challenge = stop.challenge;
  if (!challenge) {
    setVisible(els.challengePanel, false);
    return;
  }

  const revealed = isRevealed(stop.id);
  setVisible(els.challengePanel, revealed);
  if (!revealed) return;

  const answer = runtime.state.answers[stop.id];
  els.challengeQuestion.textContent = challenge.question;
  els.challengeOptions.innerHTML = "";

  challenge.options.forEach((option, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn secondary";
    btn.textContent = option;

    if (answer) {
      btn.disabled = true;
      if (index === challenge.correctIndex) {
        btn.classList.add("correct");
      } else if (index === answer.selectedIndex && !answer.correct) {
        btn.classList.add("wrong");
      }
    } else {
      btn.addEventListener("click", () => {
        const isCorrect = index === challenge.correctIndex;
        runtime.state.answers[stop.id] = { selectedIndex: index, correct: isCorrect };
        if (isCorrect) {
          runtime.state.score += 1;
          vibrate([12, 30, 12]);
        } else {
          vibrate(20);
        }
        persist();
        render();
      });
    }

    els.challengeOptions.appendChild(btn);
  });

  if (!answer) {
    els.challengeFeedback.textContent = "";
    return;
  }

  els.challengeFeedback.textContent = answer.correct ? challenge.success : challenge.failure;
}

function buildLockedNotice({ unlocked, revealed, distance, stop }) {
  if (revealed) {
    return "Capitol deschis. Continuați jocul împreună.";
  }
  if (runtime.state.settings.manualMode) {
    return "Mod Manual activ: puteți deschide capitolul fără GPS.";
  }
  if (unlocked) {
    return "Sunteți suficient de aproape. E momentul pentru poveste.";
  }
  if (!runtime.geo.isAvailable) {
    return "GPS indisponibil sau nepermis. Folosiți Mod Manual pentru a continua.";
  }
  if (Number.isFinite(distance)) {
    return `Mai aveți ${formatDistance(distance)} până la acest capitol.`;
  }
  return "Căutăm locația actuală...";
}

function buildHintText({ stop, unlocked, revealed, found, distance }) {
  if (!unlocked) {
    if (Number.isFinite(distance)) {
      const nearThreshold = 240;
      const narrative =
        distance <= nearThreshold ? stop.distanceNarrativeNear : stop.distanceNarrativeFar;
      return `${narrative} (${formatDistance(distance)})`;
    }
    return `${stop.hintToFind} Dacă GPS-ul nu merge, porniți Mod Manual.`;
  }

  if (!revealed) {
    return `Ai ajuns. Apasă "Reveal story" ca să înceapă capitolul.`;
  }

  if (!found) {
    return `Task de observație: ${stop.observationPrompt}`;
  }

  return stop.nextStopHint;
}

function renderStop(stop) {
  const revealed = isRevealed(stop.id);
  const found = isFound(stop.id);
  const distance = getDistanceToCurrentStop(stop);
  const unlocked = isStopUnlocked(stop, distance);

  els.chapterTitle.textContent = stop.chapterTitle;
  els.stopTitle.textContent = stop.title;
  els.lockedNotice.textContent = buildLockedNotice({ unlocked, revealed, distance, stop });

  els.introText.textContent = stop.intro;
  els.historyText.textContent = stop.historyShort;
  els.historyExtraText.textContent = stop.historyExtra;
  setVisible(els.historyExtraText, runtime.state.settings.historyMode);

  els.observationText.textContent = `Observă: ${stop.observationPrompt}`;
  els.clueText.textContent = `Indiciu ascuns: ${stop.hiddenClue}`;

  if (runtime.state.settings.dateMode && stop.forUsNote) {
    els.forUsText.textContent = stop.forUsNote;
    setVisible(els.forUsText, true);
  } else {
    setVisible(els.forUsText, false);
  }

  setVisible(els.storyBlock, revealed);
  if (revealed) {
    els.storyBlock.classList.remove("fade-in");
    void els.storyBlock.offsetWidth;
    els.storyBlock.classList.add("fade-in");
  }

  setVisible(els.hintBox, runtime.hintOpen);
  if (runtime.hintOpen) {
    els.hintBox.textContent = buildHintText({ stop, unlocked, revealed, found, distance });
  }

  els.revealBtn.disabled = !unlocked || revealed;
  els.foundBtn.disabled = !revealed || found;
  els.nextBtn.disabled = !found;

  if (Number.isFinite(distance)) {
    els.distanceText.textContent = `Distanță până la oprire: ${formatDistance(distance)}`;
  } else {
    els.distanceText.textContent = "Distanță până la oprire: indisponibilă";
  }

  renderChallenge(stop);
}

function renderEnding() {
  setVisible(els.endingPanel, true);
  setVisible(els.stopPanel, false);
  setVisible(els.challengePanel, false);
  els.endingTitle.textContent = runtime.config.ending.title;
  els.endingMessage.textContent = runtime.config.ending.message;
  els.progressText.textContent = `${runtime.stops.length}/${runtime.stops.length}`;
  setProgress(els.progressFill, 1);
  els.chapterLabel.textContent = "Capitol final";
  els.distanceText.textContent = "Traseu complet.";
}

function render() {
  renderViewMode();
  if (isAdminMode()) {
    renderAdmin();
    return;
  }

  updateScoreUI();

  const total = runtime.stops.length;
  const currentDisplay = Math.min(runtime.state.currentIndex + 1, total);
  const completed = runtime.state.foundStopIds.length;
  els.progressText.textContent = `${currentDisplay}/${total}`;
  setProgress(els.progressFill, total > 0 ? completed / total : 0);
  els.chapterLabel.textContent = `Capitol ${Math.min(currentDisplay, total)}`;

  if (isFinished()) {
    renderEnding();
    return;
  }

  setVisible(els.endingPanel, false);
  setVisible(els.stopPanel, true);
  setVisible(els.statusPanel, true);
  const stop = getCurrentStop();
  renderStop(stop);
}

async function refreshLocation() {
  if (runtime.state.settings.manualMode) {
    runtime.geo.isAvailable = false;
    runtime.geo.error = "";
    els.geoStatus.textContent = "Mod Manual activ. GPS-ul este ignorat.";
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
    els.geoStatus.textContent = "GPS indisponibil. Poți continua cu Mod Manual.";
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
    runtime.hintOpen = false;
    persist();
    vibrate([18, 20, 18]);
  }
}

function bindEvents() {
  els.storyViewBtn.addEventListener("click", () => {
    setViewMode("story");
  });

  els.adminViewBtn.addEventListener("click", () => {
    setViewMode("admin");
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

  els.hintBtn.addEventListener("click", () => {
    runtime.hintOpen = !runtime.hintOpen;
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

  els.manualModeToggle.addEventListener("change", (event) => {
    runtime.state.settings.manualMode = event.target.checked;
    persist();
    refreshLocation();
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
    runtime.hintOpen = false;
    render();
    refreshLocation();
  });

  els.restartBtn.addEventListener("click", () => {
    clearState();
    runtime.state = freshState();
    runtime.hintOpen = false;
    setVisible(els.endingPanel, false);
    render();
    refreshLocation();
  });
}

function applyStaticContent() {
  els.tourTitle.textContent = runtime.config.tourTitle;
  els.tourSubtitle.textContent = runtime.config.tourSubtitle;
  els.authorNote.textContent = runtime.config.authorNote;
  els.storyViewBtn.textContent = runtime.config.admin?.storyTabLabel || "Story";
  els.adminViewBtn.textContent = runtime.config.admin?.adminTabLabel || "Admin";
  els.dateModeToggle.checked = runtime.state.settings.dateMode;
  els.historyModeToggle.checked = runtime.state.settings.historyMode;
  els.manualModeToggle.checked = runtime.state.settings.manualMode;
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
