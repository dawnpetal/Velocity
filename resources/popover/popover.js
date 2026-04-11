const invoke = window.__TAURI__.core.invoke;
const { listen } = window.__TAURI__.event;
const _win = window.__TAURI__.window.getCurrentWindow();

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
const CIRC = 138.2;

const el = {
  keySection:  document.getElementById("key-section"),
  expires:     document.getElementById("expires-value"),
  expiresSub:  document.getElementById("expires-sub"),
  keyVal:      document.getElementById("key-value"),
  btnCopy:     document.getElementById("btn-copy"),
  btnRefresh:  document.getElementById("btn-refresh"),
  ringHour:    document.getElementById("ring-hour"),
  ringDay:     document.getElementById("ring-day"),
  ringHourNum: document.getElementById("ring-hour-num"),
  ringDayNum:  document.getElementById("ring-day-num"),
  scroll:      document.getElementById("scripts-scroll"),
  empty:       document.getElementById("empty"),
  btnOpen:     document.getElementById("btn-open"),
  runCount:    document.getElementById("run-count"),
};

let _validCache = null;
let _tickTimer  = null;

function hourKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}`;
}

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function isRateLimit(err) {
  const s = String(err).toLowerCase();
  return s.includes("rate") || s.includes("429") || s.includes("too many");
}

function setRing(ring, numEl, val, max) {
  const pct = max > 0 ? Math.min(val / max, 1) : 0;
  ring.style.strokeDashoffset = CIRC - pct * CIRC;
  ring.className = "ring-fill" + (pct >= 0.67 ? " warn" : "");
  numEl.textContent = val;
}

function fmtCountdown(secs) {
  if (secs <= 0) return "Expired";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtBig(secs) {
  if (secs <= 0) return { text: "Expired", cls: "fail" };
  const d = Math.floor(secs / 86400);
  const h = Math.floor(secs / 3600);
  if (d >= 2)  return { text: `${d} Days`,  cls: d < 4 ? "warn" : "" };
  if (d === 1) return { text: "1 Day",      cls: "warn" };
  if (h >= 1)  return { text: `${h}h`,      cls: "warn" };
  const m = Math.floor(secs / 60);
  return { text: `${m}m`, cls: "warn" };
}

function startTick() {
  if (_tickTimer) clearInterval(_tickTimer);
  if (!_validCache?.expires_at) return;

  function tick() {
    if (!_validCache?.expires_at) return;
    const elapsed = Date.now() / 1000 - _validCache.fetched_at;
    const remaining = _validCache.expires_at - _validCache.fetched_at - elapsed;
    const { text, cls } = fmtBig(remaining);
    el.expires.textContent = text;
    el.expires.className = cls;
    if (remaining > 0) {
      el.expiresSub.textContent = fmtCountdown(remaining);
    } else {
      el.expiresSub.textContent = "Key expired";
      clearInterval(_tickTimer);
    }
  }

  tick();
  _tickTimer = setInterval(tick, 1000);
}

function renderCache(c) {
  if (!c) {
    el.expires.textContent = "—";
    el.expires.className = "";
    el.expiresSub.textContent = "";
    el.keyVal.textContent = "No key loaded";
    setRing(el.ringHour, el.ringHourNum, 0, 3);
    setRing(el.ringDay,  el.ringDayNum,  0, 12);
    return;
  }

  if (!c.valid) {
    if (isRateLimit(c.error ?? "") && _validCache) {
      renderValidState(_validCache, true);
      return;
    }
    if (_validCache && _validCache.expires_at) {
      renderValidState(_validCache, true);
      return;
    }
    el.expires.textContent = "Invalid";
    el.expires.className = "fail";
    el.expiresSub.textContent = c.error ? c.error.replace("Rate limited: ", "") : "Validation failed";
    el.keyVal.textContent = c.key || c.error || "Validation failed";
    setRing(el.ringHour, el.ringHourNum, 0, 3);
    setRing(el.ringDay,  el.ringDayNum,  0, 12);
    return;
  }

  _validCache = c;
  renderValidState(c, false);
}

function renderValidState(c, isStale) {
  el.keyVal.textContent = c.key || "—";
  setRing(el.ringHour, el.ringHourNum, (c.hourly_counts ?? {})[hourKey()] ?? 0, 3);
  setRing(el.ringDay,  el.ringDayNum,  (c.daily_counts  ?? {})[dayKey()]  ?? 0, 12);
  if (isStale) {
    el.expiresSub.textContent = "cached · tap ↺ to refresh";
  } else {
    el.expiresSub.textContent = "";
  }
  startTick();
}

function renderScripts(scripts, executor) {
  el.scroll.querySelectorAll(".srow").forEach(n => n.remove());

  if (!scripts?.length) {
    el.empty.style.display = "block";
    el.runCount.textContent = "";
    return;
  }
  el.empty.style.display = "none";
  el.runCount.textContent = scripts.length;

  scripts.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "srow";
    row.setAttribute("role", "button");

    const idx = document.createElement("div");
    idx.className = "sidx";
    idx.textContent = i + 1;

    const meta = document.createElement("div");
    meta.className = "smeta";

    const name = document.createElement("div");
    name.className = "sname";
    name.textContent = s.name;
    meta.appendChild(name);

    if (s.shortcut) {
      const kbd = document.createElement("div");
      kbd.className = "skbd";
      kbd.textContent = s.shortcut.toLowerCase()
        .replace("cmd","⌘").replace("shift","⇧")
        .replace("alt","⌥").replace("ctrl","⌃")
        .replace(/\+/g,"");
      meta.appendChild(kbd);
    }

    const run = document.createElement("button");
    run.className = "srun";
    run.innerHTML = PLAY;

    const doRun = (e) => {
      e.stopPropagation();
      invoke("hide_popover").catch(() => {});
      invoke("inject_script", { code: s.content, executor }).catch(() => {});
    };

    row.addEventListener("click", doRun);
    run.addEventListener("click", doRun);
    row.append(idx, meta, run);
    el.scroll.insertBefore(row, el.empty);
  });
}

async function getSettings() {
  try { return (await invoke("load_ui_state_cmd"))?.settings ?? {}; }
  catch { return {}; }
}

async function refresh() {
  const settings   = await getSettings();
  const executor   = settings.executor ?? "hydrogen";
  const isHydrogen = !executor || executor === "hydrogen";

  el.keySection.classList.toggle("hidden", !isHydrogen);

  if (isHydrogen) {
    try {
      const c = await invoke("get_key_cache") ?? null;
      if (c?.valid) {
        _validCache = c;
        renderValidState(c, false);
      } else if (c && !c.valid && _validCache) {
        renderValidState(_validCache, true);
      } else {
        renderCache(c);
      }
    } catch {
      if (_validCache) renderValidState(_validCache, true);
    }
  }

  try {
    const scripts = await invoke("get_scripts") ?? [];
    renderScripts(scripts, executor);
  } catch {}
}

async function revalidate() {
  el.btnRefresh.classList.add("spinning");
  el.btnRefresh.disabled = true;

  try {
    const settings = await getSettings();
    const c = await invoke("validate_key") ?? null;
    renderCache(c);
    const scripts = await invoke("get_scripts") ?? [];
    renderScripts(scripts, settings.executor ?? "hydrogen");
  } catch (err) {
    if (isRateLimit(err) && _validCache) renderValidState(_validCache, true);
    else if (_validCache) renderValidState(_validCache, true);
    else { el.expires.textContent = "Failed"; el.expires.className = "fail"; }
  } finally {
    el.btnRefresh.classList.remove("spinning");
    el.btnRefresh.disabled = false;
  }
}

el.btnRefresh.addEventListener("click", revalidate);

el.btnCopy.addEventListener("click", async () => {
  try {
    const c = _validCache ?? await invoke("get_key_cache");
    if (!c?.key) return;
    await navigator.clipboard.writeText(c.key);
    el.btnCopy.classList.add("copied");
    setTimeout(() => el.btnCopy.classList.remove("copied"), 1500);
  } catch {}
});

el.btnOpen.addEventListener("click", () => {
  _win.hide().catch(() => {});
  invoke("show_popover").catch(() => {});
});

window.addEventListener("keydown", e => {
  if (e.key === "Escape") _win.hide().catch(() => {});
});

let _shownAt = 0;
_win.onFocusChanged(({ payload: focused }) => {
  if (!focused && Date.now() - _shownAt > 300) _win.hide().catch(() => {});
});

listen("popover:refresh",  () => { _shownAt = Date.now(); refresh(); });
listen("executor:changed", () => refresh());

refresh();