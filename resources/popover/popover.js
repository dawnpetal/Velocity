const invoke = window.__TAURI__.core.invoke;
const { listen } = window.__TAURI__.event;
const _win = window.__TAURI__.window.getCurrentWindow();

const CIRC = 125.7;
let _validCache = null;
let _tickTimer = null;
let _allScripts = [];
let _pinned = JSON.parse(localStorage.getItem("v_p") || "[]");
let _recents = JSON.parse(localStorage.getItem("v_r") || "[]");
let _isRefreshing = false;

const el = {
  keySec: document.getElementById("key-section"),
  expVal: document.getElementById("exp-val"),
  expSub: document.getElementById("exp-sub"),
  keyDisp: document.getElementById("key-display"),
  btnCopy: document.getElementById("btn-copy"),
  btnRefresh: document.getElementById("btn-refresh"),
  ringH: document.getElementById("ring-h"),
  ringD: document.getElementById("ring-d"),
  ringHN: document.getElementById("ring-h-n"),
  ringDN: document.getElementById("ring-d-n"),
  list: document.getElementById("list"),
  listLoader: document.getElementById("list-loader"),
  recents: document.getElementById("recents"),
  empty: document.getElementById("empty"),
  count: document.getElementById("count"),
  search: document.getElementById("search-input"),
  status: document.getElementById("status"),
  dot: document.getElementById("status-dot"),
};

function hourKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}
function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setRing(ring, numEl, val, max) {
  const pct = max > 0 ? Math.min(val / max, 1) : 0;
  ring.style.strokeDashoffset = CIRC - pct * CIRC;
  ring.classList.toggle("warn", pct >= 0.75);
  numEl.textContent = val;
}

function renderRecents() {
  el.recents.innerHTML = "";
  if (!_recents.length) return el.recents.style.display = "none";
  el.recents.style.display = "flex";
  _recents.forEach(name => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = name;
    chip.onclick = () => { const s = _allScripts.find(x => x.name === name); if (s) runScript(s); };
    el.recents.appendChild(chip);
  });
}

async function runScript(s) {
  if (el.dot.classList.contains("busy")) return;
  el.status.textContent = "Injecting";
  el.dot.classList.add("busy");
  try {
    await invoke("inject_script", { code: s.content });
    _recents = [s.name, ..._recents.filter(x => x !== s.name)].slice(0, 6);
    localStorage.setItem("v_r", JSON.stringify(_recents));
    renderRecents();
    el.status.textContent = "Success";
  } catch (e) {
    console.error("Script injection failed:", e);
    el.status.textContent = "Failed";
  } finally {
    el.dot.classList.remove("busy");
    setTimeout(() => el.status.textContent = "Ready", 2000);
  }
}

function renderScripts(query = "") {
  el.list.querySelectorAll(".srow").forEach(n => n.remove());
  const filtered = _allScripts
    .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const aP = _pinned.includes(a.name), bP = _pinned.includes(b.name);
      return aP === bP ? a.name.localeCompare(b.name) : aP ? -1 : 1;
    });
  el.empty.style.display = filtered.length ? "none" : "block";
  el.count.textContent = `${filtered.length} Scripts`;
  filtered.forEach(s => {
    const isPinned = _pinned.includes(s.name);
    const row = document.createElement("div");
    row.className = `srow ${isPinned ? "is-pinned" : ""}`;
    row.innerHTML = `
      <div class="s-name">${s.name}</div>
      <div class="s-pin">
        <svg viewBox="0 0 24 24" fill="${isPinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 2L15 8.5L22 9.2L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9.2L9 8.5L12 2Z"/></svg>
      </div>`;
    row.querySelector(".s-pin").onclick = (e) => {
      e.stopPropagation();
      _pinned = isPinned ? _pinned.filter(p => p !== s.name) : [..._pinned, s.name];
      localStorage.setItem("v_p", JSON.stringify(_pinned));
      renderScripts(el.search.value);
    };
    row.onclick = () => runScript(s);
    el.list.appendChild(row);
  });
}

async function refresh(force = false) {
  if (_isRefreshing && !force) return;
  _isRefreshing = true;
  el.listLoader.classList.add("active");
  try {
    const uiStateData = await invoke("load_ui_state_cmd").catch(() => ({}));
    const isHydro = (uiStateData?.settings?.executor ?? "hydrogen") === "hydrogen";
    el.keySec.classList.toggle("hidden", !isHydro);

    if (isHydro) {
      const c = await invoke("get_key_cache").catch(() => null);
      if (c?.valid) {
        _validCache = c;
        el.keyDisp.textContent = c.key || "—";
        setRing(el.ringH, el.ringHN, (c.hourly_counts ?? {})[hourKey()] ?? 0, 3);
        setRing(el.ringD, el.ringDN, (c.daily_counts ?? {})[dayKey()] ?? 0, 12);
        if (_tickTimer) clearInterval(_tickTimer);
        _tickTimer = setInterval(() => {
          const rem = _validCache.expires_at - (Date.now() / 1000);
          if (rem <= 0) { el.expVal.textContent = "Expired"; el.expSub.textContent = "Revalidate Required"; return; }
          const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60);
          el.expVal.textContent = h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(rem % 60)}s`;
          el.expSub.textContent = `Until ${new Date(_validCache.expires_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        }, 1000);
      } else {
        el.expVal.textContent = "Invalid";
        el.expSub.textContent = "Key expired or missing";
      }
    }
    _allScripts = await invoke("get_scripts").catch(() => []);
    renderScripts(el.search.value);
    renderRecents();
  } finally {
    _isRefreshing = false;
    el.listLoader.classList.remove("active");
  }
}

el.search.oninput = (e) => renderScripts(e.target.value);

el.btnRefresh.onclick = async () => {
  if (el.btnRefresh.disabled) return;
  el.btnRefresh.disabled = true;
  el.btnRefresh.classList.add("spinning");
  el.status.textContent = "Validating";
  try {
    await invoke("validate_key");
    await refresh(true);
    el.status.textContent = "Updated";
  } catch {
    el.status.textContent = "Error";
  } finally {
    el.btnRefresh.disabled = false;
    el.btnRefresh.classList.remove("spinning");
    setTimeout(() => el.status.textContent = "Ready", 2000);
  }
};

el.btnCopy.onclick = async () => {
  if (!_validCache?.key) return;
  await navigator.clipboard.writeText(_validCache.key);
  const old = el.status.textContent;
  el.status.textContent = "Copied";
  setTimeout(() => el.status.textContent = old, 1500);
};

_win.listen("tauri://blur", () => _win.hide());
listen("popover:refresh", () => refresh(true));

refresh();
