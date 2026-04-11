use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuScript {
    pub name: String,
    pub shortcut: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyCache {
    pub fetched_at: f64,
    pub valid: bool,
    pub expires_at: Option<f64>,
    pub key: Option<String>,
    pub error: Option<String>,
    pub hourly_counts: HashMap<String, i32>,
    pub daily_counts: HashMap<String, i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub path: String,
    pub line_num: u32,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchOpts {
    pub match_case: bool,
    pub whole_word: bool,
    pub is_regex: bool,
    pub include_globs: Vec<String>,
    pub exclude_globs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchEvent {
    pub id: u32,
    pub action: String,
    pub path: String,
}

#[derive(Serialize, Deserialize)]
pub struct DirEntry {
    pub entry: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ScriptsFile {
    pub scripts: Vec<MenuScript>,
}
