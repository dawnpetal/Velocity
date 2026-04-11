const executorSettings = (() => {
  const VALID = new Set(["hydrogen", "opium"]);
  window.__velocityExecutor = "hydrogen";
  function getActive() {
    return window.__velocityExecutor ?? "hydrogen";
  }
  function setActive(value, save = true) {
    if (!VALID.has(value)) return;
    window.__velocityExecutor = value;
    const sel = document.getElementById("executorSelect");
    if (sel && sel.value !== value) sel.value = value;
    if (save) persist.saveUI().catch(() => {});
  }
  function init(savedExecutor) {
    const value = VALID.has(savedExecutor) ? savedExecutor : "hydrogen";
    window.__velocityExecutor = value;
    const row = document.getElementById("executorStatusRow");
    if (row) row.style.display = "none";
    const sel = document.getElementById("executorSelect");
    if (!sel) return;
    sel.value = value;
    sel.addEventListener("change", () => {
      setActive(sel.value);
      window.__TAURI__.core.invoke("clear_port_cache").catch(() => {});
      window.__TAURI__.event.emit("executor:changed", {}).catch(() => {});
      if (typeof autoexec !== "undefined") {
        autoexec.sync().catch(() => {});
      }
    });
  }
  return {
    init,
    getActive,
    setActive,
  };
})();
