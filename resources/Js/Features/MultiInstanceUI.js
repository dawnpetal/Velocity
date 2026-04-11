const multiInstanceUI = (() => {
  const SVG = {
    instances: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
    caret: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  };
  const _esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  let _wrapEl = null;
  let _btnEl = null;
  let _toggleEl = null;
  let _popupEl = null;
  let _isRunning = false;
  let _popupOpen = false;

  /* ── Portal positioning ──────────────────────────────────────────────── */
  // Popup is appended to document.body so it's never trapped inside any
  // parent overflow:hidden or stacking context (Monaco, pinboard bar, etc.)
  function _positionPopup() {
    if (!_btnEl || !_popupEl) return;
    const r = _btnEl.getBoundingClientRect();
    _popupEl.style.top = (r.bottom + 6) + "px";
    const popW = _popupEl.offsetWidth || 220;
    let left = r.right - popW;
    if (left < 8) left = 8;
    _popupEl.style.left = left + "px";
  }

  async function _launchInstance() {
    try {
      await multiInstance.launchInstance();
      toast.show("Launching Roblox…", "ok", 2500);
    } catch (err) {
      toast.show(`Launch failed: ${err.message}`, "fail", 3000);
    }
  }

  function _renderPopup() {
    const clients = multiInstance.getClients();
    const selectedIds = multiInstance.getSelectedIds();
    const activeClients = clients.filter((c) => c.active);
    const allActive =
      activeClients.length > 0 &&
      activeClients.every((c) => selectedIds.has(c.userId));
    if (!clients.length) {
      _popupEl.innerHTML = `
        <div class="mi-popup-header">
          <span>Instances</span>
          <button class="mi-launch-btn" id="miLaunchBtn" title="Launch new Roblox instance">+ New Instance</button>
        </div>
        <div class="mi-popup-empty">Waiting for Roblox instances…<br><span style="font-size:9px;color:var(--text3)">Make sure autoexec ran in-game</span></div>
      `;
      _popupEl.querySelector("#miLaunchBtn").addEventListener("click", _launchInstance);
      return;
    }
    const items = clients
      .map((c) => {
        const isChecked = selectedIds.has(c.userId);
        const cls = c.active ? "ok" : "warn";
        const stale = !c.active ? `<span class="mi-item-warn">⚠ stale</span>` : "";
        return `<div class="mi-item${isChecked ? " selected" : ""}" data-userid="${_esc(c.userId)}" role="option" aria-selected="${isChecked}">
        <span class="mi-item-dot ${cls}"></span>
        <div class="mi-item-info">
          <span class="mi-item-name">${_esc(c.displayName || c.username)}</span>
          <span class="mi-item-meta">@${_esc(c.username)} · game ${_esc(c.gameId)}</span>
        </div>
        ${stale}
        <span class="mi-checkbox${isChecked ? " checked" : ""}" aria-hidden="true">
          ${isChecked ? SVG.check : ""}
        </span>
      </div>`;
      })
      .join("");
    _popupEl.innerHTML = `
      <div class="mi-popup-header">
        <span>Instances <span class="mi-count-badge">${clients.length}</span></span>
        <div class="mi-popup-header-actions">
          <button class="mi-all-btn${allActive ? " active" : ""}" id="miAllBtn" title="${allActive ? "Deselect all" : "Select all active"}">
            ${allActive ? "Deselect All" : "Select All"}
          </button>
          <button class="mi-launch-btn" id="miLaunchBtn" title="Launch new Roblox instance">+ New</button>
        </div>
      </div>
      <div class="mi-popup-hint">Click to toggle · script runs on checked instances</div>
      ${items}
    `;
    _popupEl.querySelector("#miAllBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      allActive ? multiInstance.selectNone() : multiInstance.selectAll();
      _renderPopup();
      _renderBtn();
    });
    _popupEl.querySelector("#miLaunchBtn").addEventListener("click", _launchInstance);
    _popupEl.querySelectorAll(".mi-item").forEach((el) => {
      el.addEventListener("click", () => {
        multiInstance.toggleSelected(el.dataset.userid);
        _renderPopup();
        _renderBtn();
      });
    });
  }

  function _renderBtn() {
    if (!_isRunning) {
      _btnEl.innerHTML = `<span class="mi-dot off"></span><span class="mi-label">Instances</span><span class="mi-caret">${SVG.caret}</span>`;
      return;
    }
    const clients = multiInstance.getClients();
    const selected = multiInstance.getSelectedClients();
    const activeClients = clients.filter((c) => c.active);
    if (!activeClients.length) {
      _btnEl.innerHTML = `<span class="mi-dot warn pulse-dot"></span><span class="mi-label">Waiting…</span><span class="mi-caret">${SVG.caret}</span>`;
      return;
    }
    const n = selected.length;
    if (n === 0) {
      _btnEl.innerHTML = `<span class="mi-dot ok"></span><span class="mi-label">${activeClients.length} instance${activeClients.length > 1 ? "s" : ""}</span><span class="mi-caret">${SVG.caret}</span>`;
    } else if (n === 1) {
      const t = selected[0];
      const cls = t.active ? "ok" : "warn";
      _btnEl.innerHTML = `<span class="mi-dot ${cls}"></span><span class="mi-label">${_esc(t.displayName || t.username)}</span><span class="mi-caret">${SVG.caret}</span>`;
    } else {
      const allSelected = n === activeClients.length;
      _btnEl.innerHTML = `<span class="mi-dot ok"></span><span class="mi-label">${allSelected ? "All" : n} instances</span><span class="mi-caret">${SVG.caret}</span>`;
    }
  }

  function _openPopup() {
    _popupOpen = true;
    _renderPopup();
    _popupEl.classList.add("open");
    _btnEl.classList.add("open");
    // Position after display:block so offsetWidth is available
    requestAnimationFrame(() => {
      _positionPopup();
      // Second frame triggers CSS transition
      requestAnimationFrame(() => {
        _popupEl.classList.add("mi-popup--visible");
      });
    });
    const close = (e) => {
      if (!_wrapEl.contains(e.target) && !_popupEl.contains(e.target)) {
        _closePopup();
        document.removeEventListener("mousedown", close);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  function _closePopup() {
    _popupOpen = false;
    _popupEl.classList.remove("open", "mi-popup--visible");
    _btnEl.classList.remove("open");
  }

  async function _toggle() {
    if (_isRunning) {
      multiInstance.stop();
      _isRunning = false;
      _toggleEl.classList.remove("active");
      _toggleEl.title = "Enable Multi-Instance";
      _renderBtn();
    } else {
      try {
        await multiInstance.installAutoexec();
        await multiInstance.start();
        _isRunning = true;
        _toggleEl.classList.add("active");
        _toggleEl.title = "Disable Multi-Instance";
        _renderBtn();
      } catch (err) {
        toast.show(`Multi-Instance: ${err.message}`, "fail", 3000);
      }
    }
  }

  function mount() {
    const titlebarActions = document.getElementById("titlebarActions");
    if (!titlebarActions) return;

    _wrapEl = document.createElement("div");
    _wrapEl.className = "mi-titlebar-wrap";
    _wrapEl.innerHTML = `
      <button class="mi-toggle-btn" id="miToggle" title="Enable Multi-Instance" aria-label="Toggle multi-instance mode">
        ${SVG.instances}
      </button>
      <div class="mi-dropdown-wrap" id="miDropdownWrap">
        <button class="mi-select-btn" id="miSelectBtn" aria-label="Select target instances" aria-haspopup="listbox">
          <span class="mi-dot off"></span>
          <span class="mi-label">Instances</span>
          <span class="mi-caret">${SVG.caret}</span>
        </button>
      </div>
    `;
    titlebarActions.appendChild(_wrapEl);

    // Portal: popup on body so it's never clipped by any ancestor
    _popupEl = document.createElement("div");
    _popupEl.className = "mi-popup";
    _popupEl.id = "miPopup";
    _popupEl.setAttribute("role", "listbox");
    _popupEl.setAttribute("aria-multiselectable", "true");
    _popupEl.setAttribute("aria-label", "Roblox instances");
    _popupEl.innerHTML = `
      <div class="mi-popup-header"><span>Instances</span></div>
      <div class="mi-popup-empty">Enable multi-instance to begin</div>
    `;
    document.body.appendChild(_popupEl);

    _toggleEl = document.getElementById("miToggle");
    _btnEl = document.getElementById("miSelectBtn");

    _toggleEl.addEventListener("click", _toggle);
    _btnEl.addEventListener("click", () => {
      if (!_isRunning) return;
      _popupOpen ? _closePopup() : _openPopup();
    });

    window.addEventListener("resize", () => {
      if (_popupOpen) _positionPopup();
    });

    eventBus.on("multiinstance:clientsChanged", () => {
      _renderBtn();
      if (_popupOpen) _renderPopup();
    });
    eventBus.on("multiinstance:selectionChanged", () => {
      _renderBtn();
      if (_popupOpen) _renderPopup();
    });
  }

  function getTargetsForRun() {
    if (!_isRunning) return null;
    const selected = multiInstance.getSelectedClients();
    if (selected.length) return selected;
    return multiInstance.getClients().filter((c) => c.active);
  }

  function getTargetForRun() {
    const targets = getTargetsForRun();
    if (!targets || !targets.length) return null;
    return targets[0];
  }

  return { mount, getTargetForRun, getTargetsForRun };
})();
