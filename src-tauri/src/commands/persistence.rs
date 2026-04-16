use crate::models::*;
use crate::services;

#[tauri::command]
pub fn save_tree_state_cmd(work_dir: String, state: TreeState) -> Result<(), String> {
    services::save_tree_state(&work_dir, state).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_tree_state_cmd(work_dir: String) -> Option<TreeState> {
    services::load_tree_state(&work_dir)
}

#[tauri::command]
pub fn save_timeline_cmd(work_dir: String, histories: TimelineHistories) -> Result<(), String> {
    services::save_timeline(&work_dir, histories).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_timeline_cmd(work_dir: String) -> Option<TimelineHistories> {
    services::load_timeline(&work_dir)
}

#[tauri::command]
pub fn save_session_cmd(data: SessionData) -> Result<(), String> {
    services::save_session(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_session_cmd() -> Option<SessionData> {
    services::load_session()
}

#[tauri::command]
pub fn save_ui_state_cmd(state: UiState) -> Result<(), String> {
    services::save_ui_state(state).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_ui_state_cmd() -> Option<UiState> {
    services::load_ui_state()
}

#[tauri::command]
pub fn push_exec_history_cmd(script: String, filename: String) -> Result<ExecHistoryEntry, String> {
    services::push_exec_history(script, filename).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_exec_history_cmd() -> Vec<ExecHistoryEntry> {
    services::get_exec_history()
}