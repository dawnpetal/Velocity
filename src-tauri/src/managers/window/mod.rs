use tauri::{AppHandle, Emitter, Manager};

pub struct WindowManager;

impl WindowManager {
    pub fn new() -> Self {
        Self
    }

    pub fn show_popover_without_focus(&self, app: &AppHandle) {
        let Some(popover) = app.get_webview_window("popover") else {
            return;
        };
        let _ = popover.show();
        let _ = popover.set_focus();
        Self::order_front_regardless(&popover);
        let _ = popover.emit("popover:refresh", ());
    }

    #[cfg(target_os = "macos")]
    fn order_front_regardless(window: &tauri::WebviewWindow) {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;
        unsafe {
            if let Ok(ns_win) = window.ns_window() {
                let ns_window = ns_win as *mut AnyObject;
                let _: () = msg_send![ns_window, orderFrontRegardless];
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn order_front_regardless(_window: &tauri::WebviewWindow) {}
}
