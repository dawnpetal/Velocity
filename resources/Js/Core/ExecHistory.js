const execHistory = (() => {
  const MAX = 50;
  let _items = [];
  let _writeTimer = null;
  function _filePath() {
    return paths.join(paths.internals, "exec_history.json");
  }
  async function load() {
    try {
      const raw = await window.__TAURI__.core.invoke("read_text_file", {
        path: _filePath(),
      });
      const parsed = JSON.parse(raw);
      _items = Array.isArray(parsed) ? parsed : [];
    } catch {
      _items = [];
    }
  }
  function _schedulePersist() {
    clearTimeout(_writeTimer);
    _writeTimer = setTimeout(async () => {
      try {
        await window.__TAURI__.core.invoke("write_text_file", {
          path: _filePath(),
          content: JSON.stringify(_items),
        });
      } catch {}
    }, 300);
  }
  async function push(script, filename) {
    const entry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      filename: filename || "unknown",
      script,
      preview: script.slice(0, 120).replace(/\n/g, " "),
    };
    _items.unshift(entry);
    if (_items.length > MAX) _items.length = MAX;
    _schedulePersist();
    return entry;
  }
  function getAll() {
    return _items;
  }
  return {
    load,
    push,
    getAll,
  };
})();
