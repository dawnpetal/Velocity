use keyring::{Entry, Error as KeyringError};
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const SERVICE_NAME: &str = "VelocityUI";
const COOKIE_BLOB_KEY: &str = "AccountCookies";
const ROBLOX_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const INSTANCE_LAUNCH_TIMEOUT_SECS: u64 = 20;
const INSTANCE_LAUNCH_POLL_MS: u64 = 250;

type CookieMap = BTreeMap<String, String>;

static COOKIE_CACHE: LazyLock<Mutex<Option<CookieMap>>> =
    LazyLock::new(|| Mutex::new(None));

static LAUNCHING_USERS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct AccountInfo {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RobloxAuthUser {
    id: u64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct ThumbnailResponse {
    data: Vec<ThumbnailEntry>,
}

#[derive(Debug, Deserialize)]
struct ThumbnailEntry {
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
}

struct InstanceLaunchGuard {
    user_id: String,
}

impl InstanceLaunchGuard {
    fn acquire(user_id: &str) -> Result<Self, String> {
        let mut set = LAUNCHING_USERS.lock().map_err(|_| "lock error".to_string())?;
        if !set.insert(user_id.to_string()) {
            return Err("already launching".to_string());
        }
        Ok(Self { user_id: user_id.to_string() })
    }
}

impl Drop for InstanceLaunchGuard {
    fn drop(&mut self) {
        if let Ok(mut set) = LAUNCHING_USERS.lock() {
            set.remove(&self.user_id);
        }
    }
}

fn accounts_meta_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("no home dir")?;
    let dir = home.join("Velocity").join("internals");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("accounts_meta.json"))
}

