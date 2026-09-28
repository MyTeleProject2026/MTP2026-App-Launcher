use serde::Serialize;
use std::fs;
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

#[derive(Serialize)]
struct ProcessInfo {
    pid: u32,
    name: String,
}

#[tauri::command]
fn mtp2026_list_processes() -> Vec<ProcessInfo> {
    #[cfg(target_os = "linux")]
    {
        let mut out = Vec::new();
        if let Ok(entries) = fs::read_dir("/proc") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Ok(pid) = name.parse::<u32>() {
                    let comm = fs::read_to_string(entry.path().join("comm"))
                        .unwrap_or_else(|_| "unknown".to_string())
                        .trim()
                        .to_string();
                    out.push(ProcessInfo { pid, name: comm });
                }
            }
        }
        out.sort_by_key(|p| p.pid);
        return out;
    }
    #[cfg(not(target_os = "linux"))]
    {
        vec![ProcessInfo { pid: std::process::id(), name: "MTP2026 Desktop Host".to_string() }]
    }
}

#[tauri::command]
fn mtp2026_list_services() -> Vec<String> {
    vec![
        "desktop-shell".to_string(),
        "window-manager".to_string(),
        "session-manager".to_string(),
        "filesystem".to_string(),
        "application-manager".to_string(),
        "guest-runtime".to_string(),
    ]
}

#[tauri::command]
fn mtp2026_filesystem_info() -> serde_json::Value {
    let root = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    let metadata = if root.is_empty() { None } else { fs::metadata(&root).ok() };
    serde_json::json!({
        "root": root,
        "separator": std::path::MAIN_SEPARATOR.to_string(),
        "exists": metadata.is_some(),
        "native": true,
    })
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
            mtp2026_list_processes,
            mtp2026_list_services,
            mtp2026_filesystem_info,
            mtp2026_open_path,
            mtp2026_reveal_path,
            mtp2026_power_action,
            mtp2026_process_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running MTP2026 Desktop native host");
}
