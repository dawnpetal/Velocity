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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptCommand {
    #[serde(default)]
    pub id: String,

    #[serde(default)]
    pub user_id: String,

    #[serde(default)]
    pub script: String,

    #[serde(default)]
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeData {
    #[serde(default)]
    pub clients: Vec<RobloxClient>,

    #[serde(default)]
    pub commands: Vec<ScriptCommand>,
}

impl BridgeData {
    pub fn new() -> Self {
        Self {
            clients: Vec::new(),
            commands: Vec::new(),
        }
    }

    pub fn cleanup_commands(&mut self, now: i64) {
        const COMMAND_TIMEOUT_SEC: i64 = 30;
        self.commands
            .retain(|c| c.timestamp > 0 && now - c.timestamp < COMMAND_TIMEOUT_SEC);
    }

    pub fn mark_active_clients(&mut self, now: i64) {
        const STALE_SEC: i64 = 12;
        const CLOCK_SKEW_TOLERANCE: i64 = 3;

        for client in &mut self.clients {
            let delta = now - client.last_heartbeat;
            client.active = client.last_heartbeat > 0
                && delta >= -CLOCK_SKEW_TOLERANCE
                && delta < STALE_SEC;
        }
    }
}