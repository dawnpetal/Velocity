use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{WatchEvent, WatchEventBatch};

const COALESCE_WINDOW_MS: u64 = 75;
const THROTTLE_MAX_CHUNK: usize = 500;
const THROTTLE_REST_MS: u64 = 200;
const MAX_BUFFERED: usize = 30_000;

const IGNORED_SEGMENTS: &[&str] = &[
    "target",
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".cache",
    ".parcel-cache",
    "out",
    ".output",
    ".turbo",
    ".svelte-kit",
    "vendor",
    ".DS_Store",
];

#[derive(Clone, Debug, PartialEq)]
pub enum ChangeType {
    Added,
    Removed,
    Updated,
}

#[derive(Clone, Debug)]
struct RawChange {
    path: String,
    kind: ChangeType,
}

struct WatchState {
    app: AppHandle,
    id: u32,
    pending: Vec<RawChange>,
    coalesce_deadline: Option<Instant>,
    total_buffered: usize,
}

impl WatchState {
    fn new(app: AppHandle, id: u32) -> Arc<Mutex<Self>> {
        Arc::new(Mutex::new(Self {
            app,
            id,
            pending: Vec::new(),
            coalesce_deadline: None,
            total_buffered: 0,
        }))
    }

    fn push(&mut self, change: RawChange) {
        if self.total_buffered >= MAX_BUFFERED {
            return;
        }

        let path = change.path.clone();

        if let Some(existing) = self.pending.iter_mut().find(|c| c.path == path) {
            match (&existing.kind, &change.kind) {
                (ChangeType::Added, ChangeType::Removed) => {
                    self.pending.retain(|c| c.path != path);
                }
                (ChangeType::Removed, ChangeType::Added) => {
                    existing.kind = ChangeType::Updated;
                }
                (ChangeType::Added, ChangeType::Updated) => {}
                _ => {
                    existing.kind = change.kind;
                }
            }
        } else {
            self.total_buffered += 1;
            self.pending.push(change);
        }

        if self.coalesce_deadline.is_none() {
            self.coalesce_deadline =
                Some(Instant::now() + Duration::from_millis(COALESCE_WINDOW_MS));
        }
    }

    fn flush_if_ready(&mut self) -> Option<Vec<RawChange>> {
        let deadline = self.coalesce_deadline?;
        if Instant::now() < deadline {
            return None;
        }
        self.coalesce_deadline = None;
        self.total_buffered = 0;
        Some(std::mem::take(&mut self.pending))
    }
}

fn is_ignored(path: &str) -> bool {
    Path::new(path).components().any(|c| {
        if let std::path::Component::Normal(seg) = c {
            let s = seg.to_str().unwrap_or("");
            IGNORED_SEGMENTS.contains(&s) || s.starts_with('.')
        } else {
            false
        }
    })
}

fn emit_batch(app: &AppHandle, id: u32, changes: Vec<RawChange>) {
    let chunks = changes.chunks(THROTTLE_MAX_CHUNK);
    for chunk in chunks {
        let events: Vec<WatchEvent> = chunk
            .iter()
            .map(|c| WatchEvent {
                id,
                action: match c.kind {
                    ChangeType::Added => "created".into(),
                    ChangeType::Removed => "removed".into(),
                    ChangeType::Updated => "updated".into(),
                },
                path: c.path.clone(),
            })
            .collect();

        let _ = app.emit("watch-event", WatchEventBatch { id, events });
        std::thread::sleep(Duration::from_millis(THROTTLE_REST_MS));
    }
}

pub struct WatcherManager {
    map: DashMap<u32, RecommendedWatcher>,
    next_id: AtomicU32,
}

impl WatcherManager {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
            next_id: AtomicU32::new(1),
        }
    }

    pub fn watch(&self, app: &AppHandle, path: &str) -> VelocityUIResult<u32> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let state = WatchState::new(app.clone(), id);
        let state_cb = Arc::clone(&state);

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };

            let kind = match &event.kind {
                notify::EventKind::Create(_) => ChangeType::Added,
                notify::EventKind::Remove(_) => ChangeType::Removed,
                notify::EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                    ChangeType::Updated
                }
                _ => return,
            };

            let path_str = match event.paths.first().and_then(|p| p.to_str()) {
                Some(p) => p.to_string(),
                None => return,
            };

            if is_ignored(&path_str) {
                return;
            }

            let mut guard = match state_cb.lock() {
                Ok(g) => g,
                Err(_) => return,
            };

            guard.push(RawChange {
                path: path_str,
                kind,
            });

            if let Some(ready) = guard.flush_if_ready() {
                let app = guard.app.clone();
                let watcher_id = guard.id;
                drop(guard);
                std::thread::spawn(move || emit_batch(&app, watcher_id, ready));
            }
        })
        .map_err(|e| VelocityUIError::Other(e.to_string()))?;

        watcher
            .watch(Path::new(path), RecursiveMode::Recursive)
            .map_err(|e| VelocityUIError::Other(e.to_string()))?;

        self.map.insert(id, watcher);

        let state_flusher = Arc::clone(&state);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(COALESCE_WINDOW_MS));
            let mut guard = match state_flusher.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            if let Some(ready) = guard.flush_if_ready() {
                if ready.is_empty() {
                    continue;
                }
                let app = guard.app.clone();
                let watcher_id = guard.id;
                drop(guard);
                emit_batch(&app, watcher_id, ready);
            }
        });

        Ok(id)
    }

    pub fn unwatch(&self, id: u32) {
        self.map.remove(&id);
    }
}
