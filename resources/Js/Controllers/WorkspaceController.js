const workspaceController = (() => {
  let _watcherId = null;
  let _watchSuppressUntil = 0;
  let _refreshing = false;
  let _deltaQueue = [];
  let _deltaTimer = null;

  function suppressWatcher(ms = 1200) {
    _watchSuppressUntil = Math.max(_watchSuppressUntil, Date.now() + ms);
  }

  async function _startWatcher(dir) {
    if (!dir) return;
    if (_watcherId !== null) {
      try {
        await window.__TAURI__.core.invoke('unwatch_path', { id: _watcherId });
      } catch {}
      _watcherId = null;
    }
    try {
      _watcherId = await window.__TAURI__.core.invoke('watch_path', { path: dir });
    } catch {}
  }

  function _nodeForPath(path) {
    let found = null;
    function walk(node) {
      if (found) return;
      if (node.path === path) {
        found = node;
        return;
      }
      for (const child of node.children ?? []) walk(child);
    }
    for (const root of state.roots) walk(root);
    return found;
  }

  async function _applyUpdate(path) {
    const node = _nodeForPath(path);
    if (!node) return;
    const file = state.findByPath(path);
    if (file && file.content !== null) {
      state.setContent(file.id, null);
      eventBus.emit('file:externalChange', { id: file.id, path });
    }
  }

  async function _flushDeltaQueue() {
    _deltaTimer = null;
    if (_deltaQueue.length === 0) return;
    const batch = _deltaQueue.splice(0);
    if (batch.some(({ action }) => action === 'created' || action === 'removed')) {
      await refreshTree();
      return;
    }
    for (const { action, path } of batch) {
      if (action === 'updated') await _applyUpdate(path);
    }
    ExplorerTree.render();
    tabs.render();
  }

  async function onWatchEvent(evt) {
    const payload = evt.detail;
    if (!payload) return;
    if (payload.id !== _watcherId) return;
    if (Date.now() < _watchSuppressUntil) return;

    const events = payload.events ?? [payload];
    for (const e of events) {
      if (!e.path) continue;
      if (autoexec.containsScript?.(e.path) || autoexec.isProtectedPath?.(e.path)) {
        autoexec.sync().catch(() => {});
      }
      _deltaQueue.push({ action: e.action, path: e.path });
    }

    clearTimeout(_deltaTimer);
    _deltaTimer = setTimeout(_flushDeltaQueue, 80);
  }

  async function shutdown() {
    if (_watcherId !== null) {
      try {
        await window.__TAURI__.core.invoke('unwatch_path', { id: _watcherId });
      } catch {}
      _watcherId = null;
    }
  }

  function _updateTitlebar() {
    const folderName = state.workDir ? helpers.basename(state.workDir) : null;
    const win = window.__TAURI__?.window?.getCurrentWindow();
    if (win) win.setTitle('VelocityUI' + (folderName ? ' — ' + folderName : ''));
    const el = document.getElementById('settingsWorkDir');
    if (el) el.textContent = state.workDir ?? '—';
  }

  async function openFolder(folderPath) {
    state.clear();
    state.workDir = folderPath;
    await autoexec.ensureWorkspaceFolder(folderPath);
    try {
      await fileManager.loadFolder(folderPath);
    } catch {
      toast.show(`Could not open folder: ${helpers.basename(folderPath)}`, 'warn', 3000);
      state.workDir = null;
      ExplorerTree.render();
      return;
    }
    _watchSuppressUntil = Date.now() + 2000;
    await _startWatcher(folderPath);
    const saved = await persist.loadTreeState(folderPath);
    if (saved?.openPaths?.length) {
      const openSet = new Set(saved.openPaths);
      const restore = (node) => {
        if (node?.type === 'folder') {
          if (openSet.has(node.path)) node.open = true;
          node.children?.forEach(restore);
        }
      };
      state.roots.forEach(restore);
    }
    const activeMatch = saved?.activeFile && state.findByPath(saved.activeFile);
    state.setActive(activeMatch?.id ?? state.files[0]?.id ?? null);
    ExplorerTree.render();
    tabs.render();
    editorController.renderEditor();
    await persist.loadTimeline(folderPath);
    timeline.setFile(state.getActive() ?? null);
    await persist.saveSession(folderPath);
    _updateTitlebar();
    eventBus.emit('workspace:loaded', { folderPath });
  }

  async function boot() {
    const session = await persist.loadSession();
    const lastFolder = session?.workDir ?? session?.lastFolder;
    if (lastFolder) {
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: lastFolder });
        if (stat.exists) {
          await openFolder(lastFolder);
          return;
        }
      } catch {}
    }
    await resetDefault();
  }

  async function resetDefault() {
    await openFolder(paths.defaultWorkspace);
  }

  async function openFolderDialog() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke('show_folder_dialog', {
        title: 'Open Folder',
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
      'Open Folder',
      `Open <strong>${helpers.escapeHtml(name)}</strong>`,
      ['Open', 'Add to workspace', 'Cancel'],
    );
    if (!choice || choice === 'Cancel') return;
    if (choice === 'Add to workspace') {
      try {
        await fileManager.loadFolder(folderPath);
        ExplorerTree.render();
        tabs.render();
        await persist.saveSession(state.workDir);
        toast.show(`Added "${name}"`, 'ok', 2000);
      } catch (err) {
        toast.show(`Could not add folder: ${err.message ?? err}`, 'fail', 3000);
      }
    } else {
      await openFolder(folderPath);
    }
  }

  async function addFolderToWorkspace() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke('show_folder_dialog', {
        title: 'Add Folder to Workspace',
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
      await persist.saveSession(state.workDir);
      toast.show(`Added "${helpers.basename(folderPath)}"`, 'ok', 2000);
    } catch (err) {
      toast.show(`Could not add folder: ${err.message ?? err}`, 'fail', 3000);
    }
  }

  async function refreshTree() {
    if (_refreshing || !state.workDir) return;
    _refreshing = true;
    try {
      await persist.saveTreeState(state.workDir);
      const activePath = state.getActive()?.path ?? null;
      const previewPath = state.previewTabId
        ? (state.getFile(state.previewTabId)?.path ?? null)
        : null;
      const openTabPaths = state.openTabIds.map((id) => state.getFile(id)?.path).filter(Boolean);
      const openPaths = new Set();
      const collectOpen = (node) => {
        if (node?.type === 'folder' && node.open) {
          openPaths.add(node.path);
          node.children?.forEach(collectOpen);
        }
      };
      state.roots.forEach((r) => collectOpen(r));
      const rootPaths = state.roots.map((r) => r.path);
      const timelineSnapshot = timeline.snapshotByPath();
      state.clear();
      for (const p of rootPaths) {
        try {
          await autoexec.ensureWorkspaceFolder(p);
          await fileManager.loadFolder(p);
        } catch {}
      }
      state.workDir = state.roots[0]?.path ?? null;
      timeline.restoreFromSnapshot(timelineSnapshot);
      const restoreOpen = (node) => {
        if (node?.type === 'folder') {
          if (openPaths.has(node.path)) node.open = true;
          node.children?.forEach(restoreOpen);
        }
      };
      state.roots.forEach((r) => restoreOpen(r));
      const restoredTabPaths = new Set(openTabPaths);
      if (activePath) restoredTabPaths.add(activePath);
      for (const path of restoredTabPaths) {
        const match = state.findByPath(path);
        if (match) {
          state.setActive(match.id, {
            keepTabs: true,
            permanent: path !== previewPath,
          });
        }
      }
      if (activePath) {
        const match = state.findByPath(activePath);
        if (match) {
          state.setActive(match.id, {
            keepTabs: true,
            permanent: activePath !== previewPath,
          });
        }
      }
      ExplorerTree.render();
      tabs.render();
      editorController.renderEditor();
      timeline.setFile(activePath ? state.findByPath(activePath) : null);
      eventBus.emit('tree:refreshed', {});
    } finally {
      _refreshing = false;
    }
  }

  return {
    boot,
    openFolder,
    openFolderDialog,
    addFolderToWorkspace,
    resetDefault,
    refreshTree,
    suppressWatcher,
    onWatchEvent,
    shutdown,
  };
})();
