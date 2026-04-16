const editorController = (() => {
  function _syncStatus(file) {
    document.getElementById("statusFile").textContent = file?.name ?? "";
    const langEl = document.getElementById("statusLang");
    if (langEl)
      langEl.textContent = file
        ? helpers.ext(file.name).toUpperCase() || "Plain"
        : "";
  }
  function renderEditor() {
    editor.render();
    const active = state.getActive();
    _syncStatus(active);
    if (!active?.preview) timeline.setFile(active ?? null);
  }
  function openFile(id) {
    let fileId = id;
    if (!state.getFile(id)) {
      const match = state.files.find((f) => f.path === id);
      if (match) fileId = match.id;
    }
    state.setActive(fileId);
    tabs.render();
    renderEditor();
    ExplorerTree.render();
  }
  async function newUntitledFile() {
    if (!state.workDir) {
      modal.alert("No Folder Open", "Open a folder first.");
      return;
    }
    const result = await fileManager
      .createFile(state.workDir, `untitled_${Date.now()}.lua`)
      .catch(console.error);
    if (result) {
      state.setActive(result.id);
      await workspaceController.refreshTree();
    }
  }
  function onFileSaved(id) {
    const f = state.getFile(id);
    if (!f) return;
    const content = f.content ?? editor.getContent();
    timeline.recordSave(f.id, content, f.name);
    timeline.refreshSize();
    if (state.workDir) {
      persist.saveTimeline(state.workDir).catch(() => {});
      persist.saveTreeState(state.workDir).catch(() => {});
    }
  }
  function _setConnectionStatus(dotClass, text, connClass) {
    const dot = document.getElementById("statusDot");
    const connText = document.getElementById("statusConnText");
    const conn = document.getElementById("statusConnection");
    if (dot) dot.className = `status-dot ${dotClass}`;
    if (connText) connText.textContent = text;
    if (conn) conn.className = `status-item ${connClass}`;
  }
  async function _execScript(script, filename) {
    try {
      await injector.execute(script);
      const executor = window.__velocityExecutor ?? "hydrogen";
      let statusText = "ok";
      if (executor === "hydrogen") {
        const port = await injector.getPort();
        statusText = port ? `Port ${port}` : "ok";
      }
      _setConnectionStatus("ok", statusText, "ok");
      await execHistory.push(script, filename);
      eventBus.emit("script:executed", {
        filename,
      });
    } catch (err) {
      _setConnectionStatus("fail", "No server", "fail");
      injector.reset();
      const msg = err?.message || String(err);
      if (msg) console_.log(msg, "fail");
      if (msg) toast.show(msg, "fail", 3000);
      eventBus.emit("script:failed", {
        error: msg,
        filename,
      });
    }
  }
  async function executeScript() {
    const active = state.getActive();
    if (!active) {
      modal.alert("Nothing to Execute", "Open a file first.");
      return;
    }
    const miTargets = multiInstanceUI.getTargetsForRun?.();
    if (miTargets && miTargets.length) {
      const script = active.content || editor.getContent();
      try {
        const userIds = miTargets.map((t) => t.user_id);
        await multiInstance.sendScriptToMany(userIds, script);
        const n = miTargets.length;
        const label =
          n === 1
            ? miTargets[0].display_name || miTargets[0].username
            : `${n} instances`;
        toast.show(`Sent to ${label}`, "ok");
        await execHistory.push(script, active.name);
        eventBus.emit("script:executed", {
          userIds,
          filename: active.name,
        });
      } catch (err) {
        toast.show(err.message, "fail", 3000);
      }
      return;
    }
    const btn = document.getElementById("btnExecute");
    btn.disabled = true;
    try {
      _setConnectionStatus("warn connecting", "Scanning…", "warn");
      if (active.content === null) await fileManager.ensureContent(active.id);
      await _execScript(active.content || editor.getContent(), active.name);
    } finally {
      btn.disabled = false;
    }
  }
  async function rerunScript(item) {
    _setConnectionStatus("warn", "Scanning…", "warn");
    console_.log(`Re-running: ${item.filename}`, "info");
    await _execScript(item.script, item.filename);
  }
  return {
    renderEditor,
    openFile,
    newUntitledFile,
    onFileSaved,
    executeScript,
    rerunScript,
  };
})();
