use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::app::AppContext;
use crate::managers::ExecutorManager;
use crate::models::ExecutorKind;

#[tauri::command]
pub async fn inject_script(code: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.Executor.inject(&code).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inject_script_with_client_bridge(
    code: String,
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    let wrapped = ctx
        .ClientBridge
        .wrap_script(app, &code)
        .await
        .map_err(|e| e.to_string())?;
    ctx.Executor
        .inject(&wrapped)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_port(ctx: State<'_, AppContext>) -> Option<u16> {
    ctx.Executor.get_active_port()
}

#[tauri::command]
pub async fn get_client_bridge_port(
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<u16, String> {
    ctx.ClientBridge
        .ensure_started(app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn queue_client_bridge_task(
    client_key: String,
    task: Value,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.ClientBridge
        .queue_task(client_key, task)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_port_cache(ctx: State<'_, AppContext>) {
    ctx.Executor.clear_port_cache();
}

#[tauri::command]
pub fn switch_executor(kind: String, ctx: State<'_, AppContext>) {
    ctx.Executor.switch(ExecutorKind::from_setting(&kind));
}

#[tauri::command]
pub fn focus_roblox() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .args(["-e", "tell application \"Roblox\" to activate"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    Err("focus_roblox is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
pub fn is_roblox_focused() -> bool {
    std::process::Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get bundle identifier of first process whose frontmost is true",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim() == "com.roblox.RobloxPlayer")
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
pub fn is_roblox_focused() -> bool {
    false
}

fn is_roblox_running() -> bool {
    std::process::Command::new("pgrep")
        .args(["-x", "RobloxPlayer"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn autoexec_enabled() -> bool {
    crate::paths::internals_dir()
        .ok()
        .map(|d| d.join("autoexec_meta.json"))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("enabled").and_then(|e| e.as_bool()))
        .unwrap_or(false)
}

pub fn start_autoexec_watcher(app: AppHandle, executor: Arc<ExecutorManager>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("autoexec watcher runtime");

        let mut was_running = false;

        loop {
            let is_running = is_roblox_running();

            if is_running != was_running {
                was_running = is_running;
                let _ = app.emit("roblox:state", serde_json::json!({ "running": is_running }));

                if is_running && autoexec_enabled() {
                    if let Some(dir) = executor.autoexec_dir() {
                        if let Ok(entries) = std::fs::read_dir(&dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                let is_lua =
                                    path.extension().and_then(|e| e.to_str()) == Some("lua");
                                let is_multiexec = path.file_name().and_then(|n| n.to_str())
                                    == Some("VelocityUI_multiexec.lua");
                                if !is_lua || is_multiexec {
                                    continue;
                                }
                                if let Ok(code) = std::fs::read_to_string(&path) {
                                    let _ = rt.block_on(executor.inject(&code));
                                }
                            }
                        }
                    }
                }
            }

            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[tauri::command]
pub fn get_executor_autoexec_dir(ctx: State<'_, AppContext>) -> Result<String, String> {
    let dir = ctx
        .Executor
        .autoexec_dir()
        .ok_or_else(|| "executor has no autoexec directory".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.to_str()
        .map(String::from)
        .ok_or_else(|| "autoexec path is not valid UTF-8".to_string())
}

#[tauri::command]
pub async fn get_executor_status(ctx: State<'_, AppContext>) -> Result<serde_json::Value, String> {
    let display_name = ctx.Executor.active_display_name();
    let kind = ctx.Executor.active_extension_kind();
    let is_alive = ctx.Executor.is_alive().await;
    Ok(serde_json::json!({
        "kind": format!("{:?}", kind).to_lowercase(),
        "displayName": display_name,
        "isAlive": is_alive,
    }))
}
