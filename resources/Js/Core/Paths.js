const paths = (() => {
  let _home = null;
  let _velocity = null;
  async function init() {
    if (_home) return;
    _home = await window.__TAURI__.core.invoke("get_home_dir");
    _velocity = `${_home}/Velocity`;
    try {
      await window.__TAURI__.core.invoke("create_dir", {
        path: _velocity,
      });
    } catch {}
  }
  function _require(label) {
    if (!_home) throw new Error(`paths.${label} accessed before paths.init()`);
  }
  function join(...parts) {
    return parts.map((p) => p.replace(/\/+$/, "")).join("/");
  }
  function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  }
  return {
    get home() {
      _require("home");
      return _home;
    },
    get velocityDir() {
      _require("velocityDir");
      return _velocity;
    },
    join,
    sanitize,
    init,
  };
})();
