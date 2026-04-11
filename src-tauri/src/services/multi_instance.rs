use crate::models::{BridgeData, RobloxClient, ScriptCommand};
use crate::paths;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

pub fn bridge_path() -> Result<PathBuf> {
    let home = paths::home_dir()?;
    Ok(home.join("Hydrogen").join("workspace").join("Velocity_multiexec.json"))
}

pub fn autoexec_path() -> Result<PathBuf> {
    let home = paths::home_dir()?;
    Ok(home.join("Hydrogen").join("autoexecute").join("Velocity_multiexec.lua"))
}

fn read_bridge() -> Result<BridgeData> {
    let path = bridge_path()?;
    if !path.exists() {
        return Ok(BridgeData::new());
    }
    let content = fs::read_to_string(&path).context("failed to read bridge file")?;
    if content.trim().is_empty() {
        return Ok(BridgeData::new());
    }
    serde_json::from_str(&content).context("failed to parse bridge JSON")
}

fn write_bridge(data: &BridgeData) -> Result<()> {
    let path = bridge_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("failed to create bridge directory")?;
    }
    let content = serde_json::to_string(data).context("failed to serialize bridge data")?;
    fs::write(&path, content).context("failed to write bridge file")
}

pub fn get_clients() -> Result<Vec<RobloxClient>> {
    let mut data = read_bridge().unwrap_or_else(|_| BridgeData::new());
    let now = chrono::Utc::now().timestamp();
    data.cleanup(now);
    data.mark_active_clients(now);
    write_bridge(&data)?;
    Ok(data.clients)
}

pub fn send_script(user_id: String, script: String) -> Result<()> {
    let mut data = read_bridge().unwrap_or_else(|_| BridgeData::new());
    let now = chrono::Utc::now().timestamp();
    
    data.commands.push(ScriptCommand {
        id: uuid::Uuid::new_v4().to_string(),
        user_id,
        script,
        timestamp: now,
    });
    
    data.cleanup(now);
    write_bridge(&data)
}

pub fn send_script_to_many(user_ids: Vec<String>, script: String) -> Result<()> {
    if user_ids.is_empty() {
        return Ok(());
    }

    let mut data = read_bridge().unwrap_or_else(|_| BridgeData::new());
    let now = chrono::Utc::now().timestamp();
    
    for user_id in user_ids {
        data.commands.push(ScriptCommand {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            script: script.clone(),
            timestamp: now,
        });
    }
    
    data.cleanup(now);
    write_bridge(&data)
}

pub fn install_autoexec_script() -> Result<String> {
    let path = autoexec_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("failed to create autoexec directory")?;
    }
    
    let lua_script = generate_lua_script();
    fs::write(&path, lua_script).context("failed to write autoexec script")?;
    
    path.to_str()
        .map(String::from)
        .context("autoexec path is not valid UTF-8")
}

fn generate_lua_script() -> String {
    r#"local HttpService = game:GetService("HttpService")
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
"#.to_string()
}
