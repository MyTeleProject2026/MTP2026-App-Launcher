/* MTP2026 guest boot coordinator.
 *
 * Boot is real only when an execution provider successfully starts a guest.
 * Native APK/desktop hosts can supply a VM/emulator provider. Web/PWA hosts use
 * the ARM64 WASM execution provider in a Worker so guest execution never blocks
 * the launcher UI thread.
 */

import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';
import { bootArm64Guest, stopArm64Guest } from './arm64GuestRuntime.js';

const listeners = new Set();
let state = Object.freeze({ id: null, phase: 'idle', running: false, provider: 'none', error: null });

function publish(next) {
  state = Object.freeze({ ...state, ...next });
  for (const listener of listeners) {
    try { listener(state); } catch (_) {}
  }
  window.dispatchEvent(new CustomEvent('mtp2026:guest-state', { detail: state }));
  return state;
}

export function getGuestState() { return state; }
export function subscribeGuestState(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function nativeProvider() {
  return window.MTP2026NativeGuestRuntime || null;
}

function resolveImageOption(options, metadata) {
  return options.image || metadata?.imageBytes || metadata?.image || null;
}

export async function installGuestImage(mode, image, metadata = {}) {
  const id = normalizeGuestSystem(mode);
  const { installGuestImage: install } = await import('./arm64GuestRuntime.js');
  const result = await install(id, image, { ...metadata, guestId: id });
  await saveGuestMetadata(id, {
    ...(await loadGuestMetadata(id).catch(() => null)),
    image: { stored: true, byteLength: result.byteLength },
    architecture: 'arm64',
    status: 'installed',
  });
  return result;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const token = `${id}:${Date.now()}`;
  const native = nativeProvider();

  publish({
    id,
    phase: 'splash',
    running: false,
    provider: native?.bootGuest ? 'native-vm' : 'arm64-wasm',
    error: null,
    token,
  });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    publish({ phase: 'prepare', metadata });

    publish({ phase: 'booting', progress: 35 });
    const result = await bootArm64Guest({
      id,
      image: resolveImageOption(options, metadata),
      storage: options.storage || metadata?.storage || null,
    });

    await saveGuestMetadata(id, {
      ...metadata,
      image: result?.image || metadata?.image || null,
      provider: result?.provider || 'arm64-wasm',
      architecture: system.architecture,
      status: 'ready',
      runningAt: new Date().toISOString(),
    });

    publish({ phase: 'ready', running: true, provider: result?.provider || 'arm64-wasm', result, error: null, progress: 100 });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    publish({ phase: 'error', running: false, error: message, progress: 0 });
    throw error;
  }
}

export async function stopGuest() {
  const id = state.id;
  const native = nativeProvider();
  try {
    if (native?.stopGuest) await native.stopGuest(id);
    else if (id) await stopArm64Guest(id);
  } finally {
    publish({ phase: 'stopped', running: false });
  }
}

window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, installGuestImage, getGuestState, subscribeGuestState });
