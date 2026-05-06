(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    minDurationSeconds: 15 * 60,
    saveIntervalMs: 5000,
    ignoreFirstSeconds: 60,
    ignoreLastSeconds: 60
  };

  const KEY_PREFIX = "yt-long-video-resume:";
  const EXCLUDE_KEY_PREFIX = "yt-long-video-resume-exclude:";
  const RESTORE_ATTRIBUTE = "data-long-resume-restored-for";

  let settings = { ...DEFAULT_SETTINGS };
  let activeVideoId = null;
  let saveTimer = null;

  async function loadSettings() {
    settings = await browser.storage.local.get(DEFAULT_SETTINGS);
  }

  function getVideoId() {
    const url = new URL(location.href);

    if (url.pathname !== "/watch") {
      return null;
    }

    return url.searchParams.get("v");
  }

  function getStorageKey(videoId) {
    return `${KEY_PREFIX}${videoId}`;
  }

  function getExcludeKey(videoId) {
    return `${EXCLUDE_KEY_PREFIX}${videoId}`;
  }

  function getVideo() {
    return document.querySelector("video");
  }

  function isLongEnough(video) {
    return Number.isFinite(video.duration) && video.duration >= settings.minDurationSeconds;
  }

  function shouldSave(video) {
    if (!isLongEnough(video)) return false;
    if (video.currentTime < settings.ignoreFirstSeconds) return false;
    if (video.currentTime > video.duration - settings.ignoreLastSeconds) return false;
    return true;
  }

  async function savePosition(videoId, video) {
    if (await isExcluded(videoId)) return;
    if (!shouldSave(video)) return;

    const data = {
      time: video.currentTime,
      duration: video.duration,
      savedAt: Date.now(),
      title: document.title.replace(" - YouTube", "")
    };

    await browser.storage.local.set({
      [getStorageKey(videoId)]: data
    });
  }

  async function clearPosition(videoId) {
    await browser.storage.local.remove(getStorageKey(videoId));
  }

  async function isExcluded(videoId) {
    const key = getExcludeKey(videoId);
    const stored = await browser.storage.local.get(key);
    return Boolean(stored[key]);
  }

  async function excludeVideo(videoId, video) {
    const data = {
      title: document.title.replace(" - YouTube", ""),
      duration: video && Number.isFinite(video.duration) ? video.duration : null,
      excludedAt: Date.now()
    };

    await browser.storage.local.set({
      [getExcludeKey(videoId)]: data
    });
    await clearPosition(videoId);
  }

  async function includeVideo(videoId) {
    await browser.storage.local.remove(getExcludeKey(videoId));
  }

  async function readPosition(videoId) {
    const key = getStorageKey(videoId);
    const stored = await browser.storage.local.get(key);
    return stored[key] || null;
  }

  async function restorePosition(videoId, video) {
    if (await isExcluded(videoId)) return;
    if (!isLongEnough(video)) return;

    const alreadyRestoredFor = video.getAttribute(RESTORE_ATTRIBUTE);
    if (alreadyRestoredFor === videoId) return;

    const saved = await readPosition(videoId);
    if (!saved || typeof saved.time !== "number") return;

    const savedTime = saved.time;

    if (savedTime < settings.ignoreFirstSeconds) return;
    if (savedTime > video.duration - settings.ignoreLastSeconds) {
      await clearPosition(videoId);
      return;
    }

    video.currentTime = savedTime;
    video.setAttribute(RESTORE_ATTRIBUTE, videoId);
    showToast(`Resumed at ${formatTime(savedTime)}`);
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

  function showToast(message) {
    const existing = document.getElementById("yt-long-video-resume-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "yt-long-video-resume-toast";
    toast.textContent = message;

    Object.assign(toast.style, {
      position: "fixed",
      left: "24px",
      bottom: "24px",
      zIndex: "999999",
      padding: "10px 14px",
      borderRadius: "6px",
      background: "rgba(0, 0, 0, 0.84)",
      color: "#fff",
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
      pointerEvents: "none",
      opacity: "1",
      transition: "opacity 300ms ease"
    });

    document.documentElement.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 350);
    }, 2200);
  }

  function stopCurrentWatcher() {
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }

    activeVideoId = null;
  }

  function startForCurrentPage() {
    const videoId = getVideoId();

    if (!videoId) {
      stopCurrentWatcher();
      return;
    }

    if (videoId === activeVideoId && saveTimer) {
      return;
    }

    stopCurrentWatcher();
    activeVideoId = videoId;

    waitForVideo().then((video) => {
      if (!video || activeVideoId !== videoId) return;

      if (video.readyState >= 1) {
        restorePosition(videoId, video);
      } else {
        video.addEventListener("loadedmetadata", () => restorePosition(videoId, video), { once: true });
      }

      video.addEventListener("ended", () => clearPosition(videoId), { once: true });

      saveTimer = setInterval(() => {
        if (activeVideoId !== videoId) return;
        savePosition(videoId, video);
      }, settings.saveIntervalMs);
    });
  }

  function waitForVideo() {
    return new Promise((resolve) => {
      const existing = getVideo();
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const video = getVideo();
        if (video) {
          observer.disconnect();
          resolve(video);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(getVideo());
      }, 10000);
    });
  }

  function watchUrlChanges() {
    let lastUrl = location.href;

    const onChange = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      startForCurrentPage();
    };

    if (window.navigation) {
      window.navigation.addEventListener("navigatesuccess", () => {
        setTimeout(startForCurrentPage, 250);
      });
    }

    new MutationObserver(onChange).observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("popstate", () => {
      setTimeout(startForCurrentPage, 250);
    });
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    let settingsChanged = false;

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (changes[key]) {
        settings[key] = changes[key].newValue;
        settingsChanged = true;
      }
    }

    if (!settingsChanged) return;

    stopCurrentWatcher();
    startForCurrentPage();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "GET_CURRENT_VIDEO_RESUME") {
      return getCurrentVideoResume();
    }

    if (message?.type === "CLEAR_CURRENT_VIDEO_RESUME") {
      return clearCurrentVideoResume();
    }

    if (message?.type === "EXCLUDE_CURRENT_VIDEO_RESUME") {
      return excludeCurrentVideoResume();
    }

    if (message?.type === "INCLUDE_CURRENT_VIDEO_RESUME") {
      return includeCurrentVideoResume();
    }

    return undefined;
  });

  async function getCurrentVideoResume() {
    const videoId = getVideoId();
    const video = getVideo();

    if (!videoId || !video) {
      return {
        ok: false,
        reason: "Open a YouTube video to see saved resume data."
      };
    }

    const saved = await readPosition(videoId);
    const excluded = await isExcluded(videoId);

    return {
      ok: true,
      videoId,
      title: document.title.replace(" - YouTube", ""),
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      saved,
      excluded
    };
  }

  async function clearCurrentVideoResume() {
    const videoId = getVideoId();

    if (!videoId) {
      return { ok: false };
    }

    await clearPosition(videoId);
    showToast("Cleared saved resume position");
    return { ok: true };
  }

  async function excludeCurrentVideoResume() {
    const videoId = getVideoId();
    const video = getVideo();

    if (!videoId) {
      return { ok: false };
    }

    await excludeVideo(videoId, video);
    showToast("This video will not be saved");
    return { ok: true };
  }

  async function includeCurrentVideoResume() {
    const videoId = getVideoId();

    if (!videoId) {
      return { ok: false };
    }

    await includeVideo(videoId);
    showToast("This video can be saved again");
    return { ok: true };
  }

  loadSettings().then(() => {
    watchUrlChanges();
    startForCurrentPage();
  });
})();
