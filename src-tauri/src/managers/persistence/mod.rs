pub mod global;
pub mod workspace;

pub use global::GlobalStateManager;
pub use workspace::WorkspaceStateManager;

use std::path::PathBuf;

use crate::error::{VelocityUIError, VelocityUIResult};

pub(super) fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> VelocityUIResult<T> {
    let content = std::fs::read_to_string(path).map_err(VelocityUIError::Io)?;
    serde_json::from_str(&content).map_err(VelocityUIError::Json)
}

pub(super) fn write_json<T: serde::Serialize>(path: &PathBuf, data: &T) -> VelocityUIResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
    }
    let content = serde_json::to_string(data).map_err(VelocityUIError::Json)?;
    std::fs::write(path, content).map_err(VelocityUIError::Io)
}
