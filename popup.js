const KEY_PREFIX = "yt-long-video-resume:";

const savedCount = document.getElementById("savedCount");
const openOptions = document.getElementById("openOptions");
const currentStatus = document.getElementById("currentStatus");
const currentVideo = document.getElementById("currentVideo");
const currentTitle = document.getElementById("currentTitle");
const currentMeta = document.getElementById("currentMeta");
const clearCurrent = document.getElementById("clearCurrent");
const excludeCurrent = document.getElementById("excludeCurrent");
const includeCurrent = document.getElementById("includeCurrent");

let activeTabId = null;

async function updateSavedCount() {
  const stored = await browser.storage.local.get(null);
  const count = Object.keys(stored).filter((key) => key.startsWith(KEY_PREFIX)).length;

  savedCount.textContent = count === 1
    ? "1 saved video position"
    : `${count} saved video positions`;
}

async function updateCurrentVideo() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id || null;

  if (!activeTabId || !tab.url?.includes("youtube.com/watch")) {
    currentStatus.textContent = "Open a YouTube video to manage its saved position.";
    currentVideo.hidden = true;
    clearCurrent.hidden = true;
    excludeCurrent.hidden = true;
    includeCurrent.hidden = true;
    return;
  }

  try {
    const response = await browser.tabs.sendMessage(activeTabId, {
      type: "GET_CURRENT_VIDEO_RESUME"
    });

    if (!response?.ok) {
      currentStatus.textContent = response?.reason || "No current video data available.";
      currentVideo.hidden = true;
      clearCurrent.hidden = true;
      excludeCurrent.hidden = true;
      includeCurrent.hidden = true;
      return;
    }

    currentStatus.textContent = "Current video";
    currentVideo.hidden = false;
    currentTitle.textContent = response.title || response.videoId || "Untitled video";

    if (response.excluded) {
      currentMeta.textContent = "This video is excluded from saving.";
      clearCurrent.hidden = true;
      excludeCurrent.hidden = true;
      includeCurrent.hidden = false;
    } else if (response.saved?.time) {
      currentMeta.textContent = getSavedMeta(response.saved);
      clearCurrent.hidden = false;
      excludeCurrent.hidden = false;
      includeCurrent.hidden = true;
    } else {
      currentMeta.textContent = `No saved position. Current time ${formatTime(response.currentTime || 0)}.`;
      clearCurrent.hidden = true;
      excludeCurrent.hidden = false;
      includeCurrent.hidden = true;
    }
  } catch {
    currentStatus.textContent = "Refresh the YouTube tab if current video data does not appear.";
    currentVideo.hidden = true;
    clearCurrent.hidden = true;
    excludeCurrent.hidden = true;
    includeCurrent.hidden = true;
  }
}

async function clearCurrentVideo() {
  if (!activeTabId) return;

  await browser.tabs.sendMessage(activeTabId, {
    type: "CLEAR_CURRENT_VIDEO_RESUME"
  }).catch(() => {});

  await updateSavedCount();
  await updateCurrentVideo();
}

async function excludeCurrentVideo() {
  if (!activeTabId) return;

  await browser.tabs.sendMessage(activeTabId, {
    type: "EXCLUDE_CURRENT_VIDEO_RESUME"
  }).catch(() => {});

  await updateSavedCount();
  await updateCurrentVideo();
}

async function includeCurrentVideo() {
  if (!activeTabId) return;

  await browser.tabs.sendMessage(activeTabId, {
    type: "INCLUDE_CURRENT_VIDEO_RESUME"
  }).catch(() => {});

  await updateSavedCount();
  await updateCurrentVideo();
}

function getSavedMeta(saved) {
  const parts = [`Saved at ${formatTime(saved.time || 0)}`];

  if (typeof saved.duration === "number" && Number.isFinite(saved.duration)) {
    parts.push(`of ${formatTime(saved.duration)}`);
  }

  if (typeof saved.savedAt === "number") {
    parts.push(new Date(saved.savedAt).toLocaleString());
  }

  return parts.join(" - ");
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

openOptions.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

clearCurrent.addEventListener("click", clearCurrentVideo);
excludeCurrent.addEventListener("click", excludeCurrentVideo);
includeCurrent.addEventListener("click", includeCurrentVideo);

updateSavedCount();
updateCurrentVideo();
