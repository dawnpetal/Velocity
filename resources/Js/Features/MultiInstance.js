const multiInstance = (() => {
  const POLL_MS = 2000;
  const STALE_SEC = 10;
  let _home = null;
  let _bridgePath = null;
  let _autoexecPath = null;
  let _clients = [];
  let _pollTimer = null;
  let _active = false;
  let _selectedUserIds = new Set();
  function _makeLuaScript() {
    return `\
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local lp = Players.LocalPlayer
local userId = tostring(lp.UserId)
local BRIDGE = "Velocity_multiexec.json"

local function readBridge()
  if not isfile(BRIDGE) then return {clients={},commands={}} end
  local ok, raw = pcall(readfile, BRIDGE)
  if not ok or not raw or raw == "" then return {clients={},commands={}} end
  local ok2, t = pcall(function() return HttpService:JSONDecode(raw) end)
  if not ok2 or type(t) ~= "table" then return {clients={},commands={}} end
  if not t.clients then t.clients = {} end
  if not t.commands then t.commands = {} end
  return t
end

local function writeBridge(t)
  local ok, encoded = pcall(function() return HttpService:JSONEncode(t) end)
  if ok then pcall(writefile, BRIDGE, encoded) end
end

local function now() return os.time() end
local executed = {}

local function heartbeat()
  while true do
    local data = readBridge()
    local found = false
    for i, c in ipairs(data.clients) do
      if c.userId == userId then
        data.clients[i].lastHeartbeat = now()
        found = true
        break
      end
    end
    if not found then
      table.insert(data.clients, {
        userId = userId,
        username = lp.Name,
        displayName = lp.DisplayName,
        gameId = game.GameId,
        jobId = game.JobId,
        lastHeartbeat = now()
      })
    end
    local alive = {}
    for _, c in ipairs(data.clients) do
      if now() - c.lastHeartbeat < 10 then table.insert(alive, c) end
    end
    data.clients = alive
    local fresh = {}
    for _, cmd in ipairs(data.commands) do
      if now() - cmd.timestamp < 30 then table.insert(fresh, cmd) end
    end
    data.commands = fresh
    writeBridge(data)
    task.wait(2)
  end
end

local function pollCommands()
  while true do
    local ok, data = pcall(readBridge)
    if ok and data then
      for _, cmd in ipairs(data.commands) do
        if cmd.userId == userId and not executed[cmd.id] then
          executed[cmd.id] = true
          local fn = loadstring(cmd.script)
          if fn then task.spawn(fn) end
        end
      end
    end
    task.wait(0.3)
  end
end

task.spawn(heartbeat)
task.spawn(pollCommands)
`;
  }
  async function _resolvePaths() {
    if (_home) return;
    const homeDir = await window.__TAURI__.core.invoke("get_home_dir");
    const user = homeDir.split("/").pop();
    _home = `/Users/${user}`;
    _bridgePath = `${_home}/Hydrogen/workspace/Velocity_multiexec.json`;
    _autoexecPath = `${_home}/Hydrogen/autoexecute/Velocity_multiexec.lua`;
  }
  async function _readBridge() {
    try {
      const raw = await window.__TAURI__.core.invoke("read_text_file", {
        path: _bridgePath,
      });
      return JSON.parse(raw);
    } catch {
      return {
        clients: [],
        commands: [],
      };
    }
  }
  async function _writeBridge(data) {
    await window.__TAURI__.core.invoke("write_text_file", {
      path: _bridgePath,
      content: JSON.stringify(data),
    });
  }
  function _stamp(client) {
    return {
      ...client,
      active: Date.now() / 1000 - client.lastHeartbeat < STALE_SEC,
    };
  }
  async function _poll() {
    const data = await _readBridge();
    const prev = _clients.map((c) => c.userId + c.lastHeartbeat).join();
    _clients = (data.clients || []).map(_stamp);
    const next = _clients.map((c) => c.userId + c.lastHeartbeat).join();
    const liveIds = new Set(_clients.map((c) => c.userId));
    for (const id of _selectedUserIds) {
      if (!liveIds.has(id)) _selectedUserIds.delete(id);
    }
    if (prev !== next)
      eventBus.emit("multiinstance:clientsChanged", {
        clients: _clients,
      });
  }
  async function installAutoexec() {
    await _resolvePaths();
    await window.__TAURI__.core.invoke("write_text_file", {
      path: _autoexecPath,
      content: _makeLuaScript(),
    });
    eventBus.emit("multiinstance:autoexecInstalled", {
      path: _autoexecPath,
    });
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
      .forEach((c) => _selectedUserIds.add(c.userId));
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
    return _clients.filter((c) => _selectedUserIds.has(c.userId));
  }
  async function sendScript(userId, scriptContent) {
    await _resolvePaths();
    const data = await _readBridge();
    data.commands = data.commands || [];
    data.commands.push({
      id: crypto.randomUUID(),
      userId,
      script: scriptContent,
      timestamp: Math.floor(Date.now() / 1000),
    });
    await _writeBridge(data);
  }
  async function sendScriptToMany(userIds, scriptContent) {
    if (!userIds?.length) return;
    await _resolvePaths();
    const data = await _readBridge();
    data.commands = data.commands || [];
    for (const userId of userIds) {
      data.commands.push({
        id: crypto.randomUUID(),
        userId,
        script: scriptContent,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
    await _writeBridge(data);
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
    installAutoexec,
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
