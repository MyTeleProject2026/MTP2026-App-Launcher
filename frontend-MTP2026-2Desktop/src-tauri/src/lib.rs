use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
struct SystemInfo {
    host_os: String,
    architecture: String,
    process_id: u32,
    native_host: bool,
}

#[tauri::command]
fn mtp2026_system_info() -> SystemInfo {
    SystemInfo {
        host_os: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        process_id: std::process::id(),
        native_host: true,
    }
}

#[tauri::command]
fn mtp2026_open_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn mtp2026_reveal_path(path: String) -> Result<(), String> {
    mtp2026_open_path(path)
}

#[tauri::command]
fn mtp2026_power_action(action: String) -> Result<String, String> {
    match action.as_str() {
        "restart-shell" | "lock-session" => Ok(action),
        _ => Err("Unsupported power action".to_string()),
    }
}

#[tauri::command]
fn mtp2026_process_action(action: String, pid: u32) -> Result<String, String> {
    match action.as_str() {
        "inspect" => Ok(format!("process:{pid}")),
        _ => Err("Only non-destructive process inspection is exposed by the MTP2026 host".to_string()),
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            mtp2026_system_info,
            mtp2026_open_path,
            mtp2026_reveal_path,
            mtp2026_power_action,
            mtp2026_process_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running MTP2026 Desktop native host");
}
