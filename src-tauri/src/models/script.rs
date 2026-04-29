use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuScript {
    pub name: String,
    pub shortcut: Option<String>,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct ScriptsFile {
    pub scripts: Vec<MenuScript>,
}
