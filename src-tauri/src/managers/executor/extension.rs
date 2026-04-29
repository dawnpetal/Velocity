use std::path::PathBuf;

use async_trait::async_trait;

use crate::error::VelocityUIResult;
use crate::models::ExecutorKind;

#[async_trait]
pub trait ExecutorExtension: Send + Sync {
    fn kind(&self) -> ExecutorKind;
    fn display_name(&self) -> &str;
    fn autoexec_dir(&self) -> Option<PathBuf>;
    async fn is_alive(&self) -> bool;
    async fn inject(&self, code: &str) -> VelocityUIResult<()>;
}
