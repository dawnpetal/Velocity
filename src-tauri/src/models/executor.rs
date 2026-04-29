use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutorKind {
    Hydrogen,
    #[default]
    Opiumware,
}

impl ExecutorKind {
    pub fn from_setting(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "opiumware" | "opium" => Self::Opiumware,
            "hydrogen" => Self::Hydrogen,
            _ => Self::default(),
        }
    }
}

impl From<Option<String>> for ExecutorKind {
    fn from(s: Option<String>) -> Self {
        s.as_deref().map(Self::from_setting).unwrap_or_default()
    }
}

impl std::fmt::Display for ExecutorKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Hydrogen => write!(f, "hydrogen"),
            Self::Opiumware => write!(f, "opiumware"),
        }
    }
}
