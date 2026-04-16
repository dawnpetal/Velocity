const accountsPanel = (() => {
  let _accounts = [];
  let _running = new Set();
  let _default = null;
  let _inited = false;
  let _pollTimer = null;
  let _launching = new Set();
  const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const SVG = {
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    starFill: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    killAll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    spinner: `<svg class="acc-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>`,
  };
  function _initials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  function _loadDefault() {
    try {
      _default = localStorage.getItem("velocity-default-account");
    } catch {
      _default = null;
    }
  }
  function _saveDefault(userId) {
    _default = userId;
    try {
      if (userId) localStorage.setItem("velocity-default-account", userId);
      else localStorage.removeItem("velocity-default-account");
    } catch {}
  }
  async function _load() {
    try {
      _accounts = (await invoke("accounts_list")) ?? [];
    } catch {
      _accounts = [];
    }
    _loadDefault();
  }
  async function _pollRunning() {
    try {
      const ids = await invoke("accounts_get_running");
      const newSet = new Set(ids ?? []);
      const changed =
        newSet.size !== _running.size ||
        [...newSet].some((id) => !_running.has(id)) ||
        [..._running].some((id) => !newSet.has(id));
      if (changed) {
        _running = newSet;
        _updateRunningUI();
      }
    } catch {}
  }
  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_pollRunning, 3000);
    _pollRunning();
  }
  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }
  function _updateRunningUI() {
    document.querySelectorAll(".acc-card[data-uid]").forEach((card) => {
      const uid = card.dataset.uid;
      const isRunning = _running.has(uid);
      const isLaunching = _launching.has(uid);
      card.classList.toggle("acc-card--running", isRunning);
      const indicator = card.querySelector(".acc-running-dot");
      if (indicator) indicator.style.display = isRunning ? "" : "none";
      const launchBtn = card.querySelector(".acc-btn-launch");
      if (launchBtn && !isLaunching) {
        launchBtn.innerHTML = isRunning ? SVG.stop : SVG.play;
        launchBtn.title = isRunning ? "Kill instance" : "Launch instance";
        launchBtn.classList.toggle("acc-btn-launch--running", isRunning);
      }
    });
    const killAllBtn = document.getElementById("accKillAllBtn");
    if (killAllBtn) {
      const anyRunning = _running.size > 0;
      killAllBtn.disabled = !anyRunning;
      killAllBtn.style.opacity = anyRunning ? "1" : "0.35";
    }
  }
  function _buildCard(acc) {
    const uid = acc.user_id;
    const isRunning = _running.has(uid);
    const isDefault = _default === uid;
    const card = document.createElement("div");
    card.className = "acc-card" + (isRunning ? " acc-card--running" : "");
    card.dataset.uid = uid;
    const pfp = document.createElement("div");
    pfp.className = "acc-pfp";
    if (acc.avatar_url) {
      const img = document.createElement("img");
      img.src = acc.avatar_url;
      img.alt = acc.display_name;
      img.onerror = () => {
        img.remove();
        pfp.textContent = _initials(acc.display_name);
      };
      pfp.appendChild(img);
    } else {
      pfp.textContent = _initials(acc.display_name);
    }
    const dot = document.createElement("span");
    dot.className = "acc-running-dot";
    dot.title = "Running";
    dot.style.display = isRunning ? "" : "none";
    pfp.appendChild(dot);
    const info = document.createElement("div");
    info.className = "acc-info";
    const nameRow = document.createElement("div");
    nameRow.className = "acc-name-row";
    const name = document.createElement("p");
    name.className = "acc-name";
    name.textContent = acc.display_name;
    if (isDefault) {
      const badge = document.createElement("span");
      badge.className = "acc-default-badge";
      badge.textContent = "default";
      nameRow.append(name, badge);
    } else {
      nameRow.append(name);
    }
    const sub = document.createElement("p");
    sub.className = "acc-sub";
    sub.textContent = "@" + acc.username;
    info.append(nameRow, sub);
    const actions = document.createElement("div");
    actions.className = "acc-actions";
    const launchBtn = _makeBtn(
      "acc-btn-launch" + (isRunning ? " acc-btn-launch--running" : ""),
      isRunning ? SVG.stop : SVG.play,
      isRunning ? "Kill instance" : "Launch instance",
    );
    launchBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (_launching.has(uid)) return;
      if (_running.has(uid)) {
        try {
          await invoke("accounts_kill", {
            userId: uid,
          });
          await _pollRunning();
        } catch {
          toast.show("Kill failed", "fail", 2000);
        }
        return;
      }
      _launching.add(uid);
      launchBtn.innerHTML = SVG.spinner;
      launchBtn.disabled = true;
      try {
        await invoke("accounts_launch", {
          userId: uid,
        });
        toast.show(`Launched ${acc.display_name}`, "ok", 1600);
        await _pollRunning();
      } catch (err) {
        toast.show(err?.message ?? "Launch failed", "fail", 2500);
        launchBtn.innerHTML = SVG.play;
      } finally {
        _launching.delete(uid);
        launchBtn.disabled = false;
        _updateRunningUI();
      }
    });
    const starBtn = _makeBtn(
      "acc-action-btn" + (isDefault ? " acc-action-btn--starred" : ""),
      isDefault ? SVG.starFill : SVG.star,
      isDefault ? "Default account (click to unset)" : "Set as default account",
    );
    starBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (_default === uid) {
        _saveDefault(null);
        _renderList();
        toast.show("Default account cleared", "ok", 1400);
        return;
      }
      try {
        await invoke("accounts_set_default", {
          userId: uid,
        });
        _saveDefault(uid);
        _renderList();
        toast.show(`${acc.display_name} set as default`, "ok", 1400);
      } catch {
        toast.show("Failed to set default", "fail", 2000);
      }
    });
    const copyBtn = _makeBtn("acc-action-btn", SVG.copy, "Copy cookie");
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const cookie = await invoke("accounts_get_cookie", {
          userId: uid,
        });
        await window.__TAURI__.core.invoke("write_clipboard", {
          text: cookie,
        });
        toast.show("Cookie copied", "ok", 1200);
      } catch {
        toast.show("Failed to copy", "fail", 2000);
      }
    });
    const refreshBtn = _makeBtn("acc-action-btn", SVG.refresh, "Refresh info");
    refreshBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      refreshBtn.disabled = true;
      try {
        const updated = await invoke("accounts_refresh", {
          userId: uid,
        });
        const idx = _accounts.findIndex((a) => a.user_id === updated.user_id);
        if (idx !== -1) _accounts[idx] = updated;
        _renderList();
        toast.show("Account refreshed", "ok", 1200);
      } catch {
        toast.show("Refresh failed", "fail", 2000);
      } finally {
        refreshBtn.disabled = false;
      }
    });
    const deleteBtn = _makeBtn(
      "acc-action-btn acc-action-btn--danger",
      SVG.delete,
      "Remove account",
    );
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = await modal.ask(
        "Remove Account",
        `Remove <strong>${helpers.escapeHtml(acc.display_name)}</strong> (@${helpers.escapeHtml(acc.username)})? The stored cookie will be deleted from your keychain.`,
        ["Remove", "Cancel"],
      );
      if (confirmed !== "Remove") return;
      try {
        await invoke("accounts_remove", {
          userId: uid,
        });
        _accounts = _accounts.filter((a) => a.user_id !== uid);
        if (_default === uid) _saveDefault(null);
        _renderList();
        toast.show("Account removed", "ok", 1400);
      } catch {
        toast.show("Remove failed", "fail", 2000);
      }
    });
    actions.append(launchBtn, starBtn, copyBtn, refreshBtn, deleteBtn);
    card.append(pfp, info, actions);
    return card;
  }
  function _makeBtn(className, html, title) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.innerHTML = html;
    btn.title = title;
    return btn;
  }
  function _renderList() {
    const list = document.getElementById("accountsList");
    if (!list) return;
    list.innerHTML = "";
    if (!_accounts.length) {
      const empty = document.createElement("div");
      empty.className = "acc-empty";
      empty.innerHTML =
        SVG.user +
        "<span>No accounts yet.<br>Add a .ROBLOSECURITY cookie below.</span>";
      list.appendChild(empty);
      return;
    }
    _accounts.forEach((acc) => list.appendChild(_buildCard(acc)));
    _updateRunningUI();
  }
  function _buildView() {
    const wrap = document.getElementById("accountsView");
    if (!wrap) return;
    wrap.innerHTML = "";
    const view = document.createElement("div");
    view.className = "accounts-view";
    const header = document.createElement("div");
    header.className = "accounts-header";
    const headerLeft = document.createElement("div");
    headerLeft.className = "accounts-header-left";
    const title = document.createElement("span");
    title.className = "accounts-title";
    title.textContent = "Accounts";
    const countBadge = document.createElement("span");
    countBadge.className = "accounts-count";
    countBadge.id = "accountsCount";
    countBadge.textContent = _accounts.length ? String(_accounts.length) : "";
    headerLeft.append(title, countBadge);
    const killAllBtn = document.createElement("button");
    killAllBtn.className = "acc-kill-all-btn";
    killAllBtn.id = "accKillAllBtn";
    killAllBtn.innerHTML = SVG.killAll + "<span>Kill All</span>";
    killAllBtn.title = "Kill all running Roblox instances";
    killAllBtn.disabled = _running.size === 0;
    killAllBtn.style.opacity = _running.size > 0 ? "1" : "0.35";
    killAllBtn.addEventListener("click", async () => {
      const confirmed = await modal.ask(
        "Kill All",
        "Kill all running Roblox instances?",
        ["Kill All", "Cancel"],
      );
      if (confirmed !== "Kill All") return;
      try {
        await invoke("accounts_kill_all");
        await _pollRunning();
        toast.show("All instances killed", "ok", 1400);
      } catch {
        toast.show("Kill all failed", "fail", 2000);
      }
    });
    header.append(headerLeft, killAllBtn);
    view.appendChild(header);
    const list = document.createElement("div");
    list.className = "acc-list";
    list.id = "accountsList";
    view.appendChild(list);
    const addSection = document.createElement("div");
    addSection.className = "acc-add-section";
    const addLabel = document.createElement("div");
    addLabel.className = "acc-add-label";
    addLabel.textContent = "Add account";
    const inputRow = document.createElement("div");
    inputRow.className = "acc-input-row";
    const cookieInput = document.createElement("input");
    cookieInput.type = "password";
    cookieInput.className = "acc-cookie-input";
    cookieInput.id = "accCookieInput";
    cookieInput.placeholder = ".ROBLOSECURITY cookie";
    cookieInput.autocomplete = "off";
    cookieInput.spellcheck = false;
    const addBtn = document.createElement("button");
    addBtn.className = "acc-add-btn";
    addBtn.id = "accAddBtn";
    addBtn.innerHTML = SVG.plus;
    addBtn.title = "Add account";
    async function _handleAdd() {
      const cookie = cookieInput.value.trim();
      if (!cookie) return;
      addBtn.disabled = true;
      cookieInput.disabled = true;
      try {
        const acc = await invoke("accounts_add", {
          cookie,
        });
        cookieInput.value = "";
        const existing = _accounts.findIndex((a) => a.user_id === acc.user_id);
        if (existing !== -1) {
          _accounts[existing] = acc;
          toast.show(`Updated ${acc.display_name}`, "ok", 1600);
        } else {
          _accounts.push(acc);
          toast.show(`Added ${acc.display_name}`, "ok", 1600);
        }
        _updateCount();
        _renderList();
      } catch (err) {
        toast.show(err?.message ?? "Failed to add account", "fail", 2500);
      } finally {
        addBtn.disabled = false;
        cookieInput.disabled = false;
        cookieInput.focus();
      }
    }
    addBtn.addEventListener("click", _handleAdd);
    cookieInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        _handleAdd();
      }
    });
    inputRow.append(cookieInput, addBtn);
    const hint = document.createElement("p");
    hint.className = "acc-add-hint";
    hint.textContent =
      "Cookies are stored securely in your system keychain and never leave your device. That does not mean you should share them with anyone, be SUPER FUCKING CAREFUL with your cookies. Anyone who gets access to them can take over your Roblox account. Make sure to clear your clipboard so you don't accidentally paste your cookie somewhere. In case of a compromise, change your password ! IMMEDIATELY ! to invalidate the stolen cookie.";
    addSection.append(addLabel, inputRow, hint);
    view.appendChild(addSection);
    wrap.appendChild(view);
  }
  function _updateCount() {
    const badge = document.getElementById("accountsCount");
    if (badge)
      badge.textContent = _accounts.length ? String(_accounts.length) : "";
  }
  async function show() {
    if (!_inited) {
      await _load();
      _inited = true;
    }
    const wrap = document.getElementById("accountsView");
    if (!wrap) return;
    wrap.style.display = "flex";
    _buildView();
    _renderList();
    _startPolling();
  }
  function hide() {
    _stopPolling();
    const wrap = document.getElementById("accountsView");
    if (wrap) wrap.style.display = "none";
  }
  return {
    show,
    hide,
  };
})();
