use tauri::{AppHandle, Emitter, Manager};

use crate::state::ShortcutMap;
use crate::types::{MenuScript, ScriptsFile};

pub fn register_script_shortcuts(app: &AppHandle, scripts: &[MenuScript]) -> anyhow::Result<()> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let shortcut_map_state = app.state::<ShortcutMap>();
    let mut map = shortcut_map_state
        .0
        .lock()
        .map_err(|_| anyhow::anyhow!("shortcut map lock poisoned"))?;
    map.clear();

    for script in scripts {
        let Some(sc_str) = &script.shortcut else { continue };
        if sc_str.is_empty() { continue }
        let Ok(sc) = sc_str.parse::<Shortcut>() else { continue };
        let id = sc.id();
        if gs.register(sc).is_ok() {
            map.insert(id, script.content.clone());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_scripts(_app: AppHandle) -> Result<Vec<MenuScript>, String> {
    let path = crate::paths::scripts_path().map_err(|e| e.to_string())?;
    let data = std::fs::read_to_string(&path).unwrap_or_else(|_| "{\"scripts\":[]}".to_string());
    let sf: ScriptsFile = serde_json::from_str(&data).unwrap_or(ScriptsFile { scripts: vec![] });
    Ok(sf.scripts)
}

#[tauri::command]
pub fn save_scripts(app: AppHandle, scripts: Vec<MenuScript>) -> Result<(), String> {
    let path = crate::paths::scripts_path().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        &path,
        serde_json::to_string(&ScriptsFile { scripts: scripts.clone() }).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    register_script_shortcuts(&app, &scripts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reload_tray_scripts(app: AppHandle, scripts: Vec<MenuScript>) -> Result<(), String> {
    register_script_shortcuts(&app, &scripts).map_err(|e| e.to_string())?;
    let _ = app.emit("popover:refresh", ());
    Ok(())
}