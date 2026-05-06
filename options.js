const DEFAULT_SETTINGS = {
  minDurationSeconds: 15 * 60,
  saveIntervalMs: 5000,
  ignoreFirstSeconds: 60,
  ignoreLastSeconds: 60
};

const KEY_PREFIX = "yt-long-video-resume:";
const EXCLUDE_KEY_PREFIX = "yt-long-video-resume-exclude:";

const fields = {
  minDurationMinutes: document.getElementById("minDurationMinutes"),
  saveIntervalSeconds: document.getElementById("saveIntervalSeconds"),
  ignoreFirstSeconds: document.getElementById("ignoreFirstSeconds"),
  ignoreLastSeconds: document.getElementById("ignoreLastSeconds")
};

const settingsForm = document.getElementById("settingsForm");
const status = document.getElementById("status");
const clearData = document.getElementById("clearData");
const clearStatus = document.getElementById("clearStatus");
const savedCount = document.getElementById("savedCount");
const savedPositions = document.getElementById("savedPositions");
const filterSaved = document.getElementById("filterSaved");
const excludedCount = document.getElementById("excludedCount");
const excludedVideos = document.getElementById("excludedVideos");
const filterExcluded = document.getElementById("filterExcluded");

let savedItems = [];
let excludedItems = [];

async function loadSettings() {
  const settings = await browser.storage.local.get(DEFAULT_SETTINGS);

  fields.minDurationMinutes.value = Math.round(settings.minDurationSeconds / 60);
  fields.saveIntervalSeconds.value = Math.round(settings.saveIntervalMs / 1000);
  fields.ignoreFirstSeconds.value = settings.ignoreFirstSeconds;
  fields.ignoreLastSeconds.value = settings.ignoreLastSeconds;
}

async function saveSettings(event) {
  event.preventDefault();

  await browser.storage.local.set({
    minDurationSeconds: Number(fields.minDurationMinutes.value) * 60,
    saveIntervalMs: Number(fields.saveIntervalSeconds.value) * 1000,
    ignoreFirstSeconds: Number(fields.ignoreFirstSeconds.value),
    ignoreLastSeconds: Number(fields.ignoreLastSeconds.value)
  });

  showStatus(status, "Saved");
}

async function updateSavedCount() {
  const stored = await browser.storage.local.get(null);
  savedItems = getSavedItems(stored);
  excludedItems = getExcludedItems(stored);
  renderSavedPositions();
  renderExcludedVideos();
}

function renderSavedPositions() {
  const filter = filterSaved.value.trim().toLowerCase();
  const visibleItems = filter
    ? savedItems.filter((item) => getFilterText(item).includes(filter))
    : savedItems;
  const count = savedItems.length;

  if (filter) {
    savedCount.textContent = `${visibleItems.length} of ${count} shown`;
  } else {
    savedCount.textContent = count === 1
      ? "1 saved video position"
      : `${count} saved video positions`;
  }

  renderSavedPositionItems(visibleItems);
}

async function clearSavedPositions() {
  const confirmed = confirm("Clear all saved YouTube resume positions?");
  if (!confirmed) return;

  const stored = await browser.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(KEY_PREFIX));

  if (keys.length > 0) {
    await browser.storage.local.remove(keys);
  }

  await updateSavedCount();

  showStatus(clearStatus, "Cleared");
}

async function clearSavedPosition(key) {
  await browser.storage.local.remove(key);
  await updateSavedCount();
  showStatus(clearStatus, "Cleared");
}

