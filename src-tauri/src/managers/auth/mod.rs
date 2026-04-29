use std::collections::HashMap;

use base64::Engine;
use chrono::Local;
use serde::Deserialize;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{KeyCache, RateLimitState};
use crate::paths;

const HOURLY_LIMIT: i32 = 3;
const DAILY_LIMIT: i32 = 12;

pub struct AuthManager {
    hourly_counts: std::sync::Mutex<HashMap<String, i32>>,
    daily_counts: std::sync::Mutex<HashMap<String, i32>>,
    inject_counts: std::sync::Mutex<RateLimitState>,
}

impl AuthManager {
    pub fn new() -> Self {
        Self {
            hourly_counts: std::sync::Mutex::new(HashMap::new()),
            daily_counts: std::sync::Mutex::new(HashMap::new()),
            inject_counts: std::sync::Mutex::new(RateLimitState::default()),
        }
    }

    pub fn record_inject(&self, hour_key: &str, day_key: &str) -> VelocityUIResult<(i32, i32)> {
        let mut cache = self
            .load_cache()
            .unwrap_or_else(|| Self::empty_cache(chrono::Utc::now().timestamp() as f64));
        let mut state = self
            .inject_counts
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        Self::merge_counts(&mut state.hourly_counts, &cache.hourly_counts);
        Self::merge_counts(&mut state.daily_counts, &cache.daily_counts);
        let h = state.increment_hour(hour_key);
        let d = state.increment_day(day_key);
        cache.hourly_counts.insert(hour_key.to_string(), h);
        cache.daily_counts.insert(day_key.to_string(), d);
        self.write_cache(&cache)?;
        Ok((h, d))
    }

    pub fn validate_key(&self) -> VelocityUIResult<KeyCache> {
        let now = chrono::Utc::now().timestamp() as f64;
        let hour_key = Local::now().format("%Y-%m-%dT%H").to_string();
        let day_key = Local::now().format("%Y-%m-%d").to_string();

        let mut cache = self.load_cache().unwrap_or_else(|| Self::empty_cache(now));
        let hour_count = self.increment_hourly(&hour_key, &cache.hourly_counts)?;
        let day_count = self.increment_daily(&day_key, &cache.daily_counts)?;
        cache.hourly_counts.insert(hour_key.clone(), hour_count);
        cache.daily_counts.insert(day_key.clone(), day_count);

        if hour_count > HOURLY_LIMIT {
            return Ok(self.rate_limit_result(
                cache,
                now,
                &format!("Rate limited: max {} checks per hour", HOURLY_LIMIT),
            ));
        }
        if day_count > DAILY_LIMIT {
            return Ok(self.rate_limit_result(
                cache,
                now,
                &format!("Rate limited: max {} checks per day", DAILY_LIMIT),
            ));
        }

        let key_path = paths::key_file_path().map_err(|e| VelocityUIError::Other(e.to_string()))?;

        let key = match std::fs::read_to_string(&key_path) {
            Ok(k) => {
                let k = k.trim().to_string();
                if k.is_empty() {
                    return Ok(self.rate_limit_result(cache, now, "Key file is empty"));
                }
                k
            }
            Err(_) => return Ok(self.rate_limit_result(cache, now, "Key file not found")),
        };

        let uuid = Self::hardware_uuid()?;

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(VelocityUIError::Network)?;

        cache.fetched_at = now;
        cache.key = Some(key.clone());

        #[derive(Deserialize)]
        struct ValidateResponse {
            success: bool,
            token: Option<String>,
        }

        match client
            .post("https://www.hydrogen.lat/api/validate-key")
            .header("Content-Type", "application/json")
            .header("Accept", "*/*")
            .header("User-Agent", "curl/8.12.1")
            .json(&serde_json::json!({ "key": key, "mac_uuid": uuid }))
            .send()
        {
            Ok(r) => match r.json::<ValidateResponse>() {
                Ok(vr) if vr.success => match vr.token {
                    Some(token) => match Self::decode_jwt(&token) {
                        Ok(exp) => {
                            let now_secs = chrono::Utc::now().timestamp() as f64;
                            cache.valid = exp > now_secs;
                            cache.expires_at = Some(exp);
                            cache.error = None;
                        }
                        Err(e) => {
                            cache.valid = false;
                            cache.error = Some(format!("JWT decode error: {e}"));
                        }
                    },
                    None => {
                        cache.valid = false;
                        cache.error = Some("Server returned success but no token".into());
                    }
                },
                Ok(_) => {
                    cache.valid = false;
                    cache.error = Some("Server returned success=false".into());
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

        let _ = self.write_cache(&cache);
        Ok(cache)
    }

    pub fn load_cache(&self) -> Option<KeyCache> {
        let path = paths::cache_path().ok()?;
        let data = std::fs::read_to_string(path).ok()?;
        serde_json::from_str::<KeyCache>(&data).ok()
    }

    pub fn write_cache(&self, cache: &KeyCache) -> VelocityUIResult<()> {
        let path = paths::cache_path().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        let json = serde_json::to_string(cache).map_err(VelocityUIError::Json)?;
        std::fs::write(&path, json).map_err(VelocityUIError::Io)
    }

    fn merge_counts(target: &mut HashMap<String, i32>, source: &HashMap<String, i32>) {
        for (key, value) in source {
            let entry = target.entry(key.clone()).or_insert(0);
            *entry = (*entry).max(*value);
        }
    }

    fn rate_limit_result(&self, mut cache: KeyCache, now: f64, msg: &str) -> KeyCache {
        cache.fetched_at = now;
        cache.valid = false;
        cache.error = Some(msg.to_string());
        let _ = self.write_cache(&cache);
        cache
    }

    fn increment_hourly(&self, key: &str, saved: &HashMap<String, i32>) -> VelocityUIResult<i32> {
        let mut map = self
            .hourly_counts
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        Self::merge_counts(&mut map, saved);
        let count = map.entry(key.to_string()).or_insert(0);
        *count += 1;
        Ok(*count)
    }

    fn increment_daily(&self, key: &str, saved: &HashMap<String, i32>) -> VelocityUIResult<i32> {
        let mut map = self
            .daily_counts
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        Self::merge_counts(&mut map, saved);
        let count = map.entry(key.to_string()).or_insert(0);
        *count += 1;
        Ok(*count)
    }

    fn hardware_uuid() -> VelocityUIResult<String> {
        let out = std::process::Command::new("/usr/sbin/system_profiler")
            .arg("SPHardwareDataType")
            .output()
            .map_err(VelocityUIError::Io)?;
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if line.contains("Hardware UUID") {
                if let Some(i) = line.find(':') {
                    return Ok(line[i + 1..].trim().to_string());
                }
            }
        }
        Err(VelocityUIError::NotFound("Hardware UUID not found".into()))
    }

    fn decode_jwt(token: &str) -> VelocityUIResult<f64> {
        #[derive(Deserialize)]
        struct Payload {
            key_expires_at: f64,
        }

        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(VelocityUIError::InvalidData("invalid JWT".into()));
        }

        let mut b64 = parts[1].replace('-', "+").replace('_', "/");
        let pad = (4 - b64.len() % 4) % 4;
        b64.extend(std::iter::repeat('=').take(pad));

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .map_err(|e| VelocityUIError::InvalidData(e.to_string()))?;

        let payload: Payload = serde_json::from_slice(&bytes).map_err(VelocityUIError::Json)?;

        Ok(payload.key_expires_at)
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
}
