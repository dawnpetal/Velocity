use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccountInfo {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}
