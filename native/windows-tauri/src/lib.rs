#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

mod native_capabilities;

#[derive(Clone, Serialize)]
struct NativeCapabilities {
    native: bool, platform: &'static str, orientation_lock: bool, fullscreen: bool,
    filesystem: bool, notifications: bool, clipboard: bool, external_apps: bool,
    gamepad: bool, window_controls: bool,
}
struct GuestProcesses(Mutex<HashMap<String, Child>>);

fn guest_root(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("mtp2026").join("guests").join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
fn guest_identity_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(guest_root(app, id)?.join("identity.json"))
}
fn verify_sha256(path: &PathBuf, expected: &str) -> Result<(), String> {
    let expected = expected.trim().to_ascii_lowercase();
    if expected.is_empty() { return Err("GUEST_IMAGE_SHA256_REQUIRED".into()); }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new(); let mut buffer = [0u8; 1024 * 1024];
    loop { let n = file.read(&mut buffer).map_err(|e| e.to_string())?; if n == 0 { break; } hasher.update(&buffer[..n]); }
    if format!("{:x}", hasher.finalize()) != expected { return Err("GUEST_IMAGE_SHA256_MISMATCH".into()); }
    Ok(())
}
fn download_https(url: &str, destination: &PathBuf) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("GUEST_IMAGE_HTTPS_REQUIRED".into()); }
    let status = Command::new("curl").args(["--fail", "--location", "--retry", "3", "--silent", "--show-error", "--output"]).arg(destination).arg(url).status().map_err(|e| format!("GUEST_IMAGE_CURL_UNAVAILABLE: {e}"))?;
    if !status.success() { return Err(format!("GUEST_IMAGE_DOWNLOAD_FAILED_{status}")); } Ok(())
}
fn extract_bundle(bundle: &PathBuf, directory: &PathBuf) -> Result<(), String> {
    let status = Command::new("tar").args(["-xzf"]).arg(bundle).arg("-C").arg(directory).status().map_err(|e| format!("GUEST_BUNDLE_TAR_UNAVAILABLE: {e}"))?;
    if !status.success() { return Err(format!("GUEST_BUNDLE_EXTRACT_FAILED_{status}")); } Ok(())
}
fn profile_name(id: &str) -> Result<&'static str, String> { match id {
    "mtp2026" => Ok("mtp2026-mtp2026-arm64-linux.Image"), "android" => Ok("mtp2026-android-arm64-linux.Image"),
    "windows11" => Ok("mtp2026-windows11-arm64-linux.Image"), "gaming" => Ok("mtp2026-gaming-arm64-linux.Image"),
    _ => Err("UNSUPPORTED_MTP2026_GUEST_PROFILE".into()),
} }
fn initrd_name(id: &str) -> Result<&'static str, String> { match id {
    "mtp2026" => Ok("mtp2026-mtp2026-initramfs.cpio.gz"), "android" => Ok("mtp2026-android-initramfs.cpio.gz"),
    "windows11" => Ok("mtp2026-windows11-initramfs.cpio.gz"), "gaming" => Ok("mtp2026-gaming-initramfs.cpio.gz"),
    _ => Err("UNSUPPORTED_MTP2026_GUEST_PROFILE".into()),
} }
fn firmware_name() -> &'static str { "mtp2026-arm64-boot-firmware.bin" }
fn boot_disk_name(id: &str) -> Result<String, String> {
    match id {
        "mtp2026" | "android" | "windows11" | "gaming" => Ok(format!("mtp2026-{}-boot-disk.img", id)),
        _ => Err("UNSUPPORTED_MTP2026_GUEST_PROFILE".into()),
    }
}
fn ensure_persistent_disk(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let dir = guest_root(app, id)?;
    let disk = dir.join("storage.qcow2");
    if disk.exists() { return Ok(disk); }
    let status = Command::new("qemu-img")
        .args(["create", "-f", "qcow2"])
        .arg(&disk)
        .arg("8G")
        .status()
        .map_err(|e| format!("QEMU_IMG_NOT_AVAILABLE: {e}"))?;
    if !status.success() { return Err(format!("GUEST_STORAGE_CREATE_FAILED_{status}")); }
    Ok(disk)
}

