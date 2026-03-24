const YT_PLAYING = 1;
const RATE_STORAGE_KEY = "lecturePlaybackRate";
const RATE_OPTIONS = [0.5, 1, 1.5];

function readStoredPlaybackRate() {
  let r = 1;
  try {
    const saved = localStorage.getItem(RATE_STORAGE_KEY);
    if (saved != null) {
      const p = Number.parseFloat(saved);
      if (Number.isFinite(p)) r = p;
    }
  } catch {
    /* ignore */
  }
  return r;
}

function nearestRateOption(rate) {
  if (!Number.isFinite(rate)) return 1;
  let best = RATE_OPTIONS[1];
  let bestDiff = Infinity;
  for (const opt of RATE_OPTIONS) {
    const d = Math.abs(opt - rate);
    if (d < bestDiff) {
      bestDiff = d;
      best = opt;
    }
  }
  return best;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTParam(raw) {
  if (raw == null || raw === "") return null;
  const str = String(raw).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  let sec = 0;
  const h = str.match(/(\d+)h/i);
  const mi = str.match(/(\d+)m/i);
  const ss = str.match(/(\d+)s/i);
  if (h) sec += parseInt(h[1], 10) * 3600;
  if (mi) sec += parseInt(mi[1], 10) * 60;
  if (ss) sec += parseInt(ss[1], 10);
  if (h || mi || ss) return sec;
  return null;
}

function parseYouTubeTimeFromHref(href) {
  try {
    const u = new URL(href, window.location.href);
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    return parseTParam(t);
  } catch {
    return null;
  }
}

function parseYouTubeVideoIdFromHref(href) {
  try {
    const u = new URL(href, window.location.href);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host === "m.youtube.com") {
      return u.searchParams.get("v");
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      return id || null;
    }
    return null;
  } catch {
    return null;
  }
}

