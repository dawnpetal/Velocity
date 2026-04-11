use crate::models::RobloxClient;
use crate::services;

#[tauri::command]
pub fn multiinstance_get_clients() -> Result<Vec<RobloxClient>, String> {
    services::get_clients().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script(user_id: String, script: String) -> Result<(), String> {
    services::send_script(user_id, script).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script_many(user_ids: Vec<String>, script: String) -> Result<(), String> {
    services::send_script_to_many(user_ids, script).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_install_autoexec() -> Result<String, String> {
    services::install_autoexec_script().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_get_bridge_path() -> Result<String, String> {
    services::bridge_path()
        .and_then(|p| p.to_str().map(String::from).ok_or_else(|| anyhow::anyhow!("non-UTF8 path")))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_get_autoexec_path() -> Result<String, String> {
    services::autoexec_path()
        .and_then(|p| p.to_str().map(String::from).ok_or_else(|| anyhow::anyhow!("non-UTF8 path")))
        .map_err(|e| e.to_string())
}
