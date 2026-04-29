use std::collections::HashMap;
use std::sync::Mutex;

use tauri::AppHandle;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{MenuScript, ScriptsFile};
use crate::paths;

pub struct ScriptManager {
    shortcut_map: Mutex<HashMap<u32, String>>,
}

impl ScriptManager {
    pub fn new() -> Self {
        Self {
            shortcut_map: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self) -> VelocityUIResult<Vec<MenuScript>> {
        let path = paths::scripts_path().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let data =
            std::fs::read_to_string(&path).unwrap_or_else(|_| "{\"scripts\":[]}".to_string());
        let sf: ScriptsFile =
            serde_json::from_str(&data).unwrap_or(ScriptsFile { scripts: vec![] });
        Ok(sf.scripts)
    }

    pub fn save(&self, app: &AppHandle, scripts: &[MenuScript]) -> VelocityUIResult<()> {
        let path = paths::scripts_path().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        let content = serde_json::to_string(&ScriptsFile {
            scripts: scripts.to_vec(),
        })
        .map_err(VelocityUIError::Json)?;
        std::fs::write(&path, content).map_err(VelocityUIError::Io)?;
        self.register_shortcuts(app, scripts)
    }

    pub fn register_shortcuts(
        &self,
        app: &AppHandle,
        scripts: &[MenuScript],
    ) -> VelocityUIResult<()> {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

        let gs = app.global_shortcut();
        let _ = gs.unregister_all();

        let mut map = self
            .shortcut_map
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        map.clear();

        for script in scripts {
            let Some(sc_str) = &script.shortcut else {
                continue;
            };
            if sc_str.is_empty() {
                continue;
            }
            let Ok(sc) = sc_str.parse::<Shortcut>() else {
                continue;
            };
            let id = sc.id();
            if gs.register(sc).is_ok() {
                map.insert(id, script.content.clone());
            }
        }

        Ok(())
    }

    pub fn lookup_shortcut(&self, id: u32) -> Option<String> {
        self.shortcut_map
            .lock()
            .ok()
            .and_then(|map| map.get(&id).cloned())
    }
}
