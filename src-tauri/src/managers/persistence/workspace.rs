use std::path::PathBuf;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{TimelineHistories, TreeState};
use crate::paths;

use super::{read_json, write_json};

pub struct WorkspaceStateManager;

impl WorkspaceStateManager {
    pub fn new() -> Self {
        Self
    }

    pub fn save_tree_state(&self, work_dir: &str, state: &TreeState) -> VelocityUIResult<()> {
        write_json(&Self::tree_path(work_dir)?, state)
    }

    pub fn load_tree_state(&self, work_dir: &str) -> Option<TreeState> {
        read_json(&Self::tree_path(work_dir).ok()?).ok()
    }

    pub fn save_timeline(
        &self,
        work_dir: &str,
        histories: &TimelineHistories,
    ) -> VelocityUIResult<()> {
        write_json(&Self::timelines_path(work_dir)?, histories)
    }

    pub fn load_timeline(&self, work_dir: &str) -> Option<TimelineHistories> {
        let new_path = Self::timelines_path(work_dir).ok()?;

        if new_path.exists() {
            return read_json(&new_path).ok();
        }

        let legacy = Self::legacy_timeline_path(work_dir).ok()?;
        let data: TimelineHistories = read_json(&legacy).ok()?;

        if write_json(&new_path, &data).is_ok() {
            let _ = std::fs::remove_file(&legacy);
        }

        Some(data)
    }

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

    fn tree_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let internals =
            paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        std::fs::create_dir_all(&internals).map_err(VelocityUIError::Io)?;
        Ok(internals.join(format!("tree_{}.json", key)))
    }

    fn timelines_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let dir = paths::internals_dir()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?
            .join("timelines");
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir.join(format!("{}.json", key)))
    }

    fn legacy_timeline_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let internals =
            paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        Ok(internals.join(format!("timeline_{}.json", key)))
    }
}
