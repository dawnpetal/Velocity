const updateChecker = (() => {
  const invoke = window.__TAURI__.core.invoke;
  const CACHE_KEY = "velocity_update_cache";
  const CACHE_TTL = 4 * 60 * 60 * 1000;

  function _setStatus(msg, type) {
    const el = document.getElementById("aboutUpdateStatus");
    if (!el) return;
    el.textContent = msg;
    el.dataset.statusType = type || "";
  }

  function _readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.fetchedAt > CACHE_TTL) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function _writeCache(info) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...info, fetchedAt: Date.now() })
      );
    } catch {}
  }

  function _clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  async function _populateVersion() {
    try {
      const v = await invoke("get_app_version");
      const el = document.getElementById("aboutVersion");
      if (el) el.textContent = `v${v}`;
    } catch {}
  }

  function _applyInfo(info, showToast = false) {
    if (info.update_available) {
      _setStatus(`v${info.latest} available`, "update");
      if (showToast && typeof toast !== "undefined") {
        toast.show(`Update available: v${info.latest}`, "update", 10000, {
          label: "View release",
          action: () =>
            invoke("open_external", { url: info.release_url }).catch(() => {}),
        });
      }
    } else {
      _setStatus(`Up to date (v${info.current})`, "ok");
    }
  }

  async function _run(showFeedback = false) {
    if (showFeedback) _setStatus("Checking...", "loading");
    let info;
    try {
      info = await invoke("check_for_update");
    } catch {
      if (showFeedback) _setStatus("Could not reach update server", "error");
      return;
    }
    _writeCache(info);
    _applyInfo(info, true);
  }

  async function check() {
    await _populateVersion();
    const cached = _readCache();
    if (cached) {
      _applyInfo(cached, false);
      return;
    }
    await _run(false);
  }

  async function checkManual() {
    _clearCache();
    await _run(true);
  }

  const DISCORD_URL = "https://discord.gg/opiumware";

  eventBus.on("settings:opened", () => {
    _populateVersion();
    const cached = _readCache();
    if (cached) _applyInfo(cached);
    const btn = document.getElementById("btnCheckUpdate");
    if (btn && !btn._ucBound) {
      btn._ucBound = true;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await checkManual();
        btn.disabled = false;
      });
    }
    const discordBtn = document.getElementById("btnDiscord");
    if (discordBtn && !discordBtn._ucBound) {
      discordBtn._ucBound = true;
      discordBtn.addEventListener("click", () => {
        invoke("open_external", { url: DISCORD_URL }).catch(() => {});
      });
    }
  });

  return {
    check,
    checkManual,
  };
})();