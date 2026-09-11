/* Real guest boot coordinator.
 *
 * This module deliberately separates launcher UX from execution. A provider must
 * implement bootGuest() before MTP2026 reports a physical guest as running.
 * Browser-only mode remains useful for orchestration and can attach a WASM/VM
 * provider later without rewriting the launcher UI.
 */

import { getGuestSystem, normalizeGuestSystem } from './guestSystemRegistry.js';
import { loadGuestMetadata, saveGuestMetadata } from './guestStorage.js';

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

function provider() {
  return window.MTP2026NativeGuestRuntime || window.MTP2026Native || null;
}

export async function bootGuest(mode, options = {}) {
  const id = normalizeGuestSystem(mode);
  const system = getGuestSystem(id);
  const token = `${id}:${Date.now()}`;
  const runtime = provider();

  publish({ id, phase: 'splash', running: false, provider: runtime?.bootGuest ? 'native-vm' : 'none', error: null, token });

  try {
    const metadata = await loadGuestMetadata(id).catch(() => null);
    publish({ phase: 'prepare', metadata });

    if (!runtime?.bootGuest) {
      publish({ phase: 'provider-required', running: false, provider: 'none', error: 'GUEST_RUNTIME_PROVIDER_REQUIRED' });
      return getGuestState();
    }

    publish({ phase: 'booting' });
    const result = await runtime.bootGuest({
      id,
      architecture: system.architecture,
      class: system.class,
      image: options.image || metadata?.image || null,
      storage: options.storage || metadata?.storage || null,
    });

    await saveGuestMetadata(id, {
      ...metadata,
      image: result?.image || metadata?.image || null,
      provider: result?.provider || 'native-vm',
      architecture: system.architecture,
      status: 'ready',
    });

    publish({ phase: 'ready', running: true, provider: result?.provider || 'native-vm', result, error: null });
    return getGuestState();
  } catch (error) {
    const message = String(error?.message || error || 'GUEST_BOOT_FAILED');
    publish({ phase: 'error', running: false, error: message });
    throw error;
  }
}

export async function stopGuest() {
  const runtime = provider();
  try { await runtime?.stopGuest?.(); } finally { publish({ phase: 'stopped', running: false }); }
}

window.MTP2026GuestBoot = Object.freeze({ bootGuest, stopGuest, getGuestState, subscribeGuestState });
