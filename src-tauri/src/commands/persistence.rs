use tauri::State;

use crate::app::AppContext;
use crate::models::*;

#[tauri::command]
pub fn save_tree_state_cmd(
    work_dir: String,
    state: TreeState,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.WorkspaceState
        .save_tree_state(&work_dir, &state)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_tree_state_cmd(work_dir: String, ctx: State<'_, AppContext>) -> Option<TreeState> {
    ctx.WorkspaceState.load_tree_state(&work_dir)
}

#[tauri::command]
pub fn save_timeline_cmd(
    work_dir: String,
    histories: TimelineHistories,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.WorkspaceState
        .save_timeline(&work_dir, &histories)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_timeline_cmd(
    work_dir: String,
    ctx: State<'_, AppContext>,
) -> Option<TimelineHistories> {
    ctx.WorkspaceState.load_timeline(&work_dir)
}

#[tauri::command]
pub fn save_session_cmd(data: SessionData, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.GlobalState
        .save_session(&data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_session_cmd(ctx: State<'_, AppContext>) -> Option<SessionData> {
    ctx.GlobalState.load_session()
}

#[tauri::command]
pub fn save_ui_state_cmd(state: UiState, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.GlobalState
        .save_ui_state(&state)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_ui_state_cmd(ctx: State<'_, AppContext>) -> Option<UiState> {
    ctx.GlobalState.load_ui_state()
}

#[tauri::command]
pub fn push_exec_history_cmd(
    script: String,
    filename: String,
    ctx: State<'_, AppContext>,
) -> Result<ExecHistoryEntry, String> {
    ctx.GlobalState
        .push_exec_history(script, filename)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_exec_history_cmd(ctx: State<'_, AppContext>) -> Vec<ExecHistoryEntry> {
    ctx.GlobalState.get_exec_history()
}
