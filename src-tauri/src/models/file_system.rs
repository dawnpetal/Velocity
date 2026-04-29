use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub open: bool,
    pub children: Vec<FileNode>,
}

impl FileNode {
    pub fn file(id: String, name: String, path: String) -> Self {
        Self {
            id,
            name,
            path,
            node_type: "file".into(),
            open: false,
            children: Vec::new(),
        }
    }

    pub fn folder(id: String, name: String, path: String, children: Vec<FileNode>) -> Self {
        Self {
            id,
            name,
            path,
            node_type: "folder".into(),
            open: true,
            children,
        }
    }

    pub fn is_folder(&self) -> bool {
        self.node_type == "folder"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchEvent {
    pub id: u32,
    pub action: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchEventBatch {
    pub id: u32,
    pub events: Vec<WatchEvent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntry {
    pub entry: String,
    #[serde(rename = "type")]
    pub kind: String,
}
