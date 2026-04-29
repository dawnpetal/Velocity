use std::path::PathBuf;
use std::sync::Arc;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::managers::ExecutorManager;
use crate::models::{BridgeData, ExecutorKind, RobloxClient, ScriptCommand};
use crate::paths;

const MULTIEXEC_VERSION: &str = "2.0";
const SCRIPT_FILENAME: &str = "VelocityUI_multiexec.lua";
const BRIDGE_FILENAME: &str = "VelocityUI_multiexec.json";

pub struct MultiInstanceManager {
    executor: Arc<ExecutorManager>,
}

impl MultiInstanceManager {
    pub fn new(executor: Arc<ExecutorManager>) -> Self {
        Self { executor }
    }

    pub fn get_clients(&self) -> VelocityUIResult<Vec<RobloxClient>> {
        let mut data = self.read_bridge().unwrap_or_default();
        let now = chrono::Utc::now().timestamp();
        data.clients
            .retain(|c| !c.user_id.is_empty() && c.last_heartbeat > 0);
        data.mark_active_clients(now);
        Ok(data.clients)
    }

    pub fn send_script(&self, user_id: String, script: String) -> VelocityUIResult<()> {
        let mut data = self.read_bridge().unwrap_or_default();
        let now = chrono::Utc::now().timestamp();
        data.commands.push(ScriptCommand {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            script,
            timestamp: now,
        });
        data.cleanup_commands(now);
        self.write_bridge(&data)
    }

    pub fn send_script_to_many(
        &self,
        user_ids: Vec<String>,
        script: String,
    ) -> VelocityUIResult<()> {
        if user_ids.is_empty() {
            return Ok(());
        }
        let mut data = self.read_bridge().unwrap_or_default();
        let now = chrono::Utc::now().timestamp();
        for user_id in user_ids {
            data.commands.push(ScriptCommand {
                id: uuid::Uuid::new_v4().to_string(),
                user_id,
                script: script.clone(),
                timestamp: now,
            });
        }
        data.cleanup_commands(now);
        self.write_bridge(&data)
    }

    pub fn install_autoexec_script(&self) -> VelocityUIResult<String> {
        let target_dir = self.autoexec_dir()?;
        let target = target_dir.join(SCRIPT_FILENAME);
        let new_content = Self::lua_script();

        if target.exists() {
            let existing = std::fs::read_to_string(&target).unwrap_or_default();
            if Self::extract_version(&existing).as_deref() == Some(MULTIEXEC_VERSION) {
                return target
                    .to_str()
                    .map(String::from)
                    .ok_or_else(|| VelocityUIError::InvalidData("non-UTF-8 autoexec path".into()));
            }
            let _ = std::fs::remove_file(&target);
        }

        self.cleanup_stale_scripts()?;

        std::fs::create_dir_all(&target_dir).map_err(VelocityUIError::Io)?;
        std::fs::write(&target, &new_content).map_err(VelocityUIError::Io)?;

        target
            .to_str()
            .map(String::from)
            .ok_or_else(|| VelocityUIError::InvalidData("non-UTF-8 autoexec path".into()))
    }

    pub fn bridge_path(&self) -> VelocityUIResult<PathBuf> {
        Ok(self.executor_workspace_dir()?.join(BRIDGE_FILENAME))
    }

    fn autoexec_dir(&self) -> VelocityUIResult<PathBuf> {
        self.executor
            .autoexec_dir()
            .ok_or_else(|| VelocityUIError::Other("executor has no autoexec directory".into()))
    }

    fn executor_workspace_dir(&self) -> VelocityUIResult<PathBuf> {
        let home = paths::home_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        Ok(match self.executor.active_kind() {
            ExecutorKind::Opiumware => home.join("Opiumware").join("workspace"),
            ExecutorKind::Hydrogen => home.join("Hydrogen").join("workspace"),
        })
    }

    fn cleanup_stale_scripts(&self) -> VelocityUIResult<()> {
        let home = paths::home_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let active = self.executor.active_kind();
        let new_content = Self::lua_script();
        let new_version = Self::extract_version(&new_content);

        let candidates = [
            (
                ExecutorKind::Opiumware,
                home.join("Opiumware")
                    .join("autoexec")
                    .join(SCRIPT_FILENAME),
            ),
            (
                ExecutorKind::Hydrogen,
                home.join("Hydrogen")
                    .join("workspace")
                    .join("autoexecute")
                    .join(SCRIPT_FILENAME),
            ),
        ];

        for (kind, path) in candidates {
            if kind == active || !path.exists() {
                continue;
            }
            let existing = std::fs::read_to_string(&path).unwrap_or_default();
            if Self::extract_version(&existing).as_deref() != new_version.as_deref() {
                let _ = std::fs::remove_file(&path);
            }
        }

        Ok(())
    }