fn load_meta() -> Vec<AccountInfo> {
    let path = match accounts_meta_path() {
        Ok(p) => p,
        Err(_) => return vec![],
    };
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_meta(accounts: &[AccountInfo]) -> Result<(), String> {
    let path = accounts_meta_path()?;
    fs::write(&path, serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

fn get_keychain_entry() -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, COOKIE_BLOB_KEY).map_err(|e| e.to_string())
}

fn load_cookies_from_keychain() -> Result<CookieMap, String> {
    match get_keychain_entry()?.get_password() {
        Ok(raw) if raw.is_empty() => Ok(BTreeMap::new()),
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        Err(KeyringError::NoEntry) => Ok(BTreeMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn load_cookies() -> Result<CookieMap, String> {
    let mut cache = COOKIE_CACHE.lock().map_err(|_| "lock error")?;
    if let Some(ref c) = *cache { return Ok(c.clone()); }
    let cookies = load_cookies_from_keychain()?;
    *cache = Some(cookies.clone());
    Ok(cookies)
}

fn save_cookies(cookies: &CookieMap) -> Result<(), String> {
    let raw = serde_json::to_string(cookies).map_err(|e| e.to_string())?;
    get_keychain_entry()?.set_password(&raw).map_err(|e| e.to_string())?;
    let mut cache = COOKIE_CACHE.lock().map_err(|_| "lock error")?;
    *cache = Some(cookies.clone());
    Ok(())
}

fn store_cookie(user_id: &str, cookie: &str) -> Result<(), String> {
    let mut cookies = load_cookies()?;
    cookies.insert(user_id.to_string(), cookie.to_string());
    save_cookies(&cookies)
}

fn get_cookie(user_id: &str) -> Result<String, String> {
    load_cookies()?
        .get(user_id)
        .cloned()
        .ok_or_else(|| format!("no cookie for {}", user_id))
}

fn remove_cookie(user_id: &str) -> Result<(), String> {
    let mut cookies = load_cookies()?;
    if cookies.remove(user_id).is_some() {
        if cookies.is_empty() {
            let _ = get_keychain_entry()
                .and_then(|e| e.delete_credential().map_err(|err| err.to_string()));
            let mut cache = COOKIE_CACHE.lock().map_err(|_| "lock error")?;
            *cache = Some(BTreeMap::new());
        } else {
            save_cookies(&cookies)?;
        }
    }
    Ok(())
}

fn clean_cookie(raw: &str) -> &str {
    let t = raw.trim();
    if let Some(idx) = t.find("_|WARNING:") {
        let after = &t[idx..];
        if let Some(end) = after.find("|_") {
            let start = end + 2;
            return if start < after.len() { &after[start..] } else { after };
        }
    }
    if let Some(idx) = t.find("CAE") { return &t[idx..]; }
    t
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(ROBLOX_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_roblox_user(cookie: &str) -> Result<RobloxAuthUser, String> {
    let resp = build_http_client()?
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Roblox auth returned {}", resp.status()));
    }
    resp.json::<RobloxAuthUser>().await.map_err(|e| e.to_string())
}

async fn fetch_avatar_url(user_id: u64) -> Option<String> {
    let url = format!(
        "https://thumbnails.roblox.com/v1/users/avatar-bust?userIds={}&size=420x420&format=Png&isCircular=false",
        user_id
    );
    let resp = build_http_client().ok()?.get(&url).send().await.ok()?;
    if !resp.status().is_success() { return None; }
    resp.json::<ThumbnailResponse>().await.ok()?
        .data.into_iter().next()
        .and_then(|e| e.image_url)
}

fn upsert_meta(accounts: &mut Vec<AccountInfo>, info: AccountInfo) {
    match accounts.iter_mut().find(|a| a.user_id == info.user_id) {
        Some(existing) => *existing = info,
        None => accounts.push(info),
    }
}

fn get_installed_roblox_path() -> Result<PathBuf, String> {
    if let Some(home) = dirs::home_dir() {
        let p = home.join("Applications/Roblox.app");
        if p.exists() { return Ok(p); }
    }
    let p = PathBuf::from("/Applications/Roblox.app");
    if p.exists() { return Ok(p); }
    Err("Roblox.app not found. Install Roblox first.".to_string())
}

fn get_clients_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("no home dir")?;
    Ok(home.join("Velocity").join("internals").join("roblox-clients"))
}

fn get_client_path(user_id: &str) -> Result<PathBuf, String> {
    let dir = get_clients_dir()?;
    let account_dir = dir.join(user_id);
    if !account_dir.exists() {
        fs::create_dir_all(&account_dir).map_err(|e| e.to_string())?;
    }
    Ok(account_dir.join("Roblox.app"))
}

fn build_bundle_id(user_id: &str) -> String {
    format!("com.roblox.RobloxPlayer.{}", user_id)
}

fn read_plist_version(plist_path: &PathBuf) -> Option<String> {
    let content = fs::read_to_string(plist_path).ok()?;
    let re = Regex::new(r"<key>CFBundleVersion</key>\s*<string>([^<]+)</string>").ok()?;
    re.captures(&content)?.get(1).map(|m| m.as_str().to_string())
}

fn ensure_client_copy(user_id: &str) -> Result<PathBuf, String> {
    let client_path = get_client_path(user_id)?;
    let source_path = get_installed_roblox_path()?;

    let needs_copy = if client_path.exists() {
        let src_ver = read_plist_version(&source_path.join("Contents/Info.plist"));
        let dst_ver = read_plist_version(&client_path.join("Contents/Info.plist"));
        src_ver != dst_ver
    } else {
        true
    };

    if needs_copy {
        if client_path.exists() {
            let _ = fs::remove_dir_all(&client_path);
        }
        let out = Command::new("cp")
            .args(["-R", source_path.to_str().unwrap(), client_path.to_str().unwrap()])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err("failed to copy Roblox.app".to_string());
        }
    }

    Ok(client_path)
}

fn rewrite_bundle_id(client_path: &PathBuf, bundle_id: &str) -> Result<(), String> {
    let plist_path = client_path.join("Contents/Info.plist");
    let content = fs::read_to_string(&plist_path).map_err(|e| e.to_string())?;
    let re = Regex::new(r"<string>com\.roblox\.RobloxPlayer\.?\w*</string>")
        .map_err(|e| e.to_string())?;
    let new_content = re.replace(&content, format!("<string>{}</string>", bundle_id)).to_string();
    fs::write(&plist_path, new_content).map_err(|e| e.to_string())
}

fn write_cookie_for_bundle(bundle_id: &str, cookie: &str) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = PathBuf::from(&home)
        .join("Library/HTTPStorages")
        .join(format!("{}.binarycookies", bundle_id));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, crate::cookies::create_binary_cookie_file(cookie))
        .map_err(|e| e.to_string())
}

fn register_bundle(client_path: &PathBuf) -> Result<(), String> {
    let lsreg = PathBuf::from(
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    );
    Command::new(lsreg)
        .arg("-f")
        .arg(client_path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_running_user_ids() -> Result<Vec<String>, String> {
    let out = Command::new("/usr/bin/lsappinfo")
        .arg("list")
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let re = Regex::new(r"com\.roblox\.RobloxPlayer\.(\d+)").map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for cap in re.captures_iter(&text) {
        if let Some(id) = cap.get(1) {
            let s = id.as_str().to_string();
            if !ids.contains(&s) { ids.push(s); }
        }
    }
    Ok(ids)
}

fn is_instance_running(user_id: &str) -> bool {
    get_running_user_ids()
        .map(|ids| ids.iter().any(|id| id == user_id))
        .unwrap_or(false)
}

fn wait_for_running(user_id: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(INSTANCE_LAUNCH_TIMEOUT_SECS);
    while Instant::now() < deadline {
        if is_instance_running(user_id) { return Ok(()); }
        std::thread::sleep(Duration::from_millis(INSTANCE_LAUNCH_POLL_MS));
    }
    Err("timed out waiting for Roblox instance to start".to_string())
}

#[tauri::command]
pub async fn accounts_add(cookie: String) -> Result<AccountInfo, String> {
    let clean = clean_cookie(&cookie).to_string();
    let user = fetch_roblox_user(&clean).await?;
    let avatar = fetch_avatar_url(user.id).await;
    let info = AccountInfo {
        user_id: user.id.to_string(),
        username: user.name,
        display_name: user.display_name,
        avatar_url: avatar,
    };
    store_cookie(&info.user_id, &clean)?;
    let mut accounts = load_meta();
    upsert_meta(&mut accounts, info.clone());
    save_meta(&accounts)?;
    Ok(info)
}

#[tauri::command]
pub fn accounts_list() -> Result<Vec<AccountInfo>, String> {
    Ok(load_meta())
}

#[tauri::command]
pub fn accounts_remove(user_id: String) -> Result<(), String> {
    remove_cookie(&user_id)?;
    let mut accounts = load_meta();
    accounts.retain(|a| a.user_id != user_id);
    save_meta(&accounts)
}

#[tauri::command]
pub async fn accounts_refresh(user_id: String) -> Result<AccountInfo, String> {
    let cookie = get_cookie(&user_id)?;
    let user = fetch_roblox_user(&cookie).await?;
    let avatar = fetch_avatar_url(user.id).await;
    let info = AccountInfo {
        user_id: user.id.to_string(),
        username: user.name,
        display_name: user.display_name,
        avatar_url: avatar,
    };
    let mut accounts = load_meta();
    upsert_meta(&mut accounts, info.clone());
    save_meta(&accounts)?;
    Ok(info)
}

#[tauri::command]
pub fn accounts_get_cookie(user_id: String) -> Result<String, String> {
    get_cookie(&user_id)
}

#[tauri::command]
pub fn accounts_get_running() -> Result<Vec<String>, String> {
    get_running_user_ids()
}

#[tauri::command]
pub fn accounts_launch(user_id: String) -> Result<(), String> {
    let _guard = InstanceLaunchGuard::acquire(&user_id)?;
    if is_instance_running(&user_id) {
        return Err("instance already running".to_string());
    }
    let cookie = get_cookie(&user_id)?;
    let client_path = ensure_client_copy(&user_id)?;
    let bundle_id = build_bundle_id(&user_id);
    rewrite_bundle_id(&client_path, &bundle_id)?;
    write_cookie_for_bundle(&bundle_id, &cookie)?;
    let _ = register_bundle(&client_path);
    let player = client_path.join("Contents/MacOS/RobloxPlayer");
    Command::new(&player)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    wait_for_running(&user_id)?;
    Ok(())
}

#[tauri::command]
pub fn accounts_kill(user_id: String) -> Result<(), String> {
    let bundle_id = build_bundle_id(&user_id);
    let out = Command::new("/usr/bin/lsappinfo")
        .arg("list")
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let pid_re = Regex::new(r"pid\s*=\s*(\d+)").map_err(|e| e.to_string())?;
    let mut current = String::new();
    let mut pid_to_kill: Option<String> = None;

    for line in text.lines() {
        let is_entry_start = line.trim_start().chars().next()
            .map(|c| c.is_ascii_digit()).unwrap_or(false)
            && line.contains(") \"");
        if is_entry_start {
            if current.contains(&bundle_id) {
                if let Some(cap) = pid_re.captures(&current) {
                    pid_to_kill = cap.get(1).map(|m| m.as_str().to_string());
                    break;
                }
            }
            current = line.to_string();
        } else {
            current.push('\n');
            current.push_str(line);
        }
    }
    if pid_to_kill.is_none() && current.contains(&bundle_id) {
        if let Some(cap) = pid_re.captures(&current) {
            pid_to_kill = cap.get(1).map(|m| m.as_str().to_string());
        }
    }
    if let Some(pid) = pid_to_kill {
        Command::new("kill").args(["-9", &pid]).output().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn accounts_kill_all() -> Result<(), String> {
    Command::new("pkill").args(["-9", "-f", "RobloxPlayer"]).output().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn accounts_set_default(user_id: String) -> Result<(), String> {
    let cookie = get_cookie(&user_id)?;
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = PathBuf::from(home)
        .join("Library/HTTPStorages/com.roblox.RobloxPlayer.binarycookies");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, crate::cookies::create_binary_cookie_file(&cookie))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accounts_clear_clients() -> Result<(), String> {
    let dir = get_clients_dir()?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
