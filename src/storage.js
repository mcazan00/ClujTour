const STORAGE_KEY = "cluj_tour_state_v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadState(defaultState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return clone(defaultState);
    }
    const parsed = JSON.parse(raw);
    return {
      ...clone(defaultState),
      ...parsed,
      settings: {
        ...defaultState.settings,
        ...(parsed.settings || {}),
      },
    };
  } catch {
    return clone(defaultState);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors to avoid blocking the app.
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
