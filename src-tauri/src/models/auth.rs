use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyCache {
    pub fetched_at: f64,
    pub valid: bool,
    pub expires_at: Option<f64>,
    pub key: Option<String>,
    pub error: Option<String>,
    pub hourly_counts: HashMap<String, i32>,
    pub daily_counts: HashMap<String, i32>,
}

#[derive(Debug, Default)]
pub struct RateLimitState {
    pub hourly_counts: HashMap<String, i32>,
    pub daily_counts: HashMap<String, i32>,
}

impl RateLimitState {
    pub fn increment_hour(&mut self, key: &str) -> i32 {
        let count = self.hourly_counts.entry(key.to_owned()).or_insert(0);
        *count += 1;
        *count
    }

    pub fn increment_day(&mut self, key: &str) -> i32 {
        let count = self.daily_counts.entry(key.to_owned()).or_insert(0);
        *count += 1;
        *count
    }
}
