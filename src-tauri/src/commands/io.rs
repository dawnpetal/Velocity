use std::sync::atomic::Ordering;
use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::WatcherRegistry;
use crate::types::{DirEntry, WatchEvent};

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    crate::paths::home_dir()
        .map_err(|e| e.to_string())
        .and_then(|p| {
            p.to_str()
                .map(String::from)
                .ok_or_else(|| "home dir path is not valid UTF-8".to_string())
        })
}

#[tauri::command]
pub fn get_resource_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .to_str()
        .map(String::from)
        .ok_or_else(|| "resource dir path is not valid UTF-8".to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn write_binary_file(path: String, data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .map(|item| {
            let item = item.map_err(|e| e.to_string())?;
            let name = item
                .file_name()
                .to_str()
                .ok_or_else(|| "filename is not valid UTF-8".to_string())?
                .to_string();
            let kind = if item.file_type().map_err(|e| e.to_string())?.is_dir() {
                "DIRECTORY"
            } else {
                "FILE"
            };
            Ok(DirEntry { entry: name, kind: kind.to_string() })
        })
        .collect()
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stat_path(path: String) -> Result<serde_json::Value, String> {
    match std::fs::metadata(&path) {
        Ok(m) => Ok(serde_json::json!({
            "exists": true,
            "isFile": m.is_file(),
            "isDirectory": m.is_dir(),
        })),
        Err(_) => Ok(serde_json::json!({ "exists": false })),
    }
}

#[tauri::command]
pub fn remove_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn rename_path(src: String, dest: String) -> Result<(), String> {
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(src: String, dest: String) -> Result<(), String> {
    let dest_path = std::path::Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dest).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_dir(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_file_cmd(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn watch_path(
    app: AppHandle,
    path: String,
    registry: State<WatcherRegistry>,
) -> Result<u32, String> {
    let id = registry.next_id.fetch_add(1, Ordering::SeqCst);
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let action = match &event.kind {
            notify::EventKind::Create(_) => "created",
            notify::EventKind::Remove(_) => "removed",
            notify::EventKind::Modify(notify::event::ModifyKind::Name(_)) => "moved",
            _ => return,
        };
        let path_str = event
            .paths
            .first()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        let _ = app_handle.emit("watch-event", WatchEvent {
            id,
            action: action.to_string(),
            path: path_str,
        });
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    registry.map.insert(id, watcher);

    Ok(id)
}

#[tauri::command]
pub fn unwatch_path(id: u32, registry: State<WatcherRegistry>) -> Result<(), String> {
    registry.map.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn show_folder_dialog(app: AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(&title)
        .pick_folder(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_clipboard(text: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
