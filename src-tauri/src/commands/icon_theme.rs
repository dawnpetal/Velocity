

use tauri::State;

use crate::icon_theme::ThemePack;
use crate::state::IconThemeState;

#[tauri::command]
pub fn icon_theme_load(state: State<'_, IconThemeState>) -> Result<(), String> {
    state.0.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_get_active(state: State<'_, IconThemeState>) -> String {
    state.0.get_active()
}

#[tauri::command]
pub fn icon_theme_get_installed(state: State<'_, IconThemeState>) -> Vec<String> {
    state.0.get_installed()
}

#[tauri::command]
pub fn icon_theme_get_registry(state: State<'_, IconThemeState>) -> Vec<ThemePack> {
    state.0.get_registry()
}

#[tauri::command]
pub fn icon_theme_is_installed(id: String, state: State<'_, IconThemeState>) -> bool {
    state.0.is_installed(&id)
}

#[tauri::command]
pub fn icon_theme_is_active(id: String, state: State<'_, IconThemeState>) -> bool {
    state.0.is_active(&id)
}

#[tauri::command]
pub fn icon_theme_activate(id: String, state: State<'_, IconThemeState>) -> Result<bool, String> {
    state.0.activate(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_install(id: String, state: State<'_, IconThemeState>) -> Result<(), String> {
    state.0.install(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_uninstall(id: String, state: State<'_, IconThemeState>) -> Result<bool, String> {
    state.0.uninstall(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_load_installed_icons(
    theme_id: String,
    state: State<'_, IconThemeState>,
) -> Result<Option<(serde_json::Value, String)>, String> {
    state.0.load_installed_icons(&theme_id).map_err(|e| e.to_string())
}
