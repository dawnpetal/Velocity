use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GithubRelease {
    pub tag_name: String,
    pub html_url: String,
    pub body: Option<String>,
}
