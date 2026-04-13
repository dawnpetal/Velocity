use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::state::SharedClient;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current:     String,
    pub latest:      String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body:     Option<String>,
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_for_update(
    app:    AppHandle,
    client: State<'_, SharedClient>,
) -> Result<UpdateInfo, String> {
    let current_str = app.package_info().version.to_string();

    let release: GithubRelease = client
        .0
        .get("https://api.github.com/repos/dawnpetal/Velocity/releases/latest")
        .header("User-Agent", "Velocity-App")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    let latest_str = release.tag_name.trim_start_matches('v').to_string();

    let update_available = match (
        Version::parse(&current_str),
        Version::parse(&latest_str),
    ) {
        (Ok(current), Ok(latest)) => latest > current,
        _ => latest_str != current_str,
    };

    Ok(UpdateInfo {
        current: current_str,
        latest:  latest_str,
        update_available,
        release_url:   release.html_url,
        release_notes: release.body,
    })
}
