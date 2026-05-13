use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobloxClient {
    #[serde(alias = "userId")]
    pub user_id: String,
    pub username: String,
    #[serde(alias = "displayName")]
    pub display_name: String,
    #[serde(alias = "gameId", default)]
    pub game_id: i64,
    #[serde(alias = "jobId")]
    pub job_id: String,
    #[serde(alias = "lastHeartbeat")]
    pub last_heartbeat: i64,
    #[serde(skip)]
    pub active: bool,
}