    fn read_bridge(&self) -> VelocityUIResult<BridgeData> {
        let path = self.bridge_path()?;
        if !path.exists() {
            return Ok(BridgeData::default());
        }
        let content = std::fs::read_to_string(&path).map_err(VelocityUIError::Io)?;
        if content.trim().is_empty() {
            return Ok(BridgeData::default());
        }
        serde_json::from_str(&content).map_err(VelocityUIError::Json)
    }

    fn write_bridge(&self, data: &BridgeData) -> VelocityUIResult<()> {
        let path = self.bridge_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        let tmp = path.with_extension("tmp");
        let content = serde_json::to_string(data).map_err(VelocityUIError::Json)?;
        std::fs::write(&tmp, &content).map_err(VelocityUIError::Io)?;
        std::fs::rename(&tmp, &path).map_err(VelocityUIError::Io)
    }

    fn extract_version(content: &str) -> Option<String> {
        content.lines().find_map(|line| {
            line.strip_prefix("-- VELOCITYUI_MULTIEXEC_VERSION:")
                .map(|v| v.trim().to_string())
        })
    }

    fn lua_script() -> String {
        format!(
            r#"-- VELOCITYUI_MULTIEXEC_VERSION: {ver}
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local BRIDGE = "VelocityUI_multiexec.json"
local executed = {{}}
local sessionStart = os.time()

local function getPlayer()
    if Players.LocalPlayer then return Players.LocalPlayer end
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    return Players.LocalPlayer
end

local lp = getPlayer()
local userId = tostring(lp.UserId)

local function safeDecode(raw)
    local ok, data = pcall(function() return HttpService:JSONDecode(raw) end)
    if ok and type(data) == "table" then
        data.clients = type(data.clients) == "table" and data.clients or {{}}
        data.commands = type(data.commands) == "table" and data.commands or {{}}
        return data
    end
    return {{ clients = {{}}, commands = {{}} }}
end

local function readBridge()
    if not isfile(BRIDGE) then return {{ clients = {{}}, commands = {{}} }} end
    local ok, raw = pcall(readfile, BRIDGE)
    if not ok or not raw or raw == "" then return {{ clients = {{}}, commands = {{}} }} end
    return safeDecode(raw)
end

local function writeBridge(data)
    local ok, encoded = pcall(function() return HttpService:JSONEncode(data) end)
    if not ok then return end
    pcall(writefile, BRIDGE, encoded)
end

local function heartbeat()
    while true do
        local data = readBridge()
        local t = os.time()
        local alive = {{}}
        local found = false
        for _, c in ipairs(data.clients) do
            if type(c.user_id) == "string" and c.user_id ~= "" and c.last_heartbeat and c.last_heartbeat > 0 then
                if tostring(c.user_id) == userId then
                    c.last_heartbeat = t
                    table.insert(alive, c)
                    found = true
                elseif (t - c.last_heartbeat) < 10 then
                    table.insert(alive, c)
                end
            end
        end
        if not found then
            table.insert(alive, {{
                user_id = userId, username = lp.Name, display_name = lp.DisplayName,
                game_id = game.GameId, job_id = game.JobId, last_heartbeat = t
            }})
        end
        local fresh = {{}}
        for _, cmd in ipairs(data.commands) do
            if cmd.timestamp and (t - cmd.timestamp) < 30 then table.insert(fresh, cmd) end
        end
        data.clients = alive
        data.commands = fresh
        writeBridge(data)
        task.wait(2)
    end
end

local function safeExecute(script, id)
    if type(script) ~= "string" or #script == 0 then return end
    local ok, fn = pcall(loadstring, script)
    if not ok or type(fn) ~= "function" then return end
    executed[id] = true
    task.spawn(function() pcall(fn) end)
end

local function pollCommands()
    while true do
        local data = readBridge()
        for _, cmd in ipairs(data.commands) do
            if tostring(cmd.user_id) == userId and cmd.timestamp and cmd.timestamp >= sessionStart then
                local id = cmd.id or tostring(cmd.timestamp)
                if not executed[id] then safeExecute(cmd.script, id) end
            end
        end
        task.wait(0.3)
    end
end

task.spawn(heartbeat)
task.spawn(pollCommands)
"#,
            ver = MULTIEXEC_VERSION
        )
    }
}
