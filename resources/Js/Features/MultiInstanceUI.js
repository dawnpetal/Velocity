const multiInstanceUI = (() => {
  const SVG = {
    instances: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
    caret: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  };
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  let wrapEl, btnEl, toggleEl, popupEl;
  let isRunning = false;
  let popupOpen = false;
  const api = () => multiInstance;
  function positionPopup() {
    if (!btnEl || !popupEl) return;
    const r = btnEl.getBoundingClientRect();
    popupEl.style.top = r.bottom + 6 + 'px';
    const w = popupEl.offsetWidth || 240;
    let left = r.right - w;
    if (left < 8) left = 8;
    popupEl.style.left = left + 'px';
  }
  async function launchInstance() {
    try {
      await api().launchInstance();
      toast.show('Launching Roblox…', 'ok', 2500);
    } catch (e) {
      toast.show(`Launch failed: ${e.message}`, 'fail', 3000);
    }
  }
  function renderBtn() {
    if (!btnEl) return;
    if (!isRunning) {
      btnEl.innerHTML = `
        <span class="mi-dot off"></span>
        <span class="mi-label">Instances</span>
        <span class="mi-caret">${SVG.caret}</span>`;
      return;
    }
    const clients = api().getClients();
    const selected = api().getSelectedClients();
    const active = clients.filter((c) => c.active);
    if (!active.length) {
      btnEl.innerHTML = `
        <span class="mi-dot warn pulse-dot"></span>
        <span class="mi-label">Waiting…</span>
        <span class="mi-caret">${SVG.caret}</span>`;
      return;
    }
    const n = selected.length;
    if (n === 0) {
      btnEl.innerHTML = `
        <span class="mi-dot ok"></span>
        <span class="mi-label">${active.length} instance${active.length > 1 ? 's' : ''}</span>
        <span class="mi-caret">${SVG.caret}</span>`;
    } else if (n === 1) {
      const t = selected[0];
      btnEl.innerHTML = `
        <span class="mi-dot ${t.active ? 'ok' : 'warn'}"></span>
        <span class="mi-label">${esc(t.display_name || t.username)}</span>
        <span class="mi-caret">${SVG.caret}</span>`;
    } else {
      const all = n === active.length;
      btnEl.innerHTML = `
        <span class="mi-dot ok"></span>
        <span class="mi-label">${all ? 'All' : n} instances</span>
        <span class="mi-caret">${SVG.caret}</span>`;
    }
  }
  function renderPopup() {
    if (!popupEl) return;
    const clients = api().getClients();
    const selected = api().getSelectedIds();
    const active = clients.filter((c) => c.active);
    const allActiveSelected = active.length > 0 && active.every((c) => selected.has(c.user_id));
    if (!clients.length) {
      popupEl.innerHTML = `
        <div class="mi-popup-header">
          <span>Instances</span>
          <button class="mi-launch-btn" id="miLaunchBtn">+ New Instance</button>
        </div>
        <div class="mi-popup-empty">Waiting for instances…</div>
      `;
      popupEl.querySelector('#miLaunchBtn')?.addEventListener('click', launchInstance);
      return;
    }
    popupEl.innerHTML = `
      <div class="mi-popup-header">
        <span>Instances <span class="mi-count-badge">${clients.length}</span></span>
        <div>
          <button class="mi-all-btn" id="miAllBtn">
            ${allActiveSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button class="mi-launch-btn" id="miLaunchBtn">+ New</button>
        </div>
      </div>

      ${clients
        .map((c) => {
          const sel = selected.has(c.user_id);
          return `
          <div class="mi-item ${sel ? 'selected' : ''}" data-id="${c.user_id}">
            <span class="mi-item-dot ${c.active ? 'ok' : 'warn'}"></span>
            <div class="mi-item-info">
              <div>${esc(c.display_name || c.username)}</div>
              <div class="mi-item-meta">@${esc(c.username)}</div>
            </div>
            <span class="mi-checkbox">${sel ? SVG.check : ''}</span>
          </div>
        `;
        })
        .join('')}
    `;
    popupEl.querySelector('#miAllBtn')?.addEventListener('click', () => {
      allActiveSelected ? api().selectNone() : api().selectAll();
      renderPopup();
      renderBtn();
    });
    popupEl.querySelector('#miLaunchBtn')?.addEventListener('click', launchInstance);
    popupEl.querySelectorAll('.mi-item').forEach((el) => {
      el.addEventListener('click', () => {
        api().toggleSelected(el.dataset.id);
        renderPopup();
        renderBtn();
      });
    });
  }
  function openPopup() {
    popupOpen = true;
    renderPopup();
    popupEl.classList.add('open');
    btnEl.classList.add('open');
    requestAnimationFrame(() => {
      positionPopup();
      popupEl.classList.add('mi-popup--visible');
    });
    const close = (e) => {
      if (!wrapEl.contains(e.target) && !popupEl.contains(e.target)) {
        closePopup();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }
  function closePopup() {
    popupOpen = false;
    popupEl.classList.remove('open', 'mi-popup--visible');
    btnEl.classList.remove('open');
  }
  async function toggle() {
    if (isRunning) {
      api().stop();
      isRunning = false;
      toggleEl.classList.remove('active');
      toggleEl.title = 'Enable Multi-Instance';
      renderBtn();
      return;
    }
    try {
      await api().start();
      isRunning = true;
      toggleEl.classList.add('active');
      toggleEl.title = 'Disable Multi-Instance';
      renderBtn();
    } catch (e) {
      toast.show(`Multi-Instance: ${e.message}`, 'fail', 3000);
    }
  }
  function mount() {
    const bar = document.getElementById('titlebarActions');
    if (!bar) return;
    wrapEl = document.createElement('div');
    wrapEl.className = 'mi-titlebar-wrap';
    wrapEl.innerHTML = `
      <button class="mi-toggle-btn" id="miToggle">
        ${SVG.instances}
      </button>

      <div class="mi-dropdown-wrap">
        <button class="mi-select-btn" id="miSelectBtn">
          <span class="mi-dot off"></span>
          <span class="mi-label">Instances</span>
          <span class="mi-caret">${SVG.caret}</span>
        </button>
      </div>
    `;
    bar.appendChild(wrapEl);
    popupEl = document.createElement('div');
    popupEl.className = 'mi-popup';
    document.body.appendChild(popupEl);
    toggleEl = document.getElementById('miToggle');
    btnEl = document.getElementById('miSelectBtn');
    toggleEl.addEventListener('click', toggle);
    btnEl.addEventListener('click', () => {
      if (!isRunning) return;
      popupOpen ? closePopup() : openPopup();
    });
    window.addEventListener('resize', () => {
      if (popupOpen) positionPopup();
    });
    eventBus.on('multiinstance:clientsChanged', () => {
      renderBtn();
      if (popupOpen) renderPopup();
    });
    eventBus.on('multiinstance:selectionChanged', () => {
      renderBtn();
      if (popupOpen) renderPopup();
    });
    renderBtn();
  }
  function getTargetsForRun() {
    if (!isRunning) return null;
    const sel = api().getSelectedClients();
    if (sel.length) return sel;
    return api()
      .getClients()
      .filter((c) => c.active);
  }
  function getTargetForRun() {
    const t = getTargetsForRun();
    return t?.[0] || null;
  }
  return {
    mount,
    getTargetsForRun,
    getTargetForRun,
  };
})();
