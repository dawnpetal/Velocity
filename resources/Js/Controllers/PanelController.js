const panelController = (() => {
  function togglePanel() {
    const panel = document.getElementById("bottomPanel");
    const visible = panel.classList.toggle("visible");
    panel.classList.toggle("hidden", !visible);
    uiState.setPanelVisible(visible);
    eventBus.emit("ui:panel-toggled", {
      visible,
    });
  }
  function _setupPanelTabs() {
    document.querySelectorAll(".panel-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".panel-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const name = tab.dataset.panel;
        const consoleOut = document.getElementById("consoleOutput");
        const robloxOut = document.getElementById("robloxOutput");
        const rbxCtrl = document.getElementById("rbxControls");
        const stdCtrl = document.getElementById("stdControls");
        if (consoleOut)
          consoleOut.style.display = name === "console" ? "" : "none";
        if (robloxOut) {
          robloxOut.classList.toggle("panel-body--hidden", name !== "roblox");
          robloxOut.classList.toggle("selectable", name === "roblox");
        }
        if (rbxCtrl)
          rbxCtrl.classList.toggle(
            "panel-ctrl-group--hidden",
            name !== "roblox",
          );
        if (stdCtrl)
          stdCtrl.classList.toggle(
            "panel-ctrl-group--hidden",
            name !== "console",
          );
      });
    });
  }
  function _setupPanelControls() {
    document.getElementById("btnClosePanel")?.addEventListener("click", () => {
      const panel = document.getElementById("bottomPanel");
      panel.classList.remove("visible");
      panel.classList.add("hidden");
      uiState.setPanelVisible(false);
    });
    document
      .getElementById("btnClearConsole")
      ?.addEventListener("click", () => {
        const o = document.getElementById("consoleOutput");
        if (o) o.innerHTML = "";
      });
    document.getElementById("btnClearRoblox")?.addEventListener("click", () => {
      const o = document.getElementById("robloxOutput");
      if (o) o.innerHTML = "";
    });
    document
      .getElementById("btnRbxStart")
      ?.addEventListener("click", () => console_.startMonitoring());
    document.getElementById("btnRbxStop")?.addEventListener("click", () => {
      console_.stopMonitoring();
      console_.robloxLog("[Velocity] Monitoring stopped.", "warn");
    });
  }
  function _setupResizers() {
    _makeResizer({
      resizerEl: document.getElementById("sidebarResizer"),
      targetEl: document.querySelector(".sidebar"),
      axis: "x",
      prop: "width",
      min: 150,
      max: 480,
      compute: (clientX) => clientX - 46,
      onCommit: (val) => uiState.setSidebarWidth(val),
    });
    _makeResizer({
      resizerEl: document.getElementById("panelResizer"),
      targetEl: document.getElementById("bottomPanel"),
      axis: "y",
      prop: "height",
      min: 80,
      max: 500,
      compute: (clientY) =>
        document.querySelector(".app").getBoundingClientRect().height - clientY,
      onCommit: (val) => uiState.setSbBottomHeight(val),
    });
  }
  function _makeResizer({
    resizerEl,
    targetEl,
    axis,
    prop,
    min,
    max,
    compute,
    onCommit,
  }) {
    if (!resizerEl || !targetEl) return;
    let dragging = false;
    let lastVal = null;
    resizerEl.addEventListener("mousedown", (e) => {
      dragging = true;
      resizerEl.classList.add("dragging");
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      lastVal = Math.min(
        max,
        Math.max(min, compute(axis === "x" ? e.clientX : e.clientY)),
      );
      targetEl.style[prop] = lastVal + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      resizerEl.classList.remove("dragging");
      if (lastVal !== null) {
        onCommit(lastVal);
        lastVal = null;
      }
    });
  }
  function init() {
    _setupPanelTabs();
    _setupPanelControls();
    _setupResizers();
  }
  return {
    init,
    togglePanel,
  };
})();
