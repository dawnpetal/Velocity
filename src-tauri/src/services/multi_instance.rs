use crate::models::{BridgeData, RobloxClient, ScriptCommand};
use crate::paths;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

fn extract_version(content: &str) -> Option<String> {
    content.lines().find_map(|line| {
        if line.starts_with("-- VELOCITY_MULTIEXEC_VERSION:") {
            Some(
                line.replace("-- VELOCITY_MULTIEXEC_VERSION:", "")
                    .trim()
                    .to_string(),
            )
        } else {
            None
        }
    })
}

fn get_executor() -> String {
    crate::services::load_ui_state()
        .and_then(|ui| ui.settings.executor)
        .unwrap_or_else(|| "opiumware".to_string())
}

fn get_executor_dir() -> Result<PathBuf> {
    let home = paths::home_dir()?;
    let executor = get_executor();

    match executor.to_ascii_lowercase().as_str() {
        "opiumware" | "opium" => Ok(home.join("Opiumware")),
        _ => Ok(home.join("Hydrogen")),
    }
}

fn executor_autoexec_dir() -> Result<PathBuf> {
    let base = get_executor_dir()?;
    let executor = get_executor();

    match executor.to_ascii_lowercase().as_str() {
        "opiumware" | "opium" => Ok(base.join("autoexec")),
        _ => Ok(base.join("workspace").join("autoexecute")),
    }
}

pub fn bridge_path() -> Result<PathBuf> {
    Ok(get_executor_dir()?
        .join("workspace")
        .join("Velocity_multiexec.json"))
}

pub fn autoexec_path() -> Result<PathBuf> {
    Ok(executor_autoexec_dir()?.join("Velocity_multiexec.lua"))
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
        fs::create_dir_all(parent)?;
    }

    let tmp = path.with_extension("tmp");
    let content = serde_json::to_string(data)?;
    fs::write(&tmp, &content)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn get_clients() -> Result<Vec<RobloxClient>> {
    let mut data = read_bridge().unwrap_or_else(|_| BridgeData::new());
    let now = chrono::Utc::now().timestamp();

    data.clients
        .retain(|c| !c.user_id.is_empty() && c.last_heartbeat > 0);

    data.mark_active_clients(now);
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

    data.cleanup_commands(now);
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

    data.cleanup_commands(now);
    write_bridge(&data)
}

pub fn install_autoexec_script() -> Result<String> {
    println!("Installing autoexec script for multi-instance support...");

    let target_dir = executor_autoexec_dir()?;
    let target = target_dir.join("Velocity_multiexec.lua");

    let new_content = generate_lua_script();
    let new_version = extract_version(&new_content);

    if target.exists() {
        let existing = fs::read_to_string(&target).unwrap_or_default();
        let existing_version = extract_version(&existing);

        if existing_version.is_some() && existing_version == new_version {
            return target
                .to_str()
                .map(String::from)
                .context("autoexec path is not valid UTF-8");
        } else {
            let _ = fs::remove_file(&target);
        }
    }

    let other_executors = ["hydrogen", "opiumware"];

    for other in &other_executors {
        let home = paths::home_dir()?;

        let base = match *other {
            "opiumware" => home.join("Opiumware"),
            _ => home.join("Hydrogen"),
        };

        let other_path = match *other {
            "opiumware" => base.join("autoexec"),
            _ => base.join("workspace").join("autoexecute"),
        }
        .join("Velocity_multiexec.lua");

        if other_path.exists() {
            let existing = fs::read_to_string(&other_path).unwrap_or_default();
            let existing_version = extract_version(&existing);

            if other.to_ascii_lowercase() != get_executor() || existing_version != new_version {
                let _ = fs::remove_file(&other_path);
            }
        }
    }

    fs::create_dir_all(&target_dir).context("failed to create autoexec directory")?;

    fs::write(&target, &new_content).context("failed to write autoexec script")?;

    target
        .to_str()
        .map(String::from)
        .context("autoexec path is not valid UTF-8")
}

fn generate_lua_script() -> String {
    r#"-- VELOCITY_MULTIEXEC_VERSION: 1.8
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local BRIDGE = "Velocity_multiexec.json"
local executed = {}
local sessionStart = os.time()

local function getPlayer()
    if Players.LocalPlayer then return Players.LocalPlayer end
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    return Players.LocalPlayer
end

local lp = getPlayer()
local userId = tostring(lp.UserId)

local function safeDecode(raw)
    local ok, data = pcall(function()
        return HttpService:JSONDecode(raw)
    end)

    if ok and type(data) == "table" then
        data.clients = type(data.clients) == "table" and data.clients or {}
        data.commands = type(data.commands) == "table" and data.commands or {}
        return data
    end

    return { clients = {}, commands = {} }
end

local function readBridge()
    if not isfile(BRIDGE) then
        return { clients = {}, commands = {} }
    end

    local ok, raw = pcall(readfile, BRIDGE)
    if not ok or not raw or raw == "" then
        return { clients = {}, commands = {} }
    end

    return safeDecode(raw)
end

local function writeBridge(data)
    local ok, encoded = pcall(function()
        return HttpService:JSONEncode(data)
    end)

    if not ok then return end
    pcall(writefile, BRIDGE, encoded)
end

local function now()
    return os.time()
end

local function heartbeat()
    while true do
        local data = readBridge()
        local t = now()

        local alive = {}
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
            table.insert(alive, {
            user_id = userId,
            username = lp.Name,
            display_name = lp.DisplayName,
            game_id = game.GameId,
            job_id = game.JobId,
            last_heartbeat = t
            })
        end

        local freshCommands = {}
        for _, cmd in ipairs(data.commands) do
            if cmd.timestamp and (t - cmd.timestamp) < 30 then
                table.insert(freshCommands, cmd)
            end
        end

        data.clients = alive
        data.commands = freshCommands

        writeBridge(data)
        task.wait(2)
    end
end

local function safeExecute(script, id)
    if type(script) ~= "string" or #script == 0 then return end

    local ok, fn = pcall(loadstring, script)
    if not ok or type(fn) ~= "function" then return end

    executed[id] = true

    task.spawn(function()
        pcall(fn)
    end)
end

local function pollCommands()
    while true do
        local data = readBridge()

        for _, cmd in ipairs(data.commands) do
            if tostring(cmd.user_id) == userId and cmd.timestamp and cmd.timestamp >= sessionStart then
                local id = cmd.id or tostring(cmd.timestamp)

                if not executed[id] then
                    safeExecute(cmd.script, id)
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
