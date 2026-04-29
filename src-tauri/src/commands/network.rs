use std::collections::HashMap;
use tauri::State;

use crate::app::AppContext;

#[tauri::command]
pub async fn http_fetch(
    url: String,
    headers: Option<HashMap<String, String>>,
    ctx: State<'_, AppContext>,
) -> Result<String, String> {
    ctx.Network
        .get_text(&url, headers.as_ref())
        .await
        .map_err(|e| e.to_string())
}
