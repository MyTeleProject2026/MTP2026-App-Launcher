#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::{Emitter, WindowEvent};
use tauri_plugin_shell::ShellExt;

mod native_capabilities;

#[derive(Clone, Serialize)]
struct NativeCapabilities {
    native: bool,
    platform: &'static str,
    orientation_lock: bool,
    fullscreen: bool,
    filesystem: bool,
    notifications: bool,
    clipboard: bool,
    external_apps: bool,
    gamepad: bool,
    window_controls: bool,
}

#[tauri::command]
fn native_capabilities() -> NativeCapabilities {
    let c = native_capabilities::capabilities();
    NativeCapabilities {
        native: c["native"], platform: "windows", orientation_lock: false,
        fullscreen: c["fullscreen"], filesystem: c["filesystem"],
        notifications: c["notifications"], clipboard: c["clipboard"],
        external_apps: c["external_apps"], gamepad: c["gamepad"],
        window_controls: c["window_controls"],
    }
}

#[tauri::command]
async fn set_device_mode(window: tauri::Window, mode: String) -> Result<(), String> {
    let size = match mode.as_str() {
        "windows" | "gaming" => tauri::LogicalSize::new(1440.0, 900.0),
        "android" | "ios" => tauri::LogicalSize::new(900.0, 1440.0),
        _ => return Err("Unsupported MTP2026 device mode".into()),
    };
    window.set_size(tauri::Size::Logical(size)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn enter_fullscreen(window: tauri::Window) -> Result<(), String> { window.set_fullscreen(true).map_err(|e| e.to_string()) }

#[tauri::command]
async fn exit_fullscreen(window: tauri::Window) -> Result<(), String> { window.set_fullscreen(false).map_err(|e| e.to_string()) }

#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.shell().open(url, None).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![native_capabilities, set_device_mode, enter_fullscreen, exit_fullscreen, open_external])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let _ = window.emit("mtp2026:window-closing", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MTP2026 Windows shell");
}
