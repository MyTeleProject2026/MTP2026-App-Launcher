/* Bridge existing guest-shell actions into the operational MTP2026 OS runtime. */

function runtime() { return window.MTP2026GuestOSRuntime || null; }

window.addEventListener('mtp2026:open-settings', () => runtime()?.openSettings?.());
window.addEventListener('mtp2026:open-files', () => runtime()?.openFiles?.());
window.addEventListener('mtp2026:open-device-os', () => {
  const button = document.querySelector('#mtp2026-guest-shell [data-action="device-os"]');
  if (button) button.click();
});
window.addEventListener('mtp2026:guest-home', () => {
  document.querySelector('#mtp2026-guest-shell')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
