const keyboardManager = (() => {
  const _registry = [];
  const _MODIFIERS = new Set(['Meta', 'Control', 'Alt', 'Shift']);
  let _scope = 'explorer';
  let _paused = false;
  function _parse(keys) {
    const binding = {
      meta: false,
      ctrl: false,
      alt: false,
      shift: false,
      key: null,
    };
    for (const raw of keys.split('+').map((s) => s.trim().toLowerCase())) {
      if (raw === 'cmd' || raw === 'meta') {
        binding.meta = true;
        continue;
      }
      if (raw === 'ctrl') {
        binding.ctrl = true;
        continue;
      }
      if (raw === 'alt') {
        binding.alt = true;
        continue;
      }
      if (raw === 'shift') {
        binding.shift = true;
        continue;
      }
      binding.key = raw;
    }
    return binding;
  }
  function _matches(binding, e) {
    const isMac = navigator.platform.includes('Mac');
    const cmdHeld = isMac ? e.metaKey : e.ctrlKey;
    if (binding.meta !== cmdHeld) return false;
    if (binding.alt !== e.altKey) return false;
    if (binding.shift !== e.shiftKey) return false;
    return e.key.toLowerCase() === binding.key;
  }
  function _scopeAllowed(entry) {
    if (_paused) return false;
    if (entry.scope?.length) return entry.scope.includes(_scope) || entry.scope.includes('global');
    if (entry.blacklist?.length) return !entry.blacklist.includes(_scope);
    return true;
  }
  function _monacoFocused() {
    const el = document.activeElement;
    return !!(el?.closest('.monaco-editor') || el?.classList.contains('inputarea'));
  }
  function _nativeInputFocused() {
    const el = document.activeElement;
    const tag = el?.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable;
  }
  function registerShortcut({
    keys,
    scope,
    blacklist,
    handler,
    allowInEditor = false,
    allowInInputs = false,
  }) {
    _registry.push({
      binding: _parse(keys),
      scope: scope ?? null,
      blacklist: blacklist ?? null,
      handler,
      allowInEditor,
      allowInInputs,
    });
  }
  function setScope(scope) {
    _scope = scope;
  }
  function getScope() {
    return _scope;
  }
  function _dispatch(e) {
    if (_MODIFIERS.has(e.key)) return;
    if (_paused) return;
    const inMonaco = _monacoFocused();
    const inInput = !inMonaco && _nativeInputFocused();
    for (const entry of _registry) {
      if (!_matches(entry.binding, e)) continue;
      if (!_scopeAllowed(entry)) continue;
      if (inMonaco && !entry.allowInEditor) continue;
      if (inInput && !entry.allowInInputs) continue;
      e.preventDefault();
      entry.handler(e);
      return;
    }
  }
  function init() {
    window.addEventListener('keydown', _dispatch, { capture: true });
  }
  function pause() {
    _paused = true;
  }
  function resume() {
    _paused = false;
  }
  return {
    init,
    registerShortcut,
    setScope,
    getScope,
    pause,
    resume,
  };
})();
