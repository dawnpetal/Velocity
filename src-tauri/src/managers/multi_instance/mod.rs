use std::path::PathBuf;
use std::sync::Arc;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::managers::ExecutorManager;
use crate::models::ExecutorKind;
use crate::paths;

const MULTIEXEC_VERSION: &str = "2.3";
const SCRIPT_FILENAME: &str = "VelocityUI_multiexec.lua";

pub struct MultiInstanceManager {
    executor: Arc<ExecutorManager>,
}

impl MultiInstanceManager {
    pub fn new(executor: Arc<ExecutorManager>) -> Self {
        Self { executor }
    }

    pub fn install_autoexec_script(&self, bridge_port: u16) -> VelocityUIResult<String> {
        let target_dir = self.autoexec_dir()?;
        let target = target_dir.join(SCRIPT_FILENAME);
        let new_content = Self::lua_script(bridge_port);

        if target.exists() {
            let existing = std::fs::read_to_string(&target).unwrap_or_default();
            if existing == new_content {
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

    fn autoexec_dir(&self) -> VelocityUIResult<PathBuf> {
        self.executor
            .autoexec_dir()
            .ok_or_else(|| VelocityUIError::Other("executor has no autoexec directory".into()))
    }

    fn cleanup_stale_scripts(&self) -> VelocityUIResult<()> {
        let home = paths::home_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let active = self.executor.active_kind();
        let new_content = Self::lua_script(0);
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

    fn extract_version(content: &str) -> Option<String> {
        content.lines().find_map(|line| {
            line.strip_prefix("-- VELOCITYUI_MULTIEXEC_VERSION:")
                .map(|v| v.trim().to_string())
        })
    }

    fn lua_script(bridge_port: u16) -> String {
        format!(
            r#"-- VELOCITYUI_MULTIEXEC_VERSION: {ver}
task.wait(3)
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local requestFn = request or http_request or (syn and syn.request) or (http and http.request)
local endpoint = "http://127.0.0.1:{port}/client"
local executed = {{}}
local sessionStart = os.time()

local function getPlayer()
    if Players.LocalPlayer then return Players.LocalPlayer end
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    return Players.LocalPlayer
end

local lp = getPlayer()
local clientKey = tostring(lp.Name) .. "-" .. tostring(lp.UserId) .. "-" .. tostring(game.PlaceId)

local function base(extra)
    extra = extra or {{}}
    extra.client_key = clientKey
    extra.username = lp.Name
    extra.display_name = lp.DisplayName
    extra.user_id = tostring(lp.UserId)
    extra.place_id = game.PlaceId
    extra.game_id = game.GameId
    extra.job_id = game.JobId
    return extra
end

local function post(kind, data)
    if type(requestFn) ~= "function" then return nil end
    data = base(data)
    data.kind = kind
    data.sent_at = os.time()
    local ok, body = pcall(function() return HttpService:JSONEncode(data) end)
    if not ok then return nil end
    local sent, response = pcall(requestFn, {{
        Url = endpoint,
        Method = "POST",
        Headers = {{ ["Content-Type"] = "application/json" }},
        Body = body,
    }})
    if not sent or not response or not response.Body then return nil end
    local decodedOk, decoded = pcall(function() return HttpService:JSONDecode(response.Body) end)
    if decodedOk and type(decoded) == "table" then return decoded end
    return nil
end

local function safeExecute(script, id, kind)
    if type(script) ~= "string" or #script == 0 then return end
    local ok, fn = pcall(loadstring, script)
    if not ok or type(fn) ~= "function" then
        post("task:error", {{ task_id = id, task_kind = kind, message = tostring(fn) }})
        return
    end
    executed[id] = true
    post("task:started", {{ task_id = id, task_kind = kind }})
    task.spawn(function()
        local ran, err = pcall(fn)
        if ran then
            post("task:finished", {{ task_id = id, task_kind = kind }})
        else
            post("task:error", {{ task_id = id, task_kind = kind, message = tostring(err) }})
        end
    end)
end

local function handleTasks(tasks)
    if type(tasks) ~= "table" then return end
    for _, taskItem in ipairs(tasks) do
        local id = taskItem.id or tostring(taskItem.timestamp or os.clock())
        local kind = taskItem.kind or "execute"
        if not executed[id] and (kind == "execute" or taskItem.script) then
            safeExecute(taskItem.script, id, kind)
        end
    end
end

task.spawn(function()
    post("hello", {{ session_start = sessionStart }})
    while true do
        local response = post("poll", {{ session_start = sessionStart }})
        if response then handleTasks(response.tasks) end
        task.wait(3)
    end
end)
"#,
            ver = MULTIEXEC_VERSION,
            port = bridge_port
        )
    }
}
