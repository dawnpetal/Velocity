const editor = (() => {
  let _monaco = null;
  let _editorInstance = null;
  let _symbolProviders = null;
  let _settings = {
    fontSize: 13,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
  };
  let _ready = false;
  let _pendingFile = null;
  let _diffEditor = null;
  let _diffTabId = null;
  function _setPane(which) {
    const ids = {
      placeholder: "editorPlaceholder",
      monaco: "monacoEditor",
      preview: "previewPane",
      diff: "diffEditor",
    };
    Object.entries(ids).forEach(([name, id]) => {
      const el = document.getElementById(id);
      if (el)
        el.style.display =
          name === which
            ? name === "preview" || name === "placeholder"
              ? "flex"
              : "block"
            : "none";
    });
    const crumb = document.getElementById("breadcrumbBar");
    if (crumb) crumb.style.display = which === "monaco" ? "" : "none";
  }
  async function _ensureReady() {
    if (_ready) return;
    const container = document.getElementById("monacoEditor");
    const result = await EditorMount.create(container, _settings);
    _monaco = result.monaco;
    _editorInstance = result.editorInstance;
    _symbolProviders = result.symbolProviders;
    Breadcrumb.init(_editorInstance, _symbolProviders);
    EditorCommands.register(_monaco, _editorInstance);
    _editorInstance.onDidChangeCursorPosition((e) => {
      const el = document.getElementById("statusCursor");
      if (el)
        el.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      Breadcrumb.update(e.position);
    });
    _editorInstance.onDidChangeModelContent(() => {
      const id = state.activeFileId;
      if (!id) return;
      state.updateContent(id, _editorInstance.getValue());
      tabs.render();
      Breadcrumb.update(
        _editorInstance.getPosition() ?? {
          lineNumber: 1,
          column: 1,
        },
      );
    });
    _ready = true;
    if (_pendingFile) {
      const f = _pendingFile;
      _pendingFile = null;
      await _showTextFile(f);
    }
  }
  async function _showTextFile(file) {
    if (file.content === null) await fileManager.ensureContent(file.id);
    _setPane("monaco");
    document.getElementById("_velocityDeletedOverlay")?.remove();
    if (file.deleted) {
      const overlay = document.createElement("div");
      overlay.id = "_velocityDeletedOverlay";
      overlay.style.cssText =
        "position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:var(--bg2);pointer-events:none";
      overlay.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        <span style="color:var(--text2);font-size:13px">This file no longer exists on disk</span>
        <span style="color:var(--text3);font-size:11px">The file was moved or deleted externally</span>`;
      const monacoEl = document.getElementById("monacoEditor");
      monacoEl.style.position = "relative";
      monacoEl.appendChild(overlay);
      _editorInstance?.updateOptions({
        readOnly: true,
      });
      return;
    }
    _editorInstance?.updateOptions({
      readOnly: false,
    });
    EditorModels.saveViewState(state.activeFileId, _editorInstance);
    const model = EditorModels.getOrCreate(_monaco, file);
    if (model.getValue() !== file.content) model.setValue(file.content);
    _editorInstance.setModel(model);
    EditorModels.restoreViewState(file.id, _editorInstance);
    _editorInstance.focus();
    timeline.refreshSize();
    const langEl = document.getElementById("statusLang");
    if (langEl)
      langEl.textContent = LangMap.extOf(file.name).toUpperCase() || "Plain";
    Breadcrumb.closePicker();
    Breadcrumb.update(
      _editorInstance.getPosition() ?? {
        lineNumber: 1,
        column: 1,
      },
    );
  }
  function _showPreviewFile(file) {
    _setPane("preview");
    const pane = document.getElementById("previewPane");
    if (!pane) return;
    pane.innerHTML = "";
    const langEl = document.getElementById("statusLang");
    if (langEl)
      langEl.textContent = LangMap.extOf(file.name).toUpperCase() + " Preview";
    switch (file.previewType) {
      case "image":
        Preview.renderImage(pane, file);
        break;
      case "svg":
        Preview.renderSvg(pane, file);
        break;
      case "markdown":
        Preview.renderMarkdown(pane, file);
        break;
      case "html":
        Preview.renderHtml(pane, file);
        break;
      case "video":
        Preview.renderVideo(pane, file);
        break;
      default:
        pane.textContent = "No preview available.";
    }
  }
  async function openPreview(sourceFile) {
    const pt = LangMap.previewType(sourceFile.name);
    if (!pt) {
      toast.show("No preview available for this file type", "warn");
      return;
    }
    const existingId = [...state.files].find(
      (f) => f.preview && f.path === sourceFile.path,
    )?.id;
    if (existingId) {
      state.setActive(existingId);
      tabs.render();
      eventBus.emit("ui:render-editor");
      return;
    }
    const id = helpers.uid();
    const isBinary = pt === "image" || pt === "video";
    let binaryData = null;
    if (isBinary) {
      try {
        binaryData = await window.__TAURI__.core.invoke("read_binary_file", {
          path: sourceFile.path,
        });
      } catch (e) {
        toast.show("Could not read file: " + (e.message ?? e), "fail");
        return;
      }
    }
    state.addFile(
      id,
      sourceFile.name + " (Preview)",
      sourceFile.path,
      sourceFile.content ?? "",
      {
        preview: true,
        previewType: pt,
        binaryData,
      },
    );
    state.setActive(id);
    tabs.render();
    eventBus.emit("ui:render-editor");
  }
  function render() {
    const active = state.getActive();
    if (!active) {
      _setPane("placeholder");
      return;
    }
    if (active.preview) {
      if (active.previewType === "diff") {
        _setPane("diff");
        return;
      }
      _showPreviewFile(active);
      return;
    }
    const pt = LangMap.previewType(active.name);
    if (pt === "image") {
      if (!active.binaryData) {
        window.__TAURI__.core
          .invoke("read_binary_file", {
            path: active.path,
          })
          .then((binaryData) => {
            active.binaryData = binaryData;
            active.previewType = "image";
            _showPreviewFile(active);
          })
          .catch((err) =>
            toast.show("Could not read image: " + (err.message ?? err), "fail"),
          );
      } else {
        active.previewType = "image";
        _showPreviewFile(active);
      }
      return;
    }
    if (pt === "svg") {
      if (active.content === null) {
        window.__TAURI__.core
          .invoke("read_text_file", {
            path: active.path,
          })
          .then((content) => {
            active.content = content;
            active.previewType = "svg";
            _showPreviewFile(active);
          })
          .catch((err) =>
            toast.show("Could not read SVG: " + (err.message ?? err), "fail"),
          );
      } else {
        active.previewType = "svg";
        _showPreviewFile(active);
      }
      return;
    }
    if (pt === "video") {
      if (!active.binaryData) {
        window.__TAURI__.core
          .invoke("read_binary_file", {
            path: active.path,
          })
          .then((binaryData) => {
            active.binaryData = binaryData;
            active.previewType = "video";
            _showPreviewFile(active);
          })
          .catch((err) =>
            toast.show("Could not read video: " + (err.message ?? err), "fail"),
          );
      } else {
        active.previewType = "video";
        _showPreviewFile(active);
      }
      return;
    }
    if (!_ready) {
      _pendingFile = active;
      _ensureReady();
      return;
    }
    _showTextFile(active);
  }
  function applyTheme() {
    if (!_ready || !_monaco) return;
    EditorTheme.apply(_monaco);
    if (_diffEditor) _monaco.editor.setTheme("velocity");
  }
  function updateSettings(key, value) {
    _settings[key] = value;
    if (!_ready || !_editorInstance) return;
    const opts = {};
    if (key === "fontSize") opts.fontSize = value;
    if (key === "wordWrap") opts.wordWrap = value ? "on" : "off";
    if (key === "minimap")
      opts.minimap = {
        enabled: value,
      };
    if (key === "lineNumbers") opts.lineNumbers = value ? "on" : "off";
    _editorInstance.updateOptions(opts);
  }
  function destroyTab(id) {
    EditorModels.destroyTab(id);
  }
  function focus() {
    _editorInstance?.focus();
  }
  function jumpToLine(fileId, lineNum) {
    state.setActive(fileId);
    tabs.render();
    eventBus.emit("ui:render-editor");
    ExplorerTree.render();
    requestAnimationFrame(() => {
      if (!_editorInstance) return;
      _editorInstance.revealLineInCenter(lineNum);
      _editorInstance.setPosition({
        lineNumber: lineNum,
        column: 1,
      });
      _editorInstance.focus();
    });
  }
  function getContent() {
    return _editorInstance?.getValue() ?? "";
  }
  function canPreview(filename) {
    return LangMap.canPreview(filename);
  }
  async function showDiff(filename, oldContent, newContent) {
    if (!_ready) await _ensureReady();
    const lang = LangMap.monacoLang(filename);
    if (_diffTabId) {
      state.closeTab(_diffTabId);
      _diffTabId = null;
    }
    const tabId = helpers.uid();
    state.addFile(tabId, filename + " (Diff)", "", "", {
      preview: true,
      previewType: "diff",
    });
    state.setActive(tabId);
    _diffTabId = tabId;
    tabs.render();
    _setPane("diff");
    if (!_diffEditor) {
      _diffEditor = _monaco.editor.createDiffEditor(
        document.getElementById("diffEditor"),
        {
          theme: "velocity",
          fontSize: _settings.fontSize,
          fontFamily:
            "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
          fontLigatures: true,
          readOnly: true,
          renderSideBySide: true,
          ignoreTrimWhitespace: false,
          renderIndicators: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          padding: {
            top: 12,
            bottom: 12,
          },
          minimap: {
            enabled: false,
          },
          folding: false,
          lineNumbers: "on",
          stickyScroll: {
            enabled: false,
          },
          occurrencesHighlight: "off",
          colorDecorators: false,
          smoothScrolling: false,
          renderWhitespace: "none",
        },
      );
    }
    const prev = _diffEditor.getModel();
    const origModel = _monaco.editor.createModel(oldContent, lang);
    const modModel = _monaco.editor.createModel(newContent, lang);
    _diffEditor.setModel({
      original: origModel,
      modified: modModel,
    });
    if (prev) {
      prev.original?.dispose();
      prev.modified?.dispose();
    }
  }
  function hideDiff() {
    if (_diffTabId) {
      state.closeTab(_diffTabId);
      _diffTabId = null;
      tabs.render();
    }
    const active = state.getActive();
    if (active && !active.preview) _showTextFile(active).catch(() => {});
    else _setPane("placeholder");
  }
  function isDiffTab(id) {
    return id === _diffTabId;
  }
  return {
    render,
    focus,
    destroyTab,
    applyTheme,
    updateSettings,
    jumpToLine,
    getContent,
    openPreview,
    canPreview,
    showDiff,
    hideDiff,
    isDiffTab,
  };
})();