function collectAnchors(article) {
  const links = article.querySelectorAll(
    'a[href*="youtube.com/watch"], a[href*="youtu.be/"]'
  );
  const points = [];
  for (const a of links) {
    const t = parseYouTubeTimeFromHref(a.href);
    if (t === null) continue;
    const y = a.getBoundingClientRect().top + window.scrollY;
    points.push({ t, y });
  }
  points.sort((a, b) => a.y - b.y);
  const seen = new Set();
  const deduped = [];
  for (const p of points) {
    const key = `${p.y}-${p.t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  return deduped.sort((a, b) => a.y - b.y);
}

function mapScrollToTime(refY, points, durationSec, article) {
  const bottomY = article.getBoundingClientRect().bottom + window.scrollY;
  const extended = [...points];
  if (durationSec > 0) {
    extended.push({ t: durationSec, y: bottomY });
  }
  extended.sort((a, b) => a.y - b.y);
  if (extended.length < 2) {
    const top = article.getBoundingClientRect().top + window.scrollY;
    const h = article.offsetHeight;
    const ratio = h > 0 ? Math.max(0, Math.min(1, (refY - top) / h)) : 0;
    return durationSec > 0 ? ratio * durationSec : 0;
  }
  if (refY <= extended[0].y) return extended[0].t;
  if (refY >= extended[extended.length - 1].y) {
    return extended[extended.length - 1].t;
  }
  for (let i = 0; i < extended.length - 1; i++) {
    const a = extended[i];
    const b = extended[i + 1];
    if (refY >= a.y && refY <= b.y) {
      const span = Math.max(1, b.y - a.y);
      const frac = (refY - a.y) / span;
      return a.t + frac * (b.t - a.t);
    }
  }
  return extended[extended.length - 1].t;
}

function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(true);
      return;
    }
    const timeout = window.setTimeout(() => resolve(false), 8000);
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      finish(true);
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    } else {
      const poll = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          window.clearInterval(poll);
          finish(true);
        }
      }, 40);
    }
  });
}

function init() {
  const dock = document.getElementById("lectureVideoDock");
  const host = document.getElementById("lectureYtPlayerHost");
  const fill = document.getElementById("lectureVideoScrubFill");
  const curEl = document.getElementById("lectureTimeCurrent");
  const durEl = document.getElementById("lectureTimeDuration");
  const btn = document.getElementById("lecturePlayBtn");
  const article = document.querySelector(".lecture-body");
  const speedBar = document.querySelector(".lecture-video-speed");

  if (!dock || !host || !article || !fill || !curEl || !durEl || !btn) return;

  function syncSpeedButtons(activeRate) {
    if (!speedBar) return;
    const best = nearestRateOption(activeRate);
    const buttons = speedBar.querySelectorAll(".lecture-video-speed__btn");
    buttons.forEach((b) => {
      const r = Number.parseFloat(b.dataset.rate);
      b.classList.toggle("is-active", Math.abs(r - best) < 0.01);
    });
  }

  if (speedBar) {
    syncSpeedButtons(readStoredPlaybackRate());
  }

  const videoId = dock.dataset.videoId;
  if (!videoId) return;

  let anchorPoints = collectAnchors(article);
  let duration = 0;
  let player = null;
  let playerReady = false;
  let playing = false;
  let playTimer = null;
  let availableRates = null;
  let pendingSeekTime = null;
  let pendingAutoplay = false;

  function rebuildAnchors() {
    anchorPoints = collectAnchors(article);
  }

  function computeScrollTime() {
    const refY = window.scrollY + window.innerHeight * 0.35;
    if (duration <= 0) {
      return 0;
    }
    return mapScrollToTime(refY, anchorPoints, duration, article);
  }

  function updateUI(t) {
    curEl.textContent = formatTime(t);
    durEl.textContent = duration > 0 ? formatTime(duration) : "--:--";
    let pct;
    if (duration > 0) {
      pct = Math.max(0, Math.min(100, (t / duration) * 100));
    } else {
      const top = article.getBoundingClientRect().top + window.scrollY;
      const h = article.offsetHeight;
      const refY = window.scrollY + window.innerHeight * 0.35;
      pct =
        h > 0
          ? Math.max(0, Math.min(100, ((refY - top) / h) * 100))
          : 0;
    }
    fill.style.width = `${pct}%`;
  }

  function tick() {
    let t;
    if (playing && player) {
      t = player.getCurrentTime();
    } else {
      t = computeScrollTime();
    }
    updateUI(t);
  }

  function onStateChange(e) {
    playing = e.data === YT_PLAYING;
    btn.classList.toggle("is-playing", playing);
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    if (playing) {
      playTimer = window.setInterval(() => tick(), 200);
    } else {
      tick();
    }
  }

  let scrollRaf = null;
  window.addEventListener(
    "scroll",
    () => {
      if (playing) return;
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        tick();
      });
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    () => {
      rebuildAnchors();
      tick();
    },
    { passive: true }
  );

  btn.addEventListener("click", () => {
    if (!player || !playerReady) return;
    if (playing) {
      player.pauseVideo();
    } else {
      const t = computeScrollTime();
      player.seekTo(t, true);
      player.playVideo();
    }
  });

  article.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const t = parseYouTubeTimeFromHref(anchor.href);
    if (!Number.isFinite(t)) return;
    const targetVideoId = parseYouTubeVideoIdFromHref(anchor.href);
    if (targetVideoId && targetVideoId !== videoId) return;
    ev.preventDefault();
    const safeTime = Math.max(0, t);
    if (!player || !playerReady) {
      pendingSeekTime = safeTime;
      pendingAutoplay = true;
      updateUI(safeTime);
      return;
    }
    player.seekTo(safeTime, true);
    player.playVideo();
  });

  function applyPlaybackRate(rate) {
    if (!player || !playerReady) return;
    if (!Number.isFinite(rate)) return;
    let desired = rate;
    if (Array.isArray(availableRates) && availableRates.length) {
      if (!availableRates.some((x) => Math.abs(x - desired) < 0.01)) {
        const sorted = [...availableRates].sort(
          (a, b) => Math.abs(a - desired) - Math.abs(b - desired)
        );
        desired = sorted[0];
      }
    }
    try {
      player.setPlaybackRate(desired);
    } catch {
      return;
    }
    let forUi = desired;
    try {
      const actual = player.getPlaybackRate();
      if (
        Number.isFinite(actual) &&
        Math.abs(actual - desired) < 0.06
      ) {
        forUi = actual;
      }
    } catch {
      /* keep rate */
    }
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(forUi));
    } catch {
      /* ignore */
    }
    syncSpeedButtons(forUi);
  }

  function onPlaybackRateChange(e) {
    if (!playerReady) return;
    let r = e.data;
    if (!Number.isFinite(r)) {
      try {
        r = e.target.getPlaybackRate();
      } catch {
        return;
      }
    }
    if (!Number.isFinite(r)) return;
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(r));
    } catch {
      /* ignore */
    }
    syncSpeedButtons(r);
  }

  function updateSpeedButtonAvailability() {
    if (!speedBar) return;
    const buttons = speedBar.querySelectorAll(".lecture-video-speed__btn");
    buttons.forEach((b) => {
      const r = Number.parseFloat(b.dataset.rate);
      const enabled =
        !Array.isArray(availableRates) ||
        !availableRates.length ||
        availableRates.some((x) => Math.abs(x - r) < 0.01);
      b.disabled = !enabled;
      b.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
  }

  if (speedBar) {
    speedBar.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLButtonElement) || !t.dataset.rate) return;
      if (t.disabled) return;
      const rate = Number.parseFloat(t.dataset.rate);
      if (!Number.isFinite(rate)) return;
      applyPlaybackRate(rate);
    });
  }

  loadYouTubeAPI().then((ok) => {
    if (!ok || !(window.YT && window.YT.Player)) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      if (speedBar) {
        const buttons = speedBar.querySelectorAll(".lecture-video-speed__btn");
        buttons.forEach((b) => {
          b.disabled = true;
          b.setAttribute("aria-disabled", "true");
        });
      }
      return;
    }
    player = new window.YT.Player(host, {
      videoId,
      width: 1,
      height: 1,
      playerVars: {
        playsinline: 1,
        rel: 0,
        controls: 0,
      },
      events: {
        onReady: (e) => {
          playerReady = true;
          duration = e.target.getDuration();
          if (!Number.isFinite(duration) || duration <= 0) duration = 0;
          rebuildAnchors();
          let initial = readStoredPlaybackRate();
          availableRates = (() => {
            try {
              return e.target.getAvailablePlaybackRates();
            } catch {
              return null;
            }
          })();
          updateSpeedButtonAvailability();
          if (
            Array.isArray(availableRates) &&
            availableRates.length &&
            !availableRates.some((x) => Math.abs(x - initial) < 0.01)
          ) {
            const sorted = [...availableRates].sort(
              (a, b) => Math.abs(a - initial) - Math.abs(b - initial)
            );
            initial = sorted[0];
          }
          applyPlaybackRate(initial);
          if (Number.isFinite(pendingSeekTime)) {
            e.target.seekTo(Math.max(0, pendingSeekTime), true);
            if (pendingAutoplay) {
              e.target.playVideo();
            } else {
              tick();
            }
            pendingSeekTime = null;
            pendingAutoplay = false;
          }
          tick();
        },
        onStateChange: onStateChange,
        onPlaybackRateChange: onPlaybackRateChange,
      },
    });
  });

  rebuildAnchors();
  tick();
}

init();
