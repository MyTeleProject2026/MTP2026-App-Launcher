const hasTauri = typeof window !== 'undefined' && Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);

async function invoke(command, args) {
  if (!hasTauri) return { supported: false, command };
  try {
    const mod = await import('@tauri-apps/api/core');
    return { supported: true, value: await mod.invoke(command, args) };
  } catch (error) {
    return { supported: false, command, error: error?.message || String(error) };
  }
}

export function getNativeDesktopCapabilities() {
  return Object.freeze({
    host: hasTauri ? 'tauri' : 'browser',
    nativeHost: hasTauri,
    filesystem: hasTauri,
    processControl: hasTauri,
    windowControl: hasTauri,
    powerControl: hasTauri,
    architecture: 'arm64',
  });
}

export async function nativeOpenPath(path) {
  return invoke('mtp2026_open_path', { path });
}

export async function nativeRevealPath(path) {
  return invoke('mtp2026_reveal_path', { path });
}

export async function nativePowerAction(action) {
  return invoke('mtp2026_power_action', { action });
}

export async function nativeProcessAction(action, pid) {
  return invoke('mtp2026_process_action', { action, pid });
}

export async function nativeSystemInfo() {
  return invoke('mtp2026_system_info');
}

export async function nativeListProcesses() {
  return invoke('mtp2026_list_processes');
}

export async function nativeListServices() {
  return invoke('mtp2026_list_services');
}

export async function nativeFilesystemInfo() {
  return invoke('mtp2026_filesystem_info');
}

export async function nativeListDirectory(path) {
  return invoke('mtp2026_list_directory', { path });
}

export async function nativeSystemMetrics() { return invoke('mtp2026_system_metrics'); }

export async function nativeQemuCapabilities() { return invoke('mtp2026_qemu_capabilities'); }
