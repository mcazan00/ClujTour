export function byId(id) {
  return document.getElementById(id);
}

export function setVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

export function setProgress(fillEl, ratio) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  fillEl.style.width = `${safeRatio * 100}%`;
}

export function formatDistance(distance) {
  if (!Number.isFinite(distance)) {
    return "Distanță indisponibilă";
  }
  if (distance < 1000) {
    return `~${Math.round(distance)} m`;
  }
  return `~${(distance / 1000).toFixed(1)} km`;
}

export function vibrate(pattern = 20) {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
