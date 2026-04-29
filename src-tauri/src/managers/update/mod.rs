use std::sync::Mutex;

use semver::Version;

use crate::error::VelocityUIResult;
use crate::models::{GithubRelease, UpdateInfo};

const REPO_API: &str = "https://api.github.com/repos/dawnpetal/VelocityUI/releases/latest";

pub struct UpdateManager {
    last_result: Mutex<Option<UpdateInfo>>,
}

impl UpdateManager {
    pub fn new() -> Self {
        Self {
            last_result: Mutex::new(None),
        }
    }

    pub async fn check(
        &self,
        current: &str,
        client: &reqwest::Client,
    ) -> VelocityUIResult<UpdateInfo> {
        let release: GithubRelease = client
            .get(REPO_API)
            .header("User-Agent", "VelocityUI-App")
            .send()
            .await?
            .json()
            .await?;

        let latest = release.tag_name.trim_start_matches('v').to_string();

        let update_available = match (Version::parse(current), Version::parse(&latest)) {
            (Ok(c), Ok(l)) => l > c,
            _ => latest != current,
        };

        let info = UpdateInfo {
            current: current.to_string(),
            latest,
            update_available,
            release_url: release.html_url,
            release_notes: release.body,
        };

        if let Ok(mut guard) = self.last_result.lock() {
            *guard = Some(info.clone());
        }

        Ok(info)
    }

    pub fn last_result(&self) -> Option<UpdateInfo> {
        self.last_result.lock().ok().and_then(|g| g.clone())
    }
}
