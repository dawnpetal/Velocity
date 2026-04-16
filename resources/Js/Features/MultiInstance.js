const multiInstance = (() => {
  const POLL_MS = 2000;
  const STALE_SEC = 12;
  let _bridgePath = null;
  let _clients = [];
  let _pollTimer = null;
  let _active = false;
  let _selectedUserIds = new Set();
  async function _resolvePaths() {
    _bridgePath = await window.__TAURI__.core.invoke(
      "multiinstance_get_bridge_path",
    );
  }
  async function _readBridge() {
    const clients = await window.__TAURI__.core.invoke(
      "multiinstance_get_clients",
    );
    return {
      clients: clients || [],
      commands: [],
    };
  }
  function _stamp(client) {
    if (!client.user_id || client.last_heartbeat <= 0) {
      return {
        ...client,
        active: false,
      };
    }
    const now = Date.now() / 1000;
    const age = now - client.last_heartbeat;
    return {
      ...client,
      active: age >= -3 && age < STALE_SEC,
    };
  }
  async function _poll() {
    const data = await _readBridge();
    const prev = _clients.map((c) => c.user_id + c.last_heartbeat).join();
    _clients = (data.clients || []).map(_stamp);
    const next = _clients.map((c) => c.user_id + c.last_heartbeat).join();
    const liveIds = new Set(_clients.map((c) => c.user_id));
    for (const id of _selectedUserIds) {
      if (!liveIds.has(id)) _selectedUserIds.delete(id);
    }
    if (prev !== next) {
      eventBus.emit("multiinstance:clientsChanged", {
        clients: _clients,
      });
    }
  }
  async function start() {
    if (_active) return;
    await _resolvePaths();
    _active = true;
    await _poll();
    _pollTimer = setInterval(_poll, POLL_MS);
    eventBus.emit("multiinstance:started", {});
  }
  function stop() {
    _active = false;
    clearInterval(_pollTimer);
    _pollTimer = null;
    _selectedUserIds.clear();
    eventBus.emit("multiinstance:stopped", {});
  }
  function getClients() {
    return _clients;
  }
  function getSelectedIds() {
    return new Set(_selectedUserIds);
  }
  function isSelected(userId) {
    return _selectedUserIds.has(userId);
  }
  function toggleSelected(userId) {
    if (_selectedUserIds.has(userId)) {
      _selectedUserIds.delete(userId);
    } else {
      _selectedUserIds.add(userId);
    }
    eventBus.emit("multiinstance:selectionChanged", {
      selected: getSelectedIds(),
    });
  }
  function selectAll() {
    _clients
      .filter((c) => c.active)
      .forEach((c) => _selectedUserIds.add(c.user_id));
    eventBus.emit("multiinstance:selectionChanged", {
      selected: getSelectedIds(),
    });
  }
  function selectNone() {
    _selectedUserIds.clear();
    eventBus.emit("multiinstance:selectionChanged", {
      selected: getSelectedIds(),
    });
  }
  function getSelectedClients() {
    return _clients.filter((c) => _selectedUserIds.has(c.user_id));
  }
  async function sendScript(userId, scriptContent) {
    await window.__TAURI__.core.invoke("multiinstance_send_script", {
      userId,
      script: scriptContent,
    });
  }
  async function sendScriptToMany(userIds, scriptContent) {
    if (!userIds?.length) return;
    await window.__TAURI__.core.invoke("multiinstance_send_script_many", {
      userIds,
      script: scriptContent,
    });
  }
  async function launchInstance() {
    await window.__TAURI__.core.invoke("open_external", {
      url: "roblox-player:",
    });
  }
  return {
    start,
    stop,
    getClients,
    getSelectedIds,
    isSelected,
    toggleSelected,
    selectAll,
    selectNone,
    getSelectedClients,
    sendScript,
    sendScriptToMany,
    launchInstance,
  };
})();
