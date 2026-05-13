use std::collections::HashMap;

use base64::{engine::general_purpose, Engine as _};
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

#[tauri::command]
pub async fn http_fetch_binary(
    url: String,
    headers: Option<HashMap<String, String>>,
    ctx: State<'_, AppContext>,
) -> Result<String, String> {
    let mut req = ctx.Network.client().get(&url);

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(k.as_str(), v.as_str());
        }
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}
