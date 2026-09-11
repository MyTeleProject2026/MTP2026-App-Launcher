(() => {
  const SURFACE_ID = 'mtp2026-guest-app-surface';
  let root = null;
  let active = null;
  let minimized = false;

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

  function ensureRoot() {
    if (root && root.isConnected) return root;
    root = document.getElementById(SURFACE_ID);
    if (root) return root;
    root = document.createElement('section');
    root.id = SURFACE_ID;
    root.className = 'mtp-guest-surface';
    root.setAttribute('aria-label', 'MTP2026 guest application');
    document.body.appendChild(root);
    return root;
  }

  function close() {
    if (!root) return;
    root.classList.remove('is-open', 'is-minimized');
    active = null;
    minimized = false;
    root.innerHTML = '';
    window.dispatchEvent(new CustomEvent('mtp2026-guest-app-closed'));
  }

  function minimize() {
    if (!root) return;
    minimized = !minimized;
    root.classList.toggle('is-minimized', minimized);
    const button = root.querySelector('[data-guest-minimize]');
    if (button) button.textContent = minimized ? '□' : '—';
  }

  function focus() {
    minimized = false;
    root?.classList.remove('is-minimized');
    root?.classList.add('is-open');
    root?.querySelector('iframe')?.focus?.();
  }

  function open(app) {
    if (!app?.url || !String(app.url).startsWith('https://')) return false;
    const target = ensureRoot();
    active = { id: String(app.id || `guest-${Date.now()}`), title: String(app.title || 'Web App'), url: String(app.url), icon: String(app.icon || '') };
    minimized = false;
    target.className = 'mtp-guest-surface is-open';
    target.innerHTML = `<div class="mtp-guest-window" role="dialog" aria-modal="true" aria-label="${esc(active.title)}"><header class="mtp-guest-titlebar"><div class="mtp-guest-title"><span class="mtp-guest-icon">${active.icon ? `<img src="${esc(active.icon)}" alt="">` : '◈'}</span><strong>${esc(active.title)}</strong><small>ARM64 guest application</small></div><div class="mtp-guest-actions"><button type="button" data-guest-focus title="Focus">↗</button><button type="button" data-guest-minimize title="Minimize">—</button><button type="button" data-guest-reload title="Reload">↻</button><button type="button" data-guest-external title="Open externally">⇱</button><button type="button" data-guest-close title="Close">×</button></div></header><div class="mtp-guest-frame-wrap"><iframe title="${esc(active.title)}" src="${esc(active.url)}" loading="eager" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="mtp-guest-frame-fallback"><b>This application does not allow embedded viewing.</b><span>Use Open externally to continue in the browser.</span></div></div></div>`;
    target.querySelector('[data-guest-close]').onclick = close;
    target.querySelector('[data-guest-minimize]').onclick = minimize;
    target.querySelector('[data-guest-focus]').onclick = focus;
    target.querySelector('[data-guest-reload]').onclick = () => { const frame = target.querySelector('iframe'); if (frame) frame.src = active.url; };
    target.querySelector('[data-guest-external]').onclick = () => window.open(active.url, '_blank', 'noopener,noreferrer');
    const frame = target.querySelector('iframe');
    frame?.addEventListener('load', () => target.classList.add('is-loaded'), { once: true });
    window.dispatchEvent(new CustomEvent('mtp2026-guest-app-opened', { detail: active }));
    return true;
  }

  window.MTP2026GuestSurface = Object.freeze({ open, close, minimize, focus });
  window.addEventListener('mtp2026-webos-app-mount', event => open(event.detail));
})();
