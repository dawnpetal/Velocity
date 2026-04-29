const execHistory = (() => {
  const invoke = window.__TAURI__.core.invoke;
  let _items = [];

  async function load() {
    try {
      _items = await invoke('get_exec_history_cmd');
    } catch {
      _items = [];
    }
  }

  async function push(script, filename) {
    try {
      const entry = await invoke('push_exec_history_cmd', {
        script,
        filename: filename || 'unknown',
      });
      _items.unshift(entry);
      if (_items.length > 50) _items.length = 50;
      return entry;
    } catch {
      return null;
    }
  }

  function getAll() {
    return _items;
  }

  return { load, push, getAll };
})();
