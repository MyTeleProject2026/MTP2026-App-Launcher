(() => {
  'use strict';
  if (window.__MTP_GUEST_SYSTEM_SWITCHER__) return;
  window.__MTP_GUEST_SYSTEM_SWITCHER__ = true;

  const MODES = Object.freeze({
    android: 'Android',
    ios: 'iOS',
    windows11: 'Windows 11',
    gaming: 'Gaming OS',
  });

  function openPicker() {
    try { sessionStorage.removeItem('mtp2026-selection-in-progress'); } catch (_) {}
    try { window.MTP2026GuestRecovery?.close?.(); } catch (_) {}
    try {
      const picker = window.MTP2026Startup?.ensurePicker?.();
      if (picker) {
        picker.classList.remove('mtp-os-hidden');
        picker.style.pointerEvents = 'auto';
        document.documentElement.dataset.mtpStartup = 'selecting';
        return true;
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('mtp2026:open-system-picker'));
    return false;
  }

  function addButton(container, kind) {
    if (!container || container.querySelector('[data-mtp-change-system]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mtpChangeSystem = '1';
    button.textContent = kind === 'boot' ? 'Change operating system' : 'Change system';
    button.className = 'secondary';
    button.addEventListener('click', openPicker);
    container.appendChild(button);
  }

  function scan() {
    document.querySelectorAll('.mtp2026-guest-recovery-actions').forEach(node => addButton(node, 'recovery'));
    document.querySelectorAll('.mtp-system-boot-actions').forEach(node => addButton(node, 'boot'));
  }

  const style = document.createElement('style');
  style.dataset.mtpGuestSystemSwitcher = '1';
  style.textContent = '[data-mtp-change-system]{border:1px solid rgba(125,211,252,.2)!important;background:#132238!important;color:#e6f7ff!important}';
  document.head.appendChild(style);

  const observer = new MutationObserver(scan);
  const start = () => {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.MTP2026GuestSystemSwitcher = Object.freeze({ openPicker, scan, modes: MODES });
})();
