(() => {
  const API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
  const STATE_CACHE_KEY = 'mtp2026:experience-state:v2';
  const REQUEST_TIMEOUT_MS = 15000;
  const RETRY_DELAYS_MS = [350, 800, 1600];
  let apps = [];
  let busy = false;
  let orientationGuidanceEnabled = false;
  let loadPromise = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function isRetryableError(error) {
    const message = String(error?.message || error || '');
    return /NETWORK_ERROR|FETCH_FAILED|TIMEOUT|Request failed \((502|503|504)\)/.test(message);
  }

  async function api(path, options = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${API}${path}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {})
          }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(data.error || `Request failed (${response.status})`);
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (error) {
        lastError = error?.name === 'AbortError' ? new Error('REQUEST_TIMEOUT') : (error instanceof TypeError ? new Error('FETCH_FAILED') : error);
        if (attempt >= RETRY_DELAYS_MS.length || !isRetryableError(lastError)) throw lastError;
        await sleep(RETRY_DELAYS_MS[attempt]);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('FETCH_FAILED');
  }

  function readCachedState() {
    try {
      const raw = sessionStorage.getItem(STATE_CACHE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !Array.isArray(value.apps)) return null;
      return value;
    } catch (_) { return null; }
  }

  function writeCachedState(settings, library) {
    try {
      sessionStorage.setItem(STATE_CACHE_KEY, JSON.stringify({ settings, apps: library, savedAt: Date.now() }));
    } catch (_) {}
  }

  function applyCachedState() {
    const cached = readCachedState();
    if (!cached) return false;
    apps = cached.apps;
    applyMode(cached.settings?.deviceMode || 'android', false);
    decorateCards();
    return true;
  }

  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const appForCard = (card) => { const id = card.dataset.mtpAppId; if (id) return apps.find(a => String(a.id) === String(id)); const title = card.querySelector('h3')?.textContent?.trim() || ''; const domain = card.querySelector('.domain')?.textContent?.trim() || ''; return apps.find(a => a.title === title && (() => { try { return new URL(a.url).hostname === domain; } catch { return false; } })()) || apps.find(a => a.title === title); };

  async function requestPlatformMode(mode, { userGesture = false } = {}) {
    const root = document.documentElement;
    const isWindows = mode === 'windows11';
    const isPortrait = mode === 'android' || mode === 'ios';
    root.dataset.mtpDeviceMode = mode;
    document.body.dataset.mtpDeviceMode = mode;
    document.body.classList.toggle('mtp-windows-desktop', isWindows);
    document.body.classList.toggle('mtp-mobile-device', !isWindows);
    document.body.classList.toggle('mtp-gaming-device', mode === 'gaming');
    if (!userGesture) return;
    try {
      if (isWindows || mode === 'gaming') {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      }
      if (screen.orientation?.lock) {
        if (isWindows) await screen.orientation.lock('landscape').catch(() => {});
        else if (isPortrait) await screen.orientation.lock('portrait').catch(() => {});
      }
    } catch (_) {}
    if (isWindows) orientationGuidanceEnabled = true;
    updateOrientationNotice(mode);
  }

  function updateOrientationNotice(mode) {
    let notice = document.querySelector('.mtp-orientation-notice');
    const needsLandscape = mode === 'windows11' && orientationGuidanceEnabled;
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    if (!needsLandscape || !portrait) { notice?.remove(); return; }
    if (!notice) { notice = document.createElement('div'); notice.className = 'mtp-orientation-notice'; document.body.appendChild(notice); }
    notice.innerHTML = '<div class="mtp-orientation-card"><div class="mtp-rotate-device">↻</div><b>Rotate your device</b><span>Windows 11 mode uses the full landscape desktop workspace. Rotate your device horizontally to continue.</span><button type="button">I rotated my device</button></div>';
    notice.querySelector('button').onclick = () => { requestPlatformMode(mode, { userGesture: true }); };
  }

  async function loadState({ force = false } = {}) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      const cached = applyCachedState();
      try {
        // Load the small settings response first. This avoids two simultaneous authenticated
        // database requests during Render instance spin-up and makes startup deterministic.
        const settings = await api('/settings');
        const library = await api('/apps/experience');
        apps = Array.isArray(library) ? library : [];
        applyMode(settings.deviceMode || 'android', false);
        decorateCards();
        writeCachedState(settings, apps);
        return true;
      } catch (error) {
        // Keep a previously rendered/cached launcher usable during a transient API outage.
        if (!cached) applyMode('android', false);
        console.warn('[MTP2026] experience state load failed; retained cached state when available:', error);
        return false;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function applyMode(mode, userGesture = false) {
    const allowed = ['android','ios','windows11','gaming'];
    const value = allowed.includes(mode) ? mode : 'android';
    if (userGesture && value === 'windows11') orientationGuidanceEnabled = true;
    requestPlatformMode(value, { userGesture });
    if (userGesture) updateOrientationNotice(value);
    else if (!orientationGuidanceEnabled) document.querySelector('.mtp-orientation-notice')?.remove();
  }

  function modal(title, body, actions = '') { document.querySelector('.mtp-experience-backdrop')?.remove(); const root = document.createElement('div'); root.className = 'mtp-experience-backdrop'; root.innerHTML = `<div class="mtp-experience-modal" role="dialog" aria-modal="true"><div class="mtp-experience-head"><div><div class="mtp-experience-kicker">MTP2026 DEVICE EXPERIENCE</div><h2>${esc(title)}</h2></div><button class="mtp-experience-close" aria-label="Close">×</button></div><div class="mtp-experience-body">${body}</div>${actions ? `<div class="mtp-experience-foot">${actions}</div>` : ''}</div>`; document.body.appendChild(root); root.querySelector('.mtp-experience-close').onclick = () => root.remove(); root.addEventListener('mousedown', e => { if (e.target === root) root.remove(); }); return root; }

  function openDeviceSettings() {
    const current = document.documentElement.dataset.mtpDeviceMode || 'android';
    const root = modal('Device & OS Mode', `<p class="mtp-muted">Choose the experience MTP2026 should use on this device. The launcher changes its layout, viewport behavior and supported orientation/fullscreen behavior.</p><div class="mtp-mode-grid">${[['android','Android','Portrait-first mobile OS-style launcher','⌂'],['ios','iOS','Portrait-first iOS-style launcher','◉'],['windows11','Windows 11','Landscape desktop OS-style workspace','▣'],['gaming','Gaming','Immersive portrait or landscape gaming launcher','◆']].map(([id,name,desc,icon]) => `<button class="mtp-mode-card ${id === current ? 'active' : ''}" data-mode="${id}"><span class="mtp-mode-icon">${icon}</span><span><b>${name}</b><small>${desc}</small></span>${id === current ? '<strong>✓</strong>' : ''}</button>`).join('')}</div><div class="mtp-mode-note"><b>Device behavior</b><span>Windows 11 mode uses a real browser fullscreen request and landscape orientation lock when the device/browser permits it. Android and iOS request portrait when supported. Unsupported browsers show the required rotate state instead of faking rotation.</span></div>`, `<button class="mtp-secondary" data-close>Close</button>`);
    root.querySelector('[data-close]').onclick = () => root.remove();
    root.querySelectorAll('[data-mode]').forEach(button => button.onclick = async () => {
      if (busy) return;
      busy = true;
      try {
        const mode = button.dataset.mode;
        await api('/settings', { method: 'PATCH', body: JSON.stringify({ deviceMode: mode }) });
        applyMode(mode, true);
        root.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('active', x === button); x.querySelector('strong')?.remove(); if (x === button) x.insertAdjacentHTML('beforeend','<strong>✓</strong>'); });
        writeCachedState({ ...(readCachedState()?.settings || {}), deviceMode: mode }, apps);
      } catch (e) { alert(e.message); } finally { busy = false; }
    });
  }

  function openAppSettings(app) { if (!app) return; const icon = app.customIconData || app.iconUrl || ''; const root = modal('Application Settings', `<div class="mtp-app-settings-summary"><div class="mtp-large-icon">${icon ? `<img src="${esc(icon)}" alt=""/>` : '🌐'}</div><div><h3>${esc(app.title)}</h3><p>${esc(app.url)}</p><small>${app.pwaSupported ? 'PWA Ready' : 'Web App'}</small></div></div><label class="mtp-field"><span>Application name</span><input id="mtp-app-title" maxlength="160" value="${esc(app.title)}"></label><label class="mtp-field"><span>Application icon</span><input id="mtp-app-icon" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><div class="mtp-setting-actions"><button class="mtp-secondary" id="mtp-remove-icon">Restore detected icon</button><button class="mtp-danger" id="mtp-uninstall">Uninstall from launcher</button></div><p class="mtp-muted">Uninstall removes this application from your MTP2026 personal launcher. It does not delete the external application.</p>`, `<button class="mtp-secondary" data-close>Cancel</button><button class="mtp-primary" id="mtp-save-app">Save application</button>`); root.querySelector('[data-close]').onclick = () => root.remove(); root.querySelector('#mtp-remove-icon').onclick = async () => { try { await api(`/apps/${encodeURIComponent(app.id)}/experience`, { method: 'PATCH', body: JSON.stringify({ customIconData: null }) }); app.customIconData = null; decorateCards(); root.remove(); writeCachedState(readCachedState()?.settings || {}, apps); } catch (e) { alert(e.message); } }; root.querySelector('#mtp-uninstall').onclick = async () => { if (!confirm(`Remove ${app.title} from your launcher?`)) return; try { await api(`/apps/${encodeURIComponent(app.id)}`, { method: 'DELETE' }); root.remove(); window.dispatchEvent(new Event('mtp2026:apps-changed')); } catch (e) { alert(e.message); } }; root.querySelector('#mtp-save-app').onclick = async () => { const title = root.querySelector('#mtp-app-title').value.trim(); const file = root.querySelector('#mtp-app-icon').files?.[0]; try { const payload = {}; if (title && title !== app.title) payload.title = title; if (file) { if (file.size > 512 * 1024) throw new Error('Icon must be 512 KB or smaller.'); payload.customIconData = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('ICON_READ_FAILED')); r.readAsDataURL(file); }); } if (!Object.keys(payload).length) return root.remove(); await api(`/apps/${encodeURIComponent(app.id)}/experience`, { method: 'PATCH', body: JSON.stringify(payload) }); Object.assign(app, payload); decorateCards(); root.remove(); writeCachedState(readCachedState()?.settings || {}, apps); } catch (e) { alert(e.message); } }; }

  function decorateCards() {
    document.querySelectorAll('.card').forEach(card => {
      const app = appForCard(card);
      if (!app) return;
      card.dataset.mtpAppId = app.id;
      card.classList.add('mtp-launcher-app-tile');
      const icon = card.querySelector('.app-icon');
      if (icon && (app.customIconData || app.userIconUrl)) icon.innerHTML = `<img src="${esc(app.customIconData || app.userIconUrl)}" alt=""/>`;
      if (!card.querySelector('.mtp-app-settings-button')) {
        const button = document.createElement('button');
        button.className = 'mtp-app-settings-button'; button.type = 'button'; button.title = 'Application settings'; button.textContent = '⚙';
        button.onclick = e => { e.stopPropagation(); openAppSettings(app); };
        card.querySelector('.card-top')?.appendChild(button);
      }
    });
  }

  function addSidebarButton() {
    if (document.querySelector('.mtp-device-settings-button')) return;
    const sidebar = document.querySelector('.sidebar'); const nav = sidebar?.querySelector('.nav'); if (!nav) return;
    const button = document.createElement('button'); button.className = 'mtp-device-settings-button'; button.type = 'button'; button.innerHTML = '<span class="mtp-device-settings-icon">◈</span><span>Device & OS Mode</span>'; button.onclick = openDeviceSettings; nav.parentNode.insertBefore(button, nav.nextSibling);
  }

  window.addEventListener('resize', () => { if (orientationGuidanceEnabled) updateOrientationNotice(document.documentElement.dataset.mtpDeviceMode || 'android'); });
  window.addEventListener('orientationchange', () => { if (orientationGuidanceEnabled) updateOrientationNotice(document.documentElement.dataset.mtpDeviceMode || 'android'); });
  document.addEventListener('fullscreenchange', () => { document.documentElement.classList.toggle('mtp-is-fullscreen', Boolean(document.fullscreenElement)); });
  const observer = new MutationObserver(() => { addSidebarButton(); decorateCards(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => { setTimeout(() => loadState(), 150); });
  window.addEventListener('mtp2026:apps-changed', () => loadState({ force: true }));
  // Single startup path: the old implementation called loadState twice (load+600ms),
  // which caused duplicate authenticated requests and amplified Render spin-up races.
  setTimeout(() => loadState(), 600);
})();
