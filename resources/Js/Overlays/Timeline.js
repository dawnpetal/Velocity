const timeline = (() => {
  const MAX = 50;
  const _histories = new Map();
  let _activeId = null;
  let _expanded = true;
  function _history(id) {
    if (!_histories.has(id)) _histories.set(id, []);
    return _histories.get(id);
  }
  function getHistory(id) {
    return _histories.get(id) ?? [];
  }
  function restoreHistory(id, items) {
    _histories.set(id, items);
    _render();
  }
  function recordSave(fileId, content, filename) {
    const h = _history(fileId);
    if (h.length && h[0].content === content) return;
    h.unshift({
      at: Date.now(),
      content,
      name: filename,
    });
    if (h.length > MAX) h.length = MAX;
    _render();
  }
  function setFile(file) {
    _activeId = file && !file.preview ? file.id : null;
    _render();
    _syncSize(file);
  }
  function _syncSize(file) {
    const sizeEl = document.getElementById("statusFileSize");
    const sepEl = document.getElementById("statusFileSizeSep");
    if (!file || file.preview) {
      if (sizeEl) sizeEl.style.display = "none";
      if (sepEl) sepEl.style.display = "none";
      return;
    }
    const bytes = file.content != null ? new Blob([file.content]).size : 0;
    if (sizeEl) {
      sizeEl.textContent = FormatHelpers.fmtBytes(bytes);
      sizeEl.style.display = "";
    }
    if (sepEl) sepEl.style.display = "";
  }
  function refreshSize() {
    _syncSize(_activeId ? state.getFile(_activeId) : null);
  }
  function clearActive() {
    document
      .querySelectorAll(".tl-entry-active")
      .forEach((r) => r.classList.remove("tl-entry-active"));
  }
  function _render() {
    const list = document.getElementById("tlList");
    if (!list) return;
    list.innerHTML = "";
    const file = _activeId ? state.getFile(_activeId) : null;
    if (!file) {
      list.innerHTML = '<div class="tl-empty">No file open</div>';
      return;
    }
    const h = _histories.get(_activeId);
    if (!h?.length) {
      list.innerHTML =
        '<div class="tl-empty">Save a file to start tracking</div>';
      return;
    }
    h.forEach((entry, idx) => {
      const row = DomHelpers.el(
        "div",
        "tl-entry" + (idx === 0 ? " tl-entry-latest" : ""),
      );
      const spine = DomHelpers.el("span", "tl-spine");
      const dot = DomHelpers.el(
        "span",
        "tl-dot" + (idx === 0 ? " tl-dot-latest" : ""),
      );
      const info = DomHelpers.el("div", "tl-entry-info");
      const label = DomHelpers.el(
        "span",
        "tl-label",
        idx === 0 ? "Latest save" : `Version ${h.length - idx}`,
      );
      const time = DomHelpers.el(
        "span",
        "tl-time",
        FormatHelpers.relTimeSecs(entry.at),
      );
      time.title = new Date(entry.at).toLocaleString();
      info.append(label, time);
      row.append(spine, dot, info);
      row.addEventListener("click", () => {
        const wasActive = row.classList.contains("tl-entry-active");
        list
          .querySelectorAll(".tl-entry-active")
          .forEach((r) => r.classList.remove("tl-entry-active"));
        if (wasActive) {
          editor.hideDiff();
          return;
        }
        row.classList.add("tl-entry-active");
        editor.showDiff(
          entry.name ?? file.name,
          entry.content,
          file.content ?? editor.getContent(),
        );
      });
      list.appendChild(row);
    });
  }
  function init() {
    const header = document.getElementById("tlHeader");
    const body = document.getElementById("tlBody");
    const arrow = document.getElementById("tlArrow");
    const panel = document.getElementById("sidebarBottom");
    if (!header) return;
    _expanded = true;
    arrow.classList.add("open");
    let _savedHeight = null;
    header.addEventListener("click", () => {
      _expanded = !_expanded;
      if (_expanded) {
        body.style.display = "";
        if (_savedHeight !== null) panel.style.height = _savedHeight;
        panel.style.minHeight = "";
      } else {
        _savedHeight = panel.style.height || panel.offsetHeight + "px";
        body.style.display = "none";
        const headerH = header.offsetHeight;
        const resizerH =
          document.getElementById("sidebarBottomResizer")?.offsetHeight ?? 4;
        panel.style.height = headerH + resizerH + "px";
        panel.style.minHeight = headerH + resizerH + "px";
      }
      arrow.classList.toggle("open", _expanded);
      header.setAttribute("aria-expanded", String(_expanded));
    });
    _setupResizer();
  }
  function _setupResizer() {
    const resizer = document.getElementById("sidebarBottomResizer");
    const panel = document.getElementById("sidebarBottom");
    if (!resizer || !panel) return;
    let startY, startH;
    resizer.addEventListener("mousedown", (e) => {
      if (!_expanded) return;
      startY = e.clientY;
      startH = panel.offsetHeight;
      resizer.classList.add("dragging");
      const onMove = (e) => {
        panel.style.height =
          Math.max(28, Math.min(480, startH - (e.clientY - startY))) + "px";
      };
      const onUp = () => {
        resizer.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  return {
    init,
    recordSave,
    setFile,
    refreshSize,
    clearActive,
    getHistory,
    restoreHistory,
  };
})();
