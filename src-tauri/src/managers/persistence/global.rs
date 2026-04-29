use std::path::PathBuf;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{ExecHistoryEntry, SessionData, UiState};
use crate::paths;

use super::{read_json, write_json};

const MAX_HISTORY: usize = 50;

pub struct GlobalStateManager;

impl GlobalStateManager {
    pub fn new() -> Self {
        Self
    }

    pub fn save_session(&self, data: &SessionData) -> VelocityUIResult<()> {
        write_json(&Self::session_path()?, data)
    }

    pub fn load_session(&self) -> Option<SessionData> {
        read_json(&Self::session_path().ok()?).ok()
    }

    pub fn save_ui_state(&self, state: &UiState) -> VelocityUIResult<()> {
        write_json(&Self::ui_path()?, state)
    }

    pub fn load_ui_state(&self) -> Option<UiState> {
        Self::load_ui_state_from_disk()
    }

    pub fn push_exec_history(
        &self,
        script: String,
        filename: String,
    ) -> VelocityUIResult<ExecHistoryEntry> {
        let mut entries = self.get_exec_history();

        let preview: String = script
            .chars()
            .take(120)
            .collect::<String>()
            .replace('\n', " ");

        let entry = ExecHistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            at: chrono::Utc::now().timestamp_millis() as f64,
            filename,
            script,
            preview,
        };

        entries.insert(0, entry.clone());
        entries.truncate(MAX_HISTORY);

        write_json(&Self::history_path()?, &entries)?;

        Ok(entry)
    }

    pub fn get_exec_history(&self) -> Vec<ExecHistoryEntry> {
        Self::history_path()
            .ok()
            .and_then(|p| read_json(&p).ok())
            .unwrap_or_default()
    }

    pub fn load_ui_state_from_disk() -> Option<UiState> {
        let primary = Self::ui_path().ok()?;
        if primary.exists() {
            if let Ok(v) = read_json::<UiState>(&primary) {
                return Some(v);
            }
        }
        let legacy = Self::legacy_ui_path().ok()?;
        read_json(&legacy).ok()
    }

    fn internals() -> VelocityUIResult<PathBuf> {
        let dir = paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir)
    }

    fn session_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::internals()?.join("session.json"))
    }

    fn ui_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::internals()?.join("settings.json"))
    }

    fn legacy_ui_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::internals()?.join("ui.json"))
    }

    fn history_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::internals()?.join("exec_history.json"))
    }
}
