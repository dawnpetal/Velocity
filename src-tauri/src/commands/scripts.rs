use tauri::{AppHandle, Emitter, State};

use crate::app::AppContext;
use crate::models::MenuScript;

#[tauri::command]
pub fn get_scripts(_app: AppHandle, ctx: State<'_, AppContext>) -> Result<Vec<MenuScript>, String> {
    ctx.Script.get().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_scripts(
    app: AppHandle,
    scripts: Vec<MenuScript>,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.Script.save(&app, &scripts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reload_tray_scripts(
    app: AppHandle,
    scripts: Vec<MenuScript>,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.Script
        .register_shortcuts(&app, &scripts)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("popover:refresh", ());
    Ok(())
}
