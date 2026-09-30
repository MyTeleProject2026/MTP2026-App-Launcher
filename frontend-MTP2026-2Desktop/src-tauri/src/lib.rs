use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::process::{Child, Command, Stdio};
use std::fs::File;
use std::io::Read;
use sha2::{Digest, Sha256};

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




#[derive(Serialize)]
struct NativeGuestInstall {
    id: String, bundle: String, kernel: String, initrd: String, firmware: String, boot_disk: String, sha256: String
}

fn guest_profile_artifacts(id: &str) -> Result<(&'static str, &'static str, &'static str, String), String> {
    let kernel = match id {
        "mtp2026" => "mtp2026-mtp2026-arm64-linux.Image", "android" => "mtp2026-android-arm64-linux.Image",
        "desktop" => "mtp2026-desktop-arm64-linux.Image", "gaming" => "mtp2026-gaming-arm64-linux.Image",
        _ => return Err("UNSUPPORTED_MTP2026_GUEST_PROFILE".into())
    };
    let initrd = match id {
        "mtp2026" => "mtp2026-mtp2026-initramfs.cpio.gz", "android" => "mtp2026-android-initramfs.cpio.gz",
        "desktop" => "mtp2026-desktop-initramfs.cpio.gz", "gaming" => "mtp2026-gaming-initramfs.cpio.gz",
        _ => return Err("UNSUPPORTED_MTP2026_GUEST_PROFILE".into())
    };
    let firmware = "mtp2026-arm64-boot-firmware.bin";
    Ok((kernel, initrd, firmware, format!("mtp2026-{}-boot-disk.img", id)))
}

fn verify_sha256_hex(path: &Path, expected: &str) -> Result<(), String> {
    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 { return Err("GUEST_IMAGE_SHA256_INVALID".into()); }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new(); let mut buf = [0u8; 1024 * 1024];
    loop { let n = file.read(&mut buf).map_err(|e| e.to_string())?; if n == 0 { break; } hasher.update(&buf[..n]); }
    if format!("{:x}", hasher.finalize()) == expected { Ok(()) } else { Err("GUEST_IMAGE_SHA256_MISMATCH".into()) }
}

