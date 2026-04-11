use std::collections::HashMap;
use base64::Engine;
use chrono::Local;
use serde::Deserialize;
use tauri::AppHandle;

use crate::types::KeyCache;

fn load_key_cache() -> Option<KeyCache> {
    let path = crate::paths::cache_path().ok()?;
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<KeyCache>(&data).ok()
}

fn write_key_cache(cache: &KeyCache) -> anyhow::Result<()> {
    let path = crate::paths::cache_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string(cache)?)?;
    Ok(())
}

fn mac_hardware_uuid() -> anyhow::Result<String> {
    let out = std::process::Command::new("/usr/sbin/system_profiler")
        .arg("SPHardwareDataType")
        .output()?;
    let text = String::from_utf8(out.stdout)?;
    for line in text.lines() {
        if line.contains("Hardware UUID") {
            if let Some(colon) = line.find(':') {
                return Ok(line[colon + 1..].trim().to_string());
            }
        }
    }
    Err(anyhow::anyhow!("Hardware UUID not found in system_profiler output"))
}

#[derive(Deserialize)]
struct JwtPayload {
    key_expires_at: f64,
}

fn decode_jwt_payload(token: &str) -> anyhow::Result<JwtPayload> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(anyhow::anyhow!("invalid JWT: expected 3 parts"));
    }
    let mut b64 = parts[1].replace('-', "+").replace('_', "/");
    let pad = (4 - b64.len() % 4) % 4;
    b64.extend(std::iter::repeat('=').take(pad));
    let bytes = base64::engine::general_purpose::STANDARD.decode(&b64)?;
    Ok(serde_json::from_slice::<JwtPayload>(&bytes)?)
}

fn empty_cache(now: f64) -> KeyCache {
    KeyCache {
        fetched_at: now,
        valid: false,
        expires_at: None,
        key: None,
        error: None,
        hourly_counts: HashMap::new(),
        daily_counts: HashMap::new(),
    }
}

const HOURLY_LIMIT: i32 = 3;
const DAILY_LIMIT:  i32 = 12;

#[tauri::command]
pub fn validate_key(_app: AppHandle) -> Result<KeyCache, String> {
    let now = chrono::Utc::now().timestamp() as f64;
    let hour_key = Local::now().format("%Y-%m-%dT%H").to_string();
    let day_key = Local::now().format("%Y-%m-%d").to_string();

    let mut cache = load_key_cache().unwrap_or_else(|| empty_cache(now));
    let hour_count = {
        let e = cache.hourly_counts.entry(hour_key.clone()).or_insert(0);
        *e += 1;
        *e
    };
    let day_count = {
        let e = cache.daily_counts.entry(day_key.clone()).or_insert(0);
        *e += 1;
        *e
    };

    let finalize = |mut c: KeyCache, err: &str| -> KeyCache {
        c.fetched_at = now;
        c.valid = false;
        c.error = Some(err.to_string());
        let _ = write_key_cache(&c);
        c
    };

    
    if hour_count > HOURLY_LIMIT {
        return Ok(finalize(cache, &format!("Rate limited: max {HOURLY_LIMIT} checks per hour")));
    }
    if day_count > DAILY_LIMIT {
        return Ok(finalize(cache, &format!("Rate limited: max {DAILY_LIMIT} checks per day")));
    }

    let key_file = match crate::paths::key_file_path() {
        Ok(p) => p,
        Err(e) => return Ok(finalize(cache, &e.to_string())),
    };

    let key = match std::fs::read_to_string(&key_file) {
        Ok(k) => {
            let k = k.trim().to_string();
            if k.is_empty() {
                return Ok(finalize(cache, "Key file is empty"));
            }
            k
        }
        Err(_) => return Ok(finalize(cache, "Key file not found")),
    };

    let uuid = match mac_hardware_uuid() {
        Ok(u) => u,
        Err(e) => return Ok(finalize(cache, &format!("Could not read Hardware UUID: {e}"))),
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://www.hydrogen.lat/api/validate-key")
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("User-Agent", "curl/8.12.1")
        .json(&serde_json::json!({ "key": key, "mac_uuid": uuid }))
        .send();

    cache.fetched_at = chrono::Utc::now().timestamp() as f64;
    cache.key = Some(key);

    #[derive(Deserialize)]
    struct ValidateResponse {
        success: bool,
        token: Option<String>,
    }

    match resp {
        Ok(r) => match r.json::<ValidateResponse>() {
            Ok(vr) if vr.success => match vr.token {
                Some(token) => match decode_jwt_payload(&token) {
                    Ok(jwt) => {
                        let now_secs = chrono::Utc::now().timestamp() as f64;
                        cache.valid = jwt.key_expires_at > now_secs;
                        cache.expires_at = Some(jwt.key_expires_at);
                        cache.error = None;
                    }
                    Err(e) => {
                        cache.valid = false;
                        cache.error = Some(format!("JWT decode error: {e}"));
                    }
                },
                None => {
                    cache.valid = false;
                    cache.error = Some("Server returned success but no token".to_string());
                }
            },
            Ok(_) => {
                cache.valid = false;
                cache.error = Some("Server returned success=false".to_string());
            }
            Err(e) => {
                cache.valid = false;
                cache.error = Some(format!("Response parse error: {e}"));
            }
        },
        Err(e) => {
            cache.valid = false;
            cache.error = Some(e.to_string());
        }
    }

    let _ = write_key_cache(&cache);
    Ok(cache)
}

#[tauri::command]
pub fn get_key_cache(_app: AppHandle) -> Result<Option<KeyCache>, String> {
    Ok(load_key_cache())
}

#[tauri::command]
pub fn save_key_cache(_app: AppHandle, cache: KeyCache) -> Result<(), String> {
    write_key_cache(&cache).map_err(|e| e.to_string())
}
