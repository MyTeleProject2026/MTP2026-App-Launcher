(() => {
  'use strict';
  if (window.__MTP_GUEST_RECOVERY__) return;
  window.__MTP_GUEST_RECOVERY__ = true;

  const labels = { android: 'Android', ios: 'iOS', windows: 'Windows 11', gaming: 'Gaming OS' };
  let overlay = null;
  let current = null;
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const modeOf = value => Object.prototype.hasOwnProperty.call(labels, value) ? value : 'android';

  function close(clearMode = true) {
    overlay?.remove();
    overlay = null;
    if (clearMode) current = null;
    document.body.classList.remove('mtp2026-guest-recovery-open');
  }

  function retry() {
    const mode = current;
    close();
    if (mode) window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', { detail: { mode } }));
  }

  async function installFile(file) {
    const mode = current;
    if (!file || busy || !mode) return;
    busy = true;
    const status = overlay?.querySelector('[data-recovery-status]');
    const input = overlay?.querySelector('[data-recovery-file]');
    if (status) status.textContent = `Installing ${file.name}…`;
    try {
      const manager = await import('./guestImageManager.js');
      const bytes = await file.arrayBuffer();
      await manager.installGuestImageFromBytes(mode, bytes, { sourceName: file.name });
      if (status) status.textContent = 'Guest image installed. Starting guest…';
      window.setTimeout(() => {
        close();
        window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', { detail: { mode } }));
      }, 250);
    } catch (error) {
      if (status) status.textContent = `Installation failed: ${error?.message || error}`;
    } finally {
      busy = false;
      if (input) input.value = '';
    }
  }

  function render(event, code) {
    const mode = modeOf(event?.detail?.id || event?.detail?.mode || current);
    close(false);
    current = mode;
    const label = labels[current];
    overlay = document.createElement('section');
    overlay.className = 'mtp2026-guest-recovery';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mtp2026-recovery-title');
    overlay.innerHTML = `<div class="mtp2026-guest-recovery-card"><div class="mtp2026-guest-recovery-mark">M</div><div class="mtp2026-guest-recovery-kicker">MTP2026 GUEST SYSTEM</div><h2 id="mtp2026-recovery-title">${esc(label)} guest image is not installed</h2><p class="mtp2026-guest-recovery-code">${esc(code || `REAL_GUEST_IMAGE_NOT_INSTALLED_${current}`)}</p><p class="mtp2026-guest-recovery-copy">The launcher control runtime is available, but this independent ARM64 guest image is missing. The guest will not pretend that the control kernel is the selected operating system.</p><div class="mtp2026-guest-recovery-actions"><label class="mtp2026-recovery-install"><input type="file" data-recovery-file accept=".img,.bin,.iso,.qcow2,.raw,application/octet-stream"/><span>Install guest image</span></label><button type="button" data-recovery-retry>Check again</button><button type="button" class="secondary" data-recovery-close>Back to systems</button></div><div class="mtp2026-guest-recovery-status" data-recovery-status>Choose a compatible ARM64 guest image to install, or return to the system selector.</div></div>`;
    const style = document.createElement('style');
    style.dataset.mtpGuestRecovery = '1';
    style.textContent = '.mtp2026-guest-recovery{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:rgba(2,5,12,.94);backdrop-filter:blur(18px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef6ff;pointer-events:auto}.mtp2026-guest-recovery-card{width:min(560px,100%);padding:26px;border:1px solid rgba(125,211,252,.2);border-radius:24px;background:linear-gradient(145deg,#0a1628,#050b15);box-shadow:0 30px 100px rgba(0,0,0,.7);text-align:center}.mtp2026-guest-recovery-mark{width:58px;height:58px;margin:0 auto 14px;display:grid;place-items:center;border-radius:17px;background:linear-gradient(135deg,#21d4fd,#4f46e5);font-size:28px;font-weight:900}.mtp2026-guest-recovery-kicker{font-size:9px;letter-spacing:.16em;color:#79d9ff;font-weight:800}.mtp2026-guest-recovery-card h2{font-size:21px;margin:8px 0}.mtp2026-guest-recovery-code{font:600 10px ui-monospace,SFMono-Regular,monospace;color:#ffb4c2;word-break:break-word}.mtp2026-guest-recovery-copy{font-size:12px;line-height:1.6;color:#9cafc7;margin:16px auto;max-width:470px}.mtp2026-guest-recovery-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.mtp2026-guest-recovery-actions button,.mtp2026-recovery-install{min-height:40px;padding:9px 14px;border:1px solid rgba(125,211,252,.18);border-radius:11px;background:#123c4d;color:#e6f7ff;font-weight:750;font-size:11px;cursor:pointer}.mtp2026-guest-recovery-actions button.secondary{background:#132238}.mtp2026-recovery-install{display:inline-flex;align-items:center;justify-content:center}.mtp2026-recovery-install input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.mtp2026-guest-recovery-status{margin-top:15px;color:#7187a1;font-size:10px;line-height:1.5}@media(max-width:600px){.mtp2026-guest-recovery{padding:10px}.mtp2026-guest-recovery-card{padding:21px 16px}.mtp2026-guest-recovery-actions{display:grid;grid-template-columns:1fr}.mtp2026-guest-recovery-actions button,.mtp2026-recovery-install{width:100%}}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    document.body.classList.add('mtp2026-guest-recovery-open');
    overlay.querySelector('[data-recovery-file]').addEventListener('change', e => installFile(e.target.files?.[0]));
    overlay.querySelector('[data-recovery-retry]').onclick = retry;
    overlay.querySelector('[data-recovery-close]').onclick = close;
  }

  window.addEventListener('mtp2026:guest-image-required', event => render(event, event.detail?.code));
  window.addEventListener('mtp2026:guest-boot-error', event => render(event, event.detail?.error));
  window.addEventListener('mtp2026-webos-boot-error', event => render(event, event.detail?.error?.message || event.detail?.error));
  window.MTP2026GuestRecovery = Object.freeze({ close, retry });
})();
