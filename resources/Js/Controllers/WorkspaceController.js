const workspaceController = (() => {
  let _watcherId = null;
  let _watchDebounce = null;
  async function _startWatcher(dir) {
    if (!dir) return;
    if (_watcherId !== null) {
      try {
        await window.__TAURI__.core.invoke("unwatch_path", {
          id: _watcherId,
        });
      } catch {}
      _watcherId = null;
    }
    try {
      _watcherId = await window.__TAURI__.core.invoke("watch_path", {
        path: dir,
      });
    } catch {}
  }
  async function onWatchEvent(evt) {
    if (_watcherId === null || evt.detail.id !== _watcherId) return;
    const action = evt.detail.action;
    if (action !== "removed" && action !== "moved" && action !== "created")
      return;
    clearTimeout(_watchDebounce);
    _watchDebounce = setTimeout(async () => {
      if (action === "removed" || action === "moved") {
        for (const f of [...state.files]) {
          try {
            const stat = await window.__TAURI__.core.invoke("stat_path", {
              path: f.path,
            });
            if (!stat.exists) tabs.closeTab(f.id);
          } catch {
            tabs.closeTab(f.id);
          }
        }
      }
      await refreshTree();
    }, 300);
  }
  async function shutdown() {
    if (_watcherId !== null) {
      try {
        await window.__TAURI__.core.invoke("unwatch_path", {
          id: _watcherId,
        });
      } catch {}
      _watcherId = null;
    }
  }
  function _updateTitlebar() {
    const folderName = state.workDir ? helpers.basename(state.workDir) : null;
    const win = window.__TAURI__?.window?.getCurrentWindow();
    if (win) win.setTitle("Velocity" + (folderName ? " — " + folderName : ""));
    const el = document.getElementById("settingsWorkDir");
    if (el) el.textContent = state.workDir ?? "—";
  }
  async function openFolder(folderPath) {
    state.clear();
    state.workDir = folderPath;
    try {
      await fileManager.loadFolder(folderPath);
    } catch {
      toast.show(
        `Could not open folder: ${helpers.basename(folderPath)}`,
        "warn",
        3000,
      );
      state.workDir = null;
      ExplorerTree.render();
      return;
    }
    await _startWatcher(folderPath);
    const saved = await persist.loadTreeState(folderPath);
    if (saved?.openPaths?.length) {
      const openSet = new Set(saved.openPaths);
      const restore = (node) => {
        if (node?.type === "folder") {
          if (openSet.has(node.path)) node.open = true;
          node.children?.forEach(restore);
        }
      };
      state.roots.forEach(restore);
    }
    const activeMatch =
      saved?.activeFile && state.files.find((f) => f.path === saved.activeFile);
    state.setActive(activeMatch?.id ?? state.files[0]?.id ?? null);
    ExplorerTree.render();
    tabs.render();
    editorController.renderEditor();
    await persist.loadTimeline(folderPath);
    timeline.setFile(state.getActive() ?? null);
    await persist.saveSession({
      folders: [folderPath],
    });
    _updateTitlebar();
    eventBus.emit("workspace:loaded", {
      folderPath,
    });
  }
  async function boot() {
    const session = await persist.loadSession();
    const lastFolder = session?.folders?.[0];
    if (lastFolder) {
      try {
        const stat = await window.__TAURI__.core.invoke("stat_path", {
          path: lastFolder,
        });
        if (stat.exists) {
          await openFolder(lastFolder);
          return;
        }
      } catch {}
    }
    await resetDefault();
  }
  async function resetDefault() {
    const defaultFolder = paths.join(paths.velocityDir, "Default");
    try {
      await window.__TAURI__.core.invoke("create_dir", {
        path: defaultFolder,
      });
    } catch {}
    await openFolder(defaultFolder);
  }
  async function openFolderDialog() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke("show_folder_dialog", {
        title: "Open Folder",
      });
      if (!folderPath) return;
    } catch {
      return;
    }
    const name = helpers.basename(folderPath);
    if (!state.workDir) {
      await openFolder(folderPath);
      return;
    }
    const choice = await modal.ask(
      "Open Folder",
      `Open <strong>${helpers.escapeHtml(name)}</strong>`,
      ["Open", "Add to workspace", "Cancel"],
    );
    if (!choice || choice === "Cancel") return;
    if (choice === "Add to workspace") {
      try {
        await fileManager.loadFolder(folderPath);
        ExplorerTree.render();
        tabs.render();
        await persist.saveSession({
          folders: state.roots.map((r) => r.path),
        });
        toast.show(`Added "${name}"`, "ok", 2000);
      } catch (err) {
        toast.show(`Could not add folder: ${err.message ?? err}`, "fail", 3000);
      }
    } else {
      await openFolder(folderPath);
    }
  }
  async function addFolderToWorkspace() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke("show_folder_dialog", {
        title: "Add Folder to Workspace",
      });
      if (!folderPath) return;
    } catch {
      return;
    }
    try {
      await fileManager.loadFolder(folderPath);
      if (!state.workDir) state.workDir = folderPath;
      ExplorerTree.render();
      tabs.render();
      await persist.saveSession({
        folders: state.roots.map((r) => r.path),
      });
      toast.show(`Added "${helpers.basename(folderPath)}"`, "ok", 2000);
    } catch (err) {
      toast.show(`Could not add folder: ${err.message ?? err}`, "fail", 3000);
    }
  }
  async function refreshTree() {
    if (!state.workDir) return;
    await persist.saveTreeState(state.workDir);
    const activePath = state.getActive()?.path ?? null;
    const openPaths = new Set();
    const collectOpen = (node) => {
      if (node?.type === "folder" && node.open) {
        openPaths.add(node.path);
        node.children?.forEach(collectOpen);
      }
    };
    state.roots.forEach((r) => collectOpen(r));
    const rootPaths = state.roots.map((r) => r.path);
    state.clear();
    for (const p of rootPaths) {
      try {
        await fileManager.loadFolder(p);
      } catch {}
    }
    state.workDir = rootPaths[0] ?? null;
    const restoreOpen = (node) => {
      if (node?.type === "folder") {
        if (openPaths.has(node.path)) node.open = true;
        node.children?.forEach(restoreOpen);
      }
    };
    state.roots.forEach((r) => restoreOpen(r));
    if (activePath) {
      const match = state.files.find((f) => f.path === activePath);
      if (match) state.setActive(match.id);
    }
    ExplorerTree.render();
    tabs.render();
    editorController.renderEditor();
    eventBus.emit("tree:refreshed", {});
  }
  return {
    boot,
    openFolder,
    openFolderDialog,
    addFolderToWorkspace,
    resetDefault,
    refreshTree,
    onWatchEvent,
    shutdown,
  };
})();
