use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeState {
    #[serde(rename = "openPaths")]
    pub open_paths: Vec<String>,
    #[serde(rename = "activeFile")]
    pub active_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    #[serde(rename = "workDir")]
    pub work_dir: Option<String>,
    #[serde(rename = "lastFolder")]
    pub last_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    #[serde(rename = "sidebarWidth")]
    pub sidebar_width: Option<u32>,
    #[serde(rename = "panelVisible")]
    pub panel_visible: bool,
    #[serde(rename = "sbBottomHeight")]
    pub sb_bottom_height: Option<u32>,
    #[serde(rename = "activeView")]
    pub active_view: String,
    pub settings: UiSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    #[serde(rename = "fontSize")]
    pub font_size: Option<u32>,
    #[serde(rename = "wordWrap")]
    pub word_wrap: Option<bool>,
    pub minimap: Option<bool>,
    #[serde(rename = "lineNumbers")]
    pub line_numbers: Option<bool>,
    
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecHistoryEntry {
    pub id: String,
    pub at: f64,
    pub filename: String,
    pub script: String,
    pub preview: String,
}

pub type TimelineHistories = HashMap<String, Vec<String>>;
