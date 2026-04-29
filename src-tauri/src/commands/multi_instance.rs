use tauri::State;

use crate::app::AppContext;
use crate::models::RobloxClient;

#[tauri::command]
pub fn multiinstance_get_clients(ctx: State<'_, AppContext>) -> Result<Vec<RobloxClient>, String> {
    ctx.MultiInstance.get_clients().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script(
    user_id: String,
    script: String,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.MultiInstance
        .send_script(user_id, script)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script_many(
    user_ids: Vec<String>,
    script: String,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.MultiInstance
        .send_script_to_many(user_ids, script)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_install_autoexec(ctx: State<'_, AppContext>) -> Result<String, String> {
    ctx.MultiInstance
        .install_autoexec_script()
        .map_err(|e| e.to_string())
}
