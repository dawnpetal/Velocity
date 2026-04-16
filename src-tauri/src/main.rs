#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod icon_theme;
mod models;
mod paths;
mod services;
mod state;
mod types;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;

use anyhow::Result;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, Manager, Runtime,
};

use state::{IconThemeState, PortCache, SharedClient, ShortcutMap, WatcherRegistry};

fn build_app_menu<R: Runtime>(app: &tauri::App<R>) -> Result<Menu<R>> {
    let velocity_menu = Submenu::with_items(
        app,
        "Velocity",
        true,
        &[&MenuItem::with_id(app, "quit", "Quit Velocity", true, Some("CmdOrCtrl+Q"))?],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    Ok(Menu::with_items(app, &[&velocity_menu, &edit_menu])?)
}

fn position_popover_below_tray(app: &AppHandle, tray_pos: tauri::PhysicalPosition<f64>) {
    let Some(popover) = app.get_webview_window("popover") else { return };
    let scale = popover.scale_factor().unwrap_or(2.0);
    let _ = popover.set_position(LogicalPosition::new(
        tray_pos.x / scale - 130.0,
        tray_pos.y / scale + 8.0,
    ));
    commands::window::show_popover_without_focus(app);
}

fn setup_tray(app: &tauri::App) -> Result<()> {
    let tray_icon_path = app.path().resource_dir()
        .unwrap_or_default()
        .join("icons/tray.png");

    let icon = if tray_icon_path.exists() {
        let img = image::open(&tray_icon_path)
            .map(|i| i.into_rgba8())
            .ok();
        if let Some(rgba) = img {
            let (w, h) = rgba.dimensions();
            tauri::image::Image::new_owned(rgba.into_raw(), w, h)
        } else {
            app.default_window_icon().cloned().unwrap()
        }
    } else {
        app.default_window_icon().cloned().unwrap()
    };

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Velocity")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                let Some(popover) = app.get_webview_window("popover") else { return };
                match popover.is_visible() {
                    Ok(true) => { let _ = popover.hide(); }
                    _ => position_popover_below_tray(app, position),
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    let internals = paths::internals_dir().expect("failed to get internals dir");
    let icon_mgr = Arc::new(icon_theme::IconThemeManager::new(internals));

    tauri::Builder::default()
        .manage(WatcherRegistry::new())
        .manage(PortCache(Mutex::new(None)))
        .manage(ShortcutMap(Arc::new(Mutex::new(HashMap::new()))))
        .manage(IconThemeState(icon_mgr))
        .manage(SharedClient(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                .build()
                .expect("failed to build http client"),
        ))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri_plugin_global_shortcut::ShortcutState;
            use commands::executor::{inject_hydro_inner, exec_opium_shortcut, is_roblox_focused};

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        if event.state != ShortcutState::Pressed || !is_roblox_focused() {
                            return;
                        }
                        let fired_id = shortcut.id();
                        let map_state = app.state::<ShortcutMap>();
                        let code = {
                            let Ok(map) = map_state.0.lock() else { return };
                            map.get(&fired_id).cloned()
                        };
                        if let Some(code) = code {
                            let executor = crate::services::load_ui_state()
                                .and_then(|ui| ui.settings.executor)
                                .unwrap_or_else(|| "opiumware".to_string())
                                .to_ascii_lowercase();
                            if executor == "opiumware" || executor == "opium" {
                                tokio::spawn(async move {
                                    let _ = exec_opium_shortcut(code).await;
                                });
                            } else {
                                let port_cache = app.state::<PortCache>();
                                let client = app.state::<SharedClient>();
                                let cached_port = *port_cache.0.lock().unwrap_or_else(|e| e.into_inner());
                                let c = client.0.clone();
                                tokio::spawn(async move {
                                    let local_cache = PortCache(std::sync::Mutex::new(cached_port));
                                    let _ = inject_hydro_inner(code, &c, &local_cache).await;
                                });
                            }
                        }
                    })
                    .build(),
            )?;

            let menu = build_app_menu(app)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id() == "quit" {
                    app.exit(0);
                }
            });

            
            if let Err(e) = commands::seed::seed_default_workspace(app.handle()) {
                eprintln!("first-run seed warning: {e}");
            }

            setup_tray(app)?;

            if let Ok(scripts) = commands::scripts::get_scripts(app.handle().clone()) {
                let _ = commands::scripts::register_script_shortcuts(app.handle(), &scripts);
            }

            let _ = services::install_autoexec_script();

            commands::executor::start_autoexec_watcher(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::io::get_home_dir,
            commands::io::get_resource_dir,
            commands::io::read_text_file,
            commands::io::write_text_file,
            commands::io::read_binary_file,
            commands::io::write_binary_file,
            commands::io::read_dir,
            commands::io::create_dir,
            commands::io::stat_path,
            commands::io::remove_path,
            commands::io::rename_path,
            commands::io::copy_file,
            commands::io::remove_dir,
            commands::io::remove_file_cmd,
            commands::io::watch_path,
            commands::io::unwatch_path,
            commands::io::show_folder_dialog,
            commands::io::open_external,
            commands::io::write_clipboard,
            commands::io::exit_app,
            commands::seed::check_first_run,
            commands::executor::inject_script,
            commands::executor::get_active_port,
            commands::executor::clear_port_cache,
            commands::executor::focus_roblox,
            commands::scripts::get_scripts,
            commands::scripts::save_scripts,
            commands::scripts::reload_tray_scripts,
            commands::auth::validate_key,
            commands::auth::get_key_cache,
            commands::auth::save_key_cache,
            commands::network::http_fetch,
            commands::network::download_file,
            commands::archive::unzip_file,
            commands::search::ripgrep_search,
            commands::search::search_with_highlights,
            commands::window::show_popover,
            commands::window::hide_popover,
            commands::icon_theme::icon_theme_load,
            commands::icon_theme::icon_theme_get_active,
            commands::icon_theme::icon_theme_get_installed,
            commands::icon_theme::icon_theme_get_registry,
            commands::icon_theme::icon_theme_is_installed,
            commands::icon_theme::icon_theme_is_active,
            commands::icon_theme::icon_theme_activate,
            commands::icon_theme::icon_theme_install,
            commands::icon_theme::icon_theme_uninstall,
            commands::icon_theme::icon_theme_load_installed_icons,
            commands::file_system::build_file_tree,
            commands::file_system::generate_unique_filename,
            commands::file_system::copy_path_recursive,
            commands::persistence::save_tree_state_cmd,
            commands::persistence::load_tree_state_cmd,
            commands::persistence::save_timeline_cmd,
            commands::persistence::load_timeline_cmd,
            commands::persistence::save_session_cmd,
            commands::persistence::load_session_cmd,
            commands::persistence::save_ui_state_cmd,
            commands::persistence::load_ui_state_cmd,
            commands::persistence::push_exec_history_cmd,
            commands::persistence::get_exec_history_cmd,
            commands::update::get_app_version,
            commands::update::check_for_update,
            commands::multi_instance::multiinstance_get_clients,
            commands::multi_instance::multiinstance_send_script,
            commands::multi_instance::multiinstance_send_script_many,
            commands::multi_instance::multiinstance_install_autoexec,
            commands::multi_instance::multiinstance_get_bridge_path,
            commands::multi_instance::multiinstance_get_autoexec_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}