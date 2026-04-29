use std::collections::BTreeMap;
use std::sync::Mutex;

use keyring::{Entry, Error as KeyringError};

use crate::error::{VelocityUIError, VelocityUIResult};

const SERVICE_NAME: &str = "VelocityUI";
const COOKIE_BLOB_KEY: &str = "AccountCookies";

type CookieMap = BTreeMap<String, String>;

pub struct CookieManager {
    cache: Mutex<Option<CookieMap>>,
}

impl CookieManager {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }

    pub fn get(&self, user_id: &str) -> VelocityUIResult<String> {
        self.load()?
            .get(user_id)
            .cloned()
            .ok_or_else(|| VelocityUIError::NotFound(format!("no cookie for {}", user_id)))
    }

    pub fn store(&self, user_id: &str, cookie: &str) -> VelocityUIResult<()> {
        let mut map = self.load()?;
        map.insert(user_id.to_string(), cookie.to_string());
        self.save(&map)
    }

    pub fn remove(&self, user_id: &str) -> VelocityUIResult<()> {
        let mut map = self.load()?;
        if map.remove(user_id).is_none() {
            return Ok(());
        }
        if map.is_empty() {
            let _ = Self::entry()?.delete_credential();
            *self
                .cache
                .lock()
                .map_err(|_| VelocityUIError::LockPoisoned)? = Some(BTreeMap::new());
        } else {
            self.save(&map)?;
        }
        Ok(())
    }

    pub fn clean_cookie(raw: &str) -> &str {
        let t = raw.trim();
        if let Some(idx) = t.find("_|WARNING:") {
            let after = &t[idx..];
            if let Some(end) = after.find("|_") {
                let start = end + 2;
                return if start < after.len() {
                    &after[start..]
                } else {
                    after
                };
            }
        }
        if let Some(idx) = t.find("CAE") {
            return &t[idx..];
        }
        t
    }

    fn load(&self) -> VelocityUIResult<CookieMap> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        if let Some(ref map) = *cache {
            return Ok(map.clone());
        }
        let map = Self::load_from_keychain()?;
        *cache = Some(map.clone());
        Ok(map)
    }

    fn save(&self, map: &CookieMap) -> VelocityUIResult<()> {
        let raw = serde_json::to_string(map).map_err(VelocityUIError::Json)?;
        Self::entry()?
            .set_password(&raw)
            .map_err(|e| VelocityUIError::Keychain(e.to_string()))?;
        *self
            .cache
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)? = Some(map.clone());
        Ok(())
    }

    fn load_from_keychain() -> VelocityUIResult<CookieMap> {
        match Self::entry()?.get_password() {
            Ok(raw) if raw.is_empty() => Ok(BTreeMap::new()),
            Ok(raw) => serde_json::from_str(&raw).map_err(VelocityUIError::Json),
            Err(KeyringError::NoEntry) => Ok(BTreeMap::new()),
            Err(e) => Err(VelocityUIError::Keychain(e.to_string())),
        }
    }

    fn entry() -> VelocityUIResult<Entry> {
        Entry::new(SERVICE_NAME, COOKIE_BLOB_KEY)
            .map_err(|e| VelocityUIError::Keychain(e.to_string()))
    }
}
