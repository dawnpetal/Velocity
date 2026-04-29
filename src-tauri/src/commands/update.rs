use tauri::{AppHandle, State};

use crate::app::AppContext;
use crate::models::UpdateInfo;

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    ctx.Update
        .check(&current, ctx.Network.client())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_last_update_result(ctx: State<'_, AppContext>) -> Option<UpdateInfo> {
    ctx.Update.last_result()
}
