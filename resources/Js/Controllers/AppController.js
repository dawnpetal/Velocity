const appController = (() => {
  let _cloudInited = false;
  function _initBridge() {
    eventBus.on("ui:render-editor", () => editorController.renderEditor());
    eventBus.on("ui:refresh-tree", () => workspaceController.refreshTree());
    eventBus.on(
      "ui:open-file",
      ({ id } = {}) => id && editorController.openFile(id),
    );
    eventBus.on("ui:open-workspace", () =>
      workspaceController.openFolderDialog(),
    );
    eventBus.on(
      "ui:file-saved",
      ({ id } = {}) => id && editorController.onFileSaved(id),
    );
    eventBus.on("ui:activity-pulse", ({ view } = {}) => {
      const btn = document.querySelector(`.activity-btn[data-view="${view}"]`);
      if (!btn) return;
      btn.classList.remove("pulse");
      void btn.offsetWidth;
      btn.classList.add("pulse");
    });
  }
  function _setupTitlebar() {
    document
      .getElementById("btnExecute")
      ?.addEventListener("click", () => editorController.executeScript());
    const titlebar = document.getElementById("titlebar");
    if (titlebar) {
      titlebar.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest("button, input, select, a, [data-no-drag]"))
          return;
        window.__TAURI__.window.getCurrentWindow().startDragging();
      });
    }
  }
  const STANDARD_VIEWS = new Set(["explorer", "search"]);
  const EXCLUSIVE_PANELS = {
    cloud: "cloudView",
    autoexec: "autoexecView",
    pinboard: "pinboardView",
    settings: "settingsPanel",
  };
  function _setupActivityBar() {
    document.querySelectorAll(".activity-btn[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => _switchView(btn.dataset.view));
    });
    document.getElementById("btnNewFile")?.addEventListener("click", () => {
      if (!state.fileTree)
        return modal.alert(
          "No Workspace Open",
          "Open or import a folder first.",
        );
      ExplorerTree.startCreate(state.fileTree, "file");
    });
    document.getElementById("btnNewFolder")?.addEventListener("click", () => {
      if (!state.fileTree)
        return modal.alert(
          "No Workspace Open",
          "Open or import a folder first.",
        );
      ExplorerTree.startCreate(state.fileTree, "folder");
    });
    document
      .getElementById("btnOpenFolder")
      ?.addEventListener("click", () => workspaceController.openFolderDialog());
    document
      .getElementById("btnGuide")
      ?.addEventListener("click", () => guide.start());
    document
      .getElementById("btnRefreshTree")
      ?.addEventListener("click", () => workspaceController.refreshTree());
    document
      .getElementById("fileTree")
      ?.addEventListener("contextmenu", (e) => {
        if (
          e.target.closest(".tree-row") ||
          e.target.closest(".tree-root-header")
        )
          return;
        if (state.fileTree) ctxMenu.showEmpty(e, state.fileTree);
      });
  }
  function _switchView(view) {
    const prevView = document.querySelector(".activity-btn.active")?.dataset
      .view;
    document
      .querySelectorAll(".activity-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelector(`.activity-btn[data-view="${view}"]`)
      ?.classList.add("active");
    const isStandard = STANDARD_VIEWS.has(view) || !EXCLUSIVE_PANELS[view];
    const isExclusive = !!EXCLUSIVE_PANELS[view];
    const showMain = !isExclusive;
    document.getElementById("sidebar").style.display =
      showMain && isStandard ? "" : "none";
    document.querySelector(".editor-area").style.display = showMain
      ? ""
      : "none";
    const fabWrap = document.getElementById("fabWrap");
    if (fabWrap) fabWrap.style.display = showMain ? "" : "none";
    const sbBottom = document.getElementById("sidebarBottom");
    if (sbBottom) sbBottom.style.display = showMain && isStandard ? "" : "none";
    for (const [panelView, elId] of Object.entries(EXCLUSIVE_PANELS)) {
      const el = document.getElementById(elId);
      if (el) el.style.display = view === panelView ? "flex" : "none";
    }
    if (prevView === "autoexec" && view !== "autoexec") autoexec.hide();
    if (view === "autoexec") autoexec.show();
    if (view === "pinboard") pinboard.show();
    if (view === "cloud" && !_cloudInited) {
      cloud.init();
      _cloudInited = true;
    }
    if (view === "settings") {
      themeManager.renderGrid();
      iconThemeManager.renderList();
      _initSettingsNav();
      menuScriptsPanel.show();
      eventBus.emit("settings:opened");
    }
    if (isStandard) {
      document.getElementById("sidebarLabel").textContent =
        view.charAt(0).toUpperCase() + view.slice(1);
      document.getElementById("fileTree").style.display =
        view === "explorer" ? "" : "none";
      document.getElementById("searchView").style.display =
        view === "search" ? "flex" : "none";
      document.getElementById("sidebarHeaderActions").style.display =
        view === "explorer" ? "" : "none";
      if (view === "search") {
        search.run();
        document.getElementById("searchInput")?.focus();
      }
    }
    keyboardManager.setScope(view);
    eventBus.emit("ui:view-changed", {
      view,
    });
  }
  function _setupSettings() {
    document
      .getElementById("btnManageWorkspaces")
      ?.addEventListener("click", () => workspaceController.openFolderDialog());
    document
      .getElementById("btnResetDefault")
      ?.addEventListener("click", () => workspaceController.resetDefault());
    const fontSlider = document.getElementById("fontSizeSlider");
    const fontVal = document.getElementById("fontSizeVal");
    fontSlider?.addEventListener("input", () => {
      const size = parseInt(fontSlider.value);
      if (fontVal) fontVal.textContent = size;
      editor.updateSettings("fontSize", size);
      persist.saveUI().catch(() => {});
    });
    _toggle("wordWrapToggle", "wordWrap");
    _toggle("minimapToggle", "minimap");
    _toggle("lineNumToggle", "lineNumbers");
  }
  let _settingsNavInited = false;
  function _initSettingsNav() {
    const body = document.getElementById("spBody");
    const navItems = document.querySelectorAll(".sp-nav-item[data-section]");
    if (!body || !navItems.length) return;
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.getElementById(item.dataset.section);
        if (!target || !body) return;
        const bodyRect = body.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        body.scrollTop += targetRect.top - bodyRect.top - 12;
      });
    });
    if (_settingsNavInited) return;
    _settingsNavInited = true;
    const sections = [...document.querySelectorAll(".sp-section")];
    body.addEventListener(
      "scroll",
      () => {
        let active = sections[0]?.id;
        for (const sec of sections) {
          if (
            sec.getBoundingClientRect().top - body.getBoundingClientRect().top <
            60
          ) {
            active = sec.id;
          }
        }
        navItems.forEach((item) =>
          item.classList.toggle("active", item.dataset.section === active),
        );
      },
      {
        passive: true,
      },
    );
  }
  function _toggle(id, settingKey) {
    document.getElementById(id)?.addEventListener("change", function () {
      editor.updateSettings(settingKey, this.checked);
      persist.saveUI().catch(() => {});
    });
  }
  function _restoreUI(ui) {
    const sidebar = document.getElementById("sidebar");
    const sbBottom = document.getElementById("sidebarBottom");
    const panel = document.getElementById("bottomPanel");
    if (ui.sidebarWidth && sidebar)
      sidebar.style.width = ui.sidebarWidth + "px";
    if (sbBottom && ui.sbBottomHeight)
      sbBottom.style.height = ui.sbBottomHeight + "px";
    if (ui.panelVisible && panel) {
      panel.classList.add("visible");
      panel.classList.remove("hidden");
    }
    const { fontSize, wordWrap, minimap, lineNumbers, executor } =
      ui.settings ?? {};
    if (typeof executorSettings !== "undefined") {
      executorSettings.init(executor ?? "hydrogen");
    }
    const fontSlider = document.getElementById("fontSizeSlider");
    const fontVal = document.getElementById("fontSizeVal");
    if (fontSize != null && fontSlider) {
      fontSlider.value = fontSize;
      if (fontVal) fontVal.textContent = fontSize;
      editor.updateSettings("fontSize", fontSize);
    }
    _restoreToggle("wordWrapToggle", "wordWrap", wordWrap);
    _restoreToggle("minimapToggle", "minimap", minimap);
    _restoreToggle("lineNumToggle", "lineNumbers", lineNumbers);
    _switchView(ui.activeView ?? "explorer");
  }
  function _restoreToggle(id, key, value) {
    if (value == null) return;
    const el = document.getElementById(id);
    if (el) {
      el.checked = value;
      editor.updateSettings(key, value);
    }
  }
  function _setupGlobalShortcuts() {
    document.getElementById("tabStrip")?.addEventListener("mousedown", () => {
      const active = document.querySelector(".activity-btn.active");
      const view = active?.dataset.view ?? "explorer";
      keyboardManager.setScope(view);
    });
    document
      .getElementById("editorContainer")
      ?.addEventListener("mousedown", (e) => {
        if (e.target.closest(".monaco-editor")) return;
        const active = document.querySelector(".activity-btn.active");
        const view = active?.dataset.view ?? "explorer";
        keyboardManager.setScope(view);
      });
    document
      .getElementById("bottomPanel")
      ?.addEventListener("mousedown", () => {
        const active = document.querySelector(".activity-btn.active");
        const view = active?.dataset.view ?? "explorer";
        keyboardManager.setScope(view);
      });
    keyboardManager.registerShortcut({
      keys: "Cmd+Q",
      scope: ["global"],
      handler: async () => {
        await _shutdown();
        await window.__TAURI__.core.invoke("exit_app");
      },
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+S",
      scope: ["global"],
      allowInEditor: true,
      handler: async () => {
        const currentView = document.querySelector(".activity-btn.active")
          ?.dataset.view;
        if (currentView === "autoexec") return;
        if (currentView === "guide") return;
        const active = state.getActive();
        if (!active) return;
        if (pinboard.isSnippetFile(active.id)) {
          pinboard.handleEditorSave(active.id);
          state.markSaved(active.id);
          tabs.render();
          return;
        }
        if (active.path && !active.preview) {
          if (state.previewTabId === active.id) state.previewTabId = null;
          await fileManager.save(active.id);
          editorController.onFileSaved(active.id);
          tabs.render();
          toast.show("Saved", "ok", 1200);
        }
      },
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+W",
      scope: ["explorer", "search", "editor"],
      handler: () => {
        const id = state.activeFileId;
        if (id) tabs.closeTab(id);
      },
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+N",
      scope: ["explorer", "search", "editor"],
      handler: () => editorController.newUntitledFile(),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+Enter",
      scope: ["explorer", "search", "editor"],
      handler: () => editorController.executeScript(),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+`",
      scope: ["global"],
      handler: () => panelController.togglePanel(),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+Shift+F",
      scope: ["global"],
      handler: () => _switchView("search"),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+Shift+O",
      scope: ["global"],
      handler: () => workspaceController.openFolderDialog(),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+Shift+R",
      scope: ["global"],
      handler: () => workspaceController.refreshTree(),
    });
    keyboardManager.registerShortcut({
      keys: "Cmd+Shift+E",
      scope: ["global"],
      handler: () => _switchView("explorer"),
    });
  }
  function _setupFab() {
    const wrap = document.getElementById("fabWrap");
    const pill = document.getElementById("fabPill");
    const chevron = document.getElementById("fabChevron");
    if (!wrap || !pill || !chevron) return;
    let locked = false;
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      locked = !locked;
      pill.classList.toggle("open", locked);
      pill.classList.toggle("locked", locked);
      chevron.title = locked ? "Unlock" : "Lock open";
    });
    document.addEventListener("click", (e) => {
      if (!locked && !wrap.contains(e.target)) pill.classList.remove("open");
    });
    document.getElementById("fabOpenRoblox")?.addEventListener("click", (e) => {
      e.stopPropagation();
      window.__TAURI__.core.invoke("focus_roblox").catch(() => {});
    });
    document.getElementById("fabHistory")?.addEventListener("click", (e) => {
      e.stopPropagation();
      historyPanel.show();
    });
  }
  async function _shutdown() {
    await workspaceController.shutdown();
    await Promise.allSettled([
      menuBar.killAgent(),
      persist.saveUI(),
      persist.saveTreeState(state.workDir),
      persist.saveTimeline(state.workDir),
      persist.saveSession({
        folders: state.roots.map((r) => r.path),
      }),
    ]);
  }
  async function init() {
    const win = window.__TAURI__.window.getCurrentWindow();
    win.onCloseRequested(async (event) => {
      event.preventDefault();
      await _shutdown();
      await window.__TAURI__.core.invoke("exit_app");
    });
    window.__TAURI__.event.listen("watch-event", (event) =>
      workspaceController.onWatchEvent({
        detail: event.payload,
      }),
    );
    _initBridge();
    await paths.init();
    themeManager.load();
    _setupTitlebar();
    _setupActivityBar();
    keyboardManager.init();
    _setupGlobalShortcuts();
    _setupSettings();
    themeManager.renderGrid();
    search.init();
    timeline.init();
    panelController.init();
    await iconThemeManager.load();
    await helpers.loadIcons();
    ExplorerTree.init();
    await execHistory.load();
    await pinboard.init();
    const ui = await persist.loadUI();
    if (ui) {
      _restoreUI(ui);
    } else {
      if (typeof executorSettings !== "undefined")
        executorSettings.init("hydrogen");
      _switchView("explorer");
      persist.saveUI().catch(() => {});
    }
    await workspaceController.boot();
    _setupFab();
    multiInstanceUI.mount();
    menuScriptsPanel.mount();
    await menuBar.init();
  }
  return {
    init,
  };
})();
