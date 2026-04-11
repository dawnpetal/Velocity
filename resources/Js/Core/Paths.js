const paths = (() => {
  let _home = null;
  let _velocity = null;
  let _internals = null;
  async function init() {
    if (_home) return;
    _home = await window.__TAURI__.core.invoke("get_home_dir");
    _velocity = `${_home}/Velocity`;
    _internals = `${_velocity}/internals`;
    for (const dir of [_velocity, _internals]) {
      try {
        await window.__TAURI__.core.invoke("create_dir", {
          path: dir,
        });
      } catch {}
    }
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
    get internals() {
      _require("internals");
      return _internals;
    },
    join,
    sanitize,
    init,
  };
})();
