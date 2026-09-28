use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

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


static CPU_SAMPLE: OnceLock<Mutex<Option<(u64, u64)>>> = OnceLock::new();

#[tauri::command]
fn mtp2026_system_metrics() -> serde_json::Value {
    #[cfg(target_os = "linux")]
    {
        let mut cpu_percent = 0.0_f64;
        if let Ok(stat) = fs::read_to_string("/proc/stat") {
            if let Some(line) = stat.lines().find(|line| line.starts_with("cpu ")) {
                let values: Vec<u64> = line.split_whitespace().skip(1).filter_map(|v| v.parse().ok()).collect();
                if values.len() >= 4 {
                    let idle = values[3] + values.get(4).copied().unwrap_or(0);
                    let total: u64 = values.iter().sum();
                    let lock = CPU_SAMPLE.get_or_init(|| Mutex::new(None));
                    if let Ok(mut previous) = lock.lock() {
                        if let Some((prev_total, prev_idle)) = *previous {
                            let total_delta = total.saturating_sub(prev_total);
                            let idle_delta = idle.saturating_sub(prev_idle);
                            if total_delta > 0 {
                                cpu_percent = ((total_delta.saturating_sub(idle_delta) as f64 / total_delta as f64) * 100.0).clamp(0.0, 100.0);
                            }
                        }
                        *previous = Some((total, idle));
                    }
                }
            }
        }

        let mut memory_percent = 0.0_f64;
        if let Ok(mem) = fs::read_to_string("/proc/meminfo") {
            let mut total = 0_u64;
            let mut available = 0_u64;
            for line in mem.lines() {
                let mut parts = line.split_whitespace();
                match parts.next() {
                    Some("MemTotal:") => total = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0),
                    Some("MemAvailable:") => available = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0),
                    _ => {}
                }
            }
            if total > 0 {
                memory_percent = (((total.saturating_sub(available)) as f64 / total as f64) * 100.0).clamp(0.0, 100.0);
            }
        }

        let mut network_rx = 0_u64;
        let mut network_tx = 0_u64;
        if let Ok(net) = fs::read_to_string("/proc/net/dev") {
            for line in net.lines().skip(2) {
                if let Some((_, values)) = line.split_once(':') {
                    let values: Vec<u64> = values.split_whitespace().filter_map(|v| v.parse().ok()).collect();
                    if values.len() >= 9 {
                        network_rx = network_rx.saturating_add(values[0]);
                        network_tx = network_tx.saturating_add(values[8]);
                    }
                }
            }
        }

        let mut storage_percent = 0.0_f64;
        let root = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| "/".to_string());
        if let Ok(output) = std::process::Command::new("df").args(["-P", "-k", &root]).output() {
            if output.status.success() {
                if let Some(line) = String::from_utf8_lossy(&output.stdout).lines().nth(1) {
                    if let Some(percent) = line.split_whitespace().nth(4) {
                        storage_percent = percent.trim_end_matches('%').parse::<f64>().unwrap_or(0.0).clamp(0.0, 100.0);
                    }
                }
            }
        }

        return serde_json::json!({
            "native": true,
            "platform": "linux",
            "cpu_percent": cpu_percent,
            "memory_percent": memory_percent,
            "network_rx_bytes": network_rx,
            "network_tx_bytes": network_tx,
            "storage_percent": storage_percent
        });
    }

    #[cfg(not(target_os = "linux"))]
    {
        serde_json::json!({
            "native": true,
            "platform": std::env::consts::OS,
            "cpu_percent": serde_json::Value::Null,
            "memory_percent": serde_json::Value::Null,
            "network_rx_bytes": serde_json::Value::Null,
            "network_tx_bytes": serde_json::Value::Null,
            "storage_percent": serde_json::Value::Null
        })
    }
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

#[derive(Serialize)]
struct DirectoryEntry {
    name: String,
    path: String,
    directory: bool,
}

#[tauri::command]
fn mtp2026_list_directory(path: String) -> Result<Vec<DirectoryEntry>, String> {
    let root = Path::new(&path);
    if !root.is_dir() { return Err(format!("Not a directory: {path}")); }
    let mut out = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let directory = p.is_dir();
        out.push(DirectoryEntry { name, path: p.to_string_lossy().to_string(), directory });
    }
    out.sort_by(|a,b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
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
            mtp2026_system_metrics,
            mtp2026_list_processes,
            mtp2026_list_services,
            mtp2026_filesystem_info,
            mtp2026_list_directory,
            mtp2026_open_path,
            mtp2026_reveal_path,
            mtp2026_power_action,
            mtp2026_process_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running MTP2026 Desktop native host");
}
