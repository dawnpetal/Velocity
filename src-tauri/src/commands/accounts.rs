use tauri::State;

use crate::app::AppContext;
use crate::models::AccountInfo;

#[tauri::command]
pub async fn accounts_add(
    cookie: String,
    ctx: State<'_, AppContext>,
) -> Result<AccountInfo, String> {
    ctx.Account
        .add(&cookie, ctx.Network.client())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_list(ctx: State<'_, AppContext>) -> Result<Vec<AccountInfo>, String> {
    Ok(ctx.Account.list())
}

#[tauri::command]
pub fn accounts_remove(user_id: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.Account.remove(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn accounts_refresh(
    user_id: String,
    ctx: State<'_, AppContext>,
) -> Result<AccountInfo, String> {
    ctx.Account
        .refresh(&user_id, ctx.Network.client())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_get_cookie(user_id: String, ctx: State<'_, AppContext>) -> Result<String, String> {
    ctx.Account.get_cookie(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_get_running(ctx: State<'_, AppContext>) -> Result<Vec<String>, String> {
    ctx.Instance.get_running().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_launch(user_id: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    let cookie = ctx
        .Account
        .get_cookie(&user_id)
        .map_err(|e| e.to_string())?;
    ctx.Instance
        .launch(&user_id, &cookie)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_kill(user_id: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.Instance.kill(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_kill_all(ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.Instance.kill_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_set_default(user_id: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.Account.set_default(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_is_launching(user_id: String, ctx: State<'_, AppContext>) -> bool {
    ctx.Instance.is_launching(&user_id)
}
