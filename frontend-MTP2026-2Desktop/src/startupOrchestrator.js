/* Dedicated MTP2026 Desktop OS startup.
 * This frontend is not the multi-profile launcher. Every web/native package
 * built from this directory boots the Desktop shell directly.
 */
const DESKTOP_MODE = 'desktop';
const MODE_KEY = 'mtp2026-default-system-os';

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return ['desktop', 'windows', 'windows11', 'win11'].includes(mode) ? DESKTOP_MODE : null;
}

function run() {
  try {
    localStorage.setItem(MODE_KEY, DESKTOP_MODE);
    localStorage.setItem('mtp2026-default-system-os-set', '1');
  } catch (_) {}
  document.documentElement.dataset.mtpDefaultSystem = DESKTOP_MODE;
  document.documentElement.dataset.mtpStartup = 'desktop-direct';
  return { mode: DESKTOP_MODE, phase: 'desktop-direct', picker: false };
}

window.MTP2026Startup = Object.freeze({
  run,
  currentMode: () => DESKTOP_MODE,
  normalizeMode,
  ensurePicker: () => null
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}
