(() => {
  const SURFACE_ID = 'mtp2026-guest-app-surface';
  let surface = null;
  let currentApp = null;
  let lastAppsKey = '';

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

  function getMode() {
    try { return localStorage.getItem('mtp2026-default-system-os') || 'android'; } catch (_) { return 'android'; }
  }

  function closeSurface() {
    surface?.remove();
    surface = null;
    currentApp = null;
    document.body.classList.remove('mtp2026-guest-app-open');
  }

  function openExternal(app) {
    try { window.open(app.url, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.assign(app.url); }
  }

  function render(app) {
    if (!app || !app.url) return;
    currentApp = app;
    if (!surface) {
      surface = document.createElement('section');
      surface.id = SURFACE_ID;
      surface.className = 'mtp2026-guest-app-surface';
      surface.innerHTML = `
        <header class="mtp2026-guest-app-bar">
          <div class="mtp2026-guest-app-title"><span class="mtp2026-guest-app-icon">◈</span><div><strong data-guest-app-title></strong><small data-guest-app-mode></small></div></div>
          <div class="mtp2026-guest-app-actions">
            <button type="button" data-guest-app-new title="Open in browser">↗</button>
            <button type="button" data-guest-app-reload title="Reload application">↻</button>
            <button type="button" data-guest-app-min title="Minimize">—</button>
            <button type="button" data-guest-app-close title="Close">×</button>
          </div>
        </header>
        <div class="mtp2026-guest-app-frame-wrap"><div class="mtp2026-guest-app-loading">Starting guest application…</div><iframe title="MTP2026 guest application" data-guest-app-frame loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; clipboard-read; clipboard-write; autoplay; gamepad" sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin"></iframe></div>
        <footer class="mtp2026-guest-app-status"><span>ARM64 guest app host</span><span data-guest-app-url></span></footer>`;
      document.body.appendChild(surface);
      document.body.classList.add('mtp2026-guest-app-open');
      surface.querySelector('[data-guest-app-close]').onclick = closeSurface;
      surface.querySelector('[data-guest-app-min]').onclick = () => surface.classList.toggle('minimized');
      surface.querySelector('[data-guest-app-reload]').onclick = () => { const frame = surface.querySelector('[data-guest-app-frame]'); if (frame) frame.src = currentApp?.url || 'about:blank'; };
      surface.querySelector('[data-guest-app-new]').onclick = () => currentApp && openExternal(currentApp);
      surface.querySelector('[data-guest-app-frame]').addEventListener('load', () => {
        const loading = surface?.querySelector('.mtp2026-guest-app-loading');
        if (loading) loading.remove();
      });
    }
    const title = surface.querySelector('[data-guest-app-title]');
    const mode = surface.querySelector('[data-guest-app-mode]');
    const url = surface.querySelector('[data-guest-app-url]');
    const frame = surface.querySelector('[data-guest-app-frame]');
    if (title) title.textContent = app.title || 'Web App';
    if (mode) mode.textContent = `${getMode()} · virtual guest`; 
    if (url) url.textContent = app.url;
    if (frame && frame.src !== app.url) {
      const loading = surface.querySelector('.mtp2026-guest-app-frame-wrap');
      if (loading && !loading.querySelector('.mtp2026-guest-app-loading')) {
        const note = document.createElement('div'); note.className = 'mtp2026-guest-app-loading'; note.textContent = 'Starting guest application…'; loading.prepend(note);
      }
      frame.src = app.url;
    }
    surface.classList.remove('minimized');
  }

  function sync(detail) {
    const guest = detail?.guest;
    const apps = Array.isArray(guest?.apps) ? guest.apps : [];
    const key = apps.map(a => `${a.id}:${a.url}:${a.state}`).join('|');
    if (key === lastAppsKey) return;
    lastAppsKey = key;
    const activeId = guest?.activeAppId || apps.find(a => a.state !== 'minimized')?.id;
    const app = apps.find(a => a.id === activeId) || apps[apps.length - 1];
    if (app) render(app);
    else if (surface) closeSurface();
  }

  window.addEventListener('mtp2026-webos-state', event => sync(event.detail || {}));
  window.addEventListener('mtp2026:default-system-os', () => {
    if (currentApp && surface) {
      const mode = surface.querySelector('[data-guest-app-mode]');
      if (mode) mode.textContent = `${getMode()} · virtual guest`;
    }
  });
  window.addEventListener('beforeunload', closeSurface);
})();
