use tauri::State;

use crate::app::AppContext;
use crate::models::KeyCache;

#[tauri::command]
pub fn validate_key(ctx: State<'_, AppContext>) -> Result<KeyCache, String> {
    ctx.Auth.validate_key().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_key_cache(ctx: State<'_, AppContext>) -> Result<Option<KeyCache>, String> {
    Ok(ctx.Auth.load_cache())
}

#[tauri::command]
pub fn record_inject_cmd(
    hour_key: String,
    day_key: String,
    ctx: State<'_, AppContext>,
) -> Result<(i32, i32), String> {
    ctx.Auth
        .record_inject(&hour_key, &day_key)
        .map_err(|e| e.to_string())
}
