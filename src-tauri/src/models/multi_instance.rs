use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobloxClient {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub username: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "gameId")]
    pub game_id: String,
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "lastHeartbeat")]
    pub last_heartbeat: i64,
    #[serde(skip_serializing, skip_deserializing, default)]
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptCommand {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub script: String,
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

    pub fn cleanup(&mut self, now: i64) {
        const CLIENT_TIMEOUT_SEC: i64 = 10;
        const COMMAND_TIMEOUT_SEC: i64 = 30;

        self.clients.retain(|c| now - c.last_heartbeat < CLIENT_TIMEOUT_SEC);
        self.commands.retain(|c| now - c.timestamp < COMMAND_TIMEOUT_SEC);
    }

    pub fn mark_active_clients(&mut self, now: i64) {
        const STALE_SEC: i64 = 10;
        for client in &mut self.clients {
            client.active = now - client.last_heartbeat < STALE_SEC;
        }
    }
}
