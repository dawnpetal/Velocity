const autoexec = (() => {
  const FOLDER_NAME = 'Autoexecute';
  const META_FILE = 'autoexec_meta.json';
  const MULTIEXEC_FILE = 'VelocityUI_multiexec.lua';

  let _enabled = false;
  let _inited = false;
  let _syncedFiles = new Set();

  function _legacyDir() {
    return `${paths.internals}/autoexec_scripts`;
  }

  function _metaPath() {
    return `${paths.internals}/${META_FILE}`;
  }

  function _workspaceDir(baseDir = state.workDir) {
    return baseDir ? `${baseDir}/${FOLDER_NAME}` : null;
  }

  function _managedDir(baseDir = state.workDir) {
    return _workspaceDir(baseDir) ?? _legacyDir();
  }

  async function _executorDir() {
    return window.__TAURI__.core.invoke('get_executor_autoexec_dir');
  }

  async function _ensureDir(path) {
    try {
      await window.__TAURI__.core.invoke('create_dir', { path });
    } catch {}
  }

  async function _listLuaFiles(dir) {
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: dir });
      return entries
        .filter(
          (entry) =>
            entry.type === 'FILE' &&
            !entry.entry.startsWith('.') &&
            entry.entry.endsWith('.lua') &&
            entry.entry !== MULTIEXEC_FILE,
        )
        .sort((a, b) => a.entry.localeCompare(b.entry));
    } catch {
      return [];
    }
  }

  async function _read(path) {
    return window.__TAURI__.core.invoke('read_text_file', { path });
  }

  async function _write(path, content) {
    return window.__TAURI__.core.invoke('write_text_file', { path, content });
  }

  async function _remove(path) {
    try {
      await window.__TAURI__.core.invoke('remove_path', { path });
    } catch {}
  }

  async function _copyMissingLuaFiles(srcDir, destDir) {
    const files = await _listLuaFiles(srcDir);
    for (const file of files) {
      const dest = `${destDir}/${file.entry}`;
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: dest });
        if (stat.exists) continue;
        await _write(dest, await _read(`${srcDir}/${file.entry}`));
      } catch {}
    }
  }

  async function ensureWorkspaceFolder(baseDir = state.workDir) {
    const dir = _workspaceDir(baseDir);
    if (!dir) return null;
    await _ensureDir(dir);
    await _copyMissingLuaFiles(_legacyDir(), dir);
    try {
      await _copyMissingLuaFiles(await _executorDir(), dir);
    } catch {}
    return dir;
  }

  async function _sourceDir(baseDir = state.workDir) {
    const dir = _managedDir(baseDir);
    await _ensureDir(dir);
    if (_workspaceDir(baseDir)) await ensureWorkspaceFolder(baseDir);
    return dir;
  }

  async function _loadMeta() {
    try {
      const meta = JSON.parse(await _read(_metaPath()));
      _enabled = !!meta.enabled;
      _syncedFiles = new Set(Array.isArray(meta.files) ? meta.files : []);
    } catch {
      _enabled = false;
      _syncedFiles = new Set();
    }
  }

  async function _saveMeta() {
    try {
      await _write(
        _metaPath(),
        JSON.stringify({ enabled: _enabled, files: [..._syncedFiles].sort() }),
      );
    } catch {}
    eventBus.emit('autoexec:changed', { enabled: _enabled });
  }

  async function sync() {
    await init();
    const sourceDir = await _sourceDir();
    const executorDir = await _executorDir();
    const files = await _listLuaFiles(sourceDir);
    const currentNames = new Set(files.map((file) => file.entry));

    if (_enabled) {
      for (const file of files) {
        try {
          await _write(`${executorDir}/${file.entry}`, await _read(`${sourceDir}/${file.entry}`));
        } catch {}
      }
      for (const name of _syncedFiles) {
        if (!currentNames.has(name)) await _remove(`${executorDir}/${name}`);
      }
      _syncedFiles = currentNames;
      await _saveMeta();
      return;
    }

    for (const name of new Set([..._syncedFiles, ...currentNames])) {
      await _remove(`${executorDir}/${name}`);
    }
    _syncedFiles = new Set();
    await _saveMeta();
  }

  async function init() {
    if (_inited) return;
    await _loadMeta();
    _inited = true;
  }

  function _logStatus(message, type = 'info') {
    if (typeof console_ !== 'undefined') console_.log('[Autoexecute] ' + message, type);
  }

  async function toggleEnabled() {
    await init();
    _enabled = !_enabled;
    await _saveMeta();
    try {
      await sync();
      _logStatus(_enabled ? 'Enabled and synced.' : 'Disabled and cleaned executor copies.');
      toast.show(
        _enabled ? 'Autoexecute enabled' : 'Autoexecute disabled',
        _enabled ? 'ok' : 'info',
        1600,
      );
    } catch (err) {
      const message = err?.message ?? String(err ?? 'Unknown error');
      _logStatus('Sync failed: ' + message, 'fail');
      toast.show('Autoexecute sync failed', 'warn', 2500);
    } finally {
      ExplorerTree.render();
    }
  }

  async function onExecutorChanged() {
    if (!_inited) return;
    await sync().catch(() => {});
  }

  function isEnabled() {
    return _enabled;
  }

  function isProtectedPath(path) {
    const dir = _workspaceDir();
    return !!dir && path === dir;
  }

  function isInsideProtectedArea(path) {
    const dir = _workspaceDir();
    return !!dir && (path === dir || path.startsWith(dir + '/'));
  }

  function containsScript(path) {
    return isInsideProtectedArea(path) && path.endsWith('.lua');
  }

  function isProtectedRootNode(node) {
    return !!node && node.type === 'folder' && isProtectedPath(node.path);
  }

  return {
    init,
    sync,
    toggleEnabled,
    onExecutorChanged,
    isEnabled,
    isProtectedPath,
    isInsideProtectedArea,
    containsScript,
    isProtectedRootNode,
    ensureWorkspaceFolder,
  };
})();
