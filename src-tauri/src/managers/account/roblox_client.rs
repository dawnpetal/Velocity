use std::path::{Path, PathBuf};
use std::process::Command;

use regex::Regex;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::paths;

pub struct RobloxClientManager;

impl RobloxClientManager {
    pub fn new() -> Self {
        Self
    }

    pub fn prepare_and_spawn(&self, user_id: &str, cookie: &str) -> VelocityUIResult<()> {
        let client_path = self.ensure_client_copy(user_id)?;
        let bundle_id = Self::bundle_id(user_id);
        self.rewrite_bundle_id(&client_path, &bundle_id)?;
        self.write_cookie_for_bundle(&bundle_id, cookie)?;
        let _ = self.register_bundle(&client_path);

        let player = client_path.join("Contents/MacOS/RobloxPlayer");
        Command::new(&player)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(VelocityUIError::Io)?;

        Ok(())
    }

    pub fn set_default_cookie(&self, cookie: &str) -> VelocityUIResult<()> {
        let home = std::env::var("HOME").map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let path =
            PathBuf::from(home).join("Library/HTTPStorages/com.roblox.RobloxPlayer.binarycookies");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        std::fs::write(&path, crate::cookies::create_binary_cookie_file(cookie))
            .map_err(VelocityUIError::Io)
    }

    pub fn bundle_id(user_id: &str) -> String {
        format!("com.roblox.RobloxPlayer.{}", user_id)
    }

    fn ensure_client_copy(&self, user_id: &str) -> VelocityUIResult<PathBuf> {
        let client_path = Self::client_path(user_id)?;
        let source_path = Self::installed_roblox_path()?;

        let needs_copy = if client_path.exists() {
            let src_ver = Self::plist_version(&source_path.join("Contents/Info.plist"));
            let dst_ver = Self::plist_version(&client_path.join("Contents/Info.plist"));
            src_ver != dst_ver
        } else {
            true
        };

        if needs_copy {
            if client_path.exists() {
                let _ = std::fs::remove_dir_all(&client_path);
            }
            let out = Command::new("cp")
                .args([
                    "-R",
                    source_path.to_str().unwrap_or(""),
                    client_path.to_str().unwrap_or(""),
                ])
                .output()
                .map_err(VelocityUIError::Io)?;

            if !out.status.success() {
                return Err(VelocityUIError::Other("failed to copy Roblox.app".into()));
            }
        }

        Ok(client_path)
    }

    fn rewrite_bundle_id(&self, client_path: &Path, bundle_id: &str) -> VelocityUIResult<()> {
        let plist_path = client_path.join("Contents/Info.plist");
        let content = std::fs::read_to_string(&plist_path).map_err(VelocityUIError::Io)?;
        let re = Regex::new(r"<string>com\.roblox\.RobloxPlayer\.?\w*</string>")
            .map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let updated = re
            .replace(&content, format!("<string>{}</string>", bundle_id))
            .to_string();
        std::fs::write(&plist_path, updated).map_err(VelocityUIError::Io)
    }

    fn write_cookie_for_bundle(&self, bundle_id: &str, cookie: &str) -> VelocityUIResult<()> {
        let home = std::env::var("HOME").map_err(|e| VelocityUIError::Other(e.to_string()))?;
        let path = PathBuf::from(home)
            .join("Library/HTTPStorages")
            .join(format!("{}.binarycookies", bundle_id));
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        std::fs::write(&path, crate::cookies::create_binary_cookie_file(cookie))
            .map_err(VelocityUIError::Io)
    }

    fn register_bundle(&self, client_path: &Path) -> VelocityUIResult<()> {
        let lsreg = PathBuf::from(
            "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
        );
        Command::new(lsreg)
            .arg("-f")
            .arg(client_path)
            .output()
            .map_err(VelocityUIError::Io)?;
        Ok(())
    }

    fn plist_version(plist_path: &Path) -> Option<String> {
        let content = std::fs::read_to_string(plist_path).ok()?;
        let re = Regex::new(r"<key>CFBundleVersion</key>\s*<string>([^<]+)</string>").ok()?;
        re.captures(&content)?
            .get(1)
            .map(|m| m.as_str().to_string())
    }

    fn installed_roblox_path() -> VelocityUIResult<PathBuf> {
        if let Some(home) = dirs::home_dir() {
            let p = home.join("Applications/Roblox.app");
            if p.exists() {
                return Ok(p);
            }
        }
        let p = PathBuf::from("/Applications/Roblox.app");
        if p.exists() {
            return Ok(p);
        }
        Err(VelocityUIError::NotFound(
            "Roblox.app not found. Install Roblox first.".into(),
        ))
    }

    fn clients_dir() -> VelocityUIResult<PathBuf> {
        Ok(paths::internals_dir()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?
            .join("roblox-clients"))
    }

    fn client_path(user_id: &str) -> VelocityUIResult<PathBuf> {
        let dir = Self::clients_dir()?.join(user_id);
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir.join("Roblox.app"))
    }
}
