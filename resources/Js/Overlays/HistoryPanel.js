const historyPanel = (() => {
  let _overlay = null;
  function _build() {
    const overlay = document.createElement("div");
    overlay.className = "hist-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hide();
    });
    const panel = DomHelpers.el("div", "hist-panel");
    const header = DomHelpers.el("div", "hist-header");
    header.innerHTML = `<span class="hist-title">Execution History</span><button class="hist-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    header.querySelector(".hist-close").addEventListener("click", hide);
    const body = DomHelpers.el("div", "hist-body");
    const items = execHistory.getAll();
    if (!items.length) {
      body.innerHTML =
        '<div class="hist-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg><span>No scripts executed yet</span></div>';
    } else {
      items.forEach((item) => {
        const row = DomHelpers.el("div", "hist-item");
        const meta = DomHelpers.el("div", "hist-item-meta");
        const file = DomHelpers.el("span", "hist-item-file", item.filename);
        const time = DomHelpers.el(
          "span",
          "hist-item-time",
          FormatHelpers.relTime(item.at),
        );
        time.title = new Date(item.at).toLocaleString();
        const lines = DomHelpers.el(
          "span",
          "hist-item-lines",
          item.script.split("\n").length + " ln",
        );
        meta.append(file, time, lines);
        const preview = DomHelpers.el(
          "div",
          "hist-item-preview",
          item.preview + (item.script.length > 120 ? "…" : ""),
        );
        const actions = DomHelpers.el("div", "hist-item-actions");
        const viewBtn = DomHelpers.btn("View", "", () => {
          let expanded = row.querySelector(".hist-item-expanded");
          if (expanded) {
            expanded.remove();
            viewBtn.textContent = "View";
            return;
          }
          expanded = document.createElement("pre");
          expanded.className = "hist-item-expanded";
          expanded.textContent = item.script;
          row.appendChild(expanded);
          viewBtn.textContent = "Hide";
        });
        const copyBtn = DomHelpers.btn("Copy", "", async () => {
          await window.__TAURI__.core.invoke("write_clipboard", {
            text: item.script,
          });
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1400);
        });
        const rerunBtn = DomHelpers.btn(
          "Re-run",
          "hist-btn-primary",
          async () => {
            hide();
            await editorController.rerunScript(item);
          },
        );
        actions.append(viewBtn, copyBtn, rerunBtn);
        row.append(meta, preview, actions);
        body.appendChild(row);
      });
    }
    panel.append(header, body);
    overlay.appendChild(panel);
    return overlay;
  }
  function show() {
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
    _overlay = _build();
    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add("open"));
  }
  function hide() {
    if (!_overlay) return;
    _overlay.classList.remove("open");
    setTimeout(() => {
      _overlay?.remove();
      _overlay = null;
    }, 200);
  }
  return {
    show,
    hide,
  };
})();