fn safe_archive_listing(bundle: &Path) -> Result<(), String> {
    let output = Command::new("tar").args(["-tzf"]).arg(bundle).output().map_err(|e| format!("GUEST_BUNDLE_TAR_UNAVAILABLE: {e}"))?;
    if !output.status.success() { return Err("GUEST_BUNDLE_ARCHIVE_INVALID".into()); }
    for raw in String::from_utf8_lossy(&output.stdout).lines() {
        let item = raw.trim();
        let normalized = item.replace('\\', "/");
        if normalized.starts_with('/') || normalized.split('/').any(|part| part == "..") {
            return Err("GUEST_BUNDLE_UNSAFE_PATH".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn mtp2026_qemu_install_bundle(app: tauri::AppHandle, id: String, bundle_url: String, bundle_sha256: String) -> Result<NativeGuestInstall, String> {
    let (kernel_name, initrd_name, firmware_name, disk_name) = guest_profile_artifacts(&id)?;
    if !bundle_url.starts_with("https://") { return Err("GUEST_IMAGE_HTTPS_REQUIRED".into()); }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("mtp2026").join("guests").join(&id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let bundle = dir.join("guest.tar.gz");
    let tmp = dir.join("guest.tar.gz.part");
    let status = Command::new("curl").args(["--fail","--location","--retry","3","--silent","--show-error","--output"]).arg(&tmp).arg(&bundle_url).status().map_err(|e| format!("GUEST_IMAGE_CURL_UNAVAILABLE: {e}"))?;
    if !status.success() { let _=fs::remove_file(&tmp); return Err("GUEST_IMAGE_DOWNLOAD_FAILED".into()); }
    verify_sha256_hex(&tmp, &bundle_sha256)?;
    safe_archive_listing(&tmp)?;
    fs::rename(&tmp, &bundle).map_err(|e| e.to_string())?;
    let status = Command::new("tar").args(["-xzf"]).arg(&bundle).arg("-C").arg(&dir).status().map_err(|e| format!("GUEST_BUNDLE_TAR_UNAVAILABLE: {e}"))?;
    if !status.success() { return Err("GUEST_BUNDLE_EXTRACT_FAILED".into()); }
    let kernel=dir.join(kernel_name); let initrd=dir.join(initrd_name); let firmware=dir.join(firmware_name); let boot_disk=dir.join(&disk_name);
    if !kernel.is_file() || !initrd.is_file() || !firmware.is_file() || !boot_disk.is_file() { return Err("GUEST_BUNDLE_MISSING_FIRMWARE_BOOT_ARTIFACTS".into()); }
    Ok(NativeGuestInstall{id,bundle:bundle.to_string_lossy().into(),kernel:kernel.to_string_lossy().into(),initrd:initrd.to_string_lossy().into(),firmware:firmware.to_string_lossy().into(),boot_disk:boot_disk.to_string_lossy().into(),sha256:bundle_sha256.trim().to_ascii_lowercase()})
}

static QEMU_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

#[derive(Serialize)]
struct QemuRuntimeState { running: bool, pid: Option<u32>, executable: String }

fn qemu_runtime() -> &'static Mutex<Option<Child>> { QEMU_CHILD.get_or_init(|| Mutex::new(None)) }

#[tauri::command]
fn mtp2026_qemu_status() -> QemuRuntimeState {
    let executable = if cfg!(target_os = "windows") { "qemu-system-aarch64.exe" } else { "qemu-system-aarch64" }.to_string();
    let mut running = false; let mut pid = None;
    if let Ok(mut guard) = qemu_runtime().lock() {
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => { *guard = None; }
                Ok(None) => { running = true; pid = Some(child.id()); }
                Err(_) => {}
            }
        }
    }
    QemuRuntimeState { running, pid, executable }
}

#[tauri::command]
fn mtp2026_qemu_launch(kernel: String, initrd: Option<String>, disk: Option<String>, memory_mb: Option<u32>, append: Option<String>) -> Result<QemuRuntimeState, String> {
    let executable = if cfg!(target_os = "windows") { "qemu-system-aarch64.exe" } else { "qemu-system-aarch64" };
    let valid = |p: &str| !p.is_empty() && Path::new(p).is_file();
    if !valid(&kernel) { return Err(format!("Guest kernel not found: {kernel}")); }
    if let Some(ref p) = initrd { if !valid(p) { return Err(format!("Guest initramfs not found: {p}")); } }
    if let Some(ref p) = disk { if !valid(p) { return Err(format!("Guest disk not found: {p}")); } }
    let mut guard = qemu_runtime().lock().map_err(|_| "QEMU state lock unavailable".to_string())?;
    if let Some(child) = guard.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() { return Err("MTP2026 ARM64 guest is already running".to_string()); }
    }
    *guard = None;
    let mut cmd = Command::new(executable);
    cmd.args(["-M","virt","-cpu","cortex-a72","-nographic","-serial","stdio"]);
    cmd.args(["-m", &memory_mb.unwrap_or(1024).clamp(256, 8192).to_string()]);
    cmd.args(["-kernel", &kernel]);
    if let Some(p) = initrd { cmd.args(["-initrd", &p]); }
    if let Some(p) = disk { cmd.args(["-drive", &format!("file={p},if=virtio,format=raw")]); }
    if let Some(a) = append { cmd.args(["-append", &a]); }
    let child = cmd.stdin(Stdio::null()).stdout(Stdio::inherit()).stderr(Stdio::inherit()).spawn().map_err(|e| format!("Unable to launch QEMU: {e}"))?;
    let pid = child.id(); *guard = Some(child);
    Ok(QemuRuntimeState { running:true, pid:Some(pid), executable:executable.to_string() })
}

#[tauri::command]
fn mtp2026_qemu_stop() -> Result<QemuRuntimeState, String> {
    let executable = if cfg!(target_os = "windows") { "qemu-system-aarch64.exe" } else { "qemu-system-aarch64" }.to_string();
    let mut guard = qemu_runtime().lock().map_err(|_| "QEMU state lock unavailable".to_string())?;
    if let Some(mut child) = guard.take() { let _ = child.kill(); let _ = child.wait(); }
    Ok(QemuRuntimeState { running:false, pid:None, executable })
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

#[tauri::command]
fn mtp2026_qemu_capabilities() -> serde_json::Value {
    let executable = if cfg!(target_os = "windows") { "qemu-system-aarch64.exe" } else { "qemu-system-aarch64" };
    let probe = std::process::Command::new(executable).arg("--version").output();
    match probe {
        Ok(output) if output.status.success() => serde_json::json!({
            "available": true,
            "executable": executable,
            "version": String::from_utf8_lossy(&output.stdout).trim(),
            "architecture": "arm64",
            "machine": "qemu-aarch64-virt",
            "provider": "native-qemu-system-aarch64"
        }),
        _ => serde_json::json!({
            "available": false,
            "executable": executable,
            "architecture": "arm64",
            "machine": "qemu-aarch64-virt",
            "provider": "native-qemu-system-aarch64"
        })
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
            mtp2026_process_action,
            mtp2026_qemu_capabilities,
            mtp2026_qemu_status,
            mtp2026_qemu_install_bundle,
            mtp2026_qemu_launch,
            mtp2026_qemu_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running MTP2026 Desktop native host");
}
