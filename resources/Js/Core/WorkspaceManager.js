const workspaceManager = (() => {
  let _current = null;
  function _wsPath(name) {
    return paths.join(paths.workspaces, `${paths.sanitize(name)}.json`);
  }
  async function list() {
    try {
      const entries = await window.__TAURI__.core.invoke("read_dir", {
        path: paths.workspaces,
      });
      return entries
        .filter((e) => e.entry.endsWith(".json") && !e.entry.startsWith("."))
        .map((e) => e.entry.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }
  async function load(name) {
    try {
      const raw = await window.__TAURI__.core.invoke("read_text_file", {
        path: _wsPath(name),
      });
      _current = JSON.parse(raw);
      return _current;
    } catch {
      return null;
    }
  }
  async function save(ws) {
    _current = ws;
    await window.__TAURI__.core.invoke("write_text_file", {
      path: _wsPath(ws.name),
      content: JSON.stringify(ws, null, 2),
    });
  }
  async function create(name) {
    const ws = {
      name,
      folders: [],
    };
    await save(ws);
    return ws;
  }
  async function addFolder(ws, folderPath) {
    if (!ws.folders.some((f) => f.path === folderPath))
      ws.folders.push({
        path: folderPath,
      });
    await save(ws);
  }
  async function removeFolder(ws, folderPath) {
    ws.folders = ws.folders.filter((f) => f.path !== folderPath);
    await save(ws);
  }
  async function deleteWorkspace(name) {
    try {
      await window.__TAURI__.core.invoke("remove_path", {
        path: _wsPath(name),
      });
    } catch {}
    if (_current?.name === name) _current = null;
  }
  function getCurrent() {
    return _current;
  }
  return {
    list,
    load,
    save,
    create,
    addFolder,
    removeFolder,
    deleteWorkspace,
    getCurrent,
  };
})();
