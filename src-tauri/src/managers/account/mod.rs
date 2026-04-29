pub mod cookie;
pub mod roblox_client;

pub use cookie::CookieManager;
pub use roblox_client::RobloxClientManager;

use std::path::PathBuf;

use serde::Deserialize;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::AccountInfo;
use crate::paths;

#[derive(Deserialize)]
struct RobloxAuthUser {
    id: u64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Deserialize)]
struct ThumbnailResponse {
    data: Vec<ThumbnailEntry>,
}

#[derive(Deserialize)]
struct ThumbnailEntry {
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
}

pub struct AccountManager {
    cookies: CookieManager,
    roblox: RobloxClientManager,
}

impl AccountManager {
    pub fn new() -> Self {
        Self {
            cookies: CookieManager::new(),
            roblox: RobloxClientManager::new(),
        }
    }

    pub async fn add(
        &self,
        cookie: &str,
        client: &reqwest::Client,
    ) -> VelocityUIResult<AccountInfo> {
        let clean = CookieManager::clean_cookie(cookie).to_string();
        let user = Self::fetch_user(&clean, client).await?;
        let avatar = Self::fetch_avatar(user.id, client).await;

        let info = AccountInfo {
            user_id: user.id.to_string(),
            username: user.name,
            display_name: user.display_name,
            avatar_url: avatar,
        };

        self.cookies.store(&info.user_id, &clean)?;
        let mut accounts = self.load_meta();
        Self::upsert(&mut accounts, info.clone());
        self.save_meta(&accounts)?;

        Ok(info)
    }

    pub fn list(&self) -> Vec<AccountInfo> {
        self.load_meta()
    }

    pub fn remove(&self, user_id: &str) -> VelocityUIResult<()> {
        self.cookies.remove(user_id)?;
        let mut accounts = self.load_meta();
        accounts.retain(|a| a.user_id != user_id);
        self.save_meta(&accounts)
    }

    pub async fn refresh(
        &self,
        user_id: &str,
        client: &reqwest::Client,
    ) -> VelocityUIResult<AccountInfo> {
        let cookie = self.cookies.get(user_id)?;
        let user = Self::fetch_user(&cookie, client).await?;
        let avatar = Self::fetch_avatar(user.id, client).await;

        let info = AccountInfo {
            user_id: user.id.to_string(),
            username: user.name,
            display_name: user.display_name,
            avatar_url: avatar,
        };

        let mut accounts = self.load_meta();
        Self::upsert(&mut accounts, info.clone());
        self.save_meta(&accounts)?;

        Ok(info)
    }

    pub fn get_cookie(&self, user_id: &str) -> VelocityUIResult<String> {
        self.cookies.get(user_id)
    }

    pub fn set_default(&self, user_id: &str) -> VelocityUIResult<()> {
        let cookie = self.cookies.get(user_id)?;
        self.roblox.set_default_cookie(&cookie)
    }

    fn meta_path() -> VelocityUIResult<PathBuf> {
        let dir = paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir.join("accounts_meta.json"))
    }

    fn load_meta(&self) -> Vec<AccountInfo> {
        Self::meta_path()
            .ok()
            .filter(|p| p.exists())
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save_meta(&self, accounts: &[AccountInfo]) -> VelocityUIResult<()> {
        let path = Self::meta_path()?;
        let json = serde_json::to_string_pretty(accounts).map_err(VelocityUIError::Json)?;
        std::fs::write(&path, json).map_err(VelocityUIError::Io)
    }

    fn upsert(accounts: &mut Vec<AccountInfo>, info: AccountInfo) {
        match accounts.iter_mut().find(|a| a.user_id == info.user_id) {
            Some(existing) => *existing = info,
            None => accounts.push(info),
        }
    }

    async fn fetch_user(
        cookie: &str,
        client: &reqwest::Client,
    ) -> VelocityUIResult<RobloxAuthUser> {
        let resp = client
            .get("https://users.roblox.com/v1/users/authenticated")
            .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(VelocityUIError::Other(format!(
                "Roblox auth returned {}",
                resp.status()
            )));
        }

        resp.json::<RobloxAuthUser>()
            .await
            .map_err(VelocityUIError::Network)
    }

    async fn fetch_avatar(user_id: u64, client: &reqwest::Client) -> Option<String> {
        let url = format!(
            "https://thumbnails.roblox.com/v1/users/avatar-bust?userIds={}&size=420x420&format=Png&isCircular=false",
            user_id
        );
        let resp = client.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<ThumbnailResponse>()
            .await
            .ok()?
            .data
            .into_iter()
            .next()
            .and_then(|e| e.image_url)
    }
}
