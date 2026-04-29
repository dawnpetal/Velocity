use tauri::{AppHandle, Manager};

use crate::app::AppContext;

pub fn show_popover_without_focus(app: &AppHandle) {
    if let Some(ctx) = app.try_state::<AppContext>() {
        ctx.Window.show_popover_without_focus(app);
    }
}
