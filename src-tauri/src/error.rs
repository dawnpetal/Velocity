use thiserror::Error;

#[derive(Debug, Error)]
pub enum VelocityUIError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    #[error("network: {0}")]
    Network(#[from] reqwest::Error),

    #[error("keychain: {0}")]
    Keychain(String),

    #[error("process: {0}")]
    Process(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("lock poisoned")]
    LockPoisoned,

    #[error("already in progress")]
    AlreadyInProgress,

    #[error("invalid data: {0}")]
    InvalidData(String),

    #[error("{0}")]
    Other(String),
}

impl From<VelocityUIError> for String {
    fn from(e: VelocityUIError) -> Self {
        e.to_string()
    }
}

pub type VelocityUIResult<T> = std::result::Result<T, VelocityUIError>;
