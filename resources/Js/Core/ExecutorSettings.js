const executorSettings = (() => {
  function getActive() {
    return uiState.executor;
  }
  function setActive(value) {
    uiState.setExecutor(value);
    const sel = document.getElementById("executorSelect");
    if (sel && sel.value !== value) sel.value = value;
  }
  function init(savedExecutor) {
    uiState.setExecutor(savedExecutor ?? "opium");
    const row = document.getElementById("executorStatusRow");
    if (row) row.style.display = "none";
    const sel = document.getElementById("executorSelect");
    if (!sel) return;
    sel.value = uiState.executor;
    sel.addEventListener("change", () => {
      setActive(sel.value);
      window.__TAURI__.core.invoke("clear_port_cache").catch(() => {});
      window.__TAURI__.event.emit("executor:changed", {}).catch(() => {});
      if (typeof autoexec !== "undefined") {
        autoexec.onExecutorChanged().catch(() => {});
      }
    });
  }
  return {
    init,
    getActive,
    setActive,
  };
})();
