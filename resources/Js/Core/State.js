const state = (() => {
  let _files = new Map();
  let _tabs = [];
  let _activeId = null;
  let _unsaved = new Set();
  let _workDir = null;
  let _roots = [];
  let _previewId = null;
  function _emit(event, data = {}) {
    eventBus.emit(event, data);
  }
  function addFile(id, name, path, content = null, opts = {}) {
    if (_files.has(id)) return;
    _files.set(id, {
      id,
      name,
      path,
      content,
      _lines: null,
      preview: opts.preview ?? false,
      previewType: opts.previewType ?? null,
      binaryData: opts.binaryData ?? null,
    });
  }
  function setContent(id, content) {
    const f = _files.get(id);
    if (!f) return;
    f.content = content;
    f._lines = null;
  }
  function getFile(id) {
    return _files.get(id) ?? null;
  }
  function getActive() {
    return _activeId ? (_files.get(_activeId) ?? null) : null;
  }
  function setActive(id) {
    _activeId = id;
    if (!id) {
      _emit("file:activated", {
        id: null,
        file: null,
      });
      return;
    }
    if (!_tabs.includes(id)) {
      if (_previewId && _previewId !== id && !_unsaved.has(_previewId)) {
        const idx = _tabs.indexOf(_previewId);
        if (idx !== -1) _tabs.splice(idx, 1);
        _unsaved.delete(_previewId);
      }
      _previewId = id;
      _tabs.push(id);
    }
    _emit("file:activated", {
      id,
      file: _files.get(id) ?? null,
    });
  }
  function updateContent(id, content) {
    const f = _files.get(id);
    if (!f) return;
    f.content = content;
    f._lines = null;
    _unsaved.add(id);
    if (_previewId === id) _previewId = null;
    _emit("file:changed", {
      id,
    });
  }
  function getLines(id) {
    const f = _files.get(id);
    if (!f || f.content === null) return [];
    if (!f._lines) f._lines = f.content.split("\n");
    return f._lines;
  }
  function markSaved(id) {
    _unsaved.delete(id);
  }
  function isUnsaved(id) {
    return _unsaved.has(id);
  }
  function removeFile(id) {
    _files.delete(id);
  }
  function closeTab(id) {
    _tabs = _tabs.filter((t) => t !== id);
    _unsaved.delete(id);
    if (_previewId === id) _previewId = null;
    if (_activeId === id) {
      _activeId = _tabs.at(-1) ?? null;
      _emit("file:activated", {
        id: _activeId,
        file: _activeId ? (_files.get(_activeId) ?? null) : null,
      });
    }
    _emit("file:closed", {
      id,
    });
  }
  function addRoot(node) {
    if (!_roots.some((r) => r.path === node.path)) _roots.push(node);
    return node;
  }
  function removeRoot(path) {
    _roots = _roots.filter((r) => r.path !== path);
  }
  function clear() {
    _files.clear();
    _tabs = [];
    _activeId = null;
    _unsaved.clear();
    _roots = [];
    _workDir = null;
    _previewId = null;
    _emit("workspace:cleared", {});
  }
  return {
    get files() {
      return [..._files.values()];
    },
    get openTabIds() {
      return _tabs;
    },
    get activeFileId() {
      return _activeId;
    },
    get unsaved() {
      return _unsaved;
    },
    get workDir() {
      return _workDir;
    },
    set workDir(v) {
      _workDir = v;
    },
    get roots() {
      return _roots;
    },
    get fileTree() {
      return _roots[0] ?? null;
    },
    set fileTree(v) {
      _roots = v === null ? [] : [v];
    },
    get previewTabId() {
      return _previewId;
    },
    set previewTabId(v) {
      _previewId = v;
    },
    addFile,
    getFile,
    getActive,
    setActive,
    updateContent,
    setContent,
    getLines,
    markSaved,
    isUnsaved,
    removeFile,
    closeTab,
    addRoot,
    removeRoot,
    clear,
  };
})();
