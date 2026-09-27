(() => {
  'use strict';

  // Keep the React launcher interactive while the optional ARM64 guest starts in a worker.
  const BOOT_DELAY_MS = 900;
  const BOOT_WATCHDOG_MS = 15000;
  let scheduled = false;
  let watchdog = null;

  function scheduleBoot(original, mode) {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      try {
        original(mode);
      } catch (error) {
        console.error('[MTP2026] background ARM64 boot failed:', error);
        window.dispatchEvent(new CustomEvent('mtp2026-webos-boot-error', { detail: { error } }));
        return;
      }
      clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        try {
          const state = window.MTP2026WebOS?.getState?.();
          if (state?.booting && !state?.ready) {
            console.warn('[MTP2026] ARM64 guest is still booting; launcher remains interactive.', state);
            window.dispatchEvent(new CustomEvent('mtp2026-webos-boot-slow', { detail: state }));
          }
        } catch (_) {}
      }, BOOT_WATCHDOG_MS);
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: BOOT_DELAY_MS });
    else window.setTimeout(run, BOOT_DELAY_MS);
  }

  function install() {
    const api = window.MTP2026WebOS;
    if (!api || api.__interactionGuardInstalled) return Boolean(api);
    const originalWarmBoot = typeof api.warmBoot === 'function' ? api.warmBoot.bind(api) : null;
    if (!originalWarmBoot) return false;

    const guardedApi = {
      ...api,
      warmBoot(mode = null) {
        const current = api.getState?.() || {};
        if (current.ready || current.booting) return current;
        scheduleBoot(originalWarmBoot, mode);
        return { ...current, state: 'scheduled', booting: true };
      },
      __interactionGuardInstalled: true,
    };

    try { window.MTP2026WebOS = Object.freeze(guardedApi); }
    catch (_) { window.MTP2026WebOS = guardedApi; }
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (install() || ++attempts > 120) window.clearInterval(timer);
    }, 25);
  }

  // Defensive cleanup: stale runtime overlays must not survive after their close action.
  window.addEventListener('pagehide', () => {
    try { document.body.classList.remove('mtp-webos-open', 'mtp2026-guest-app-open'); } catch (_) {}
  });

  window.addEventListener('mtp2026-webos-boot-error', event => {
    console.error('[MTP2026] Web OS background boot error:', event.detail?.error || event.detail);
  });
  window.addEventListener('mtp2026-webos-boot-slow', event => {
    console.warn('[MTP2026] Web OS background boot is slow:', event.detail || {});
  });
})();
