use crate::models::*;
use crate::paths;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

fn sanitize_key(work_dir: &str) -> String {
    work_dir
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn persistence_path(filename: &str) -> Result<PathBuf> {
    let internals = paths::internals_dir()?;
    fs::create_dir_all(&internals).context("failed to create internals directory")?;
    Ok(internals.join(filename))
}

fn timelines_path(filename: &str) -> Result<PathBuf> {
    let dir = paths::internals_dir()?.join("timelines");
    fs::create_dir_all(&dir).context("failed to create timelines directory")?;
    Ok(dir.join(filename))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> Result<T> {
    let content = fs::read_to_string(path).context("failed to read file")?;
    serde_json::from_str(&content).context("failed to parse JSON")
}

fn write_json<T: serde::Serialize>(path: &PathBuf, data: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("failed to create parent directory")?;
    }
    let content = serde_json::to_string(data).context("failed to serialize JSON")?;
    fs::write(path, content).context("failed to write file")
}

pub fn save_tree_state(work_dir: &str, state: TreeState) -> Result<()> {
    let key = sanitize_key(work_dir);
    let path = persistence_path(&format!("tree_{}.json", key))?;
    write_json(&path, &state)
}

pub fn load_tree_state(work_dir: &str) -> Option<TreeState> {
    let key = sanitize_key(work_dir);
    let path = persistence_path(&format!("tree_{}.json", key)).ok()?;
    read_json(&path).ok()
}

pub fn save_timeline(work_dir: &str, histories: TimelineHistories) -> Result<()> {
    let key = sanitize_key(work_dir);
    let path = timelines_path(&format!("{}.json", key))?;
    write_json(&path, &histories)
}

pub fn load_timeline(work_dir: &str) -> Option<TimelineHistories> {
    let key = sanitize_key(work_dir);
    let path = timelines_path(&format!("{}.json", key)).ok()?;
    if path.exists() {
        return read_json(&path).ok();
    }
    let legacy = persistence_path(&format!("timeline_{}.json", key)).ok()?;
    read_json(&legacy).ok()
}

pub fn save_session(data: SessionData) -> Result<()> {
    let path = persistence_path("session.json")?;
    write_json(&path, &data)
}

pub fn load_session() -> Option<SessionData> {
    let path = persistence_path("session.json").ok()?;
    read_json(&path).ok()
}

pub fn save_ui_state(state: UiState) -> Result<()> {
    let path = persistence_path("settings.json")?;
    write_json(&path, &state)
}

pub fn load_ui_state() -> Option<UiState> {
    let path = persistence_path("settings.json").ok()?;
    if path.exists() {
        if let Ok(v) = read_json(&path) {
            return Some(v);
        }
    }
    let legacy = persistence_path("ui.json").ok()?;
    read_json(&legacy).ok()
}

const MAX_HISTORY_ENTRIES: usize = 50;

pub fn load_exec_history() -> Vec<ExecHistoryEntry> {
    let path = match persistence_path("exec_history.json") {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    read_json(&path).unwrap_or_default()
}

pub fn push_exec_history(script: String, filename: String) -> Result<ExecHistoryEntry> {
    let mut entries = load_exec_history();

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
    if entries.len() > MAX_HISTORY_ENTRIES {
        entries.truncate(MAX_HISTORY_ENTRIES);
    }

    let path = persistence_path("exec_history.json")?;
    write_json(&path, &entries)?;

    Ok(entry)
}

pub fn get_exec_history() -> Vec<ExecHistoryEntry> {
    load_exec_history()
}
