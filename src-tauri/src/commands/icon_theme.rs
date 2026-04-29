use tauri::State;

use crate::app::AppContext;
use crate::managers::icon_theme::ThemePack;

#[tauri::command]
pub fn icon_theme_load(ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.IconTheme.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_get_active(ctx: State<'_, AppContext>) -> String {
    ctx.IconTheme.get_active()
}

#[tauri::command]
pub fn icon_theme_get_installed(ctx: State<'_, AppContext>) -> Vec<String> {
    ctx.IconTheme.get_installed()
}

#[tauri::command]
pub fn icon_theme_get_registry(ctx: State<'_, AppContext>) -> Vec<ThemePack> {
    ctx.IconTheme.get_registry()
}

#[tauri::command]
pub fn icon_theme_is_installed(id: String, ctx: State<'_, AppContext>) -> bool {
    ctx.IconTheme.is_installed(&id)
}

#[tauri::command]
pub fn icon_theme_is_active(id: String, ctx: State<'_, AppContext>) -> bool {
    ctx.IconTheme.is_active(&id)
}

#[tauri::command]
pub fn icon_theme_activate(id: String, ctx: State<'_, AppContext>) -> Result<bool, String> {
    ctx.IconTheme.activate(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn icon_theme_install(id: String, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.IconTheme
        .install(&id, ctx.Network.client())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_uninstall(id: String, ctx: State<'_, AppContext>) -> Result<bool, String> {
    ctx.IconTheme.uninstall(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_load_installed_icons(
    theme_id: String,
    ctx: State<'_, AppContext>,
) -> Result<Option<(serde_json::Value, String)>, String> {
    ctx.IconTheme
        .load_installed_icons(&theme_id)
        .map_err(|e| e.to_string())
}
