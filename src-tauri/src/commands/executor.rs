use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::Write;
use std::net::TcpStream;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::task::JoinSet;

use crate::state::{PortCache, SharedClient};

const HYDRO_PORT_START: u16 = 6969;
const HYDRO_PORT_END: u16 = 7069;
const HYDRO_SECRET: &str = "0xdeadbeef";

const OPIUM_PORTS: &[u16] = &[8392, 8393, 8394, 8395, 8396, 8397];

async fn probe_hydro(client: &reqwest::Client, port: u16) -> Option<u16> {
    let ok = async {
        let text = client
            .get(format!("http://127.0.0.1:{}/secret", port))
            .send()
            .await
            .ok()?
            .text()
            .await
            .ok()?;
        Some(text.trim() == HYDRO_SECRET)
    }
    .await
    .unwrap_or(false);
    if ok {
        Some(port)
    } else {
        None
    }
}

async fn discover_hydro(client: &reqwest::Client) -> anyhow::Result<u16> {
    let mut set = JoinSet::new();
    for port in HYDRO_PORT_START..=HYDRO_PORT_END {
        let c = client.clone();
        set.spawn(async move { probe_hydro(&c, port).await });
    }
    while let Some(result) = set.join_next().await {
        if let Ok(Some(port)) = result {
            set.abort_all();
            return Ok(port);
        }
    }
    Err(anyhow::anyhow!(
        "Hydrogen not found on ports {HYDRO_PORT_START}-{HYDRO_PORT_END}"
    ))
}

async fn resolve_hydro_port(client: &reqwest::Client, cache: &PortCache) -> anyhow::Result<u16> {
    let cached = *cache
        .0
        .lock()
        .map_err(|_| anyhow::anyhow!("port cache poisoned"))?;
    if let Some(port) = cached {
        if probe_hydro(client, port).await.is_some() {
            return Ok(port);
        }
        *cache
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("port cache poisoned"))? = None;
    }
    let port = discover_hydro(client).await?;
    *cache
        .0
        .lock()
        .map_err(|_| anyhow::anyhow!("port cache poisoned"))? = Some(port);
    Ok(port)
}

pub async fn inject_hydro_inner(
    code: String,
    client: &reqwest::Client,
    cache: &PortCache,
) -> anyhow::Result<()> {
    let port = resolve_hydro_port(client, cache).await?;
    let resp = client
        .post(format!("http://127.0.0.1:{}/execute", port))
        .header("Content-Type", "text/plain")
        .body(code)
        .send()
        .await?;
    if !resp.status().is_success() {
        *cache
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("port cache poisoned"))? = None;
        return Err(anyhow::anyhow!(
            "Hydrogen execute returned {}",
            resp.status()
        ));
    }
    Ok(())
}

fn opium_compress(data: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    enc.write_all(data)?;
    Ok(enc.finish()?)
}

fn build_opium_payload(code: &str) -> String {
    let t = code.trim_start();
    if t.starts_with("OpiumwareScript ") || t == "NULL" {
        code.to_string()
    } else {
        format!("OpiumwareScript {}", code)
    }
}

fn exec_opium_blocking(code: String) -> anyhow::Result<()> {
    let payload = build_opium_payload(&code);
    for &port in OPIUM_PORTS {
        if let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{}", port)) {
            if payload != "NULL" {
                let compressed = opium_compress(payload.as_bytes())?;
                stream.write_all(&compressed)?;
            }
            return Ok(());
        }
    }
    Err(anyhow::anyhow!(
        "Opiumware not found on ports {:?}",
        OPIUM_PORTS
    ))
}

async fn exec_opium(code: String) -> anyhow::Result<()> {
    tauri::async_runtime::spawn_blocking(move || exec_opium_blocking(code))
        .await
        .map_err(|e| anyhow::anyhow!("Opiumware task join error: {e}"))?
}

pub async fn exec_opium_shortcut(code: String) -> anyhow::Result<()> {
    exec_opium(code).await
}

#[tauri::command]
pub async fn inject_script(
    code: String,
    port_cache: State<'_, PortCache>,
    client: State<'_, SharedClient>,
) -> Result<(), String> {
    let kind = crate::services::load_ui_state()
        .and_then(|ui| ui.settings.executor)
        .unwrap_or_else(|| "opiumware".to_string())
        .trim()
        .to_ascii_lowercase();

    match kind.as_str() {
        "opiumware" | "opium" => exec_opium(code).await.map_err(|e| e.to_string()),
        _ => inject_hydro_inner(code, &client.0, &port_cache)
            .await
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn get_active_port(port_cache: State<PortCache>) -> Option<u16> {
    *port_cache.0.lock().unwrap()
}

#[tauri::command]
pub fn clear_port_cache(port_cache: State<PortCache>) {
    if let Ok(mut cache) = port_cache.0.lock() {
        *cache = None;
    }
}

#[tauri::command]
pub fn focus_roblox() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .args(["-e", "tell application \"Roblox\" to activate"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Not supported on this platform".to_string())
    }
}

fn is_roblox_running() -> bool {
    std::process::Command::new("pgrep")
        .args(["-x", "RobloxPlayer"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub fn is_roblox_focused() -> bool {
    std::process::Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get bundle identifier of first process whose frontmost is true",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim() == "com.roblox.RobloxPlayer")
        .unwrap_or(false)
}


pub fn start_autoexec_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("autoexec runtime");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(400))
            .build()
            .expect("autoexec http client");

        let port_cache = PortCache(Mutex::new(None));
        let mut was_running = false;

        loop {
            let is_running = is_roblox_running();
            if is_running != was_running {
                was_running = is_running;
                let _ = app.emit("roblox:state", serde_json::json!({ "running": is_running }));

                if is_running {
                    let meta_enabled = crate::paths::internals_dir()
                        .ok()
                        .map(|d| d.join("autoexec_meta.json"))
                        .and_then(|p| std::fs::read_to_string(p).ok())
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|v| v.get("enabled").and_then(|e| e.as_bool()))
                        .unwrap_or(false);

                    if meta_enabled {
                        let executor = crate::services::load_ui_state()
                            .and_then(|ui| ui.settings.executor)
                            .unwrap_or_else(|| "opium".to_string())
                            .to_ascii_lowercase();

                        let dir_opt = crate::paths::home_dir().ok().map(|home| {
                            match executor.as_str() {
                                "opiumware" | "opium" => home.join("Opiumware").join("autoexec"),
                                _ => home.join("Hydrogen").join("workspace").join("autoexecute"),
                            }
                        });

                        if let Some(dir) = dir_opt {
                            if let Ok(entries) = std::fs::read_dir(&dir) {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if path.extension().and_then(|e| e.to_str()) != Some("lua") {
                                        continue;
                                    }
                                    if path.file_name().and_then(|n| n.to_str()) == Some("Velocity_multiexec.lua") {
                                        continue;
                                    }
                                    if let Ok(code) = std::fs::read_to_string(&path) {
                                        match executor.as_str() {
                                            "opiumware" | "opium" => {
                                                let _ = rt.block_on(exec_opium(code));
                                            }
                                            _ => {
                                                let _ = rt.block_on(inject_hydro_inner(
                                                    code,
                                                    &client,
                                                    &port_cache,
                                                ));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}