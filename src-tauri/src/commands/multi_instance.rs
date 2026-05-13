use serde_json::json;
use tauri::{AppHandle, State};

use crate::app::AppContext;
use crate::models::RobloxClient;

#[tauri::command]
pub fn multiinstance_get_clients(ctx: State<'_, AppContext>) -> Result<Vec<RobloxClient>, String> {
    ctx.ClientBridge.clients().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script(
    user_id: String,
    script: String,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.ClientBridge
        .queue_task(
            user_id,
            json!({
                "kind": "execute",
                "id": uuid::Uuid::new_v4().to_string(),
                "script": script,
                "timestamp": chrono::Utc::now().timestamp(),
            }),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn multiinstance_send_script_many(
    user_ids: Vec<String>,
    script: String,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    for user_id in user_ids {
        ctx.ClientBridge
            .queue_task(
                user_id,
                json!({
                    "kind": "execute",
                    "id": uuid::Uuid::new_v4().to_string(),
                    "script": script,
                    "timestamp": now,
                }),
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn multiinstance_install_autoexec(
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<String, String> {
    let port = ctx
        .ClientBridge
        .ensure_started(app)
        .await
        .map_err(|e| e.to_string())?;
    ctx.MultiInstance
        .install_autoexec_script(port)
        .map_err(|e| e.to_string())
}
