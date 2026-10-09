/* MTP2026 Desktop guest-runtime bridge.
 *
 * Connects the Desktop shell to the existing MTP2026 guest boot controller.
 * It never substitutes the browser shell for a real guest provider: when no
 * native/remote-QEMU provider and verified boot media are available, the
 * controller reports an explicit runtime error instead of simulated execution.
 */

import { bootGuest, stopGuest, subscribeGuestState, getGuestState } from './guestBootController.js';

export async function bootDesktopGuest({ onState } = {}) {
  const unsubscribe = subscribeGuestState(state => {
    try { onState?.(state); } catch (_) {}
  });
  try {
    const state = await bootGuest('desktop', { controlKernel: false });
    return state;
  } finally {
    unsubscribe();
  }
}

export async function stopDesktopGuest() {
  return stopGuest();
}

export function getDesktopGuestState() {
  return getGuestState();
}

export function subscribeDesktopGuestState(listener) {
  return subscribeGuestState(listener);
}

export function getDesktopGuestCapabilities() {
  const native = globalThis.MTP2026NativeGuestRuntime;
  const qemu = globalThis.MTP2026QemuWasmGuestRuntime;
  const state = getGuestState();
  return Object.freeze({
    architecture: 'arm64',
    guestProfile: 'desktop',
    nativeProvider: Boolean(native?.bootGuest),
    qemuWasmProvider: Boolean(qemu?.qemuWasmCapabilities?.().available || qemu?.boot),
    controller: Boolean(globalThis.MTP2026GuestBoot),
    running: Boolean(state?.running),
    phase: state?.phase || 'idle',
    provider: state?.provider || 'none',
  });
}