function getSavedItems(stored) {
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(KEY_PREFIX))
    .map(([key, value]) => ({
      key,
      videoId: key.slice(KEY_PREFIX.length),
      ...value
    }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

function getExcludedItems(stored) {
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(EXCLUDE_KEY_PREFIX))
    .map(([key, value]) => ({
      key,
      videoId: key.slice(EXCLUDE_KEY_PREFIX.length),
      ...value
    }))
    .sort((a, b) => (b.excludedAt || 0) - (a.excludedAt || 0));
}

function renderSavedPositionItems(items) {
  savedPositions.textContent = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-meta";
    empty.textContent = savedItems.length === 0
      ? "No saved video positions yet."
      : "No saved videos match the filter.";
    savedPositions.appendChild(empty);
    return;
  }

  for (const item of items) {
    const wrapper = document.createElement("article");
    wrapper.className = "saved-item";

    const details = document.createElement("div");

    const title = document.createElement("p");
    title.className = "saved-title";
    title.textContent = item.title || item.videoId || "Untitled video";

    const meta = document.createElement("p");
    meta.className = "saved-meta";
    meta.textContent = getSavedMeta(item);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "danger";
    clearButton.textContent = "Clear";
    clearButton.addEventListener("click", () => clearSavedPosition(item.key));

    details.append(title, meta);
    wrapper.append(details, clearButton);
    savedPositions.appendChild(wrapper);
  }
}

function renderExcludedVideos() {
  const filter = filterExcluded.value.trim().toLowerCase();
  const visibleItems = filter
    ? excludedItems.filter((item) => getFilterText(item).includes(filter))
    : excludedItems;
  const count = excludedItems.length;

  if (filter) {
    excludedCount.textContent = `${visibleItems.length} of ${count} shown`;
  } else {
    excludedCount.textContent = count === 1
      ? "1 excluded video"
      : `${count} excluded videos`;
  }

  renderExcludedVideoItems(visibleItems);
}

function renderExcludedVideoItems(items) {
  excludedVideos.textContent = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-meta";
    empty.textContent = excludedItems.length === 0
      ? "No excluded videos yet."
      : "No excluded videos match the filter.";
    excludedVideos.appendChild(empty);
    return;
  }

  for (const item of items) {
    const wrapper = document.createElement("article");
    wrapper.className = "saved-item";

    const details = document.createElement("div");

    const title = document.createElement("p");
    title.className = "saved-title";
    title.textContent = item.title || item.videoId || "Untitled video";

    const meta = document.createElement("p");
    meta.className = "saved-meta";
    meta.textContent = getExcludedMeta(item);

    const includeButton = document.createElement("button");
    includeButton.type = "button";
    includeButton.textContent = "Allow";
    includeButton.addEventListener("click", () => includeSavedVideo(item.key));

    details.append(title, meta);
    wrapper.append(details, includeButton);
    excludedVideos.appendChild(wrapper);
  }
}

async function includeSavedVideo(key) {
  await browser.storage.local.remove(key);
  await updateSavedCount();
  showStatus(clearStatus, "Allowed");
}

function getFilterText(item) {
  return [
    item.title,
    item.videoId,
    formatTime(item.time || 0),
    typeof item.duration === "number" ? formatTime(item.duration) : "",
    typeof item.savedAt === "number" ? new Date(item.savedAt).toLocaleString() : "",
    typeof item.excludedAt === "number" ? new Date(item.excludedAt).toLocaleString() : ""
  ].join(" ").toLowerCase();
}

function getSavedMeta(item) {
  const parts = [`Position ${formatTime(item.time || 0)}`];

  if (typeof item.duration === "number" && Number.isFinite(item.duration)) {
    parts.push(`of ${formatTime(item.duration)}`);
  }

  if (typeof item.savedAt === "number") {
    parts.push(`saved ${new Date(item.savedAt).toLocaleString()}`);
  }

  return parts.join(" - ");
}

function getExcludedMeta(item) {
  const parts = [];

  if (typeof item.duration === "number" && Number.isFinite(item.duration)) {
    parts.push(`Duration ${formatTime(item.duration)}`);
  }

  if (typeof item.excludedAt === "number") {
    parts.push(`excluded ${new Date(item.excludedAt).toLocaleString()}`);
  }

  return parts.length > 0 ? parts.join(" - ") : "Excluded from saving";
}

function formatTime(totalSeconds) {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function showStatus(element, message) {
  element.textContent = message;
  setTimeout(() => {
    element.textContent = "";
  }, 1600);
}

settingsForm.addEventListener("submit", saveSettings);
clearData.addEventListener("click", clearSavedPositions);
filterSaved.addEventListener("input", renderSavedPositions);
filterExcluded.addEventListener("input", renderExcludedVideos);

loadSettings();
updateSavedCount();
