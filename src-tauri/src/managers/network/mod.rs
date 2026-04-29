use std::collections::HashMap;
use std::time::Duration;

use crate::error::{VelocityUIError, VelocityUIResult};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub struct NetworkManager {
    client: reqwest::Client,
}

impl NetworkManager {
    pub fn new() -> VelocityUIResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .user_agent(USER_AGENT)
            .build()
            .map_err(VelocityUIError::Network)?;

        Ok(Self { client })
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub async fn get_text(
        &self,
        url: &str,
        headers: Option<&HashMap<String, String>>,
    ) -> VelocityUIResult<String> {
        let mut req = self.client.get(url);

        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                req = req.header(k.as_str(), v.as_str());
            }
        }

        let resp = req.send().await?;

        if !resp.status().is_success() {
            return Err(VelocityUIError::Other(format!("HTTP {}", resp.status())));
        }

        Ok(resp.text().await?)
    }
}
