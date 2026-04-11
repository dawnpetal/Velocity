use dashmap::DashMap;
use notify::RecommendedWatcher;
use std::sync::{
    atomic::AtomicU32,
    Arc, Mutex,
};

use crate::icon_theme;

pub struct WatcherRegistry {
    pub map: DashMap<u32, RecommendedWatcher>,
    pub next_id: AtomicU32,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
            next_id: AtomicU32::new(1),
        }
    }
}

pub struct PortCache(pub Mutex<Option<u16>>);

pub struct SharedClient(pub reqwest::Client);

pub struct ShortcutMap(pub Arc<Mutex<std::collections::HashMap<u32, String>>>);

pub struct IconThemeState(pub Arc<icon_theme::IconThemeManager>);
