const paths = (() => {
  let _data = null;

  async function init() {
    if (_data) return;
    _data = await window.__TAURI__.core.invoke('get_app_paths');
  }

  function _require(label) {
    if (!_data) throw new Error(`paths.${label} accessed before paths.init()`);
  }

  function _get(key, label = key) {
    _require(label);
    return _data[key];
  }

  function join(...parts) {
    return parts.map((p) => p.replace(/\/+$/, '')).join('/');
  }

  function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  }

  return {
    get home() {
      return _get('home');
    },
    get velocityuiDir() {
      return _get('velocityui', 'velocityuiDir');
    },
    get internals() {
      return _get('internals');
    },
    get workspaces() {
      return _get('workspaces');
    },
    get defaultWorkspace() {
      return _get('defaultWorkspace');
    },
    join,
    sanitize,
    init,
  };
})();
