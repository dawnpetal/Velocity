const dataTree = (() => {
  const STORE_FILE = 'datatrees_index.json';
  const LEGACY_STORE_FILE = 'datatrees.json';
  const SNAPSHOT_DIR = 'datatree-snapshots';
  const MAX_RENDER_ROWS = 720;
  const SNAPSHOT_LIMIT = 6;

  const _log = {
    info: (...args) => console.log('[DataTree]', ...args),
    warn: (...args) => console.warn('[DataTree]', ...args),
    error: (...args) => console.error('[DataTree]', ...args),
    fetch: (...args) => console.log('[DataTree/fetch]', ...args),
  };

  const state_ = {
    snapshots: [],
    activeSnapshotId: null,
    activeNodeId: null,
    expanded: new Set(),
    query: '',
    previewTab: 'viewport',
    visibleOverflow: 0,
    scroll: { tree: 0, details: 0 },
    meta: { orders: {}, icons: {}, iconHtml: new Map() },
    meshAssets: new Map(),
    sceneCache: new Map(),
    viewportCameras: new Map(),
    viewportBuild: { key: '', token: 0, status: 'idle', progress: 0, message: '' },
    viewportSummary: new Map(),
    meshVersion: 0,
    viewportAutoLoad: false,
    viewportClickSelect: false,
    importing: false,
    treeLoading: false,
    previewReady: false,
    importProgress: {
      progress: 0,
      message: 'Waiting for file',
      nodeCount: 0,
      bytesRead: 0,
      totalBytes: 0,
    },
  };
  let _inited = false;
  let _initPromise = null;
  let _searchTimer = null;
  let _saveTimer = null;
  let _previewWarmupTimer = null;
  let _activeRowEl = null;
  const ICON_ALIASES = {
    Instance: 'Class',
    NumberValue: 'Value',
    IntValue: 'Value',
    ObjectValue: 'Value',
    StringValue: 'Value',
    DoubleConstrainedValue: 'Value',
    RayValue: 'Value',
    Vector3Value: 'Value',
    HumanoidDescription: 'Class',
    PackageLink: 'LinkingService',
    WrapLayer: 'LayerCollector',
    WrapTarget: 'LayerCollector',
  };

  const _container = () => document.getElementById('dataTreeView');
  const _storePath = () => `${paths.internals}/${STORE_FILE}`;
  const _legacyStorePath = () => `${paths.internals}/${LEGACY_STORE_FILE}`;
  const _snapshotStoragePath = (id) => {
    const safeId = String(id || helpers.uid()).replace(/[^a-z0-9_-]/gi, '_');
    return `${paths.internals}/${SNAPSHOT_DIR}/${safeId}.json`;
  };
  const _escape = (value) => helpers.escapeHtml(String(value ?? ''));
  const _cssEscape = (value) =>
    window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
  const _fmtTime = (ts) => (ts ? new Date(ts).toLocaleString([], { hour12: false }) : 'Never');

  async function init() {
    if (_inited) return;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      await _loadMeta();
      await _load();
      _inited = true;
      render();
    })();
    return _initPromise;
  }

  async function _loadMeta() {
    _log.info('Loading icon manifest and explorer order');
    const [orders, icons] = await Promise.allSettled([
      fetch('Assets/RobloxExplorerOrder.json').then((res) => (res.ok ? res.json() : null)),
      fetch('Assets/RobloxStudioIconManifest.json').then((res) => (res.ok ? res.json() : null)),
    ]);
    const meta = orders.status === 'fulfilled' ? orders.value : null;
    state_.meta.orders = meta?.orders || {};
    state_.meta.icons = icons.status === 'fulfilled' ? icons.value || {} : {};
    state_.meta.iconHtml = new Map();
    _log.info(
      `Meta loaded: ${Object.keys(state_.meta.orders).length} orders, ${Object.keys(state_.meta.icons).length} icons`,
    );
  }

  async function _load() {
    try {
      _log.info('Loading saved DataTree state from disk');
      const raw = await window.__TAURI__.core.invoke('read_text_file', { path: _storePath() });
      const data = JSON.parse(raw);
      state_.snapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(
        0,
        SNAPSHOT_LIMIT,
      );
      state_.activeSnapshotId = data.activeSnapshotId ?? state_.snapshots[0]?.id ?? null;
      _log.info(`Loaded ${state_.snapshots.length} snapshot(s), active=${state_.activeSnapshotId}`);
    } catch (err) {
      await _loadLegacy();
    }
  }

  async function _loadLegacy() {
    try {
      const raw = await window.__TAURI__.core.invoke('read_text_file', {
        path: _legacyStorePath(),
      });
      const data = JSON.parse(raw);
      state_.snapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(
        0,
        SNAPSHOT_LIMIT,
      );
      for (const snapshot of state_.snapshots) await _persistLegacyPayload(snapshot);
      state_.activeSnapshotId = data.activeSnapshotId ?? state_.snapshots[0]?.id ?? null;
      const active = activeSnapshot();
      if (active?.nodes?.length) _hydrate(active);
      _restoreSnapshotState(active);
      _saveSoon();
      _log.warn(`Migrated legacy DataTree state with ${state_.snapshots.length} snapshot(s)`);
    } catch (err) {
      _log.warn(`No saved DataTree state (${err?.message}) — starting fresh`);
      state_.snapshots = [];
    }
  }

  async function _persistLegacyPayload(snapshot) {
    if (!snapshot?.nodes?.length || snapshot.storagePath) return;
    snapshot.id = snapshot.id || helpers.uid();
    snapshot.nodeCount = snapshot.nodeCount || snapshot.nodes.length;
    snapshot.storagePath = _snapshotStoragePath(snapshot.id);
    await window.__TAURI__.core.invoke('write_text_file', {
      path: snapshot.storagePath,
      content: JSON.stringify({
        ..._snapshotMeta(snapshot),
        rootId: snapshot.rootId || snapshot.nodes[0]?.id || null,
        nodes: snapshot.nodes,
      }),
    });
  }

  async function _ensureSnapshotLoaded(snapshot, { light = true } = {}) {
    if (!snapshot || snapshot.byId || snapshot.nodes?.length) {
      if (snapshot && !snapshot.byId) await _hydrateAsync(snapshot);
      return snapshot;
    }
    if (!snapshot.storagePath) return snapshot;
    const full = await window.__TAURI__.core.invoke('datatree_load_snapshot', {
      path: snapshot.storagePath,
      light,
    });
    snapshot.nodes = full.nodes || [];
    snapshot.nodeCount = full.nodeCount ?? snapshot.nodes.length;
    snapshot.rootId = snapshot.rootId || full.rootId || snapshot.nodes[0]?.id || null;
    snapshot.expandedIds = snapshot.expandedIds || full.expandedIds || [];
    snapshot.activeNodeId = snapshot.activeNodeId || full.activeNodeId || null;
    snapshot.sourcePath = snapshot.sourcePath || full.sourcePath || '';
    snapshot.sourceSize = snapshot.sourceSize || full.sourceSize || 0;
    snapshot.heavyLoaded = !light;
    await _hydrateAsync(snapshot);
    return snapshot;
  }

  async function _ensureHeavySnapshotLoaded(snapshot) {
    if (!snapshot?.storagePath || snapshot.heavyLoaded) return snapshot;
    const full = await window.__TAURI__.core.invoke('datatree_load_snapshot', {
      path: snapshot.storagePath,
      light: false,
    });
    const keepActive = snapshot.activeNodeId;
    const keepExpanded = snapshot.expandedIds;
    snapshot.nodes = full.nodes || [];
    snapshot.nodeCount = full.nodeCount ?? snapshot.nodes.length;
    snapshot.rootId = full.rootId || snapshot.rootId || snapshot.nodes[0]?.id || null;
    snapshot.expandedIds = keepExpanded || full.expandedIds || [];
    snapshot.activeNodeId = keepActive || full.activeNodeId || null;
    snapshot.sourcePath = full.sourcePath || snapshot.sourcePath || '';
    snapshot.sourceSize = full.sourceSize || snapshot.sourceSize || 0;
    snapshot.heavyLoaded = true;
    await _hydrateAsync(snapshot);
    return snapshot;
  }

  async function _loadRenderSnapshot(snapshot, node) {
    if (!snapshot?.storagePath || !node?.id) return snapshot;
    const renderSnapshot = await window.__TAURI__.core.invoke('datatree_render_snapshot', {
      path: snapshot.storagePath,
      rootId: node.id,
    });
    renderSnapshot.id = `${snapshot.id}:render:${node.id}`;
    renderSnapshot.sourcePath = snapshot.sourcePath || renderSnapshot.sourcePath || '';
    renderSnapshot.sourceSize = snapshot.sourceSize || renderSnapshot.sourceSize || 0;
    renderSnapshot.heavyLoaded = true;
    await _hydrateAsync(renderSnapshot, { chunkMs: 4 });
    return renderSnapshot;
  }

  function _loadActiveSnapshotForView() {
    const snapshot = activeSnapshot();
    if (!snapshot?.storagePath || snapshot.byId || snapshot.nodes?.length || state_.treeLoading)
      return;
    state_.treeLoading = true;
    state_.previewReady = false;
    render();
    _ensureSnapshotLoaded(snapshot, { light: true })
      .then(() => {
        _restoreSnapshotState(snapshot);
        state_.previewTab = 'raw';
      })
      .catch((err) => toast.show(err?.message || 'DataTree failed to load', 'fail', 3200))
      .finally(() => {
        state_.treeLoading = false;
        render();
        _schedulePreviewWarmup();
      });
  }

  function _schedulePreviewWarmup() {
    clearTimeout(_previewWarmupTimer);
    if (!activeSnapshot()?.byId) return;
    _previewWarmupTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          state_.previewReady = true;
          _replace('.dt-preview-pane', _previewPane());
        });
      });
    }, 80);
  }

  function _saveSoon() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => _save().catch(() => {}), 220);
  }

  async function _save() {
    _log.info(`Saving ${state_.snapshots.length} snapshot(s) to disk`);
    await window.__TAURI__.core.invoke('write_text_file', {
      path: _storePath(),
      content: JSON.stringify({
        activeSnapshotId: state_.activeSnapshotId,
        snapshots: state_.snapshots.map(_snapshotMeta),
      }),
    });
  }

  function show() {
    if (!_inited) {
      const root = _container();
      if (root) root.replaceChildren(_shellSkeleton('Preparing DataTree'));
      init()
        .then(() => requestAnimationFrame(_loadActiveSnapshotForView))
        .catch((err) => toast.show(err?.message || 'DataTree failed to load', 'fail', 3200));
      return;
    }
    render();
    requestAnimationFrame(_loadActiveSnapshotForView);
    if (activeSnapshot()?.byId && !state_.previewReady) _schedulePreviewWarmup();
  }

  function hide() {
    clearTimeout(_previewWarmupTimer);
    state_.previewReady = false;
    const root = _container();
    if (root) {
      _rememberScroll(root);
      _disposeViewports(root);
      root.innerHTML = '';
    }
    _releaseHeavyRenderState({ unloadSnapshots: false });
  }

  async function openImportDialog() {
    await init();
    _container()?.querySelector('[data-action="import"]')?.click();
  }

  async function importRbxlx(file) {
    if (state_.importing) return;
    _log.info('Importing RBXLX via native Tauri parser');
    const importId = helpers.uid();
    state_.importing = true;
    state_.importProgress = {
      importId,
      progress: 0.02,
      message: 'Waiting for file selection',
      nodeCount: 0,
      bytesRead: 0,
      totalBytes: 0,
    };
    render();
    const unlisten = await window.__TAURI__?.event
      ?.listen?.('datatree-import-progress', (event) => {
        const payload = event?.payload || {};
        if (payload.importId !== importId) return;
        state_.importProgress = {
          importId,
          progress: Math.max(0.02, Math.min(1, Number(payload.progress) || 0.02)),
          message: payload.message || 'Importing RBXLX',
          nodeCount: Number(payload.nodeCount) || 0,
          bytesRead: Number(payload.bytesRead) || 0,
          totalBytes: Number(payload.totalBytes) || 0,
        };
        _paintImportProgress();
      })
      .catch?.(() => null);
    try {
      const snapshot = await window.__TAURI__.core.invoke('datatree_import_dialog', { importId });
      if (!snapshot) return;
      await _hydrateAsync(snapshot);
      state_.snapshots.unshift(snapshot);
      state_.snapshots = state_.snapshots.slice(0, SNAPSHOT_LIMIT);
      await _activateSnapshot(snapshot.id);
      await _save();
      _log.info(`Import complete: ${snapshot.nodeCount} instances, id=${snapshot.id}`);
      toast.show(`Imported ${snapshot.nodeCount.toLocaleString()} instances`, 'ok', 2200);
    } catch (err) {
      _log.error(`Import failed: ${err?.message}`);
      toast.show(err?.message || 'RBXLX import failed', 'fail', 3600);
    } finally {
      if (typeof unlisten === 'function') unlisten();
      state_.importing = false;
      render();
      _schedulePreviewWarmup();
    }
  }

  function activeSnapshot() {
    return (
      state_.snapshots.find((snapshot) => snapshot.id === state_.activeSnapshotId) ||
      state_.snapshots[0] ||
      null
    );
  }

  async function _activateSnapshot(id) {
    const snapshot = state_.snapshots.find((item) => item.id === id) || state_.snapshots[0] || null;
    _log.info(
      `Activating snapshot id=${snapshot?.id} name="${snapshot?.name}" nodes=${snapshot?.nodeCount}`,
    );
    state_.activeSnapshotId = snapshot?.id ?? null;
    state_.previewReady = false;
    state_.previewTab = 'raw';
    state_.sceneCache.clear();
    if (snapshot?.byId || snapshot?.nodes?.length) _restoreSnapshotState(snapshot);
    else {
      state_.activeNodeId = snapshot?.activeNodeId || snapshot?.rootId || null;
      state_.expanded = new Set((snapshot?.expandedIds || []).filter(Boolean));
    }
  }

  function _restoreSnapshotState(snapshot) {
    state_.activeNodeId =
      snapshot?.activeNodeId || snapshot?.rootId || snapshot?.nodes?.[0]?.id || null;
    state_.expanded = new Set(
      snapshot?.expandedIds?.length ? snapshot.expandedIds : [state_.activeNodeId].filter(Boolean),
    );
  }

  function _persistSnapshotState(snapshot = activeSnapshot()) {
    if (!snapshot) return;
    snapshot.activeNodeId = state_.activeNodeId;
    snapshot.expandedIds = [...state_.expanded];
    _saveSoon();
  }

  function _hydrate(snapshot) {
    const byId = new Map();
    const children = new Map();
    for (const node of snapshot.nodes || []) {
      byId.set(node.id, node);
      delete node.path;
      node.searchText =
        node.searchText || `${node.name || ''} ${node.className || ''}`.toLowerCase();
      const parentId = node.parentId ?? 0;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
    }
    for (const list of children.values()) list.sort(_nodeSort);
    snapshot.byId = byId;
    snapshot.children = children;
    delete snapshot.searchIndex;
    snapshot.rootId = children.get(0)?.[0]?.id ?? snapshot.nodes?.[0]?.id ?? null;
    snapshot.nodeCount = snapshot.nodes?.length || 0;
    _ensureDepths(snapshot);
  }

  async function _hydrateAsync(snapshot, { chunkMs = 5 } = {}) {
    const byId = new Map();
    const children = new Map();
    const nodes = snapshot.nodes || [];
    let sliceStart = performance.now();
    for (const node of nodes) {
      byId.set(node.id, node);
      delete node.path;
      node.searchText =
        node.searchText || `${node.name || ''} ${node.className || ''}`.toLowerCase();
      const parentId = node.parentId ?? 0;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
      if (performance.now() - sliceStart >= chunkMs) {
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
    let sorted = 0;
    sliceStart = performance.now();
    for (const list of children.values()) {
      list.sort(_nodeSort);
      sorted += list.length;
      if (sorted > 1400 || performance.now() - sliceStart >= chunkMs) {
        sorted = 0;
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
    snapshot.byId = byId;
    snapshot.children = children;
    delete snapshot.searchIndex;
    snapshot.rootId = children.get(0)?.[0]?.id ?? snapshot.nodes?.[0]?.id ?? null;
    snapshot.nodeCount = nodes.length || 0;
    await _ensureDepthsAsync(snapshot, chunkMs);
  }

  function _ensureDepths(snapshot) {
    const stack = (snapshot.children.get(0) || []).map((node) => [node, 0]);
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (node.depth == null) node.depth = depth;
      const nextDepth = Number(node.depth) + 1;
      const kids = snapshot.children.get(node.id) || [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], nextDepth]);
    }
  }

  async function _ensureDepthsAsync(snapshot, chunkMs = 5) {
    const stack = (snapshot.children.get(0) || []).map((node) => [node, 0]);
    let sliceStart = performance.now();
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (node.depth == null) node.depth = depth;
      const nextDepth = Number(node.depth) + 1;
      const kids = snapshot.children.get(node.id) || [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], nextDepth]);
      if (performance.now() - sliceStart >= chunkMs) {
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
  }

  function _nodeSort(a, b) {
    const ao = state_.meta.orders[a.className] ?? 9999;
    const bo = state_.meta.orders[b.className] ?? 9999;
    if (ao !== bo) return ao - bo;
    const an = String(a.name || '');
    const bn = String(b.name || '');
    if (an !== bn) return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
    return String(a.className || '').localeCompare(String(b.className || ''));
  }

  function _snapshotMeta(snapshot) {
    return {
      id: snapshot.id,
      name: snapshot.name,
      source: snapshot.source,
      capturedAt: snapshot.capturedAt,
      completedAt: snapshot.completedAt,
      nodeCount: snapshot.nodeCount,
      status: snapshot.status,
      rootId: snapshot.rootId || null,
      expandedIds: snapshot.expandedIds || [],
      activeNodeId: snapshot.activeNodeId || null,
      storagePath: snapshot.storagePath || '',
      sourcePath: snapshot.sourcePath || '',
      sourceSize: snapshot.sourceSize || 0,
    };
  }

  function render() {
    const root = _container();
    if (!root) return;
    _rememberScroll(root);
    _disposeViewports(root);
    root.innerHTML = '';
    root.appendChild(_view());
    _restoreScroll(root);
  }

  function _shellSkeleton(message = 'Loading DataTree') {
    const shell = document.createElement('div');
    shell.className = 'dt-shell';
    shell.innerHTML = `<header class="dt-topbar"><div class="dt-title-block"><h2>DataTree</h2><p>RBXLX Explorer</p></div><div class="dt-actions"><button class="dt-btn dt-btn-primary" disabled>Import RBXLX</button></div></header><div class="dt-content"><section class="dt-side dt-side--loading"><main class="dt-tree-pane"><div class="dt-tree-toolbar"><div><span class="dt-tree-title">Data Model Explorer</span><small>${_escape(message)}</small></div><label class="dt-search"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><input placeholder="Search" disabled></label></div><div class="dt-tree-list"><div class="dt-stage-card"><span class="dt-stage-pill">Explorer first</span><strong>Loading saved imports</strong><p>The side tree and inspector are loading before the preview wakes up.</p><div class="dt-stage-line"><span></span></div></div></div></main><aside class="dt-details"><div class="dt-empty">Inspector will appear after the tree loads.</div></aside></section><main class="dt-preview-pane"><div class="dt-preview-empty dt-preview-empty--deferred"><span>${_escape(message)}</span><p>Preview is intentionally asleep while the explorer becomes interactive.</p></div></main></div>`;
    return shell;
  }

  function _rememberScroll(root) {
    state_.scroll.tree = root.querySelector('.dt-tree-list')?.scrollTop ?? state_.scroll.tree;
    state_.scroll.details = root.querySelector('.dt-details')?.scrollTop ?? state_.scroll.details;
  }

  function _restoreScroll(root) {
    requestAnimationFrame(() => {
      const tree = root.querySelector('.dt-tree-list');
      const details = root.querySelector('.dt-details');
      if (tree) tree.scrollTop = state_.scroll.tree || 0;
      if (details) details.scrollTop = state_.scroll.details || 0;
    });
  }

  function _view() {
    const shell = document.createElement('div');
    shell.className = `dt-shell${state_.importing ? ' is-importing' : ''}`;
    shell.append(_topbar(), _content());
    if (state_.importing) shell.appendChild(_importOverlay());
    return shell;
  }

  function _topbar() {
    const bar = document.createElement('header');
    bar.className = 'dt-topbar';
    const snapshot = activeSnapshot();
    const busy = state_.importing;
    bar.setAttribute('aria-busy', String(busy));
    bar.innerHTML = `<div class="dt-title-block"><h2>DataTree</h2><p>${busy ? 'Importing RBXLX' : 'RBXLX Explorer'}</p></div><div class="dt-actions"><select class="dt-snapshot-select" aria-label="Saved DataTrees"${busy ? ' disabled' : ''}>${state_.snapshots.map((item) => `<option value="${_escape(item.id)}"${item.id === state_.activeSnapshotId ? ' selected' : ''}>${_escape(item.name || 'Untitled DataTree')}</option>`).join('') || '<option>No imports</option>'}</select><button class="dt-icon-action" type="button" data-action="delete" title="Delete import"${busy ? ' disabled' : ''}>Delete</button><button class="dt-btn dt-btn-primary" data-action="import"${busy ? ' disabled' : ''}>${busy ? 'Importing RBXLX' : 'Import RBXLX'}</button></div>`;
    const select = bar.querySelector('.dt-snapshot-select');
    select?.addEventListener('change', async () => {
      if (state_.importing) return;
      await _activateSnapshot(select.value);
      _saveSoon();
      render();
      requestAnimationFrame(_loadActiveSnapshotForView);
    });
    bar.querySelector('[data-action="delete"]')?.addEventListener('click', deleteSnapshot);
    bar.querySelector('[data-action="import"]')?.addEventListener('click', () => importRbxlx());
    if (!snapshot) {
      bar.querySelector('[data-action="delete"]')?.setAttribute('disabled', '');
    }
    return bar;
  }

  function _importOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'dt-busy-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    const pct = Math.round(
      Math.max(0.02, Math.min(1, state_.importProgress.progress || 0.02)) * 100,
    );
    const count = state_.importProgress.nodeCount
      ? `${state_.importProgress.nodeCount.toLocaleString()} instances`
      : 'Preparing parser';
    overlay.innerHTML = `<div class="dt-busy-card"><span class="dt-busy-spinner"></span><strong>Importing RBXLX</strong><p class="dt-import-message">${_escape(state_.importProgress.message || 'Parsing and indexing in Tauri.')}</p><div class="dt-progress-track dt-import-progress"><span style="width:${pct}%"></span></div><small class="dt-import-meta">${pct}% · ${_escape(count)}</small></div>`;
    return overlay;
  }

  function _paintImportProgress() {
    const pct = Math.round(
      Math.max(0.02, Math.min(1, state_.importProgress.progress || 0.02)) * 100,
    );
    const message = _container()?.querySelector('.dt-import-message');
    const bar = _container()?.querySelector('.dt-import-progress span');
    const meta = _container()?.querySelector('.dt-import-meta');
    if (message) message.textContent = state_.importProgress.message || 'Importing RBXLX';
    if (bar) bar.style.width = `${pct}%`;
    if (meta) {
      const count = state_.importProgress.nodeCount
        ? `${state_.importProgress.nodeCount.toLocaleString()} instances`
        : 'Preparing parser';
      meta.textContent = `${pct}% · ${count}`;
    }
  }

  function _content() {
    const wrap = document.createElement('div');
    wrap.className = 'dt-content';
    const side = document.createElement('section');
    side.className = `dt-side${state_.treeLoading ? ' dt-side--loading' : ''}`;
    side.append(_treePane(), _detailsPane());
    wrap.append(side, state_.previewReady ? _previewPane() : _previewDormantPane());
    return wrap;
  }

  function renameSnapshot() {
    const snapshot = activeSnapshot();
    if (!snapshot) return;
    const name = window.prompt('Rename DataTree', snapshot.name || 'Untitled DataTree')?.trim();
    if (!name || name === snapshot.name) return;
    snapshot.name = name;
    _saveSoon();
    render();
  }

  async function deleteSnapshot() {
    const snapshot = activeSnapshot();
    if (!snapshot || state_.importing) return;
    const ok = await (modal.confirmInApp || modal.confirm)(
      'Delete DataTree',
      `Delete <strong>${_escape(snapshot.name || 'Untitled DataTree')}</strong>? This removes the saved snapshot file.`,
    );
    if (!ok) return;
    _releaseSnapshotPayload(snapshot, snapshot.id === state_.activeSnapshotId);
    _releaseHeavyRenderState({ unloadSnapshots: false });
    state_.snapshots = state_.snapshots.filter((item) => item.id !== snapshot.id);
    if (snapshot.storagePath)
      window.__TAURI__.core.invoke('remove_path', { path: snapshot.storagePath }).catch(() => {});
    await _activateSnapshot(state_.snapshots[0]?.id ?? null);
    _saveSoon();
    render();
  }

  function _treePane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('main');
    pane.className = 'dt-tree-pane';
    const loading = Boolean(snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length);
    const status = loading
      ? state_.treeLoading
        ? 'Loading explorer tree...'
        : 'Queued for explorer load'
      : snapshot
        ? `${snapshot.nodeCount.toLocaleString()} instances · ${_fmtTime(snapshot.completedAt || snapshot.capturedAt)}`
        : 'Import an RBXLX or RBXMX file';
    pane.innerHTML = `<div class="dt-tree-toolbar"><div><span class="dt-tree-title">Data Model Explorer</span><small>${_escape(status)}</small></div><label class="dt-search"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><input placeholder="Search" value="${_escape(state_.query)}" spellcheck="false"></label></div><div class="dt-tree-list"></div>`;
    const input = pane.querySelector('input');
    input?.addEventListener('input', () => {
      state_.query = input.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => _refreshTreeList(), 140);
    });
    _renderTreeList(pane.querySelector('.dt-tree-list'), snapshot);
    return pane;
  }

  function _renderTreeList(list, snapshot) {
    if (!list) return;
    _activeRowEl = null;
    list.replaceChildren();
    if (!snapshot) {
      list.innerHTML =
        '<div class="dt-empty">Import a saved place file to inspect its hierarchy.</div>';
      return;
    }
    if (!snapshot.byId && !snapshot.nodes?.length) {
      list.innerHTML = '<div class="dt-empty">Loading explorer tree...</div>';
      return;
    }
    const rows = _visibleRows(snapshot);
    if (!rows.length) {
      list.innerHTML = '<div class="dt-empty">No matching instances.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(_treeRow(snapshot, row.node, row.depth));
    if (state_.visibleOverflow > 0) fragment.appendChild(_overflowRow());
    list.appendChild(fragment);
  }

  function _refreshTreeList(snapshot = activeSnapshot()) {
    const list = _container()?.querySelector('.dt-tree-list');
    if (!list) return;
    const top = list.scrollTop;
    _renderTreeList(list, snapshot);
    list.scrollTop = top;
  }

  function _visibleRows(snapshot) {
    const query = state_.query.trim().toLowerCase();
    const rows = [];
    let total = 0;
    if (query) {
      for (const node of snapshot.nodes || []) {
        if (!_nodeMatches(node, query)) continue;
        total += 1;
        if (rows.length < MAX_RENDER_ROWS) rows.push({ node, depth: _depth(snapshot, node) });
      }
      state_.visibleOverflow = Math.max(0, total - rows.length);
      return rows;
    }
    const walk = (parentId, depth) => {
      for (const node of snapshot.children.get(parentId) || []) {
        total += 1;
        if (rows.length < MAX_RENDER_ROWS) rows.push({ node, depth });
        if (rows.length >= MAX_RENDER_ROWS) continue;
        if (state_.expanded.has(node.id)) walk(node.id, depth + 1);
      }
    };
    walk(0, 0);
    state_.visibleOverflow = Math.max(0, total - rows.length);
    return rows;
  }

  function _nodeMatches(node, query) {
    return (node.searchText || '').includes(query);
  }

  function _overflowRow() {
    const row = document.createElement('div');
    row.className = 'dt-overflow-row';
    row.textContent = `${state_.visibleOverflow.toLocaleString()} more instances hidden. Refine search or collapse branches.`;
    return row;
  }

  function _nodePath(snapshot, node) {
    const names = [];
    let current = node;
    while (current && names.length < 160) {
      names.unshift(String(current.name || current.className || 'Instance'));
      current = current.parentId ? snapshot?.byId?.get(current.parentId) : null;
    }
    return names.join('.');
  }

  function _depth(snapshot, node) {
    if (Number.isFinite(node?.depth)) return Number(node.depth);
    let depth = 0;
    let current = node;
    while (current?.parentId && snapshot.byId.has(current.parentId) && depth < 128) {
      depth += 1;
      current = snapshot.byId.get(current.parentId);
    }
    return depth;
  }

  function _treeRow(snapshot, node, depth) {
    const hasChildren = (snapshot.children.get(node.id) || []).length > 0;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `dt-tree-row${node.id === state_.activeNodeId ? ' active' : ''}`;
    row.dataset.nodeId = String(node.id);
    row.dataset.depth = String(depth);
    row.style.setProperty('--depth', depth);
    row.innerHTML = `<span class="dt-disclosure${state_.expanded.has(node.id) ? ' open' : ''}${hasChildren ? '' : ' empty'}">›</span>${_iconMarkup(_classIcon(node.className))}<span class="dt-node-name">${_escape(node.name)}</span><span class="dt-node-class">${_escape(node.className)}</span>`;
    if (node.id === state_.activeNodeId) _activeRowEl = row;
    row.addEventListener('click', () => _selectNode(node.id, row));
    row.querySelector('.dt-disclosure')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!hasChildren) return;
      _toggleNodeInPlace(snapshot, node, depth, row);
    });
    return row;
  }

  function _selectNode(id, rowEl = null) {
    if (state_.activeNodeId === id) return;
    state_.activeNodeId = id;
    const snapshot = activeSnapshot();
    const node = snapshot?.byId?.get(id);
    _log.info(`Selected node id=${id} class=${node?.className} name="${node?.name}"`);
    if (node) state_.previewTab = state_.previewReady ? _preferredPreviewTab(node) : 'raw';
    _cancelViewportBuild();
    if (snapshot) snapshot.activeNodeId = id;
    _activeRowEl?.classList.remove('active');
    _activeRowEl =
      rowEl || _container()?.querySelector(`.dt-tree-row[data-node-id="${String(id)}"]`) || null;
    _activeRowEl?.classList.add('active');
    if (state_.previewReady) _replace('.dt-preview-pane', _previewPane());
    _replace('.dt-details', _detailsPane());
    if (!state_.previewReady) _schedulePreviewWarmup();
    _saveSoon();
  }

  function _replace(selector, node) {
    const current = _container()?.querySelector(selector);
    if (!current) return;
    _disposeViewports(current);
    current.replaceWith(node);
  }

  function _disposeViewports(scope) {
    scope?.querySelectorAll?.('.dt-viewport-canvas').forEach((canvas) => canvas.__dtDispose?.());
  }

  function _releaseHeavyRenderState({ unloadSnapshots = false } = {}) {
    const activeBuildScene = state_.viewportBuild.scene;
    _cancelViewportBuild();
    for (const scene of state_.sceneCache.values()) _releaseSceneCpuMesh(scene);
    _releaseSceneCpuMesh(activeBuildScene);
    state_.sceneCache.clear();
    state_.meshAssets.clear();
    state_.viewportCameras.clear();
    state_.viewportSummary.clear();
    state_.meshVersion += 1;
    state_.viewportAutoLoad = false;
    state_.viewportClickSelect = false;
    state_.visibleOverflow = 0;
    for (const snapshot of state_.snapshots) _stripHeavySnapshotValues(snapshot);
    if (!unloadSnapshots) return;
    const activeId = state_.activeSnapshotId;
    for (const snapshot of state_.snapshots)
      _releaseSnapshotPayload(snapshot, snapshot.id === activeId);
  }

  function _isHeavySnapshotKey(key = '') {
    return /mesh|texture|content|image|asset|physics|serialized|modelmesh|sound|animation|template/i.test(
      String(key || ''),
    );
  }

  function _stripHeavySnapshotValues(snapshot) {
    if (!snapshot?.nodes?.length) return;
    let stripped = false;
    for (const node of snapshot.nodes) {
      for (const bag of [node.properties, node.attributes]) {
        for (const [key, value] of Object.entries(bag || {})) {
          if (
            typeof value === 'string' &&
            value.length > 512 &&
            (_isHeavySnapshotKey(key) || bag === node.attributes)
          ) {
            bag[key] = `__dt_heavy__:${value.length} bytes preserved in native snapshot`;
            stripped = true;
          }
        }
      }
    }
    if (stripped) {
      snapshot.heavyLoaded = false;
    }
  }

  function _releaseSnapshotPayload(snapshot, persistState = false) {
    if (!snapshot?.storagePath) return;
    if (persistState) _persistSnapshotState(snapshot);
    delete snapshot.nodes;
    delete snapshot.byId;
    delete snapshot.children;
    delete snapshot.searchIndex;
  }

  function _toggleNode(id) {
    if (state_.expanded.has(id)) state_.expanded.delete(id);
    else state_.expanded.add(id);
  }

  function _toggleNodeInPlace(snapshot, node, depth, row) {
    const wasOpen = state_.expanded.has(node.id);
    _toggleNode(node.id);
    _persistSnapshotState(snapshot);
    if (state_.query.trim() || state_.visibleOverflow > 0) {
      _refreshTreeList(snapshot);
      return;
    }
    row.querySelector('.dt-disclosure')?.classList.toggle('open', !wasOpen);
    if (wasOpen) {
      _removeRenderedChildren(row, depth);
      return;
    }
    const rows = _descendantRows(snapshot, node.id, depth + 1);
    const currentRows = _container()?.querySelectorAll('.dt-tree-row').length || 0;
    if (currentRows + rows.length > MAX_RENDER_ROWS) {
      _refreshTreeList(snapshot);
      return;
    }
    row.after(...rows.map((item) => _treeRow(snapshot, item.node, item.depth)));
  }

  function _removeRenderedChildren(row, depth) {
    let next = row.nextElementSibling;
    while (next?.classList?.contains('dt-tree-row') && Number(next.dataset.depth || 0) > depth) {
      const current = next;
      next = next.nextElementSibling;
      current.remove();
    }
  }

  function _descendantRows(snapshot, parentId, depth) {
    const rows = [];
    const walk = (id, rowDepth) => {
      for (const child of snapshot.children.get(id) || []) {
        rows.push({ node: child, depth: rowDepth });
        if (rows.length >= MAX_RENDER_ROWS) return;
        if (state_.expanded.has(child.id)) walk(child.id, rowDepth + 1);
        if (rows.length >= MAX_RENDER_ROWS) return;
      }
    };
    walk(parentId, depth);
    return rows;
  }

  function _classIcon(className = '') {
    const klass = String(className || 'Instance');
    const key = _iconKey(klass);
    return {
      glyph: klass.slice(0, 1).toUpperCase() || 'I',
      src: key ? state_.meta.icons[key] : '',
    };
  }

  function _iconKey(klass) {
    const icons = state_.meta.icons || {};
    if (icons[klass]) return klass;
    const alias = ICON_ALIASES[klass];
    if (alias && icons[alias]) return alias;
    if (/module/i.test(klass) && icons.ModuleScript) return 'ModuleScript';
    if (/localscript/i.test(klass) && icons.LocalScript) return 'LocalScript';
    if (/script/i.test(klass) && icons.Script) return 'Script';
    if (/value$/i.test(klass) && icons.Value) return 'Value';
    if (/folder|configuration/i.test(klass) && icons.Folder) return 'Folder';
    if (/model|accessory|character/i.test(klass) && icons.Model) return 'Model';
    if (/mesh/i.test(klass) && icons.MeshPart) return 'MeshPart';
    if (/part|seat|spawn|wedge|union/i.test(klass) && icons.Part) return 'Part';
    if (/texture/i.test(klass) && icons.Texture) return 'Texture';
    if (/decal/i.test(klass) && icons.Decal) return 'Decal';
    if (/sound|audio/i.test(klass) && icons.Sound) return 'Sound';
    if (/image/i.test(klass) && icons.ImageLabel) return 'ImageLabel';
    if (/gui|frame|button|label/i.test(klass) && icons.Frame) return 'Frame';
    return icons.Class ? 'Class' : '';
  }

  function _iconMarkup(icon, className = 'dt-node-icon') {
    const key = `${className}|${icon.src || ''}|${icon.glyph || ''}`;
    const cached = state_.meta.iconHtml.get(key);
    if (cached) return cached;
    const html = icon.src
      ? `<span class="${className} has-icon" data-glyph="${_escape(icon.glyph)}"><img src="${_escape(icon.src)}" alt="" loading="lazy" decoding="async" draggable="false"></span>`
      : `<span class="${className} missing" data-glyph="${_escape(icon.glyph)}"></span>`;
    state_.meta.iconHtml.set(key, html);
    return html;
  }

  function _previewPane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('main');
    pane.className = 'dt-preview-pane';
    if (snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length) {
      pane.innerHTML =
        '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Preview paused</span><p>Explorer and inspector are loading before preview work starts.</p></div>';
      return pane;
    }
    const node =
      snapshot?.byId?.get(state_.activeNodeId) ||
      (snapshot?.rootId ? snapshot.byId.get(snapshot.rootId) : null);
    if (!snapshot || !node) {
      pane.innerHTML =
        '<div class="dt-preview-empty"><span>No DataTree Loaded</span><p>Import an RBXLX or RBXMX file to inspect its hierarchy.</p></div>';
      return pane;
    }
    if (!state_.previewReady) {
      pane.innerHTML =
        '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Explorer first</span><p>Select instances freely. Raw inspection wakes up after the side tree paints.</p></div>';
      return pane;
    }
    const previewKind = _previewKind(node);
    const tabs = _previewTabs(node, previewKind);
    if (!tabs.includes(state_.previewTab))
      state_.previewTab = _preferredPreviewTab(node, previewKind);
    pane.innerHTML = `<div class="dt-preview-head"><div><span>${_escape(node.name)}</span><small>${_escape(node.className)} · ${_escape(_nodePath(snapshot, node))}</small></div><strong>${_escape(previewKind.label)}</strong></div><div class="dt-preview-tools">${tabs.map((tab) => `<button class="${state_.previewTab === tab ? 'active' : ''}" type="button" data-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div><div class="dt-preview-body"></div>`;
    pane.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state_.previewTab = button.dataset.tab || 'viewport';
        _replace('.dt-preview-pane', _previewPane());
      });
    });
    pane.querySelector('.dt-preview-body')?.append(_previewPanel(node, previewKind));
    return pane;
  }

  function _previewDormantPane() {
    const pane = document.createElement('main');
    pane.className = 'dt-preview-pane dt-preview-pane--dormant';
    pane.innerHTML =
      '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Explorer first</span><p>The 3D viewport is idle. Select instances; raw inspection will wake after the side tree is ready.</p></div>';
    return pane;
  }

  function _previewPanel(node, previewKind) {
    if (state_.previewTab === 'script') return _scriptPanel(node);
    if (state_.previewTab === 'asset') return _assetPanel(node);
    if (state_.previewTab === 'raw') return _rawPanel(node);
    return _viewportPanel(node, previewKind);
  }

  function _viewportPanel(node, previewKind) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--viewport';
    const snapshot = activeSnapshot();
    if (!state_.viewportAutoLoad) {
      const summaryKey = _viewportSummaryKey(snapshot, node);
      const summary = state_.viewportSummary.get(summaryKey);
      const summaryText = summary
        ? `${summary.parts.toLocaleString()} renderable instances · ${summary.assets.toLocaleString()} external mesh IDs · built only when requested.`
        : '3D stays completely idle until you press Load 3D.';
      wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--prompt"><div class="dt-render-grid"></div><div class="dt-preview-copy"><span>Load 3D preview?</span><p data-summary-key="${_escape(summaryKey)}">${_escape(summaryText)}</p><div class="dt-render-actions"><button type="button" class="dt-btn dt-btn-primary" data-action="load-viewport">Load 3D</button><button type="button" class="dt-icon-action" data-action="skip-viewport">Stay light</button></div></div></section>`;
      wrap.querySelector('[data-action="load-viewport"]')?.addEventListener('click', () => {
        state_.viewportAutoLoad = true;
        _replace('.dt-preview-pane', _previewPane());
      });
      wrap.querySelector('[data-action="skip-viewport"]')?.addEventListener('click', () => {
        state_.previewTab = 'raw';
        _replace('.dt-preview-pane', _previewPane());
      });
      return wrap;
    }
    const buildKey = _viewportBuildKey(snapshot, node);
    const job = state_.viewportBuild.key === buildKey ? state_.viewportBuild : null;
    const scene = job?.status === 'ready' ? job.scene : state_.sceneCache.get(buildKey);
    if (!scene) {
      const activeJob = job || {
        progress: 0.02,
        message: 'Preparing 3D preview',
        startedAt: performance.now(),
      };
      wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--loading"><div class="dt-render-grid"></div>${_viewportProgressMarkup(activeJob, buildKey)}</section>`;
      requestAnimationFrame(() => _ensureViewportBuild(snapshot, node, buildKey));
      return wrap;
    }
    if (!(scene.partCount || scene.parts.length) || !scene.mesh.vertexCount) {
      wrap.innerHTML = `<section class="dt-render-frame"><div class="dt-render-grid"></div><div class="dt-preview-copy"><span>${_escape(previewKind.title)}</span><p>${_escape(previewKind.body)}</p></div></section>`;
      return wrap;
    }
    const assetStats = scene.assetCount
      ? `<span>${scene.assetReady.toLocaleString()}/${scene.assetCount.toLocaleString()} embedded meshes</span>${scene.assetFailed ? `<span>${scene.assetFailed.toLocaleString()} unavailable</span>` : ''}`
      : '';
    const omittedStats = scene.omittedParts
      ? `<span>${scene.omittedParts.toLocaleString()} deferred</span>`
      : '';
    const assetProgress = _viewportProgressMarkup(job || state_.viewportBuild, buildKey, 'asset');
    const skyStyle = `--dt-sky-top:${scene.sky?.cssTop || 'rgb(24 28 34)'};--dt-sky-bottom:${scene.sky?.cssBottom || 'rgb(12 14 18)'}`;
    wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--canvas" style="${skyStyle}"><canvas class="dt-viewport-canvas" data-build-key="${_escape(buildKey)}" aria-label="3D preview"></canvas><div class="dt-render-stats" data-render-stats="${_escape(buildKey)}"><span>${(scene.partCount || scene.parts.length).toLocaleString()} parts</span><span>${scene.mesh.triangleCount.toLocaleString()} tris</span>${assetStats}${omittedStats}</div>${assetProgress}<div class="dt-render-hint">Drag/right-drag look · WASD fly · Q/E up/down · Shift fast · Scroll forward · F focus · Dbl-click reset<button type="button" class="dt-click-select-toggle${state_.viewportClickSelect ? ' active' : ''}" title="Click parts in viewport to select them in the tree">Click Select</button></div></section>`;
    wrap.querySelector('.dt-click-select-toggle')?.addEventListener('click', () => {
      state_.viewportClickSelect = !state_.viewportClickSelect;
      wrap
        .querySelector('.dt-click-select-toggle')
        ?.classList.toggle('active', state_.viewportClickSelect);
    });
    requestAnimationFrame(() => {
      _mountViewport(
        wrap.querySelector('.dt-viewport-canvas'),
        scene,
        _viewportCameraKey(snapshot, node),
      );
      _loadViewportAssets(scene.assets, node.id, buildKey);
      _releaseSceneCpuMesh(scene);
      state_.sceneCache.delete(buildKey);
      if (state_.viewportBuild.scene === scene) state_.viewportBuild.scene = null;
    });
    return wrap;
  }

  function _viewportCameraKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}`;
  }

  function _defaultViewportCamera(scene) {
    const d = Math.max(3, scene.extent * 2.2);

    const yaw = -0.72;
    const pitch = 0.38;
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    return {
      x: scene.center[0] + sy * cp * d,
      y: scene.center[1] - sp * d + scene.extent * 0.1,
      z: scene.center[2] + cy * cp * d,
      yaw: yaw + Math.PI,
      pitch: -pitch,
      distance: d,
      panX: 0,
      panY: 0,
    };
  }

  function _saveViewportCamera(key, camera) {
    if (!key || !camera) return;
    state_.viewportCameras.set(key, {
      x: camera.x,
      y: camera.y,
      z: camera.z,
      yaw: camera.yaw,
      pitch: camera.pitch,
      distance: camera.distance,
      panX: camera.panX,
      panY: camera.panY,
    });
    while (state_.viewportCameras.size > 32)
      state_.viewportCameras.delete(state_.viewportCameras.keys().next().value);
  }

  const _yieldFrame = () =>
    new Promise((resolve) => {
      if (window.requestIdleCallback) window.requestIdleCallback(() => resolve(), { timeout: 50 });
      else if (window.requestAnimationFrame) window.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });

  function _viewportBuildKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}:${state_.meshVersion}`;
  }

  function _viewportSummaryKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}`;
  }

  function _activeViewportBuildKey() {
    return _viewportBuildKey(activeSnapshot(), activeSnapshot()?.byId?.get(state_.activeNodeId));
  }

  function _cancelViewportBuild() {
    state_.viewportBuild.token = (state_.viewportBuild.token || 0) + 1;
    state_.viewportBuild.status = 'idle';
    state_.viewportBuild.key = '';
    state_.viewportBuild.scene = null;
    state_.viewportBuild.renderSnapshot = null;
    state_.viewportBuild.renderNodeId = null;
  }

  function _updateViewportBuild(key, patch) {
    if (state_.viewportBuild.key !== key) return;
    Object.assign(state_.viewportBuild, patch);
    _paintViewportProgress(key);
  }

  function _etaText(startedAt, progress) {
    if (!startedAt || progress <= 0.03 || progress >= 0.98) return 'Estimating time...';
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, (elapsed / progress) * (1 - progress));
    if (remaining < 1000) return 'Almost done';
    return `About ${Math.ceil(remaining / 1000)}s remaining`;
  }

  function _viewportProgressMarkup(job, key, mode = 'block') {
    const progress = Math.max(0.02, Math.min(1, job?.progress || 0.02));
    const pct = Math.round(progress * 100);
    const message = job?.message || 'Preparing 3D preview';
    const cls = `dt-viewport-loading${mode === 'asset' ? ' dt-viewport-loading--asset' : ''}`;
    const hidden = mode === 'asset' && job?.status !== 'assets' ? ' hidden' : '';
    return `<div class="${cls}" data-build-key="${_escape(key)}"${hidden}><strong>${_escape(message)}</strong><p>${_escape(_etaText(job?.startedAt, progress))}</p><div class="dt-progress-track"><span style="width:${pct}%"></span></div><small>${pct}%</small></div>`;
  }

  function _paintViewportProgress(key) {
    const job = state_.viewportBuild;
    if (job.key !== key) return;
    const el = _container()?.querySelector(
      `.dt-viewport-loading[data-build-key="${_cssEscape(key)}"]`,
    );
    if (!el) return;
    const progress = Math.max(0.02, Math.min(1, job.progress || 0.02));
    const pct = Math.round(progress * 100);
    const strong = el.querySelector('strong');
    const p = el.querySelector('p');
    const bar = el.querySelector('.dt-progress-track span');
    const small = el.querySelector('small');
    if (strong) strong.textContent = job.message || 'Preparing 3D preview';
    if (p) p.textContent = _etaText(job.startedAt, progress);
    if (bar) bar.style.width = `${pct}%`;
    if (small) small.textContent = `${pct}%`;
    el.hidden = job.status !== 'assets' && el.classList.contains('dt-viewport-loading--asset');
  }

  async function _ensureViewportSummary(snapshot, node, key) {
    if (!snapshot || !node || state_.viewportSummary.has(key)) return;
    const token = state_.viewportBuild.token;
    let parts = 0;
    let assets = 0;
    let processed = 0;
    const stack = [node];
    while (stack.length) {
      if (token !== state_.viewportBuild.token) return;
      const start = performance.now();
      while (stack.length && performance.now() - start < 7) {
        const current = stack.pop();
        processed += 1;
        const children = snapshot.children.get(current.id) || [];
        if (_isRenderablePart(current.className)) {
          parts += 1;
          const mesh = _meshDescriptor(current, _meshChildFor(children));
          if (mesh?.id && !mesh.embedded) assets += 1;
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      await _yieldFrame();
    }
    state_.viewportSummary.set(key, { parts, assets, processed });
    const el = _container()?.querySelector(`[data-summary-key="${_cssEscape(key)}"]`);
    if (el) {
      el.textContent = `${parts.toLocaleString()} renderable instances · ${assets.toLocaleString()} external mesh IDs · built only when requested.`;
    }
  }

  function _ensureViewportBuild(snapshot, node, key) {
    if (!snapshot || !node) return;
    const current = state_.viewportBuild;
    if (current.key === key && (current.status === 'scanning' || current.status === 'building')) {
      return;
    }
    const cached = state_.sceneCache.get(key);
    if (cached) {
      state_.viewportBuild = {
        key,
        token: current.token,
        status: 'ready',
        progress: 1,
        message: '3D preview ready',
        startedAt: performance.now(),
        scene: cached,
      };
      return;
    }
    const token = (current.token || 0) + 1;
    state_.viewportBuild = {
      key,
      token,
      status: 'scanning',
      progress: 0.02,
      message: 'Scanning geometry',
      startedAt: performance.now(),
      scene: null,
      renderSnapshot: null,
      renderNodeId: node.id,
    };
    _buildViewportSceneProgressive(snapshot, node, key, token).catch((err) => {
      if (state_.viewportBuild.key !== key || state_.viewportBuild.token !== token) return;
      _updateViewportBuild(key, {
        status: 'error',
        progress: 1,
        message: err?.message || '3D preview failed',
      });
    });
  }

  async function _buildViewportSceneProgressive(snapshot, node, key, token) {
    let renderSnapshot = snapshot;
    let renderNode = node;
    if (snapshot.storagePath) {
      _updateViewportBuild(key, {
        status: 'scanning',
        progress: 0.03,
        message: 'Loading renderable geometry',
      });
      renderSnapshot = await _loadRenderSnapshot(snapshot, node);
      renderNode = renderSnapshot.byId?.get(node.id) || renderNode;
      if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== key) {
        return;
      }
    }
    state_.viewportBuild.renderSnapshot = renderSnapshot;
    state_.viewportBuild.renderNodeId = renderNode.id;
    const parts = [];
    const stack = [renderNode];
    let scanned = 0;
    while (stack.length) {
      if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== key) return;
      const sliceStart = performance.now();
      while (stack.length && performance.now() - sliceStart < 8) {
        const current = stack.pop();
        scanned += 1;
        const children = renderSnapshot.children.get(current.id) || [];
        if (/^terrain$/i.test(String(current.className || ''))) {
          const terrainParts = _terrainToParts(current);
          for (const tp of terrainParts) parts.push(tp);
        } else if (_isRenderablePart(current.className)) {
          const part = _nodePart(current, _meshChildFor(children));
          if (part) parts.push(part);
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      _updateViewportBuild(key, {
        status: 'scanning',
        progress: Math.min(
          0.22,
          0.02 + (scanned / Math.max(renderSnapshot.nodeCount || 1, 1)) * 0.22,
        ),
        message: `Scanning geometry · ${parts.length.toLocaleString()} renderables`,
      });
      await _yieldFrame();
    }

    _updateViewportBuild(key, {
      status: 'building',
      progress: 0.25,
      message: `Building preview · ${parts.length.toLocaleString()} renderables`,
    });
    const scene = await _buildSceneProgressive(parts, key, token, renderSnapshot);
    if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== key) return;
    state_.sceneCache.set(key, scene);
    _trimSceneCache();
    _updateViewportBuild(key, {
      status: 'ready',
      progress: 1,
      message: '3D preview ready',
      scene,
    });
    if (
      activeSnapshot()?.id === snapshot.id &&
      state_.activeNodeId === node.id &&
      state_.previewTab === 'viewport'
    ) {
      _replace('.dt-preview-pane', _previewPane());
    }
  }

  async function _buildSceneProgressive(parts, key, token, snapshot = null) {
    if (!parts.length) return { ..._emptyScene(), sky: _sceneSky(snapshot) };
    const budget = _sceneBudget(parts.length);
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = _pointCollector();
    const assetMap = new Map();
    const aabbs = [];
    let assetReady = 0;
    let assetFailed = 0;
    let omittedParts = 0;
    for (let i = 0; i < parts.length; i += 1) {
      if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== key)
        return _emptyScene();
      if (mesh.vertexCount() >= budget.maxVertices) {
        omittedParts = parts.length - i;
        break;
      }
      const part = parts[i];
      const assetKey = _meshAssetKey(part.mesh);
      if (assetKey) {
        assetMap.set(assetKey, part.mesh);
        const cached = state_.meshAssets.get(assetKey);
        if (cached?.status === 'ready') assetReady += 1;
        if (cached?.status === 'failed') assetFailed += 1;
      }

      mesh.setFlag(part.matFlag || 0);
      const before = points.length;
      points.beginPart();
      _emitPart(part, mesh, points, budget);

      if (points.length > before && part.id) {
        aabbs.push({ partId: part.id, ...points.endPart() });
      } else {
        points.endPart();
      }

      if (i % 96 === 0) {
        _updateViewportBuild(key, {
          status: 'building',
          progress: 0.25 + (i / Math.max(parts.length, 1)) * 0.65,
          message: `Building preview · ${i.toLocaleString()}/${parts.length.toLocaleString()} parts`,
        });
        await _yieldFrame();
      }
    }
    if (!points.length)
      return {
        ..._emptyScene(),
        partCount: parts.length,
        assets: [...assetMap.values()],
        assetCount: assetMap.size,
        assetReady,
        assetFailed,
        omittedParts,
        aabbs,
        sky: _sceneSky(snapshot),
      };
    const bounds = _bounds(points);
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts: [],
      partCount: parts.length,
      assets: [...assetMap.values()],
      assetCount: assetMap.size,
      assetReady,
      assetFailed,
      omittedParts,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
      aabbs,
      sky: _sceneSky(snapshot),
    };
  }

  function _viewportScene(snapshot, node) {
    if (!snapshot || !node) return _emptyScene();
    const parts = _collectRenderableParts(snapshot, node);
    const signature = parts
      .map((part) => _meshAssetKey(part.mesh))
      .filter(Boolean)
      .sort()
      .map((key) => `${key}:${state_.meshAssets.get(key)?.status || 'new'}`)
      .join('|');
    const key = `${snapshot.id}:${node.id}:${parts.length}:${signature}`;
    const cached = state_.sceneCache.get(key);
    if (cached) {
      _log.info(`Scene cache hit: ${parts.length} parts`);
      return cached;
    }
    _log.info(
      `Building scene for node id=${node.id} class=${node.className}: ${parts.length} parts`,
    );
    const scene = _buildScene(parts);
    _log.info(
      `Scene built: ${scene.mesh.vertexCount} verts, ${scene.mesh.triangleCount} tris, ${scene.assetCount} asset(s) (${scene.assetReady} ready, ${scene.assetFailed} failed), ${scene.omittedParts} deferred`,
    );
    state_.sceneCache.set(key, scene);
    _trimSceneCache();
    return scene;
  }

  function _viewportSummary(snapshot, node) {
    if (!snapshot || !node) return { parts: 0, assets: 0 };
    let parts = 0;
    let assets = 0;
    const stack = [node];
    while (stack.length) {
      const current = stack.pop();
      const children = snapshot.children.get(current.id) || [];
      if (_isRenderablePart(current.className)) {
        parts += 1;
        const mesh = _meshDescriptor(current, _meshChildFor(children));
        if (mesh?.id && !mesh.embedded) assets += 1;
      }
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    return { parts, assets };
  }

  function _collectRenderableParts(snapshot, node) {
    const parts = [];
    const stack = [node];
    while (stack.length) {
      const current = stack.pop();
      const children = snapshot.children.get(current.id) || [];
      if (/^terrain$/i.test(String(current.className || ''))) {
        const terrainParts = _terrainToParts(current);
        for (const tp of terrainParts) parts.push(tp);
      } else if (_isRenderablePart(current.className)) {
        const part = _nodePart(current, _meshChildFor(children));
        if (part) parts.push(part);
      }
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    return parts;
  }

  function _trimSceneCache() {
    while (state_.sceneCache.size > 1) {
      const key = state_.sceneCache.keys().next().value;
      _releaseSceneCpuMesh(state_.sceneCache.get(key));
      state_.sceneCache.delete(key);
    }
    let vertices = [...state_.sceneCache.values()].reduce(
      (sum, scene) => sum + (scene.mesh?.vertexCount || 0),
      0,
    );
    while (vertices > 2400000 && state_.sceneCache.size > 1) {
      const key = state_.sceneCache.keys().next().value;
      const scene = state_.sceneCache.get(key);
      vertices -= scene?.mesh?.vertexCount || 0;
      _releaseSceneCpuMesh(scene);
      state_.sceneCache.delete(key);
    }
  }

  function _releaseSceneCpuMesh(scene) {
    if (!scene) return;
    for (const mesh of [scene.mesh, scene.guide]) {
      if (!mesh) continue;
      mesh.positions = new Float32Array(0);
      mesh.normals = new Float32Array(0);
      mesh.colors = new Float32Array(0);
      mesh.flags = new Float32Array(0);
    }
    scene.parts = [];
  }

  function _emptyScene() {
    return {
      parts: [],
      assets: [],
      assetCount: 0,
      assetReady: 0,
      assetFailed: 0,
      omittedParts: 0,
      mesh: { vertexCount: 0, triangleCount: 0 },
      guide: { vertexCount: 0 },
      center: [0, 0, 0],
      extent: 1,
      aabbs: [],
      sky: _sceneSky(activeSnapshot()),
    };
  }

  function _sceneSky(snapshot) {
    const nodes = snapshot?.nodes || [];
    const lighting = nodes.find((node) =>
      /^lighting$/i.test(String(node.className || node.name || '')),
    );
    const atmosphere = nodes.find((node) =>
      /^atmosphere$/i.test(String(node.className || node.name || '')),
    );
    const props = lighting?.properties || {};
    const atmoProps = atmosphere?.properties || {};
    const ambient = _parseColor(_firstProp(props, ['OutdoorAmbient', 'Ambient', 'ColorShift_Top']));
    const fog = _parseColor(_firstProp(props, ['FogColor', 'Color']));
    const decay = _parseColor(_firstProp(atmoProps, ['Decay', 'Color']));
    const density = Math.max(0, Math.min(1, Number(_firstProp(atmoProps, ['Density'])) || 0.2));
    const brightness = Math.max(
      0.35,
      Math.min(1.35, Number(_firstProp(props, ['Brightness'])) || 1),
    );
    const top = _mixRgb(_boostRgb(ambient, brightness), decay, density * 0.35);
    const bottom = _mixRgb(_boostRgb(fog, brightness * 0.88), top, 0.28);
    return {
      top,
      bottom,
      cssTop: _rgbCss(top),
      cssBottom: _rgbCss(bottom),
    };
  }

  function _mixRgb(a, b, t) {
    const weight = Math.max(0, Math.min(1, t));
    return [0, 1, 2].map((index) => Math.round(a[index] * (1 - weight) + b[index] * weight));
  }

  function _boostRgb(rgb, amount) {
    return rgb.map((item) => Math.max(0, Math.min(255, Math.round(item * amount))));
  }

  function _rgbCss(rgb) {
    return `rgb(${rgb.map((item) => Math.max(0, Math.min(255, Math.round(item)))).join(' ')})`;
  }

  function _isRenderablePart(className = '') {
    return /^(part|meshpart|unionoperation|intersectoperation|negateoperation|wedgepart|cornerwedgepart|trusspart|seat|vehicleseat|spawnlocation|terrain)$/i.test(
      String(className || ''),
    );
  }

  const _TERRAIN_COLORS = {
    0: [106, 127, 63],
    1: [106, 127, 63],
    2: [198, 176, 133],
    3: [102, 92, 78],
    4: [132, 123, 110],
    5: [141, 154, 158],
    6: [130, 160, 130],
    7: [106, 127, 63],
    8: [214, 210, 205],
    9: [160, 140, 110],
    10: [140, 82, 43],
    11: [161, 154, 147],
    12: [192, 172, 135],
    13: [100, 80, 60],
    14: [120, 143, 165],
    15: [248, 244, 230],
    16: [210, 210, 210],
    17: [120, 85, 50],
    18: [128, 128, 128],
    19: [200, 200, 210],
    20: [170, 95, 40],
    21: [110, 110, 110],
    22: [90, 75, 60],
    23: [240, 235, 225],
    24: [200, 155, 80],
  };

  function _terrainToParts(terrainNode) {
    const props = terrainNode.properties || {};

    const cells = _decodeTerrainGrid(props.SmoothGrid || props.Voxels || '');
    if (!cells.length) {
      return _terrainFallbackSlab(props);
    }
    const parts = [];
    const CELL = 4;
    for (const cell of cells) {
      if (cell.material === 0 || cell.occupancy < 0.12) continue;
      const color = _TERRAIN_COLORS[cell.material] || [130, 120, 100];

      const fill = Math.max(0.15, Math.min(1.0, cell.occupancy));
      const sizeY = CELL * fill;
      parts.push({
        id: terrainNode.id,
        className: 'Terrain',
        shape: 'box',
        center: [cell.x * CELL + CELL / 2, cell.y * CELL + sizeY / 2, cell.z * CELL + CELL / 2],
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        size: [CELL, sizeY, CELL],
        color,
        alpha: cell.material === 14 ? 0.62 : 1.0,
        mesh: { id: '', embedded: null },
        matFlag: 0,
        isTerrain: true,
      });
    }
    return parts;
  }

  function _decodeTerrainGrid(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const text = raw.trim();

    let bytes;
    try {
      const b64 = text.replace(/^.*?,/, '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 10) return [];
      bytes = _base64ToBytes(b64);
    } catch {
      return [];
    }
    if (bytes.length < 6) return [];
    const xSize = bytes[0] | (bytes[1] << 8);
    const ySize = bytes[2] | (bytes[3] << 8);
    const zSize = bytes[4] | (bytes[5] << 8);
    if (!xSize || !ySize || !zSize) return [];
    const expectedBytes = 6 + xSize * ySize * zSize * 3;
    if (bytes.length < expectedBytes) return [];
    const cells = [];
    let offset = 6;
    for (let y = 0; y < ySize; y++) {
      for (let z = 0; z < zSize; z++) {
        for (let x = 0; x < xSize; x++) {
          const material = bytes[offset];
          const occupancy = bytes[offset + 1] / 255;
          offset += 3;
          if (material !== 0 && occupancy > 0.05) {
            cells.push({ material, occupancy, x, y, z });
          }
        }
      }
    }
    return cells;
  }

  function _terrainFallbackSlab(props) {
    const minStr = props.MinExtents || props.minExtents || '';
    const maxStr = props.MaxExtents || props.maxExtents || '';
    const min = _parseOptionalVector3(minStr) || [-64, -8, -64];
    const max = _parseOptionalVector3(maxStr) || [64, 0, 64];
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const sx = Math.max(4, max[0] - min[0]);
    const sy = Math.max(2, max[1] - min[1]);
    const sz = Math.max(4, max[2] - min[2]);
    return [
      {
        id: 0,
        className: 'Terrain',
        shape: 'box',
        center: [cx, cy, cz],
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        size: [sx, sy, sz],
        color: [106, 127, 63],
        alpha: 1.0,
        mesh: { id: '', embedded: null },
        matFlag: 0,
        isTerrain: true,
      },
    ];
  }

  function _nodePart(node, meshNode = null) {
    const props = node.properties || {};
    const cframe = _parseCFrame(
      _firstProp(props, ['CFrame', 'CoordinateFrame', 'Position', 'PivotOffset']),
    );
    const mesh = _meshDescriptor(node, meshNode);
    const size = _partSize(node.className, props, mesh);
    const material = _firstProp(props, ['Material', 'material']);
    const reflectance = Math.max(0, Math.min(1, Number(_firstProp(props, ['Reflectance'])) || 0));
    const color = _materialColor(
      _parseColor(
        _firstProp(props, ['Color', 'Color3', 'Color3uint8', 'BrickColor', 'BrickColorValue']),
      ),
      material,
      reflectance,
    );
    const transparency = Math.max(0, Math.min(1, Number(_firstProp(props, ['Transparency'])) || 0));
    if (transparency >= 0.995) return null;
    const center = mesh.offset ? _offsetCenter(cframe, mesh.offset) : cframe.center;
    const matKey = _materialKey(material);
    const matFlag = matKey.includes('neon')
      ? 1
      : matKey.includes('glass') || matKey.includes('forcefield')
        ? 2
        : matKey.includes('metal') || matKey.includes('diamond') || matKey.includes('foil')
          ? 3
          : 0;
    return {
      id: node.id,
      className: node.className,
      shape: _partShape(node.className, props, mesh),
      center,
      matrix: cframe.matrix,
      size,
      color,
      alpha: _materialAlpha(Math.max(0.08, 1 - transparency), material),
      mesh,
      matFlag,
    };
  }

  function _meshChildFor(children = []) {
    return (
      children.find((child) =>
        /^(specialmesh|filemesh|blockmesh|cylindermesh)$/i.test(String(child.className || '')),
      ) || null
    );
  }

  function _meshDescriptor(node, meshNode) {
    const props = node.properties || {};
    const meshProps = meshNode?.properties || {};
    const rawMesh =
      _firstProp(props, ['MeshId', 'MeshID', 'MeshContent', 'MeshData', 'ModelMeshData']) ||
      _firstProp(meshProps, ['MeshId', 'MeshID', 'MeshContent', 'MeshData', 'ModelMeshData']);
    const embedded = _embeddedMesh(props) || _embeddedMesh(meshProps);
    const meshId = embedded ? '' : _assetId(rawMesh);
    const textureId = _assetId(
      _firstProp(props, ['TextureID', 'TextureId', 'TextureContent']) ||
        _firstProp(meshProps, ['TextureID', 'TextureId', 'TextureContent']),
    );
    const scale =
      meshNode && !/meshpart/i.test(node.className) ? _parseOptionalVector3(meshProps.Scale) : null;
    const offset = meshNode ? _parseOptionalVector3(meshProps.Offset) : null;
    const vertexCount = Number(_firstProp(props, ['VertexCount', 'vertexCount'])) || 0;
    const initialSize = _parseOptionalVector3(_firstProp(props, ['InitialSize', 'initialSize']));
    return {
      id: meshId,
      textureId,
      embedded,
      meshType: String(meshProps.MeshType || '').toLowerCase(),
      childClass: String(meshNode?.className || '').toLowerCase(),
      scale,
      offset,
      name: String(node.name || ''),
      vertexCount,
      initialSize,
    };
  }

  function _embeddedMesh(props) {
    const raw = _firstProp(props, [
      'MeshData',
      'MeshContent',
      'ModelMeshData',
      'SerializedMesh',
      'PhysicsData',
    ]);
    if (!raw || /^rbxasset|^https?:/i.test(raw)) return null;
    return raw;
  }

  function _firstProp(props, keys) {
    if (!props) return '';
    for (const key of keys) {
      const value = props[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    const lower = new Map(Object.keys(props).map((key) => [key.toLowerCase(), key]));
    for (const key of keys) {
      const realKey = lower.get(String(key).toLowerCase());
      const value = realKey ? props[realKey] : null;
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function _partSize(className, props, mesh) {
    const rawSize = _firstProp(props, ['Size', 'size']);
    const fallback =
      mesh?.initialSize && /meshpart|union|intersect|negate/i.test(String(className || ''))
        ? mesh.initialSize
        : _defaultPartSize(className);
    const size = _parseVector3(rawSize, fallback);
    if (!mesh?.scale) return size;
    return size.map((item, index) => Math.max(0.04, item * mesh.scale[index]));
  }

  function _offsetCenter(cframe, offset) {
    const m = cframe.matrix;
    const c = cframe.center;
    return [
      c[0] + m[0][0] * offset[0] + m[0][1] * offset[1] + m[0][2] * offset[2],
      c[1] + m[1][0] * offset[0] + m[1][1] * offset[1] + m[1][2] * offset[2],
      c[2] + m[2][0] * offset[0] + m[2][1] * offset[1] + m[2][2] * offset[2],
    ];
  }

  function _partShape(className = '', props = {}, mesh = {}) {
    const klass = String(className || '').toLowerCase();
    const raw = String(_firstProp(props, ['Shape', 'shape']) || '')
      .toLowerCase()
      .trim();

    const meshShape = _meshTypeShape(mesh);
    if (meshShape) return meshShape;
    if (mesh.embedded || mesh.id) return 'asset-mesh';

    if (klass.includes('cornerwedgepart')) return 'cornerwedge';
    if (klass.includes('wedgepart')) return 'wedge';
    if (klass.includes('trusspart')) return 'truss';

    if (
      klass.includes('meshpart') ||
      klass.includes('union') ||
      klass.includes('intersect') ||
      klass.includes('negate')
    )
      return 'asset-mesh';

    if (klass.includes('spherepart') || klass.includes('ballpart')) return 'sphere';

    if (raw) {
      if (raw === 'ball' || raw === 'sphere' || raw === '0') return 'sphere';
      if (raw === 'cylinder' || raw === '2') return 'cylinder';
      if (raw === 'wedge' || raw === '3') return 'wedge';
    }

    return 'box';
  }

  function _inferredMeshShape(klass = '', mesh = {}) {
    const name = String(mesh.name || '').toLowerCase();
    const text = `${klass} ${name}`;
    if (/barrel|chamber|pin|bolt|muzzle|axle|shaft|peg/.test(text)) return 'cylinder';
    if (
      /trigger|sight|body|butt|stock|grip|receiver|guard|clip|magazine|cube|block|brick|wall|floor|base|board|panel|plate|plank|door|window|sign|screen|trim|frame|step|stair|shelf|table|seat|backrest/.test(
        text,
      )
    )
      return 'sculptbox';
    if (/torus|ring|donut|hoop|loop|tire|tyre/.test(text)) return 'torus';
    if (/cone|spike|horn|tip|point/.test(text)) return 'cone';
    if (/capsule|rounded|pill/.test(text)) return 'capsule';
    if (/sphere|ball|orb|globe|bubble/.test(text)) return 'sphere';
    if (
      /cylinder|pipe|tube|pole|rod|bar|beam|leg|handle|rail|rope|wire|cable|wheel|coin/.test(text)
    )
      return 'cylinder';
    if (/wedge|ramp|slope/.test(text)) return 'wedge';
    if (/meshpart|union|intersect|negate/.test(klass)) {
      const v = Number(mesh.vertexCount) || 0;
      if (/rock|boulder|leaf|bush|cloud|hair|cloth|scarf|cape|fur|organic/.test(text))
        return 'organicbox';
      if (v >= 48) return 'sculptbox';
    }
    return '';
  }

  function _meshTypeShape(mesh = {}) {
    const child = String(mesh.childClass || '').toLowerCase();
    const value = String(mesh.meshType || '')
      .toLowerCase()
      .trim();

    if (child === 'cylindermesh') return 'cylinder';

    if (!value) return '';

    const number = Number(value);
    const hasNumber = value !== '' && Number.isFinite(number);

    if (value === 'cylinder' || (hasNumber && number === 4)) return 'cylinder';

    if (value === 'sphere' || (hasNumber && number === 3)) return 'sphere';

    if (value === 'head' || (hasNumber && number === 0 && child === 'specialmesh')) return 'sphere';
    if (value === 'wedge' || (hasNumber && number === 2)) return 'wedge';
    if (value === 'brick' || (hasNumber && number === 6)) return 'box';
    if (value === 'prism' || (hasNumber && number === 7)) return 'prism';
    if (value === 'pyramid' || (hasNumber && number === 8)) return 'pyramid';
    if (value === 'parallelramp' || value.includes('parallel') || (hasNumber && number === 9))
      return 'parallelramp';
    if (value === 'rightangleramp' || value.includes('rightangle') || (hasNumber && number === 10))
      return 'rightangleramp';
    if (value === 'cornerwedge' || value.includes('corner') || (hasNumber && number === 11))
      return 'cornerwedge';

    if (hasNumber && number === 0) return 'box';

    if (value === 'torso' || value === 'blob') return 'box';
    return '';
  }

  function _defaultPartSize(className = '') {
    if (/seat/i.test(className)) return [4, 1, 4];
    if (/truss/i.test(className)) return [2, 6, 2];
    return [4, 1.2, 2];
  }

  function _parseVector3(value, fallback) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    if (nums.length >= 3)
      return nums
        .slice(0, 3)
        .map((item, index) => Math.max(Math.abs(item), index === 1 ? 0.06 : 0.08));
    return fallback;
  }

  function _parseOptionalVector3(value) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    return nums.length >= 3 ? nums.slice(0, 3) : null;
  }

  function _parseCFrame(value) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    const center = nums.length >= 3 ? nums.slice(0, 3) : [0, 0, 0];
    const matrix =
      nums.length >= 12
        ? [nums.slice(3, 6), nums.slice(6, 9), nums.slice(9, 12)]
        : [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ];
    return { center, matrix };
  }

  function _parseColor(value) {
    const text = String(value ?? '').trim();
    const named = _brickColor(text);
    if (named) return named;
    const nums =
      text
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    if (nums.length >= 3) {
      const rgb = nums.slice(0, 3).map((item) => Math.round(item <= 1 ? item * 255 : item));
      return rgb.map((item) => Math.max(28, Math.min(245, item)));
    }
    if (nums.length === 1) {
      const brick = _brickColor(String(nums[0]));
      if (brick) return brick;
      if (nums[0] > 255) {
        const packed = nums[0] >>> 0;
        return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map((item) =>
          Math.max(28, Math.min(245, item)),
        );
      }
    }
    return [126, 151, 178];
  }

  function _materialColor(color, material = '', reflectance = 0) {
    const key = _materialKey(material);
    let out = color.slice();
    if (key.includes('neon')) out = out.map((item) => Math.min(255, item * 1.25 + 18));
    else if (key.includes('metal') || key.includes('diamond'))
      out = out.map((item) => item * 0.86 + 32);
    else if (key.includes('glass') || key.includes('forcefield'))
      out = out.map((item) => item * 0.76 + 54);
    else if (key.includes('wood'))
      out = [out[0] * 0.92 + 24, out[1] * 0.82 + 18, out[2] * 0.72 + 10];
    else if (key.includes('grass') || key.includes('leafy'))
      out = [out[0] * 0.72, out[1] * 1.08 + 14, out[2] * 0.76];
    if (reflectance > 0)
      out = out.map((item) => item + (255 - item) * Math.min(0.45, reflectance * 0.5));
    return out.map((item) => Math.max(18, Math.min(255, Math.round(item))));
  }

  function _materialAlpha(alpha, material = '') {
    const key = _materialKey(material);
    if (key.includes('glass') || key.includes('forcefield')) return Math.min(alpha, 0.62);
    return alpha;
  }

  function _materialKey(material = '') {
    const text = String(material || '').toLowerCase();
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return text;
    const names = {
      256: 'plastic',
      272: 'smoothplastic',
      288: 'neon',
      512: 'wood',
      528: 'woodplanks',
      768: 'marble',
      784: 'basalt',
      800: 'slate',
      804: 'crackedlava',
      816: 'concrete',
      820: 'limestone',
      832: 'granite',
      836: 'pavement',
      848: 'brick',
      864: 'pebble',
      880: 'cobblestone',
      896: 'rock',
      912: 'sandstone',
      1040: 'corrodedmetal',
      1056: 'diamondplate',
      1072: 'foil',
      1088: 'metal',
      1280: 'grass',
      1284: 'leafygrass',
      1296: 'sand',
      1312: 'fabric',
      1328: 'snow',
      1344: 'mud',
      1360: 'ground',
      1376: 'asphalt',
      1392: 'salt',
      1536: 'glass',
      1584: 'forcefield',
    };
    return names[numeric] || text;
  }

  function _brickColor(text) {
    const key = text.toLowerCase();
    const colors = {
      1: [242, 243, 243],
      5: [215, 197, 154],
      18: [204, 142, 105],
      21: [196, 40, 28],
      23: [13, 105, 172],
      24: [245, 205, 48],
      26: [27, 42, 53],
      28: [40, 127, 71],
      29: [161, 196, 140],
      37: [75, 151, 75],
      38: [160, 95, 53],
      45: [180, 210, 228],
      101: [218, 133, 65],
      102: [110, 153, 202],
      103: [199, 193, 183],
      104: [107, 50, 124],
      105: [226, 155, 64],
      106: [218, 134, 122],
      107: [163, 162, 165],
      108: [99, 95, 98],
      192: [105, 64, 40],
      194: [163, 162, 165],
      199: [99, 95, 98],
      1001: [248, 248, 248],
      1002: [205, 205, 205],
      1003: [17, 17, 17],
      1004: [255, 0, 0],
      1005: [255, 176, 0],
      1006: [180, 128, 255],
      1007: [163, 75, 75],
      1008: [193, 190, 66],
      1009: [255, 255, 0],
      1010: [0, 0, 255],
      1011: [0, 32, 96],
      1012: [33, 84, 185],
      1013: [4, 175, 236],
      1014: [170, 85, 0],
      1015: [170, 0, 170],
      1016: [255, 102, 204],
      1017: [255, 175, 0],
      1018: [18, 238, 212],
      1019: [0, 255, 255],
      1020: [0, 255, 0],
      1021: [58, 125, 21],
      1022: [127, 142, 100],
      1023: [140, 91, 159],
      1024: [175, 221, 255],
      'medium stone grey': [163, 162, 165],
      'dark stone grey': [99, 95, 98],
      'light stone grey': [229, 228, 223],
      'really black': [17, 17, 17],
      black: [27, 42, 53],
      white: [242, 243, 243],
      'institutional white': [248, 248, 248],
      'bright red': [196, 40, 28],
      'bright blue': [13, 105, 172],
      'bright green': [75, 151, 75],
      'bright yellow': [245, 205, 48],
      'earth green': [39, 70, 45],
      'sand green': [120, 144, 130],
      'sand blue': [116, 134, 157],
      'reddish brown': [105, 64, 40],
    };
    return colors[key] || null;
  }

  function _buildScene(parts) {
    if (!parts.length) return { ..._emptyScene(), sky: _sceneSky(activeSnapshot()) };
    const budget = _sceneBudget(parts.length);
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = _pointCollector();
    const assetMap = new Map();
    const aabbs = [];
    let assetReady = 0;
    let assetFailed = 0;
    let omittedParts = 0;
    for (let i = 0; i < parts.length; i += 1) {
      if (mesh.vertexCount() >= budget.maxVertices) {
        omittedParts = parts.length - i;
        break;
      }
      const part = parts[i];
      const assetKey = _meshAssetKey(part.mesh);
      if (assetKey) {
        assetMap.set(assetKey, part.mesh);
        const cached = state_.meshAssets.get(assetKey);
        if (cached?.status === 'ready') assetReady += 1;
        if (cached?.status === 'failed') assetFailed += 1;
      }

      mesh.setFlag(part.matFlag || 0);
      const before = points.length;
      points.beginPart();
      _emitPart(part, mesh, points, budget);

      if (points.length > before && part.id) {
        aabbs.push({ partId: part.id, ...points.endPart() });
      } else {
        points.endPart();
      }
    }
    if (!points.length)
      return {
        ..._emptyScene(),
        parts,
        assets: [...assetMap.values()],
        assetCount: assetMap.size,
        assetReady,
        assetFailed,
        omittedParts,
        aabbs,
        sky: _sceneSky(activeSnapshot()),
      };
    const bounds = _bounds(points);
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts,
      assets: [...assetMap.values()],
      assetCount: assetMap.size,
      assetReady,
      assetFailed,
      omittedParts,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
      aabbs,
      sky: _sceneSky(activeSnapshot()),
    };
  }

  function _sceneBudget(partCount) {
    return {
      maxVertices: Number.POSITIVE_INFINITY,
      sphereLat: 24,
      sphereLon: 48,
      cylinderSegments: 64,
    };
  }

  function _meshBuilder() {
    const positions = [];
    const normals = [];
    const colors = [];
    const flags = [];
    let _currentFlag = 0;
    return {
      setFlag(f) {
        _currentFlag = f || 0;
      },
      tri(a, b, c, color, alpha = 1) {
        const normal = _norm(_cross(_sub(b, a), _sub(c, a)));
        this.triNormal(a, b, c, normal, normal, normal, color, alpha);
      },
      triNormal(a, b, c, na, nb, nc, color, alpha = 1) {
        for (const [point, normal] of [
          [a, na],
          [b, nb],
          [c, nc],
        ]) {
          const n = _norm(normal);
          positions.push(point[0], point[1], point[2]);
          normals.push(n[0], n[1], n[2]);
          colors.push(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
          flags.push(_currentFlag);
        }
      },
      quad(a, b, c, d, color, alpha = 1) {
        this.tri(a, b, c, color, alpha);
        this.tri(a, c, d, color, alpha);
      },
      vertexCount() {
        return positions.length / 3;
      },
      finish() {
        return {
          positions: new Float32Array(positions),
          normals: new Float32Array(normals),
          colors: new Float32Array(colors),
          flags: new Float32Array(flags),
          vertexCount: positions.length / 3,
          triangleCount: positions.length / 9,
        };
      },
    };
  }

  function _pointCollector() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let partMin = null;
    let partMax = null;
    const ingest = (point) => {
      if (!point) return;
      for (let k = 0; k < 3; k++) {
        const value = point[k];
        if (value < min[k]) min[k] = value;
        if (value > max[k]) max[k] = value;
        if (partMin) {
          if (value < partMin[k]) partMin[k] = value;
          if (value > partMax[k]) partMax[k] = value;
        }
      }
    };
    return {
      length: 0,
      push(...items) {
        for (const item of items) {
          ingest(item);
          this.length += 1;
        }
      },
      beginPart() {
        partMin = [Infinity, Infinity, Infinity];
        partMax = [-Infinity, -Infinity, -Infinity];
      },
      endPart() {
        const out = partMin ? { min: partMin, max: partMax } : { min: [0, 0, 0], max: [0, 0, 0] };
        partMin = null;
        partMax = null;
        return out;
      },
      bounds() {
        return { min: min.slice(), max: max.slice() };
      },
    };
  }

  function _lineBuilder() {
    const positions = [];
    const colors = [];
    return {
      line(a, b, color) {
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        colors.push(...color, ...color);
      },
      finish() {
        return {
          positions: new Float32Array(positions),
          colors: new Float32Array(colors),
          vertexCount: positions.length / 3,
        };
      },
    };
  }

  function _emitPart(part, mesh, points, budget = _sceneBudget(0)) {
    if (part.shape === 'asset-mesh') {
      const asset = state_.meshAssets.get(_meshAssetKey(part.mesh));
      if (asset?.status === 'ready' && asset.mesh)
        return _emitAssetMesh(part, asset.mesh, mesh, points);
      return _emitMeshProxy(part, mesh, points, budget);
    }
    if (part.shape === 'sphere') return _emitSphere(part, mesh, points, budget);
    if (part.shape === 'cylinder') return _emitCylinder(part, mesh, points, budget);
    if (part.shape === 'cone') return _emitCone(part, mesh, points, budget);
    if (part.shape === 'capsule') return _emitCapsule(part, mesh, points, budget);
    if (part.shape === 'torus') return _emitTorus(part, mesh, points, budget);
    if (part.shape === 'wedge') return _emitPoly(part, mesh, points, _wedgePrimitive());
    if (part.shape === 'cornerwedge') return _emitPoly(part, mesh, points, _cornerWedgePrimitive());
    if (part.shape === 'prism') return _emitPoly(part, mesh, points, _prismPrimitive());
    if (part.shape === 'pyramid') return _emitPoly(part, mesh, points, _pyramidPrimitive());
    if (part.shape === 'parallelramp')
      return _emitPoly(part, mesh, points, _parallelRampPrimitive());
    if (part.shape === 'rightangleramp')
      return _emitPoly(part, mesh, points, _rightAngleRampPrimitive());
    if (part.shape === 'truss') return _emitTruss(part, mesh, points);

    const bevel = part.shape === 'organicbox' ? _softBoxBevel(part) : 0;
    return _emitPoly(part, mesh, points, _boxPrimitive(bevel));
  }

  function _emitMeshProxy(part, mesh, points, budget) {
    const inferred = _inferredMeshShape(part.className, part.mesh);
    if (inferred && inferred !== 'sculptbox' && inferred !== 'organicbox') {
      const proxy = { ...part, shape: inferred };
      return _emitPart(proxy, mesh, points, budget);
    }
    const klass = String(part.className || '').toLowerCase();
    const name = String(part.mesh?.name || part.name || '').toLowerCase();
    const text = `${klass} ${name}`;
    if (/\bcylinder\b|\bpipe\b|\btube\b|\bpole\b|\brod\b/.test(text))
      return _emitCylinder(part, mesh, points, budget);
    if (/\bsphere\b|\bball\b|\borb\b/.test(text)) return _emitSphere(part, mesh, points, budget);
    if (/\bwedge\b|\bramp\b/.test(text)) return _emitPoly(part, mesh, points, _wedgePrimitive());
    if (/\btorus\b|\bring\b/.test(text)) return _emitTorus(part, mesh, points, budget);
    const bevel = inferred === 'organicbox' || inferred === 'sculptbox' ? _softBoxBevel(part) : 0;
    return _emitPoly(part, mesh, points, _boxPrimitive(bevel));
  }

  function _softBoxBevel(part) {
    const v = Number(part.mesh?.vertexCount) || 0;
    const name = String(part.mesh?.name || '').toLowerCase();
    if (/cube|block|brick|wall|floor|base|board|panel|plate/.test(name)) return 0.025;
    if (v > 300) return 0.18;
    if (v > 120) return 0.13;
    if (v > 32) return 0.08;
    return 0.04;
  }

  function _emitAssetMesh(part, asset, mesh, points) {
    const positions = asset.positions;
    const indices = asset.indices;
    const size = asset.size || [1, 1, 1];
    const center = asset.center || [0, 0, 0];
    const normals = asset.normals;
    const localPoint = (index) => {
      const offset = index * 3;
      return [
        (positions[offset] - center[0]) / size[0],
        (positions[offset + 1] - center[1]) / size[1],
        (positions[offset + 2] - center[2]) / size[2],
      ];
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = _partPoint(part, localPoint(indices[i]));
      const b = _partPoint(part, localPoint(indices[i + 1]));
      const c = _partPoint(part, localPoint(indices[i + 2]));
      points.push(a, b, c);
      if (normals?.length) {
        const normalPoint = (index) => {
          const offset = index * 3;
          return _partNormal(part, [normals[offset], normals[offset + 1], normals[offset + 2]]);
        };
        mesh.triNormal(
          a,
          b,
          c,
          normalPoint(indices[i]),
          normalPoint(indices[i + 1]),
          normalPoint(indices[i + 2]),
          part.color,
          part.alpha,
        );
      } else {
        mesh.tri(a, b, c, part.color, part.alpha);
      }
    }
  }

  function _emitPoly(part, mesh, points, primitive) {
    const vertices = primitive.vertices.map((point) => _partPoint(part, point));
    points.push(...vertices);
    for (const face of primitive.faces) {
      if (face.length === 3)
        mesh.tri(vertices[face[0]], vertices[face[1]], vertices[face[2]], part.color, part.alpha);
      else if (face.length === 4)
        mesh.quad(
          vertices[face[0]],
          vertices[face[1]],
          vertices[face[2]],
          vertices[face[3]],
          part.color,
          part.alpha,
        );
      else {
        for (let i = 1; i < face.length - 1; i += 1)
          mesh.tri(
            vertices[face[0]],
            vertices[face[i]],
            vertices[face[i + 1]],
            part.color,
            part.alpha,
          );
      }
    }
  }

  function _boxPrimitive(bevel = 0) {
    const x = 0.5;
    const y = 0.5;
    const z = 0.5;
    const b = Math.max(0, Math.min(0.18, bevel));
    const vertices = [
      [-x + b, -y, -z + b],
      [x - b, -y, -z + b],
      [x, -y, -z + b],
      [x, -y, z - b],
      [x - b, -y, z],
      [-x + b, -y, z],
      [-x, -y, z - b],
      [-x, -y, -z + b],
      [-x + b, y, -z + b],
      [x - b, y, -z + b],
      [x, y, -z + b],
      [x, y, z - b],
      [x - b, y, z],
      [-x + b, y, z],
      [-x, y, z - b],
      [-x, y, -z + b],
    ];
    if (!b)
      return {
        vertices: [
          [-x, -y, -z],
          [x, -y, -z],
          [x, y, -z],
          [-x, y, -z],
          [-x, -y, z],
          [x, -y, z],
          [x, y, z],
          [-x, y, z],
        ],
        faces: [
          [0, 1, 2, 3],
          [4, 7, 6, 5],
          [0, 4, 5, 1],
          [3, 2, 6, 7],
          [1, 5, 6, 2],
          [0, 3, 7, 4],
        ],
      };
    return {
      vertices,
      faces: [
        [0, 1, 9, 8],
        [2, 3, 11, 10],
        [4, 5, 13, 12],
        [6, 7, 15, 14],
        [0, 7, 6, 5, 4, 3, 2, 1],
        [8, 9, 10, 11, 12, 13, 14, 15],
        [1, 2, 10, 9],
        [3, 4, 12, 11],
        [5, 6, 14, 13],
        [7, 0, 8, 15],
      ],
    };
  }

  function _wedgePrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [3, 2, 5, 4],
        [0, 3, 4],
        [1, 5, 2],
        [0, 4, 5, 1],
      ],
    };
  }

  function _cornerWedgePrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [1, 4, 2],
        [2, 4, 3],
        [0, 3, 4, 1],
      ],
    };
  }

  function _prismPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0, 0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2],
        [3, 5, 4],
        [0, 3, 4, 1],
        [1, 4, 5, 2],
        [2, 5, 3, 0],
      ],
    };
  }

  function _pyramidPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [0, 0.5, 0],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 4, 1],
        [1, 4, 2],
        [2, 4, 3],
        [3, 4, 0],
      ],
    };
  }

  function _parallelRampPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 4, 5, 1],
        [3, 2, 5, 4],
        [0, 3, 4],
        [1, 5, 2],
      ],
    };
  }

  function _rightAngleRampPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 3, 4],
        [0, 4, 1],
        [1, 4, 2],
        [2, 4, 3],
      ],
    };
  }

  function _emitSphere(part, mesh, points, budget = _sceneBudget(0)) {
    const lat = budget.sphereLat;
    const lon = budget.sphereLon;
    const rows = [];
    for (let y = 0; y <= lat; y += 1) {
      const v = y / lat;
      const theta = v * Math.PI;
      const row = [];
      for (let x = 0; x <= lon; x += 1) {
        const u = x / lon;
        const phi = u * Math.PI * 2;
        row.push(
          _partPoint(part, [
            Math.cos(phi) * Math.sin(theta) * 0.5,
            Math.cos(theta) * 0.5,
            Math.sin(phi) * Math.sin(theta) * 0.5,
          ]),
        );
      }
      rows.push(row);
    }
    for (const row of rows) points.push(...row);
    for (let y = 0; y < lat; y += 1) {
      for (let x = 0; x < lon; x += 1) {
        const a = rows[y][x];
        const b = rows[y][x + 1];
        const c = rows[y + 1][x + 1];
        const d = rows[y + 1][x];
        mesh.tri(a, b, c, part.color, part.alpha);
        mesh.tri(a, c, d, part.color, part.alpha);
      }
    }
  }

  function _emitCylinder(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = budget.cylinderSegments;
    const top = [];
    const bottom = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      top.push(_partPoint(part, [Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5]));
      bottom.push(_partPoint(part, [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]));
    }
    const topCenter = _partPoint(part, [0, 0.5, 0]);
    const bottomCenter = _partPoint(part, [0, -0.5, 0]);
    points.push(topCenter, bottomCenter, ...top, ...bottom);
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.quad(bottom[i], bottom[next], top[next], top[i], part.color, part.alpha);
      mesh.tri(topCenter, top[i], top[next], part.color, part.alpha);
      mesh.tri(bottomCenter, bottom[next], bottom[i], part.color, part.alpha);
    }
  }

  function _emitCone(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = budget.cylinderSegments;
    const tip = _partPoint(part, [0, 0.5, 0]);
    const center = _partPoint(part, [0, -0.5, 0]);
    const ring = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      ring.push(_partPoint(part, [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]));
    }
    points.push(tip, center, ...ring);
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.tri(tip, ring[i], ring[next], part.color, part.alpha);
      mesh.tri(center, ring[next], ring[i], part.color, part.alpha);
    }
  }

  function _emitCapsule(part, mesh, points, budget = _sceneBudget(0)) {
    const body = { ...part, size: [part.size[0], part.size[1] * 0.58, part.size[2]] };
    _emitCylinder(body, mesh, points, budget);
    const top = {
      ...part,
      center: _partPoint(part, [0, 0.29, 0]),
      size: [part.size[0], part.size[1] * 0.42, part.size[2]],
    };
    const bottom = {
      ...part,
      center: _partPoint(part, [0, -0.29, 0]),
      size: [part.size[0], part.size[1] * 0.42, part.size[2]],
    };
    _emitSphere(top, mesh, points, budget);
    _emitSphere(bottom, mesh, points, budget);
  }

  function _emitTorus(part, mesh, points, budget = _sceneBudget(0)) {
    const major = Math.max(12, Math.min(36, budget.cylinderSegments + 8));
    const minor = Math.max(6, Math.min(14, Math.round(major / 3)));
    const rows = [];
    for (let i = 0; i <= major; i += 1) {
      const u = (i / major) * Math.PI * 2;
      const row = [];
      for (let j = 0; j <= minor; j += 1) {
        const v = (j / minor) * Math.PI * 2;
        const r = 0.34 + Math.cos(v) * 0.14;
        row.push(_partPoint(part, [Math.cos(u) * r, Math.sin(v) * 0.14, Math.sin(u) * r]));
      }
      rows.push(row);
    }
    for (const row of rows) points.push(...row);
    for (let i = 0; i < major; i += 1) {
      for (let j = 0; j < minor; j += 1) {
        mesh.quad(
          rows[i][j],
          rows[i + 1][j],
          rows[i + 1][j + 1],
          rows[i][j + 1],
          part.color,
          part.alpha,
        );
      }
    }
  }

  function _emitFacetedProxy(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = Math.max(8, Math.min(18, budget.cylinderSegments));
    const levels = [-0.5, -0.24, 0.24, 0.5];
    const radii = [0.62, 0.78, 0.74, 0.56];
    const rows = levels.map((y, rowIndex) => {
      const row = [];
      for (let i = 0; i < segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        const facet = i % 2 ? 0.92 : 1;
        const rx = 0.5 * radii[rowIndex] * facet;
        const rz = 0.5 * radii[rowIndex] * (i % 3 ? 0.96 : 1.08);
        row.push(_partPoint(part, [Math.cos(a) * rx, y, Math.sin(a) * rz]));
      }
      return row;
    });
    const top = _partPoint(part, [0, 0.5, 0]);
    const bottom = _partPoint(part, [0, -0.5, 0]);
    points.push(top, bottom, ...rows.flat());
    for (let row = 0; row < rows.length - 1; row += 1) {
      for (let i = 0; i < segments; i += 1) {
        const next = (i + 1) % segments;
        mesh.quad(
          rows[row][i],
          rows[row][next],
          rows[row + 1][next],
          rows[row + 1][i],
          part.color,
          part.alpha,
        );
      }
    }
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.tri(top, rows[rows.length - 1][i], rows[rows.length - 1][next], part.color, part.alpha);
      mesh.tri(bottom, rows[0][next], rows[0][i], part.color, part.alpha);
    }
  }

  function _emitTruss(part, mesh, points) {
    const bars = [
      [
        [-0.36, 0, -0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0.36, 0, -0.36],
        [0.12, 1, 0.12],
      ],
      [
        [-0.36, 0, 0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0.36, 0, 0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0, -0.35, 0],
        [0.9, 0.12, 0.9],
      ],
      [
        [0, 0.35, 0],
        [0.9, 0.12, 0.9],
      ],
    ];
    for (const [offset, size] of bars) {
      const bar = {
        ...part,
        center: _partPoint(part, offset),
        matrix: part.matrix,
        size: [part.size[0] * size[0], part.size[1] * size[1], part.size[2] * size[2]],
      };
      _emitPoly(bar, mesh, points, _boxPrimitive(0));
    }
  }

  function _partPoint(part, point) {
    const x = point[0] * part.size[0];
    const y = point[1] * part.size[1];
    const z = point[2] * part.size[2];
    const m = part.matrix;
    const c = part.center;
    return [
      c[0] + m[0][0] * x + m[0][1] * y + m[0][2] * z,
      c[1] + m[1][0] * x + m[1][1] * y + m[1][2] * z,
      c[2] + m[2][0] * x + m[2][1] * y + m[2][2] * z,
    ];
  }

  function _partNormal(part, normal) {
    const m = part.matrix;
    return _norm([
      m[0][0] * normal[0] + m[0][1] * normal[1] + m[0][2] * normal[2],
      m[1][0] * normal[0] + m[1][1] * normal[1] + m[1][2] * normal[2],
      m[2][0] * normal[0] + m[2][1] * normal[1] + m[2][2] * normal[2],
    ]);
  }

  function _bounds(points) {
    if (points?.bounds) return points.bounds();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const point of points) {
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], point[i]);
        max[i] = Math.max(max[i], point[i]);
      }
    }
    return { min, max };
  }

  function _emitGuides(guide, bounds, center, extent) {
    const y = bounds.min[1];

    const axis = Math.max(4, extent * 0.24);
    const root = [bounds.min[0], y, bounds.min[2]];
    guide.line(root, [root[0] + axis, root[1], root[2]], [1, 0.28, 0.28, 0.82]);
    guide.line(root, [root[0], root[1] + axis, root[2]], [0.35, 1, 0.56, 0.82]);
    guide.line(root, [root[0], root[1], root[2] + axis], [0.36, 0.66, 1, 0.82]);
  }

  function _mountViewport(canvas, scene, cameraKey = '') {
    if (!canvas || !scene?.mesh?.vertexCount) return;
    const gl =
      canvas.getContext('webgl2', {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }) ||
      canvas.getContext('webgl', {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    if (!gl) return _mountViewport2dFallback(canvas, scene);
    const program = _createViewportProgram(gl);
    if (!program) return;
    let buffers = _createViewportBuffers(gl, scene, program);
    const savedCamera = cameraKey ? state_.viewportCameras.get(cameraKey) : null;
    const camera = savedCamera ? { ...savedCamera } : _defaultViewportCamera(scene);
    if (!savedCamera && cameraKey) _saveViewportCamera(cameraKey, camera);

    const keys = new Set();
    let looking = false;
    let lastPointer = null;
    let frame = 0;
    let lastTime = 0;
    let disposed = false;
    let animating = false;

    const moveSpeed = () => {
      const base = Math.max(4, scene.extent * 0.055);
      return keys.has('ShiftLeft') || keys.has('ShiftRight') ? base * 6 : base;
    };

    const clampPitch = (p) => Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p));

    const camVectors = () => {
      const cy = Math.cos(camera.yaw),
        sy = Math.sin(camera.yaw);
      const cp = Math.cos(camera.pitch),
        sp = Math.sin(camera.pitch);
      const fwd = [-sy * cp, sp, -cy * cp];
      const right = [cy, 0, -sy];
      const up = [0, 1, 0];
      return { fwd, right, up };
    };

    const schedule = (continuous = false) => {
      if (disposed) return;
      animating = continuous;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    const resize = new ResizeObserver(() => schedule());
    const deleteBuffers = () => {
      for (const buf of Object.values(buffers)) if (buf?.buffer) gl.deleteBuffer(buf.buffer);
    };
    canvas.__dtUpdateScene = (nextScene) => {
      if (disposed || !nextScene?.mesh?.vertexCount) return;
      deleteBuffers();
      scene = nextScene;
      buffers = _createViewportBuffers(gl, scene, program);
      const frame = canvas.closest('.dt-render-frame--canvas');
      if (frame) {
        frame.style.setProperty('--dt-sky-top', scene.sky?.cssTop || 'rgb(24 28 34)');
        frame.style.setProperty('--dt-sky-bottom', scene.sky?.cssBottom || 'rgb(12 14 18)');
      }
      schedule();
    };
    canvas.__dtDispose = () => {
      disposed = true;
      looking = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      deleteBuffers();
      gl.deleteProgram(program.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext?.();
      canvas.width = 0;
      canvas.height = 0;
    };
    resize.observe(canvas.parentElement || canvas);

    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 0.38s ease';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        canvas.style.opacity = '1';
      }),
    );

    if (!savedCamera) {
      const d = scene.extent * 1.4;
      const { fwd } = camVectors();
      camera.x = scene.center[0] - fwd[0] * d;
      camera.y = scene.center[1] - fwd[1] * d;
      camera.z = scene.center[2] - fwd[2] * d;
      _saveViewportCamera(cameraKey, camera);
    }

    const MOVE_KEYS = new Set([
      'KeyW',
      'KeyS',
      'KeyA',
      'KeyD',
      'KeyQ',
      'KeyE',
      'Space',
      'ShiftLeft',
      'ShiftRight',
    ]);
    const onKeyDown = (e) => {
      if (!canvas.isConnected || disposed) return;

      if (!canvas.matches(':hover') && document.pointerLockElement !== canvas) return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.add(e.code);
        schedule(true);
      }
      if (e.code === 'KeyF') {
        const d = scene.extent * 1.4;
        const { fwd } = camVectors();
        camera.x = scene.center[0] - fwd[0] * d;
        camera.y = scene.center[1] - fwd[1] * d;
        camera.z = scene.center[2] - fwd[2] * d;
        _saveViewportCamera(cameraKey, camera);
        schedule();
      }
    };
    const onKeyUp = (e) => {
      keys.delete(e.code);
      if (keys.size === 0) animating = false;
    };
    const onPointerLockChange = () => {
      if (document.pointerLockElement !== canvas) looking = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) {
        looking = true;
        lastPointer = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (e.button === 0) {
        lastPointer = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        looking = true;
        e.preventDefault();
      }
    });

    let _clickStart = null;
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button === 0) _clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      },
      true,
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (e.button === 0 && _clickStart) {
          const dx = e.clientX - _clickStart.x;
          const dy = e.clientY - _clickStart.y;
          const dt = Date.now() - _clickStart.time;
          _clickStart = null;

          if (Math.hypot(dx, dy) < 6 && dt < 400 && state_.viewportClickSelect) {
            _raycastClick(e, canvas, scene, camera);
          }
        }
      },
      true,
    );

    canvas.addEventListener('pointermove', (e) => {
      if (!looking && document.pointerLockElement !== canvas) return;

      let dx, dy;
      if (document.pointerLockElement === canvas) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        if (!lastPointer) return;
        dx = e.clientX - lastPointer.x;
        dy = e.clientY - lastPointer.y;
        lastPointer = { x: e.clientX, y: e.clientY };
      }
      camera.yaw += dx * 0.006;
      camera.pitch = clampPitch(camera.pitch - dy * 0.006);
      _saveViewportCamera(cameraKey, camera);
      schedule();
    });

    canvas.addEventListener('pointerup', (e) => {
      looking = false;
      lastPointer = null;
    });
    canvas.addEventListener('pointercancel', () => {
      looking = false;
      lastPointer = null;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const { fwd } = camVectors();
        const speed = Math.max(2, scene.extent * 0.12);
        const delta = -e.deltaY * 0.005 * speed;
        camera.x += fwd[0] * delta;
        camera.y += fwd[1] * delta;
        camera.z += fwd[2] * delta;
        _saveViewportCamera(cameraKey, camera);
        schedule();
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', () => {
      Object.assign(camera, _defaultViewportCamera(scene));
      _saveViewportCamera(cameraKey, camera);
      schedule();
    });

    function draw(now) {
      if (disposed || !canvas.isConnected) {
        canvas.__dtDispose?.();
        return;
      }
      const dt = Math.min((now - (lastTime || now)) / 1000, 0.1);
      lastTime = now;

      if (keys.size > 0) {
        const speed = moveSpeed();
        const { fwd, right } = camVectors();
        if (keys.has('KeyW') || keys.has('ArrowUp')) {
          camera.x += fwd[0] * speed * dt;
          camera.y += fwd[1] * speed * dt;
          camera.z += fwd[2] * speed * dt;
        }
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
          camera.x -= fwd[0] * speed * dt;
          camera.y -= fwd[1] * speed * dt;
          camera.z -= fwd[2] * speed * dt;
        }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) {
          camera.x -= right[0] * speed * dt;
          camera.z -= right[2] * speed * dt;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
          camera.x += right[0] * speed * dt;
          camera.z += right[2] * speed * dt;
        }
        if (keys.has('KeyE') || keys.has('Space')) {
          camera.y += speed * dt;
        }
        if (keys.has('KeyQ')) {
          camera.y -= speed * dt;
        }
        _saveViewportCamera(cameraKey, camera);
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      const sky = scene.sky?.bottom || [0, 0, 0];
      gl.clearColor(sky[0] / 255, sky[1] / 255, sky[2] / 255, 1);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program.program);

      const matrices = _viewportMatrices(scene, camera, width / height);
      gl.uniformMatrix4fv(program.uMvp, false, matrices.mvp);
      gl.uniform1f(program.uUnlit, 0);

      _bindViewportBuffer(gl, program, buffers.mesh);
      gl.drawArrays(gl.TRIANGLES, 0, scene.mesh.vertexCount);

      gl.uniform1f(program.uUnlit, 1);
      gl.disable(gl.DEPTH_TEST);
      _bindViewportBuffer(gl, program, buffers.guide);
      gl.drawArrays(gl.LINES, 0, scene.guide.vertexCount);
      gl.enable(gl.DEPTH_TEST);

      if (animating || keys.size > 0) schedule(true);
    }
    schedule();
  }

  function _mountViewport2dFallback(canvas, scene) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.__dtDispose = () => {};
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function _raycastClick(e, canvas, scene, camera) {
    const aabbs = scene.aabbs;
    if (!aabbs || !aabbs.length) return;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;

    const aspect = rect.width / rect.height;
    const fovy = Math.PI / 3;
    const cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw);
    const fwd = [-sy * cp, sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
    const tanHalf = Math.tan(fovy / 2);
    const rayDir = _norm([
      fwd[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
      fwd[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
      fwd[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
    ]);
    const origin = [camera.x, camera.y, camera.z];
    let bestT = Infinity;
    let bestId = null;
    for (const aabb of aabbs) {
      const t = _rayAABB(origin, rayDir, aabb.min, aabb.max);
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = aabb.partId;
      }
    }
    if (bestId != null) {
      const snapshot = activeSnapshot();
      if (snapshot) {
        let cur = snapshot.byId.get(bestId);
        while (cur?.parentId) {
          state_.expanded.add(cur.parentId);
          cur = snapshot.byId.get(cur.parentId);
        }
        _refreshTreeList(snapshot);
      }
      _selectNode(bestId);

      requestAnimationFrame(() => {
        const row = _container()?.querySelector(`.dt-tree-row[data-node-id="${bestId}"]`);
        if (row) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          row.classList.add('dt-tree-row--flash');
          setTimeout(() => row.classList.remove('dt-tree-row--flash'), 600);
        }
      });
    }
  }

  function _rayAABB(origin, dir, min, max) {
    let tmin = 0,
      tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const inv = 1 / dir[i];
      let t1 = (min[i] - origin[i]) * inv;
      let t2 = (max[i] - origin[i]) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
  }

  const MESH_CONCURRENCY = 2;

  async function _loadViewportAssets(assets = [], nodeId, buildKey = '') {
    const pending = [];
    for (const asset of assets) {
      const key = _meshAssetKey(asset);
      const cached = state_.meshAssets.get(key);
      if (
        key &&
        (!cached || (cached.status === 'failed' && Date.now() - (cached.failedAt || 0) > 120000))
      )
        pending.push(asset);
    }
    if (!pending.length) return;

    _log.info(
      `Loading ${pending.length} mesh asset(s) for node ${nodeId} (parallel, concurrency=${MESH_CONCURRENCY})`,
    );
    for (const asset of pending) {
      state_.meshAssets.set(_meshAssetKey(asset), { status: 'loading' });
    }
    const startedAt = performance.now();
    if (buildKey && state_.viewportBuild.key === buildKey) {
      _updateViewportBuild(buildKey, {
        status: 'assets',
        progress: 0.92,
        message: `Loading mesh assets · 0/${pending.length}`,
        startedAt,
      });
    }

    let completed = 0;
    await _parallelMap(pending, MESH_CONCURRENCY, async (asset) => {
      const key = _meshAssetKey(asset);
      try {
        _log.fetch(`Fetching mesh asset key=${key} id=${asset.id}`);
        const bytes = asset.embedded
          ? _decodeMeshBlob(asset.embedded)
          : await _fetchMeshAssetBytes(asset.id);
        const mesh = await _parseRobloxMesh(bytes);
        state_.meshAssets.set(key, { status: 'ready', mesh });
        _log.info(`Mesh ready: ${key} (${mesh.vertexCount} verts, ${mesh.triangleCount} tris)`);
      } catch (err) {
        const msg = err?.message || String(err || 'Mesh unavailable');
        _log.error(`Mesh failed: ${key} — ${msg}`);
        state_.meshAssets.set(key, { status: 'failed', failedAt: Date.now(), message: msg });
      } finally {
        completed += 1;
        if (buildKey && state_.viewportBuild.key === buildKey) {
          _updateViewportBuild(buildKey, {
            status: 'assets',
            progress: 0.92 + (completed / pending.length) * 0.07,
            message: `Loading mesh assets · ${completed}/${pending.length}`,
          });
        }
      }
    });

    _trimMeshAssets();
    await _refreshViewportSceneLive(buildKey, nodeId);
  }

  async function _refreshViewportSceneLive(buildKey, nodeId) {
    const job = state_.viewportBuild;
    if (!buildKey || job.key !== buildKey || !job.renderSnapshot) return;
    const snapshot = job.renderSnapshot;
    const node = snapshot.byId?.get(nodeId);
    const canvas = _container()?.querySelector(
      `.dt-viewport-canvas[data-build-key="${_cssEscape(buildKey)}"]`,
    );
    if (!node || !canvas?.__dtUpdateScene) return;
    const token = job.token;
    _updateViewportBuild(buildKey, {
      status: 'assets',
      progress: 0.995,
      message: 'Applying meshes live',
    });
    const parts = await _collectRenderablePartsProgressive(snapshot, node, token, buildKey);
    if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== buildKey) return;
    const scene = await _buildSceneProgressive(parts, buildKey, token, snapshot);
    if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== buildKey) return;
    scene.assetReady = scene.assetCount;
    state_.viewportBuild.scene = scene;
    state_.viewportBuild.status = 'ready';
    state_.viewportBuild.progress = 1;
    state_.viewportBuild.message = '3D preview ready';
    canvas.__dtUpdateScene(scene);
    _updateRenderStats(buildKey, scene);
    _paintViewportProgress(buildKey);
    _releaseSceneCpuMesh(scene);
    if (state_.viewportBuild.scene === scene) state_.viewportBuild.scene = null;
  }

  async function _collectRenderablePartsProgressive(snapshot, node, token, key) {
    const parts = [];
    const stack = [node];
    while (stack.length) {
      if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== key) return parts;
      const sliceStart = performance.now();
      while (stack.length && performance.now() - sliceStart < 6) {
        const current = stack.pop();
        const children = snapshot.children.get(current.id) || [];
        if (/^terrain$/i.test(String(current.className || ''))) {
          const terrainParts = _terrainToParts(current);
          for (const tp of terrainParts) parts.push(tp);
        } else if (_isRenderablePart(current.className)) {
          const part = _nodePart(current, _meshChildFor(children));
          if (part) parts.push(part);
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      await _yieldFrame();
    }
    return parts;
  }

  function _updateRenderStats(buildKey, scene) {
    const stats = _container()?.querySelector(`[data-render-stats="${_cssEscape(buildKey)}"]`);
    if (!stats) return;
    stats.innerHTML = `<span>${(scene.partCount || scene.parts.length).toLocaleString()} parts</span><span>${scene.mesh.triangleCount.toLocaleString()} tris</span>${scene.assetCount ? `<span>${scene.assetReady.toLocaleString()}/${scene.assetCount.toLocaleString()} embedded meshes</span>` : ''}${scene.assetFailed ? `<span>${scene.assetFailed.toLocaleString()} unavailable</span>` : ''}`;
  }

  async function _parallelMap(items, concurrency, fn) {
    const results = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]).catch((err) => err);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function _loadMeshAsset(asset) {
    const key = _meshAssetKey(asset);
    try {
      const bytes = asset.embedded
        ? _decodeMeshBlob(asset.embedded)
        : await _fetchMeshAssetBytes(asset.id);
      const mesh = await _parseRobloxMesh(bytes);
      state_.meshAssets.set(key, { status: 'ready', mesh });
      state_.meshVersion += 1;
      _trimMeshAssets();
      state_.sceneCache.clear();
    } catch (err) {
      state_.meshAssets.set(key, {
        status: 'failed',
        failedAt: Date.now(),
        message: err?.message || String(err || 'Mesh unavailable'),
      });
      state_.meshVersion += 1;
      _trimMeshAssets();
      state_.sceneCache.clear();
    }
  }

  function _extractAssetId(value) {
    const text = String(value || '').trim();

    const m1 = text.match(/rbxasset(?:id)?:\/\/(\d+)/i);
    if (m1) return m1[1];

    const m2 = text.match(/[?&]id=(\d+)/i);
    if (m2) return m2[1];

    const m3 = text.match(/\/(?:asset|assetId)\/(\d+)/i);
    if (m3) return m3[1];

    const m4 = text.match(/\b(\d{5,})\b/);
    if (m4) return m4[1];
    return '';
  }

  function _assetDeliveryUrl(id) {
    return `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}`;
  }

  function _errMsg(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err?.message) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function _sniffPayloadType(bytes) {
    if (!bytes?.length) return 'empty';
    const h = bytes;
    if (h[0] === 0x76 && h[1] === 0x65) return 'mesh(text/v1)';
    if (h[0] === 0x76 && h[1] === 0x65 && h[2] === 0x72) return 'mesh';
    const hdr = new TextDecoder().decode(h.slice(0, Math.min(16, h.length)));
    if (/^version \d/.test(hdr)) return 'mesh';
    if (h[0] === 0xff && h[1] === 0xd8) return 'jpeg';
    if (h[0] === 0x89 && h[1] === 0x50) return 'png';
    if (h[0] === 0x47 && h[1] === 0x49) return 'gif';
    if (h[0] === 0x3c) return 'html/xml';
    if (h[0] === 0x7b) return 'json';
    if (h[0] === 0x1f && h[1] === 0x8b) return 'gzip';
    if (h[0] === 0x4f && h[1] === 0x67) return 'ogg';
    return `unknown(0x${h[0].toString(16).padStart(2, '0')}${h[1]?.toString(16).padStart(2, '0') ?? ''})`;
  }

  async function _fetchMeshAssetBytes(id) {
    if (!id) throw new Error('Missing mesh asset id');
    const numericId = _extractAssetId(id) || id;
    _log.fetch(`Fetching mesh id=${numericId}`);
    const encoded = encodeURIComponent(numericId);
    const headers = {
      Accept: 'application/octet-stream,*/*',
      AssetType: 'Mesh',
      AssetFormat: 'Mesh',
      'Roblox-AssetFormat': 'Mesh',
    };
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri not available');

    let lastError = null;

    const _on429 = async (msg) => {
      if (/429/.test(msg)) {
        _log.warn(`  rate-limited (429), backing off 1.5s`);
        await new Promise((res) => setTimeout(res, 1500));
      }
    };

    for (const url of [
      `https://assetdelivery.roblox.com/v1/asset/?id=${encoded}`,
      `https://www.roblox.com/asset/?id=${encoded}`,
    ]) {
      try {
        const bytes = _base64ToBytes(await invoke('http_fetch_binary', { url, headers }));
        if (_isMeshPayload(bytes)) {
          _log.fetch(`  ✓ direct (${bytes.length}B)`);
          return bytes;
        }
        lastError = new Error(`Not mesh data (${_sniffPayloadType(bytes)}) from direct URL`);
        _log.warn(`  direct non-mesh: ${_sniffPayloadType(bytes)} ${bytes.length}B`);
      } catch (err) {
        lastError = new Error(_errMsg(err));
        _log.warn(`  direct failed: ${_errMsg(err)}`);
        await _on429(_errMsg(err));
      }
    }

    for (const apiUrl of [
      `https://assetdelivery.roblox.com/v1/assetId/${encoded}`,
      `https://assetdelivery.roblox.com/v2/assetId/${encoded}`,
    ]) {
      try {
        const raw = await invoke('http_fetch', {
          url: apiUrl,
          headers: { Accept: 'application/json,*/*' },
        });
        const data = JSON.parse(raw);

        const apiErr = data?.errors?.[0]?.message || data?.error || data?.message;
        if (apiErr && !data?.location && !data?.locations?.length) {
          lastError = new Error(apiErr);
          _log.warn(`  delivery API error: ${apiErr}`);
          continue;
        }
        const location = data?.location || data?.locations?.find((l) => l?.location)?.location;
        if (!location) {
          lastError = new Error('No delivery location');
          continue;
        }
        _log.fetch(`  CDN: ${location.split('?')[0]}`);
        const bytes = _base64ToBytes(await invoke('http_fetch_binary', { url: location, headers }));
        if (_isMeshPayload(bytes)) {
          _log.fetch(`  ✓ CDN redirect (${bytes.length}B)`);
          return bytes;
        }
        lastError = new Error(`Not mesh data (${_sniffPayloadType(bytes)}) from CDN`);
        _log.warn(`  CDN non-mesh: ${_sniffPayloadType(bytes)} ${bytes.length}B`);
      } catch (err) {
        lastError = new Error(_errMsg(err));
        _log.warn(
          `  delivery API failed [${apiUrl.includes('v2') ? 'v2' : 'v1'}]: ${_errMsg(err)}`,
        );
        await _on429(_errMsg(err));
      }
    }

    const msg = lastError?.message || 'Mesh unavailable';
    _log.error(`✗ mesh id=${numericId}: ${msg}`);
    throw new Error(msg);
  }

  function _trimMeshAssets() {
    for (const [key, val] of state_.meshAssets) {
      if (val.status === 'failed' && Date.now() - (val.failedAt || 0) > 300000) {
        state_.meshAssets.delete(key);
      }
    }
  }

  async function _fetchAssetBlob(id, hint) {
    if (!id) return null;
    const numericId = _extractAssetId(String(id)) || String(id);
    _log.fetch(`Fetching asset blob id=${numericId} hint=${hint}`);
    const encoded = encodeURIComponent(numericId);
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) {
      _log.error('Tauri not available');
      return null;
    }

    const sniffMime = (bytes) => {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
      if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'audio/wav';
      if (bytes[0] === 0x4f && bytes[1] === 0x67) return 'audio/ogg';
      if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
      if (bytes[0] === 0x66 && bytes[1] === 0x74 && bytes[2] === 0x79) return 'audio/mp4';
      return hint === 'audio' ? 'audio/mpeg' : 'image/png';
    };

    for (const url of [
      `https://assetdelivery.roblox.com/v1/asset/?id=${encoded}`,
      `https://www.roblox.com/asset/?id=${encoded}`,
    ]) {
      try {
        _log.fetch(`  direct: ${url}`);
        const bytes = _base64ToBytes(
          await invoke('http_fetch_binary', { url, headers: { Accept: '*/*' } }),
        );
        if (!bytes.length) continue;
        const mime = sniffMime(bytes);
        _log.fetch(`  OK ${mime} (${bytes.length}B)`);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
      } catch (err) {
        _log.warn(`  direct failed: ${_errMsg(err)}`);
      }
    }

    for (const url of [
      `https://assetdelivery.roblox.com/v1/assetId/${encoded}`,
      `https://assetdelivery.roblox.com/v2/assetId/${encoded}`,
    ]) {
      try {
        _log.fetch(`  delivery API: ${url}`);
        const data = JSON.parse(
          await invoke('http_fetch', { url, headers: { Accept: 'application/json,*/*' } }),
        );
        const location = data?.location || data?.locations?.find((l) => l?.location)?.location;
        if (!location) continue;
        const bytes = _base64ToBytes(
          await invoke('http_fetch_binary', { url: location, headers: { Accept: '*/*' } }),
        );
        if (!bytes.length) continue;
        const mime = sniffMime(bytes);
        _log.fetch(`  OK ${mime} via redirect (${bytes.length}B)`);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
      } catch (err) {
        _log.warn(`  delivery API failed: ${_errMsg(err)}`);
      }
    }

    _log.error(`All fetches failed for id=${numericId}`);
    return null;
  }

  function _meshAssetKey(asset) {
    if (!asset) return '';
    return asset.embedded
      ? `embedded:${asset.embedded.length}:${asset.embedded.slice(0, 48)}`
      : asset.id
        ? `mesh:${asset.id}`
        : '';
  }

  function _base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function _decodeMeshBlob(value) {
    const text = String(value || '').trim();
    const b64 = text.includes(',') ? text.split(',').pop() : text;
    if (/^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 80)
      return _base64ToBytes(b64.replace(/\s+/g, ''));
    return new TextEncoder().encode(text);
  }

  async function _parseRobloxMesh(bytes) {
    bytes = await _decompressIfGzip(bytes);
    bytes = _meshPayload(bytes);
    const headerText = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 32)));
    const header = headerText.match(/^version \d+\.\d\d/)?.[0];
    if (!header) throw new Error('Unknown mesh header');
    if (/version 1\.0[01]/.test(header)) return _parseMeshV1(bytes, header.endsWith('1.00'));
    if (/version 2\.00/.test(header)) return _parseMeshV2(bytes, header.length + 1);
    if (/version 3\.0[01]/.test(header)) return _parseMeshV3(bytes, header.length + 1);
    if (/version [45]\.0[01]/.test(header)) return _parseMeshV4(bytes, header.length + 1);
    throw new Error(
      `${header} needs embedded compressed mesh data that is not present in RBXLX-native mode`,
    );
  }

  function _isMeshPayload(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
    const payload = _meshPayload(bytes);
    const headerText = new TextDecoder().decode(payload.slice(0, Math.min(payload.length, 32)));
    return /^version \d+\.\d\d/.test(headerText);
  }

  function _meshPayload(bytes) {
    const marker = _bytesIndexOf(bytes, 'version ');
    return marker > 0 ? bytes.slice(marker) : bytes;
  }

  async function _decompressIfGzip(bytes) {
    if (!bytes || bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      let totalLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
      const out = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      _log.fetch(`  gzip decompressed ${bytes.length}B → ${out.length}B`);
      return out;
    } catch (err) {
      _log.warn(`  gzip decompress failed: ${err?.message} — using raw bytes`);
      return bytes;
    }
  }

  function _bytesIndexOf(bytes, text, start = 0) {
    const needle = new TextEncoder().encode(text);
    outer: for (let i = Math.max(0, start); i <= bytes.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function _parseMeshV1(bytes, halfScale) {
    const text = new TextDecoder().decode(bytes);
    const values = [
      ...text
        .split('\n')
        .slice(2)
        .join('')
        .matchAll(/\[([^\]]+)\]/g),
    ].map((match) => match[1].split(',').map(Number));
    const positions = [];
    const indices = [];
    for (let i = 0; i + 8 < values.length; i += 9) {
      for (let j = 0; j < 3; j += 1) {
        const point = values[i + j * 3] || [0, 0, 0];
        positions.push(
          point[0] * (halfScale ? 0.5 : 1),
          point[1] * (halfScale ? 0.5 : 1),
          point[2] * (halfScale ? 0.5 : 1),
        );
        indices.push(indices.length);
      }
    }
    return _finishParsedMesh(positions, indices);
  }

  function _parseMeshV2(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vertexSize = view.getUint8(offset + 2);
    const faceSize = view.getUint8(offset + 3);
    const numVerts = view.getUint32(offset + 4, true);
    const numFaces = view.getUint32(offset + 8, true);
    return _parseMeshArrays(view, offset + 12, numVerts, numFaces, vertexSize, faceSize, null);
  }

  function _parseMeshV3(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vertexSize = view.getUint8(offset + 2);
    const faceSize = view.getUint8(offset + 3);
    const lodCount = view.getUint16(offset + 6, true);
    const numVerts = view.getUint32(offset + 8, true);
    const numFaces = view.getUint32(offset + 12, true);
    return _parseMeshArrays(view, offset + 16, numVerts, numFaces, vertexSize, faceSize, lodCount);
  }

  function _parseMeshV4(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = view.getUint16(offset, true);
    const numVerts = view.getUint32(offset + 4, true);
    const numFaces = view.getUint32(offset + 8, true);
    const lodCount = view.getUint16(offset + 12, true);
    return _parseMeshArrays(view, offset + headerSize, numVerts, numFaces, 40, 12, lodCount);
  }

  function _parseMeshArrays(view, offset, numVerts, numFaces, vertexSize, faceSize, lodCount) {
    const vertexBytes = offset + numVerts * vertexSize;
    const faceBytes = vertexBytes + numFaces * faceSize;
    if (!numVerts || !numFaces || vertexBytes > view.byteLength || faceBytes > view.byteLength)
      throw new Error('Invalid mesh dimensions');
    const positions = new Float32Array(numVerts * 3);
    let cursor = offset;
    for (let i = 0; i < numVerts; i += 1) {
      positions[i * 3] = view.getFloat32(cursor, true);
      positions[i * 3 + 1] = view.getFloat32(cursor + 4, true);
      positions[i * 3 + 2] = view.getFloat32(cursor + 8, true);
      cursor += vertexSize;
    }
    const rawFaces = [];
    for (let i = 0; i < numFaces; i += 1) {
      const a = faceSize === 6 ? view.getUint16(cursor, true) : view.getUint32(cursor, true);
      const b =
        faceSize === 6 ? view.getUint16(cursor + 2, true) : view.getUint32(cursor + 4, true);
      const c =
        faceSize === 6 ? view.getUint16(cursor + 4, true) : view.getUint32(cursor + 8, true);
      if (a < numVerts && b < numVerts && c < numVerts) rawFaces.push(a, b, c);
      cursor += faceSize;
    }
    let endFace = rawFaces.length / 3;
    if (lodCount && lodCount > 1 && cursor + lodCount * 4 <= view.byteLength) {
      const lods = Array.from({ length: lodCount }, (_, index) =>
        view.getUint32(cursor + index * 4, true),
      );
      if (lods[1] > lods[0] && lods[1] <= endFace) endFace = lods[1];
    }
    return _finishParsedMesh(positions, rawFaces.slice(0, endFace * 3));
  }

  function _finishParsedMesh(positionsInput, indicesInput, normalsInput = null) {
    const positions =
      positionsInput instanceof Float32Array ? positionsInput : new Float32Array(positionsInput);
    const indices =
      indicesInput instanceof Uint32Array ? indicesInput : new Uint32Array(indicesInput);
    const normals =
      normalsInput instanceof Float32Array
        ? normalsInput
        : normalsInput
          ? new Float32Array(normalsInput)
          : null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
    const bounds = { min, max };
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const size = bounds.max.map((item, index) => Math.max(item - bounds.min[index], 0.0001));
    return {
      positions,
      indices,
      normals,
      center,
      size,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
    };
  }

  function _createViewportProgram(gl) {
    const vertex = _compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec4 aColor;
      attribute float aFlag;
      uniform mat4 uMvp;
      uniform float uUnlit;
      varying vec4  vColor;
      varying vec3  vNormal;
      varying float vUnlit;
      varying float vFlag;
      void main() {
        vColor  = aColor;
        vNormal = aNormal;
        vUnlit  = uUnlit;
        vFlag   = aFlag;
        gl_Position = uMvp * vec4(aPosition, 1.0);
      }
    `,
    );
    const fragment = _compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      varying vec4  vColor;
      varying vec3  vNormal;
      varying float vUnlit;
      varying float vFlag;
      void main() {
        if (vUnlit > 0.5) {
          gl_FragColor = vColor;
          return;
        }
        vec3 n = normalize(vNormal);

        // Key light  — warm sun from upper-right-front
        vec3 keyDir  = normalize(vec3(0.55, 0.82, 0.45));
        float key    = max(dot(n, keyDir), 0.0);

        // Fill light — cool bounce from lower-left-back
        vec3 fillDir = normalize(vec3(-0.6, -0.18, -0.5));
        float fill   = max(dot(n, fillDir), 0.0) * 0.28;

        // Hemisphere ambient — sky slightly blue, ground slightly warm
        float hemi   = n.y * 0.5 + 0.5;
        vec3 sky     = vec3(0.42, 0.48, 0.58);
        vec3 ground  = vec3(0.32, 0.28, 0.24);
        vec3 ambient = mix(ground, sky, hemi) * 0.55;

        vec3 baseRgb = vColor.rgb;
        float alpha  = vColor.a;
        int flag = int(vFlag + 0.5);

        vec3 lit;
        if (flag == 1) {
          // Neon: emissive, barely affected by lighting, bright boost
          vec3 emissive = baseRgb * 1.6;
          float rim = pow(1.0 - abs(dot(n, keyDir)), 2.0) * 0.5;
          lit = clamp(emissive + vec3(rim), 0.0, 1.0);
        } else if (flag == 2) {
          // Glass: diffuse lighting, slight env reflection on facing-away faces
          vec3 diffuse = baseRgb * (ambient + vec3(key * 0.5 + fill));
          float fresnel = pow(1.0 - max(dot(n, normalize(vec3(0.55,0.82,0.45))), 0.0), 3.0);
          lit = mix(diffuse, vec3(0.82, 0.88, 0.95), fresnel * 0.35);
          alpha = min(alpha, 0.62);
        } else if (flag == 3) {
          // Metal/DiamondPlate: stronger specular, slight environment tint
          vec3 diffuse = baseRgb * (ambient * 0.7 + vec3(key * 0.9 + fill));
          float spec = pow(max(dot(n, keyDir), 0.0), 18.0) * 0.55;
          lit = diffuse + vec3(spec);
        } else {
          // Normal plastic/smooth
          lit = baseRgb * (ambient + vec3(key * 0.72 + fill));
        }

        // Gamma encode
        lit = pow(clamp(lit, 0.0, 1.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(lit, alpha);
      }
    `,
    );
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      aColor: gl.getAttribLocation(program, 'aColor'),
      aFlag: gl.getAttribLocation(program, 'aFlag'),
      uMvp: gl.getUniformLocation(program, 'uMvp'),
      uUnlit: gl.getUniformLocation(program, 'uUnlit'),
    };
  }

  function _compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function _createViewportBuffers(gl, scene, program) {
    const flatFlags = new Float32Array(scene.guide.vertexCount);
    return {
      mesh: _createVertexBuffer(
        gl,
        scene.mesh.positions,
        scene.mesh.normals,
        scene.mesh.colors,
        scene.mesh.flags || new Float32Array(scene.mesh.vertexCount),
        scene.mesh.vertexCount,
      ),
      guide: _createVertexBuffer(
        gl,
        scene.guide.positions,
        _flatNormals(scene.guide.vertexCount),
        scene.guide.colors,
        flatFlags,
        scene.guide.vertexCount,
      ),
    };
  }

  function _createVertexBuffer(gl, positions, normals, colors, flags, vertexCount) {
    const stride = 11;
    const data = new Float32Array(vertexCount * stride);
    for (let i = 0; i < vertexCount; i += 1) {
      const base = i * stride;
      data[base] = positions[i * 3];
      data[base + 1] = positions[i * 3 + 1];
      data[base + 2] = positions[i * 3 + 2];
      data[base + 3] = normals[i * 3];
      data[base + 4] = normals[i * 3 + 1];
      data[base + 5] = normals[i * 3 + 2];
      data[base + 6] = colors[i * 4];
      data[base + 7] = colors[i * 4 + 1];
      data[base + 8] = colors[i * 4 + 2];
      data[base + 9] = colors[i * 4 + 3];
      data[base + 10] = flags ? flags[i] || 0 : 0;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, vertexCount, stride: stride * 4 };
  }

  function _bindViewportBuffer(gl, program, buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.enableVertexAttribArray(program.aPosition);
    gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, buffer.stride, 0);
    gl.enableVertexAttribArray(program.aNormal);
    gl.vertexAttribPointer(program.aNormal, 3, gl.FLOAT, false, buffer.stride, 12);
    gl.enableVertexAttribArray(program.aColor);
    gl.vertexAttribPointer(program.aColor, 4, gl.FLOAT, false, buffer.stride, 24);
    if (program.aFlag >= 0) {
      gl.enableVertexAttribArray(program.aFlag);
      gl.vertexAttribPointer(program.aFlag, 1, gl.FLOAT, false, buffer.stride, 40);
    }
  }

  function _flatNormals(vertexCount) {
    const normals = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) normals.set([0, 1, 0], i * 3);
    return normals;
  }

  function _viewportMatrices(scene, camera, aspect) {
    const eye = [camera.x, camera.y, camera.z];
    const cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw);

    const target = [eye[0] - sy * cp, eye[1] + sp, eye[2] - cy * cp];
    const view = _mat4LookAt(eye, target, [0, 1, 0]);
    const near = Math.max(0.05, scene.extent / 2000);
    const far = Math.max(1000, scene.extent * 120);
    const projection = _mat4Perspective(Math.PI / 3, Math.max(0.1, aspect), near, far);
    return { mvp: _mat4Multiply(projection, view), eye };
  }

  function _mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function _mat4LookAt(eye, center, up) {
    const z = _norm(_sub(eye, center));
    const x = _norm(_cross(up, z));
    const y = _cross(z, x);
    const out = new Float32Array(16);
    out[0] = x[0];
    out[1] = y[0];
    out[2] = z[0];
    out[3] = 0;
    out[4] = x[1];
    out[5] = y[1];
    out[6] = z[1];
    out[7] = 0;
    out[8] = x[2];
    out[9] = y[2];
    out[10] = z[2];
    out[11] = 0;
    out[12] = -_dot(x, eye);
    out[13] = -_dot(y, eye);
    out[14] = -_dot(z, eye);
    out[15] = 1;
    return out;
  }

  function _mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[col * 4 + row] =
          a[row] * b[col * 4] +
          a[4 + row] * b[col * 4 + 1] +
          a[8 + row] * b[col * 4 + 2] +
          a[12 + row] * b[col * 4 + 3];
      }
    }
    return out;
  }

  function _niceGridStep(value) {
    const power = 10 ** Math.floor(Math.log10(Math.max(0.001, value)));
    const scaled = value / power;
    if (scaled <= 1) return power;
    if (scaled <= 2) return power * 2;
    if (scaled <= 5) return power * 5;
    return power * 10;
  }

  function _sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function _cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function _dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function _norm(vector) {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }

  function _scriptPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    const source = node.properties?.Source || node.properties?.source || '';
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Script</span><small>${_escape(node.className)}</small></div><pre>${_escape(source || 'No script source is present in this file.')}</pre></section>`;
    return wrap;
  }

  function _assetPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    const assets = _assetsFromNode(node);
    const asset = assets[0] || { key: '', value: '', id: '', kind: '' };
    if (!asset.value) {
      wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Asset</span><small>${_escape(node.className)}</small></div><div class="dt-asset-empty"><span>No asset reference</span><p>Image, texture, mesh, sound, animation, and content properties appear here.</p></div></section>`;
      return wrap;
    }
    const cards = assets.map((item, index) => _assetCard(item, index)).join('');
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Asset</span><small>${_escape(node.className)}</small></div><div class="dt-asset-stack">${cards}</div></section>`;
    wrap.querySelectorAll('[data-load-mesh-asset]').forEach((button) => {
      button.addEventListener('click', () =>
        _loadAssetMeshPreview(wrap, assets[Number(button.dataset.loadMeshAsset)], button),
      );
    });

    wrap.querySelectorAll('[data-download-asset]').forEach((button) => {
      button.addEventListener('click', () =>
        _downloadAsset(assets[Number(button.dataset.downloadAsset)], button),
      );
    });

    wrap.querySelectorAll('[data-fetch-image]').forEach((frame) => {
      const id = frame.dataset.fetchImage;
      _fetchAssetBlob(id, 'image').then((url) => {
        const placeholder = frame.querySelector('.dt-asset-loading');
        if (!url) {
          if (placeholder) placeholder.textContent = 'Preview unavailable';
          return;
        }
        const img = document.createElement('img');
        img.className = 'dt-asset-image';
        img.decoding = 'async';
        img.alt = '';
        img.src = url;
        if (placeholder) placeholder.replaceWith(img);
        else frame.prepend(img);
      });
    });

    wrap.querySelectorAll('[data-fetch-audio]').forEach((frame) => {
      const id = frame.dataset.fetchAudio;
      _fetchAssetBlob(id, 'audio').then((url) => {
        const placeholder = frame.querySelector('.dt-asset-loading');
        if (!url) {
          if (placeholder) placeholder.textContent = 'Audio unavailable';
          return;
        }
        const audio = document.createElement('audio');
        audio.className = 'dt-asset-audio';
        audio.controls = true;
        audio.src = url;
        if (placeholder) placeholder.replaceWith(audio);
        else frame.prepend(audio);
      });
    });

    return wrap;
  }

  async function _loadAssetMeshPreview(wrap, asset, button) {
    if (!asset?.id) return;
    const stage = button.closest('.dt-asset-card')?.querySelector('[data-mesh-stage]');
    try {
      button.disabled = true;
      button.textContent = 'Loading mesh';
      const mesh = await _parseRobloxMesh(await _fetchMeshAssetBytes(asset.id));
      if (!stage) return;
      stage.innerHTML = `<canvas class="dt-viewport-canvas" aria-label="Mesh asset preview"></canvas><div class="dt-render-stats"><span>${mesh.vertexCount.toLocaleString()} verts</span><span>${mesh.triangleCount.toLocaleString()} tris</span></div>`;
      requestAnimationFrame(() =>
        _mountViewport(stage.querySelector('.dt-viewport-canvas'), _sceneFromParsedMesh(mesh)),
      );
      button.textContent = 'Mesh loaded';
    } catch (err) {
      button.disabled = false;
      button.textContent = 'Retry mesh';
      if (stage)
        stage.innerHTML = `<div class="dt-asset-error">${_escape(err?.message || 'Mesh could not be loaded')}</div>`;
    }
  }

  function _sceneFromParsedMesh(asset) {
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = [];
    const positions = asset.positions;
    const indices = asset.indices;
    const point = (index) => {
      const offset = index * 3;
      return [positions[offset], positions[offset + 1], positions[offset + 2]];
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = point(indices[i]);
      const b = point(indices[i + 1]);
      const c = point(indices[i + 2]);
      points.push(a, b, c);
      mesh.tri(a, b, c, [116, 159, 218], 1);
    }
    const bounds = points.length ? _bounds(points) : { min: [-1, -1, -1], max: [1, 1, 1] };
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts: [],
      assets: [],
      assetCount: 0,
      assetReady: 0,
      assetFailed: 0,
      omittedParts: 0,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
    };
  }

  async function _downloadAsset(asset, button) {
    if (!asset?.id) return;
    _log.info(`Download: id=${asset.id} kind=${asset.kind}`);

    const isMesh = asset.kind === 'Mesh';
    const ext = isMesh ? 'mesh' : asset.kind === 'Audio' ? 'mp3' : 'png';
    const filename = `${asset.id}.${ext}`;

    if (isMesh) {
      const card = button.closest('.dt-asset-card');
      let bar = card?.querySelector('.dt-download-progress');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dt-download-progress';
        bar.innerHTML = `
          <div class="dt-download-progress-inner" style="padding:6px 0 2px">
            <div class="dt-download-bar-track" style="height:4px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-bottom:4px">
              <div class="dt-download-bar-fill" style="height:100%;width:0%;background:var(--accent,#5b8dd9);border-radius:2px;transition:width 0.2s ease"></div>
            </div>
            <span class="dt-download-label" style="font-size:11px;opacity:0.72">Starting…</span>
          </div>`;
        card?.appendChild(bar);
      }
      const fill = bar.querySelector('.dt-download-bar-fill');
      const label = bar.querySelector('.dt-download-label');
      const setProgress = (pct, text) => {
        fill.style.width = `${Math.round(pct)}%`;
        label.textContent = text;
      };

      button.disabled = true;
      setProgress(10, 'Resolving CDN…');

      try {
        setProgress(30, 'Fetching mesh bytes…');
        const bytes = await _fetchMeshAssetBytes(asset.id);
        setProgress(80, `${(bytes.length / 1024).toFixed(0)} KB — saving…`);
        _triggerDownload(bytes, filename, 'application/octet-stream');
        setProgress(100, `✓ ${filename}`);
        _log.info(`Downloaded mesh ${filename} (${bytes.length}B)`);
        setTimeout(() => {
          bar.remove();
          button.disabled = false;
        }, 2800);
      } catch (err) {
        const msg = _errMsg(err);
        setProgress(0, `✗ ${msg}`);
        _log.error(`Download failed id=${asset.id}: ${msg}`);
        fill.style.background = 'var(--dt-error, #c0392b)';
        setTimeout(() => {
          bar.remove();
          button.disabled = false;
        }, 3500);
      }
    } else {
      const orig = button.textContent;
      button.disabled = true;
      button.textContent = '…';
      try {
        const hint = asset.kind === 'Audio' ? 'audio' : 'image';
        const blobUrl = await _fetchAssetBlob(asset.id, hint);
        if (!blobUrl) throw new Error('No blob returned');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
        _log.info(`Downloaded ${filename}`);
        button.textContent = '✓';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = orig;
        }, 2000);
      } catch (err) {
        _log.error(`Download failed id=${asset.id}: ${_errMsg(err)}`);
        button.textContent = '✗';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = orig;
        }, 2500);
      }
    }
  }

  function _triggerDownload(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 6000);
  }

  function _assetCard(asset, index = 0) {
    const preview =
      asset.kind === 'Mesh'
        ? `<div class="dt-asset-image-frame dt-asset-image-frame--mesh" data-mesh-stage="${_escape(asset.id)}"><span>Mesh</span><strong>${_escape(asset.id || '?')}</strong><small>Fetches mesh bytes and renders geometry when Roblox allows delivery.</small></div>`
        : asset.id
          ? asset.kind === 'Audio'
            ? `<div class="dt-asset-image-frame dt-asset-image-frame--audio" data-fetch-audio="${_escape(asset.id)}"><span class="dt-asset-loading">Loading audio…</span><span>${_escape(asset.kind)}</span></div>`
            : `<div class="dt-asset-image-frame" data-fetch-image="${_escape(asset.id)}"><span class="dt-asset-loading">Loading…</span><span>${_escape(asset.kind)}</span></div>`
          : '<div class="dt-asset-image-frame empty"><span>No preview</span></div>';
    const load =
      asset.kind === 'Mesh' && asset.id
        ? `<button class="dt-asset-open" type="button" data-load-mesh-asset="${index}">Load mesh</button>`
        : '';
    const downloadBtn = asset.id
      ? `<button class="dt-asset-download" type="button" data-download-asset="${index}" title="Download ${asset.kind || 'asset'} (id ${asset.id})">↓ Download</button>`
      : '';
    const link = asset.id
      ? `<a class="dt-asset-open" href="https://www.roblox.com/library/${_escape(asset.id)}" target="_blank" rel="noreferrer">Open asset</a>`
      : '';
    return `<div class="dt-asset-card">${preview}<div class="dt-asset-meta"><div><span>Property</span><strong>${_escape(asset.key)}</strong></div><div><span>Asset ID</span><strong>${_escape(asset.id || 'Not detected')}</strong></div><div><span>Reference</span><code>${_escape(asset.value)}</code></div>${load}${downloadBtn}${link}</div></div>`;
  }

  function _assetFromNode(node) {
    return _assetsFromNode(node)[0] || { key: '', value: '', id: '', kind: '' };
  }

  function _assetsFromNode(node) {
    const props = node.properties || {};

    const knownKeys = [
      'MeshId',
      'MeshID',
      'MeshContent',
      'Texture',
      'TextureID',
      'TextureId',
      'TextureContent',
      'Image',
      'ImageContent',
      'SoundId',
      'SoundID',
      'AnimationId',
      'AnimationID',
      'Graphic',
      'ShirtTemplate',
      'PantsTemplate',
      'Face',
      'SkyboxBk',
      'SkyboxDn',
      'SkyboxFt',
      'SkyboxLf',
      'SkyboxRt',
      'SkyboxUp',
      'BaseTextureId',
      'OverlayTextureId',
      'BaseTextureContent',
      'OverlayTextureContent',
    ];

    const seenKeys = new Set();
    const seenIds = new Set();
    const seenSigs = new Set();
    const assets = [];

    const push = (key, value) => {
      const id = _assetId(value);
      const sig = `${key}:${id || value}`;
      if (seenSigs.has(sig)) return;
      if (id && seenIds.has(id)) return;
      seenSigs.add(sig);
      if (id) seenIds.add(id);
      const entry = { key, value, id, kind: _assetKind(key, value) };
      _log.info(`  asset prop "${key}" id=${id || '(none)'} kind=${entry.kind}`);
      assets.push(entry);
    };

    for (const key of knownKeys) {
      seenKeys.add(key.toLowerCase());
      const value = String(props[key] || '').trim();
      if (value) push(key, value);
    }

    for (const key of Object.keys(props)) {
      if (seenKeys.has(key.toLowerCase())) continue;
      if (
        !/asset|content|image|texture|mesh|sound|animation|template|skybox|graphic|face/i.test(key)
      )
        continue;
      const value = String(props[key] || '').trim();
      if (value) push(key, value);
    }

    return assets;
  }

  function _assetId(value) {
    return _extractAssetId(value);
  }

  function _assetKind(key, value) {
    const text = `${key} ${value}`.toLowerCase();
    if (text.includes('mesh')) return 'Mesh';
    if (text.includes('sound') || text.includes('audio')) return 'Audio';
    if (text.includes('animation')) return 'Animation';
    if (
      text.includes('image') ||
      text.includes('texture') ||
      text.includes('decal') ||
      text.includes('skybox')
    )
      return 'Image';
    return 'Asset';
  }

  function _thumbnailUrl(id) {
    return `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}`;
  }

  function _rawPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Raw</span><small>${_escape(_nodePath(activeSnapshot(), node))}</small></div><pre>${_escape(JSON.stringify(node, null, 2))}</pre></section>`;
    return wrap;
  }

  function _previewKind(node) {
    const klass = String(node.className || '').toLowerCase();
    const asset = _assetFromNode(node).value;
    if (/script|module/.test(klass))
      return {
        mode: 'script',
        label: 'Script',
        title: 'Script source',
        body: 'Source captured from the place file.',
      };
    if (_isViewportInstance(klass))
      return {
        mode: 'viewport',
        label: 'Viewport',
        title: 'Model preview',
        body: 'Interactive model viewport for parsed RBXLX geometry.',
      };
    if (asset || /decal|texture|image|sound|audio|animation|video/.test(klass))
      return {
        mode: 'asset',
        label: 'Asset',
        title: 'Asset preview',
        body: 'Captured asset references and preview thumbnails.',
      };
    return {
      mode: 'raw',
      label: 'Raw',
      title: 'Raw data',
      body: 'Readonly metadata for the selected instance.',
    };
  }

  function _isViewportInstance(klass) {
    return /^(workspace|worldmodel|model|part|meshpart|unionoperation|intersectoperation|negateoperation|wedgepart|cornerwedgepart|trusspart|seat|vehicleseat|spawnlocation|terrain)$/.test(
      klass,
    );
  }

  function _previewTabs(node, previewKind = _previewKind(node)) {
    if (previewKind.mode === 'script') return ['script'];
    if (previewKind.mode === 'asset') return ['asset', 'raw'];
    if (previewKind.mode === 'viewport') return ['viewport', 'raw'];
    return ['raw'];
  }

  function _preferredPreviewTab(node, previewKind = _previewKind(node)) {
    return _previewTabs(node, previewKind)[0] || 'raw';
  }

  function _detailsPane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('aside');
    pane.className = 'dt-details';
    if (snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length) {
      pane.innerHTML = '<div class="dt-empty">Loading properties and attributes...</div>';
      return pane;
    }
    const node =
      snapshot?.byId?.get(state_.activeNodeId) ||
      (snapshot?.rootId ? snapshot.byId.get(snapshot.rootId) : null);
    if (!snapshot || !node) {
      pane.innerHTML = '<div class="dt-empty">Select an instance to inspect metadata.</div>';
      return pane;
    }
    pane.innerHTML = `<div class="dt-details-head"><div><span>Inspector</span><small>${Number(node.childCount || 0).toLocaleString()} children</small></div></div>`;
    const sections = [
      _kvSection('Properties', node.properties, node),
      _kvSection('Attributes', node.attributes, node),
    ];
    const tags = _tagSection(node.tags);
    if (tags) sections.push(tags);
    pane.append(...sections);
    return pane;
  }

  function _kvSection(title, data, node) {
    const section = document.createElement('section');
    section.className = 'dt-kv-section';
    const entries = Object.entries(data || {});
    section.innerHTML = `<span><strong>${_escape(title)}</strong><em>${entries.length.toLocaleString()}</em></span>`;
    if (!entries.length) {
      section.insertAdjacentHTML('beforeend', '<div class="dt-empty-small">None</div>');
      return section;
    }
    for (const [key, value] of entries) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dt-kv-row';
      row.title = 'Open full value';
      row.innerHTML = `<span>${_escape(key)}</span><code>${_escape(_formatValue(value))}</code><em>Open</em>`;
      row.addEventListener('click', () => _openFullValue(title, key, value, node));
      section.appendChild(row);
    }
    return section;
  }

  async function _openFullValue(section, key, currentValue, node) {
    const snapshot = activeSnapshot();
    let value = currentValue;
    if (snapshot?.storagePath && node?.id) {
      try {
        value = await window.__TAURI__.core.invoke('datatree_node_value', {
          path: snapshot.storagePath,
          nodeId: node.id,
          section,
          key,
        });
      } catch (err) {
        toast.show(err?.message || 'Could not load full value', 'fail', 2400);
      }
    }
    _valueDialog(`${section}.${key}`, value);
  }

  function _valueDialog(title, value) {
    document.querySelector('.dt-value-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'dt-value-modal';
    const text = _formatFullValue(value);
    overlay.innerHTML = `<div class="dt-value-card" role="dialog" aria-modal="true"><header><div><span>Full Value</span><strong>${_escape(title)}</strong></div><button type="button" data-action="close" aria-label="Close">×</button></header><textarea readonly spellcheck="false"></textarea><footer><small>${text.length.toLocaleString()} characters</small><button type="button" data-action="copy">Copy</button><button type="button" data-action="close">Done</button></footer></div>`;
    const textarea = overlay.querySelector('textarea');
    textarea.value = text;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target?.dataset?.action === 'close') close();
    });
    overlay.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast.show('Copied full value', 'ok', 1200);
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }

  function _formatFullValue(value) {
    if (value == null) return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }

  function _tagSection(tags) {
    if (!tags?.length) return null;
    const section = document.createElement('section');
    section.className = 'dt-kv-section';
    section.innerHTML = `<span><strong>Tags</strong><em>${tags.length.toLocaleString()}</em></span><div class="dt-tags">${tags.map((tag) => `<span>${_escape(tag)}</span>`).join('')}</div>`;
    return section;
  }

  function _formatValue(value) {
    if (value == null) return String(value);
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }

  function ensureBridge() {
    return Promise.resolve(null);
  }
  function captureLiveTree() {
    toast.show('Import an RBXLX file to use DataTree.', 'warn', 2200);
  }
  function queueTask() {
    return Promise.resolve();
  }
  function handleBridgeEvent() {}
  function handleBridgeError() {}

  return {
    init,
    show,
    hide,
    render,
    openImportDialog,
    importRbxlx,
    ensureBridge,
    captureLiveTree,
    handleBridgeEvent,
    handleBridgeError,
    queueTask,
  };
})();