#[tauri::command]
fn native_capabilities() -> NativeCapabilities { let c = native_capabilities::capabilities(); NativeCapabilities {
    native: c["native"], platform: "windows", orientation_lock: false, fullscreen: c["fullscreen"], filesystem: c["filesystem"],
    notifications: c["notifications"], clipboard: false, external_apps: c["external_apps"], gamepad: c["gamepad"], window_controls: c["window_controls"],
} }
#[tauri::command]
async fn set_device_mode(window: tauri::Window, mode: String) -> Result<(), String> { let size = match mode.as_str() {
    "windows" | "gaming" => tauri::LogicalSize::new(1440.0, 900.0), "android" | "ios" => tauri::LogicalSize::new(900.0, 1440.0),
    _ => return Err("Unsupported MTP2026 device mode".into()),
}; window.set_size(tauri::Size::Logical(size)).map_err(|e| e.to_string()) }

#[tauri::command]
async fn sync_guest_identity(app: tauri::AppHandle, id: String, subject: String, display_name: String, expires_at: String) -> Result<(), String> {
    let safe_id = profile_name(&id).map(|_| id.clone())?;
    let path = guest_identity_path(&app, &safe_id)?;
    let payload = serde_json::json!({
        "schema": "mtp2026-guest-identity-v1",
        "provider": "VexaAccount",
        "subject": subject,
        "displayName": display_name,
        "expiresAt": expires_at
    });
    fs::write(path, serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

async fn boot_guest(app: tauri::AppHandle, id: String, bundle_url: String, bundle_sha256: String, processes: tauri::State<'_, GuestProcesses>) -> Result<serde_json::Value, String> {
    let kernel_name = profile_name(&id)?; let initrd_name = initrd_name(&id)?; let dir = guest_root(&app, &id)?; let bundle = dir.join("guest.tar.gz");
    { let mut running = processes.0.lock().map_err(|_| "GUEST_PROCESS_LOCK_FAILED")?; if let Some(mut child) = running.remove(&id) { let _ = child.kill(); } }
    if !bundle.exists() { download_https(&bundle_url, &bundle)?; }
    if let Err(error) = verify_sha256(&bundle, &bundle_sha256) {
        if error == "GUEST_IMAGE_SHA256_MISMATCH" {
            let _ = fs::remove_file(&bundle);
            download_https(&bundle_url, &bundle)?;
            verify_sha256(&bundle, &bundle_sha256)?;
        } else { return Err(error); }
    }
    extract_bundle(&bundle, &dir)?;
    let kernel = dir.join(kernel_name);
    let initrd = dir.join(initrd_name);
    let firmware = dir.join(firmware_name());
    let boot_disk = dir.join(boot_disk_name(&id)?);
    if !kernel.exists() || !initrd.exists() || !firmware.exists() || !boot_disk.exists() {
        return Err("GUEST_BUNDLE_MISSING_FIRMWARE_BOOT_ARTIFACTS".into());
    }
    let disk = ensure_persistent_disk(&app, &id)?;
    let identity = guest_identity_path(&app, &id).ok();
    let serial_log = dir.join("serial.log");
    let serial_arg = format!("file:{}", serial_log.to_string_lossy());
    let qemu_log = dir.join("qemu.log");
    let mut command = Command::new("qemu-system-aarch64");
    let boot_drive = format!("if=none,format=raw,id=bootdisk,file={}", boot_disk.to_string_lossy());
    command.args(["-M", "virt", "-cpu", "cortex-a72", "-m", "2048", "-bios"]).arg(&firmware)
        .args(["-drive"]).arg(boot_drive)
        .args(["-device", "virtio-blk-device,drive=bootdisk"])
        .args(["-drive", "if=virtio,format=qcow2"]).arg(&disk)
        .args(["-netdev", "user,id=net0", "-device", "virtio-net-pci,netdev=net0"])
        // Graphical guest path: virtio-gpu exposes the guest framebuffer and
        // virtio input devices provide keyboard/mouse/controller-style events.
        .args(["-device", "virtio-gpu-pci", "-device", "virtio-keyboard-pci", "-device", "virtio-mouse-pci", "-device", "virtio-tablet-pci"])
        .args(["-audiodev", "driver=none,id=mtp2026audio", "-device", "virtio-sound-pci,audiodev=mtp2026audio"])
        .args(["-display", "default"])
        ;
    if let Some(identity_path) = identity { if identity_path.exists() { let fwcfg = format!("name=opt/mtp2026/identity,file={}", identity_path.to_string_lossy()); command.args(["-fw_cfg", fwcfg.as_str()]); } }
    let qemu_output = File::create(&qemu_log).map_err(|e| format!("QEMU_LOG_CREATE_FAILED: {e}"))?;
    let qemu_error = qemu_output.try_clone().map_err(|e| format!("QEMU_LOG_CLONE_FAILED: {e}"))?;
    command.stdin(Stdio::null()).stdout(Stdio::from(qemu_output)).stderr(Stdio::from(qemu_error));
    let child = command.spawn().map_err(|e| format!("QEMU_AARCH64_NOT_AVAILABLE: {e}"))?; let pid = child.id();
    processes.0.lock().map_err(|_| "GUEST_PROCESS_LOCK_FAILED")?.insert(id.clone(), child);
    Ok(serde_json::json!({"success":true,"id":id,"provider":"tauri-qemu-system-aarch64","architecture":"arm64","execution":"real-aarch64-linux-guest","bootFirmware":"mtp2026-arm64-boot-firmware.bin","bootDisk":boot_disk.to_string_lossy(),"pid":pid,"kernel":kernel.to_string_lossy(),"initrd":initrd.to_string_lossy(),"serialLog":serial_log.to_string_lossy(),"qemuLog":qemu_log.to_string_lossy(),"persistentDisk":disk.to_string_lossy(),"display":"qemu-default"}))
}
#[tauri::command]
async fn stop_guest(id: String, processes: tauri::State<'_, GuestProcesses>) -> Result<(), String> { let mut running = processes.0.lock().map_err(|_| "GUEST_PROCESS_LOCK_FAILED")?; if let Some(mut child) = running.remove(&id) { let _ = child.kill(); } Ok(()) }
#[tauri::command]
async fn guest_runtime_status(id: String, processes: tauri::State<'_, GuestProcesses>) -> Result<serde_json::Value, String> { let mut running = processes.0.lock().map_err(|_| "GUEST_PROCESS_LOCK_FAILED")?; if let Some(child) = running.get_mut(&id) { match child.try_wait().map_err(|e| e.to_string())? {
    Some(status) => { running.remove(&id); Ok(serde_json::json!({"running":false,"exitStatus":status.code()})) },
    None => Ok(serde_json::json!({"running":true,"pid":child.id()})),
} } else { Ok(serde_json::json!({"running":false})) } }
#[tauri::command]
async fn enter_fullscreen(window: tauri::Window) -> Result<(), String> { window.set_fullscreen(true).map_err(|e| e.to_string()) }
#[tauri::command]
async fn exit_fullscreen(window: tauri::Window) -> Result<(), String> { window.set_fullscreen(false).map_err(|e| e.to_string()) }
#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> { app.shell().open(url, None).map_err(|e| e.to_string()) }
#[tauri::command]
async fn install_package(app: tauri::AppHandle, url: String, package_type: String) -> Result<serde_json::Value, String> { let trimmed = url.trim(); if !trimmed.starts_with("https://") { return Err("NATIVE_PACKAGE_HTTPS_REQUIRED".into()); } app.shell().open(trimmed.to_string(), None).map_err(|e| e.to_string())?; Ok(serde_json::json!({"success":true,"status":"external_install_handoff","host":"windows","packageType":package_type,"requiresUserApproval":true,"url":trimmed})) }
#[tauri::command]
async fn notify_native(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> { let title = title.trim(); let body = body.trim(); if title.is_empty() && body.is_empty() { return Err("Notification title and body cannot both be empty".into()); } app.notification().builder().title(if title.is_empty() { "MTP2026" } else { title }).body(body).show().map_err(|e| e.to_string()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { tauri::Builder::default().manage(GuestProcesses(Mutex::new(HashMap::new())))
    .plugin(tauri_plugin_fs::init()).plugin(tauri_plugin_notification::init()).plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![native_capabilities,set_device_mode,sync_guest_identity,boot_guest,stop_guest,guest_runtime_status,enter_fullscreen,exit_fullscreen,open_external,install_package,notify_native])
    .on_window_event(|window, event| { if let WindowEvent::CloseRequested { .. } = event { let _ = window.emit("mtp2026:window-closing", ()); } })
    .run(tauri::generate_context!()).expect("error while running MTP2026 Windows shell"); }
