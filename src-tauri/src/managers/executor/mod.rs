pub mod extension;
pub mod hydrogen;
pub mod opiumware;

pub use extension::ExecutorExtension;

use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::VelocityUIResult;
use crate::models::ExecutorKind;

use hydrogen::HydrogenExtension;
use opiumware::OpiumwareExtension;

pub struct ExecutorManager {
    active_kind: Mutex<ExecutorKind>,
    hydrogen: HydrogenExtension,
    opiumware: OpiumwareExtension,
}

impl ExecutorManager {
    pub fn new(client: reqwest::Client) -> Self {
        let active_kind =
            crate::managers::persistence::GlobalStateManager::load_ui_state_from_disk()
                .and_then(|ui| ui.settings.executor)
                .map(|s| ExecutorKind::from_setting(&s))
                .unwrap_or_default();

        Self {
            active_kind: Mutex::new(active_kind),
            hydrogen: HydrogenExtension::new(client),
            opiumware: OpiumwareExtension::new(),
        }
    }

    pub async fn inject(&self, code: &str) -> VelocityUIResult<()> {
        self.active().inject(code).await
    }

    pub async fn is_alive(&self) -> bool {
        self.active().is_alive().await
    }

    pub fn switch(&self, kind: ExecutorKind) {
        if let Ok(mut g) = self.active_kind.lock() {
            *g = kind;
        }
    }

    pub fn active_kind(&self) -> ExecutorKind {
        self.active_kind.lock().map(|g| *g).unwrap_or_default()
    }

    pub fn active_display_name(&self) -> &str {
        self.active().display_name()
    }

    pub fn active_extension_kind(&self) -> ExecutorKind {
        self.active().kind()
    }

    pub fn autoexec_dir(&self) -> Option<PathBuf> {
        self.active().autoexec_dir()
    }

    pub fn get_active_port(&self) -> Option<u16> {
        self.hydrogen.get_port()
    }

    pub fn clear_port_cache(&self) {
        self.hydrogen.clear_port();
    }

    fn active(&self) -> &dyn ExecutorExtension {
        match self.active_kind.lock().map(|g| *g).unwrap_or_default() {
            ExecutorKind::Hydrogen => &self.hydrogen,
            ExecutorKind::Opiumware => &self.opiumware,
        }
    }
}
