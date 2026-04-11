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
}
