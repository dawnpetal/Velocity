use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use tokio::task::JoinSet;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::ExecutorKind;
use crate::paths;

use super::extension::ExecutorExtension;

const PORT_START: u16 = 6969;
const PORT_END: u16 = 7069;
const SECRET: &str = "0xdeadbeef";
const PROBE_TIMEOUT: Duration = Duration::from_millis(400);

pub struct HydrogenExtension {
    client: reqwest::Client,
    port_cache: Mutex<Option<u16>>,
}

impl HydrogenExtension {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            port_cache: Mutex::new(None),
        }
    }

    pub fn get_port(&self) -> Option<u16> {
        self.port_cache.lock().ok().and_then(|g| *g)
    }

    pub fn clear_port(&self) {
        if let Ok(mut g) = self.port_cache.lock() {
            *g = None;
        }
    }

    async fn probe(&self, port: u16) -> Option<u16> {
        let text = self
            .client
            .get(format!("http://127.0.0.1:{}/secret", port))
            .timeout(PROBE_TIMEOUT)
            .send()
            .await
            .ok()?
            .text()
            .await
            .ok()?;

        if text.trim() == SECRET {
            Some(port)
        } else {
            None
        }
    }

    async fn discover(&self) -> VelocityUIResult<u16> {
        let mut set = JoinSet::new();

        for port in PORT_START..=PORT_END {
            let client = self.client.clone();
            set.spawn(async move {
                let text = client
                    .get(format!("http://127.0.0.1:{}/secret", port))
                    .timeout(PROBE_TIMEOUT)
                    .send()
                    .await
                    .ok()?
                    .text()
                    .await
                    .ok()?;
                if text.trim() == SECRET {
                    Some(port)
                } else {
                    None
                }
            });
        }

        while let Some(res) = set.join_next().await {
            if let Ok(Some(port)) = res {
                set.abort_all();
                return Ok(port);
            }
        }

        Err(VelocityUIError::NotFound(format!(
            "Hydrogen not found on ports {PORT_START}-{PORT_END}"
        )))
    }

    async fn resolve_port(&self) -> VelocityUIResult<u16> {
        let cached = self
            .port_cache
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)
            .map(|g| *g)?;

        if let Some(port) = cached {
            if self.probe(port).await.is_some() {
                return Ok(port);
            }
            if let Ok(mut g) = self.port_cache.lock() {
                *g = None;
            }
        }

        let port = self.discover().await?;
        if let Ok(mut g) = self.port_cache.lock() {
            *g = Some(port);
        }
        Ok(port)
    }
}

#[async_trait]
impl ExecutorExtension for HydrogenExtension {
    fn kind(&self) -> ExecutorKind {
        ExecutorKind::Hydrogen
    }

    fn display_name(&self) -> &str {
        "Hydrogen"
    }

    fn autoexec_dir(&self) -> Option<PathBuf> {
        paths::home_dir()
            .ok()
            .map(|h| h.join("Hydrogen").join("workspace").join("autoexecute"))
    }

    async fn is_alive(&self) -> bool {
        self.resolve_port().await.is_ok()
    }

    async fn inject(&self, code: &str) -> VelocityUIResult<()> {
        let port = self.resolve_port().await?;

        let resp = self
            .client
            .post(format!("http://127.0.0.1:{}/execute", port))
            .header("Content-Type", "text/plain")
            .body(code.to_string())
            .send()
            .await?;

        if !resp.status().is_success() {
            if let Ok(mut g) = self.port_cache.lock() {
                *g = None;
            }
            return Err(VelocityUIError::Other(format!(
                "Hydrogen execute returned {}",
                resp.status()
            )));
        }

        Ok(())
    }
}
