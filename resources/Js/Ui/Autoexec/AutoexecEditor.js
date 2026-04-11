const AutoexecEditor = (() => {
  let _monacoEditor = null;
  let _monacoModel = null;
  let _dirty = false;
  let _currentFilePath = null;
  const EDITOR_FONT_SIZE = 13;
  const EDITOR_TAB_SIZE = 2;
  const EDITOR_PADDING = {
    top: 10,
    bottom: 10,
  };
  async function loadFile(filePath) {
    _currentFilePath = filePath;
    const wrap = document.getElementById("autoexecEditorWrap");
    if (!wrap) return;
    let content = "";
    try {
      content = await window.__TAURI__.core.invoke("read_text_file", {
        path: filePath,
      });
    } catch {
      content = "";
    }
    if (_monacoEditor) {
      if (_monacoModel) _monacoModel.dispose();
      _monacoModel = window.monaco.editor.createModel(content, "lua");
      _monacoEditor.setModel(_monacoModel);
      _monacoModel.onDidChangeContent(() => {
        _dirty = true;
        renderSaveIndicator(true);
      });
      _dirty = false;
      renderSaveIndicator(false);
      return;
    }
    wrap.innerHTML = "";
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:100%;";
    wrap.appendChild(container);
    if (!window.monaco) return;
    const monaco = window.monaco;
    _monacoModel = monaco.editor.createModel(content, "lua");
    _monacoEditor = monaco.editor.create(container, {
      model: _monacoModel,
      theme: "velocity",
      fontSize: EDITOR_FONT_SIZE,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineNumbers: "on",
      minimap: {
        enabled: false,
      },
      wordWrap: "off",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: EDITOR_PADDING,
      renderLineHighlight: "line",
      bracketPairColorization: {
        enabled: true,
      },
      guides: {
        indentation: true,
      },
      wordBasedSuggestions: "currentDocument",
      suggest: {
        showKeywords: true,
        showSnippets: true,
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
      tabSize: EDITOR_TAB_SIZE,
      insertSpaces: true,
      detectIndentation: false,
      folding: true,
      showFoldingControls: "mouseover",
      contextmenu: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
    });
    _monacoModel.onDidChangeContent(() => {
      _dirty = true;
      renderSaveIndicator(true);
    });
    wrap.addEventListener(
      "keydown",
      (e) => {
        const isMac = navigator.platform.includes("Mac");
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          save(_currentFilePath);
        }
      },
      true,
    );
    _dirty = false;
    renderSaveIndicator(false);
  }
  async function flushSave(filePath) {
    if (!filePath || !_monacoEditor) return;
    try {
      await window.__TAURI__.core.invoke("write_text_file", {
        path: filePath,
        content: _monacoEditor.getValue(),
      });
      _dirty = false;
      renderSaveIndicator(false);
    } catch {}
  }
  async function save(filePath) {
    if (!filePath || !_monacoEditor) return;
    try {
      await window.__TAURI__.core.invoke("write_text_file", {
        path: filePath,
        content: _monacoEditor.getValue(),
      });
      _dirty = false;
      renderSaveIndicator(false);
      toast.show("Saved", "ok", 900);
    } catch {
      toast.show("Save failed", "fail", 2000);
    }
  }
  function renderSaveIndicator(isDirty) {
    const btn = document.getElementById("autoexecSaveBtn");
    if (btn) btn.style.opacity = isDirty ? "1" : "0";
  }
  function getEditor() {
    return _monacoEditor;
  }
  function isDirty() {
    return _dirty;
  }
  function dispose() {
    if (_monacoEditor) {
      _monacoEditor.dispose();
      _monacoEditor = null;
    }
    if (_monacoModel) {
      _monacoModel.dispose();
      _monacoModel = null;
    }
    _dirty = false;
    _currentFilePath = null;
  }
  return {
    loadFile,
    flushSave,
    save,
    renderSaveIndicator,
    getEditor,
    isDirty,
    dispose,
  };
})();
