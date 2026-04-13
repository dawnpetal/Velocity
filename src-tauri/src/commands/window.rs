use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
fn show_without_stealing_focus(window: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    unsafe {
        if let Ok(ns_win) = window.ns_window() {
            let ns_window = ns_win as *mut AnyObject;
            let _: () = msg_send![ns_window, orderFrontRegardless];
        }
    }
}

#[tauri::command]
pub fn show_popover(app: AppHandle) -> Result<(), String> {
    if let Some(popover) = app.get_webview_window("popover") {
        let _ = popover.hide();
    }
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_popover(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("popover")
        .ok_or_else(|| "popover window not found".to_string())?
        .hide()
        .map_err(|e| e.to_string())
}

pub fn show_popover_without_focus(app: &AppHandle) {
    if let Some(popover) = app.get_webview_window("popover") {
        let _ = popover.show();
        let _ = popover.set_focus();
        show_without_stealing_focus(&popover);
        let _ = popover.emit("popover:refresh", ());
    }
}