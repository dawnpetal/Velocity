const uiState = (() => {
  let _sidebarWidth = null;
  let _panelVisible = false;
  let _sbBottomHeight = null;
  let _activeView = "explorer";
  let _fontSize = null;
  let _wordWrap = null;
  let _minimap = null;
  let _lineNumbers = null;
  let _executor = "opium";
  const VALID_EXECUTORS = new Set(["hydrogen", "opium"]);
  function snapshot() {
    return {
      sidebarWidth: _sidebarWidth,
      panelVisible: _panelVisible,
      sbBottomHeight: _sbBottomHeight,
      activeView: _activeView,
      settings: {
        fontSize: _fontSize,
        wordWrap: _wordWrap,
        minimap: _minimap,
        lineNumbers: _lineNumbers,
        executor: _executor,
      },
    };
  }
  function applyLoaded(loaded) {
    if (!loaded) return;
    if (loaded.sidebarWidth != null) _sidebarWidth = loaded.sidebarWidth;
    if (loaded.sbBottomHeight != null) _sbBottomHeight = loaded.sbBottomHeight;
    if (loaded.panelVisible != null) _panelVisible = loaded.panelVisible;
    if (loaded.activeView) _activeView = loaded.activeView;
    const s = loaded.settings ?? {};
    if (s.fontSize != null) _fontSize = s.fontSize;
    if (s.wordWrap != null) _wordWrap = s.wordWrap;
    if (s.minimap != null) _minimap = s.minimap;
    if (s.lineNumbers != null) _lineNumbers = s.lineNumbers;
    if (s.executor && VALID_EXECUTORS.has(s.executor)) _executor = s.executor;
  }
  function save() {
    persist.saveUI(snapshot()).catch(() => {});
  }
  function setSidebarWidth(px) {
    _sidebarWidth = px;
    save();
  }
  function setPanelVisible(v) {
    _panelVisible = v;
    save();
  }
  function setSbBottomHeight(px) {
    _sbBottomHeight = px;
    save();
  }
  function setActiveView(v) {
    _activeView = v;
    save();
  }
  function setFontSize(n) {
    _fontSize = n;
    save();
  }
  function setWordWrap(v) {
    _wordWrap = v;
    save();
  }
  function setMinimap(v) {
    _minimap = v;
    save();
  }
  function setLineNumbers(v) {
    _lineNumbers = v;
    save();
  }
  function setExecutor(v) {
    if (!VALID_EXECUTORS.has(v)) return;
    _executor = v;
    save();
  }
  return {
    applyLoaded,
    get executor() {
      return _executor;
    },
    get sidebarWidth() {
      return _sidebarWidth;
    },
    get sbBottomHeight() {
      return _sbBottomHeight;
    },
    get panelVisible() {
      return _panelVisible;
    },
    get activeView() {
      return _activeView;
    },
    get fontSize() {
      return _fontSize;
    },
    get wordWrap() {
      return _wordWrap;
    },
    get minimap() {
      return _minimap;
    },
    get lineNumbers() {
      return _lineNumbers;
    },
    setSidebarWidth,
    setPanelVisible,
    setSbBottomHeight,
    setActiveView,
    setFontSize,
    setWordWrap,
    setMinimap,
    setLineNumbers,
    setExecutor,
    snapshot,
  };
})();
