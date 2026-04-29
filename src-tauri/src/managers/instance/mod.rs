use std::collections::HashSet;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use regex::Regex;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::managers::account::RobloxClientManager;

const LAUNCH_TIMEOUT: Duration = Duration::from_secs(20);
const LAUNCH_POLL: Duration = Duration::from_millis(250);

pub struct LaunchGuard {
    user_id: String,
    set: Arc<Mutex<HashSet<String>>>,
}

impl Drop for LaunchGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.set.lock() {
            guard.remove(&self.user_id);
        }
    }
}

pub struct InstanceManager {
    launching: Arc<Mutex<HashSet<String>>>,
    roblox: RobloxClientManager,
}

impl InstanceManager {
    pub fn new() -> Self {
        Self {
            launching: Arc::new(Mutex::new(HashSet::new())),
            roblox: RobloxClientManager::new(),
        }
    }

    pub fn launch(&self, user_id: &str, cookie: &str) -> VelocityUIResult<()> {
        let _guard = self.acquire_guard(user_id)?;

        if self.is_running(user_id) {
            return Err(VelocityUIError::Other("instance already running".into()));
        }

        self.roblox.prepare_and_spawn(user_id, cookie)?;
        self.wait_until_running(user_id)
    }

    pub fn kill(&self, user_id: &str) -> VelocityUIResult<()> {
        let bundle_id = RobloxClientManager::bundle_id(user_id);

        let out = Command::new("/usr/bin/lsappinfo")
            .arg("list")
            .output()
            .map_err(VelocityUIError::Io)?;

        let text = String::from_utf8_lossy(&out.stdout);
        let pid_re =
            Regex::new(r"pid\s*=\s*(\d+)").map_err(|e| VelocityUIError::Other(e.to_string()))?;

        let mut current = String::new();
        let mut pid: Option<String> = None;

        for line in text.lines() {
            let is_entry_start = line
                .trim_start()
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
                && line.contains(") \"");

            if is_entry_start {
                if current.contains(&bundle_id) {
                    if let Some(cap) = pid_re.captures(&current) {
                        pid = cap.get(1).map(|m| m.as_str().to_string());
                        break;
                    }
                }
                current = line.to_string();
            } else {
                current.push('\n');
                current.push_str(line);
            }
        }

        if pid.is_none() && current.contains(&bundle_id) {
            if let Some(cap) = pid_re.captures(&current) {
                pid = cap.get(1).map(|m| m.as_str().to_string());
            }
        }

        if let Some(p) = pid {
            Command::new("kill")
                .args(["-9", &p])
                .output()
                .map_err(VelocityUIError::Io)?;
        }

        Ok(())
    }

    pub fn kill_all(&self) -> VelocityUIResult<()> {
        Command::new("pkill")
            .args(["-9", "-f", "RobloxPlayer"])
            .output()
            .map_err(VelocityUIError::Io)?;
        Ok(())
    }

    pub fn get_running(&self) -> VelocityUIResult<Vec<String>> {
        let out = Command::new("/usr/bin/lsappinfo")
            .arg("list")
            .output()
            .map_err(VelocityUIError::Io)?;

        let text = String::from_utf8_lossy(&out.stdout);
        let re = Regex::new(r"com\.roblox\.RobloxPlayer\.(\d+)")
            .map_err(|e| VelocityUIError::Other(e.to_string()))?;

        let mut ids: Vec<String> = Vec::new();
        for cap in re.captures_iter(&text) {
            if let Some(id) = cap.get(1) {
                let s = id.as_str().to_string();
                if !ids.contains(&s) {
                    ids.push(s);
                }
            }
        }

        Ok(ids)
    }

    pub fn is_running(&self, user_id: &str) -> bool {
        self.get_running()
            .map(|ids| ids.iter().any(|id| id == user_id))
            .unwrap_or(false)
    }

    pub fn is_launching(&self, user_id: &str) -> bool {
        self.launching
            .lock()
            .map(|set| set.contains(user_id))
            .unwrap_or(false)
    }

    fn acquire_guard(&self, user_id: &str) -> VelocityUIResult<LaunchGuard> {
        let mut set = self
            .launching
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;

        if !set.insert(user_id.to_string()) {
            return Err(VelocityUIError::AlreadyInProgress);
        }

        Ok(LaunchGuard {
            user_id: user_id.to_string(),
            set: Arc::clone(&self.launching),
        })
    }

    fn wait_until_running(&self, user_id: &str) -> VelocityUIResult<()> {
        let deadline = Instant::now() + LAUNCH_TIMEOUT;
        while Instant::now() < deadline {
            if self.is_running(user_id) {
                return Ok(());
            }
            std::thread::sleep(LAUNCH_POLL);
        }
        Err(VelocityUIError::Other(
            "timed out waiting for Roblox instance to start".into(),
        ))
    }
}
