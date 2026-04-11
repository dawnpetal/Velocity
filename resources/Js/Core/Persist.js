const persist = (() => {
  function _key(workDir) {
    return workDir.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  function _path(filename) {
    return paths.join(paths.internals, filename);
  }
  function _timelinesDir() {
    return paths.join(paths.internals, "timelines");
  }
  async function _ensureDir(dirPath) {
    try {
      await window.__TAURI__.core.invoke("create_dir", {
        path: dirPath,
      });
    } catch {}
  }
  async function _write(filePath, data) {
    await window.__TAURI__.core.invoke("write_text_file", {
      path: filePath,
      content: JSON.stringify(data),
    });
  }
  async function _read(filePath) {
    const raw = await window.__TAURI__.core.invoke("read_text_file", {
      path: filePath,
    });
    return JSON.parse(raw);
  }
  async function saveTreeState(workDir) {
    if (!workDir || !state.fileTree) return;
    const openPaths = [];
    const collect = (node) => {
      if (node?.type === "folder" && node.open) {
        openPaths.push(node.path);
        node.children?.forEach(collect);
      }
    };
    collect(state.fileTree);
    try {
      await _write(_path(`tree_${_key(workDir)}.json`), {
        openPaths,
        activeFile: state.getActive()?.path ?? null,
      });
    } catch {}
  }
  async function loadTreeState(workDir) {
    if (!workDir) return null;
    try {
      return await _read(_path(`tree_${_key(workDir)}.json`));
    } catch {
      return null;
    }
  }
  async function saveTimeline(workDir) {
    if (!workDir) return;
    const histories = {};
    state.files.forEach((f) => {
      const h = timeline.getHistory(f.id);
      if (h?.length) histories[f.path] = h;
    });
    try {
      await _ensureDir(_timelinesDir());
      await _write(
        paths.join(_timelinesDir(), `${_key(workDir)}.json`),
        histories,
      );
    } catch {}
  }
  async function loadTimeline(workDir) {
    if (!workDir) return;
    try {
      const data = await _read(
        paths.join(_timelinesDir(), `${_key(workDir)}.json`),
      );
      state.files.forEach((f) => {
        if (data[f.path]?.length) timeline.restoreHistory(f.id, data[f.path]);
      });
    } catch {}
  }
  async function saveSession(data) {
    if (!data) return;
    try {
      await _write(_path("session.json"), data);
    } catch {}
  }
  async function loadSession() {
    try {
      return await _read(_path("session.json"));
    } catch {
      return null;
    }
  }
  async function saveUI() {
    const sidebar = document.getElementById("sidebar");
    const panel = document.getElementById("bottomPanel");
    const sbBottom = document.getElementById("sidebarBottom");
    const activeBtn = document.querySelector(".activity-btn.active");
    const fontSlider = document.getElementById("fontSizeSlider");
    const wordWrap = document.getElementById("wordWrapToggle");
    const minimap = document.getElementById("minimapToggle");
    const lineNums = document.getElementById("lineNumToggle");
    try {
      await _write(_path("settings.json"), {
        sidebarWidth: sidebar?.offsetWidth ?? null,
        panelVisible: panel?.classList.contains("visible") ?? false,
        sbBottomHeight: sbBottom?.offsetHeight ?? null,
        activeView: activeBtn?.dataset.view ?? "explorer",
        settings: {
          fontSize: fontSlider ? parseInt(fontSlider.value) : null,
          wordWrap: wordWrap?.checked ?? null,
          minimap: minimap?.checked ?? null,
          lineNumbers: lineNums?.checked ?? null,
          executor: window.__velocityExecutor ?? "hydrogen",
        },
      });
    } catch {}
  }
  async function loadUI() {
    try {
      return await _read(_path("settings.json"));
    } catch {}
    try {
      return await _read(_path("ui.json"));
    } catch {
      return null;
    }
  }
  return {
    saveTreeState,
    loadTreeState,
    saveTimeline,
    loadTimeline,
    saveSession,
    loadSession,
    saveUI,
    loadUI,
  };
})();
