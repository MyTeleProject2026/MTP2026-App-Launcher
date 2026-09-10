(() => {
  const API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
  let apps = [];
  let busy = false;

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  };

  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const appForCard = (card) => {
    const title = card.querySelector('h3')?.textContent?.trim() || '';
    const domain = card.querySelector('.domain')?.textContent?.trim() || '';
    return apps.find(a => a.title === title && (() => { try { return new URL(a.url).hostname === domain; } catch { return false; } })()) || apps.find(a => a.title === title);
  };

  async function loadState() {
    try {
      const [settings, library] = await Promise.all([api('/settings'), api('/apps')]);
      apps = Array.isArray(library) ? library : [];
      applyMode(settings.deviceMode || 'android');
      decorateCards();
    } catch (_) {}
  }

  function applyMode(mode) {
    const allowed = ['android', 'ios', 'windows11', 'gaming'];
    const value = allowed.includes(mode) ? mode : 'android';
    document.documentElement.dataset.mtpDeviceMode = value;
    document.body.dataset.mtpDeviceMode = value;
  }

  function modal(title, body, actions = '') {
    document.querySelector('.mtp-experience-backdrop')?.remove();
    const root = document.createElement('div');
    root.className = 'mtp-experience-backdrop';
    root.innerHTML = `<div class="mtp-experience-modal" role="dialog" aria-modal="true"><div class="mtp-experience-head"><div><div class="mtp-experience-kicker">MTP2026 DEVICE EXPERIENCE</div><h2>${esc(title)}</h2></div><button class="mtp-experience-close" aria-label="Close">×</button></div><div class="mtp-experience-body">${body}</div>${actions ? `<div class="mtp-experience-foot">${actions}</div>` : ''}</div>`;
    document.body.appendChild(root);
    root.querySelector('.mtp-experience-close').onclick = () => root.remove();
    root.addEventListener('mousedown', e => { if (e.target === root) root.remove(); });
    return root;
  }

  function openDeviceSettings() {
    const current = document.documentElement.dataset.mtpDeviceMode || 'android';
    const root = modal('Device & OS Mode', `<p class="mtp-muted">This preference is saved to your MTP2026 account and follows the account across devices.</p><div class="mtp-mode-grid">${[
      ['android','Android','Portrait-first mobile launcher','⌂'],['ios','iOS','Portrait-first iOS-style launcher','◉'],['windows11','Windows 11','Landscape desktop workspace','▣'],['gaming','Gaming','Portrait or landscape immersive launcher','◆']
    ].map(([id,name,desc,icon]) => `<button class="mtp-mode-card ${id === current ? 'active' : ''}" data-mode="${id}"><span class="mtp-mode-icon">${icon}</span><span><b>${name}</b><small>${desc}</small></span>${id === current ? '<strong>✓</strong>' : ''}</button>`).join('')}</div><div class="mtp-mode-note"><b>Real platform behavior</b><span>MTP2026 uses responsive layout plus browser/PWA orientation and fullscreen capabilities available on the device. It does not fake native OS privileges.</span></div>`);
    root.querySelectorAll('[data-mode]').forEach(button => button.onclick = async () => {
      if (busy) return;
      busy = true;
      try {
        const mode = button.dataset.mode;
        await api('/settings', { method: 'PATCH', body: JSON.stringify({ deviceMode: mode }) });
        applyMode(mode);
        root.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('active', x === button); x.querySelector('strong')?.remove(); if (x === button) x.insertAdjacentHTML('beforeend','<strong>✓</strong>'); });
      } catch (e) { alert(e.message); } finally { busy = false; }
    });
  }

  function openAppSettings(app) {
    if (!app) return;
    const icon = app.customIconData || app.iconUrl || '';
    const root = modal('Application Settings', `<div class="mtp-app-settings-summary"><div class="mtp-large-icon">${icon ? `<img src="${esc(icon)}" alt=""/>` : '🌐'}</div><div><h3>${esc(app.title)}</h3><p>${esc(app.url)}</p><small>${app.pwaSupported ? 'PWA Ready' : 'Web App'}</small></div></div><label class="mtp-field"><span>Application name</span><input id="mtp-app-title" maxlength="160" value="${esc(app.title)}"></label><label class="mtp-field"><span>Application icon</span><input id="mtp-app-icon" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><div class="mtp-setting-actions"><button class="mtp-secondary" id="mtp-remove-icon">Restore detected icon</button><button class="mtp-danger" id="mtp-uninstall">Uninstall from launcher</button></div><p class="mtp-muted">Uninstall removes this application from your MTP2026 personal launcher. It does not delete the external application.</p>`, `<button class="mtp-secondary" data-close>Cancel</button><button class="mtp-primary" id="mtp-save-app">Save application</button>`);
    root.querySelector('[data-close]').onclick = () => root.remove();
    root.querySelector('#mtp-remove-icon').onclick = async () => { try { await api(`/apps/${encodeURIComponent(app.id)}/experience`, { method: 'PATCH', body: JSON.stringify({ customIconData: null }) }); app.customIconData = null; decorateCards(); root.remove(); } catch (e) { alert(e.message); } };
    root.querySelector('#mtp-uninstall').onclick = async () => { if (!confirm(`Remove ${app.title} from your launcher?`)) return; try { await api(`/apps/${encodeURIComponent(app.id)}`, { method: 'DELETE' }); root.remove(); window.dispatchEvent(new Event('mtp2026:apps-changed')); } catch (e) { alert(e.message); } };
    root.querySelector('#mtp-save-app').onclick = async () => {
      const title = root.querySelector('#mtp-app-title').value.trim();
      const file = root.querySelector('#mtp-app-icon').files?.[0];
      try {
        const payload = {};
        if (title && title !== app.title) payload.title = title;
        if (file) {
          if (file.size > 512 * 1024) throw new Error('Icon must be 512 KB or smaller.');
          payload.customIconData = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('ICON_READ_FAILED')); r.readAsDataURL(file); });
        }
        if (!Object.keys(payload).length) return root.remove();
        await api(`/apps/${encodeURIComponent(app.id)}/experience`, { method: 'PATCH', body: JSON.stringify(payload) });
        Object.assign(app, payload); decorateCards(); root.remove();
      } catch (e) { alert(e.message); }
    };
  }

  function decorateCards() {
    document.querySelectorAll('.card').forEach(card => {
      const app = appForCard(card);
      if (!app) return;
      card.dataset.mtpAppId = app.id;
      const icon = card.querySelector('.app-icon');
      if (icon && app.customIconData) icon.innerHTML = `<img src="${esc(app.customIconData)}" alt=""/>`;
      if (card.querySelector('.mtp-app-settings-button')) return;
      const button = document.createElement('button');
      button.className = 'mtp-app-settings-button';
      button.type = 'button';
      button.title = 'Application settings';
      button.textContent = '⚙';
      button.onclick = e => { e.stopPropagation(); openAppSettings(app); };
      card.querySelector('.card-top')?.appendChild(button);
    });
  }

  function addSidebarButton() {
    if (document.querySelector('.mtp-device-settings-button')) return;
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar?.querySelector('.nav');
    if (!nav) return;
    const button = document.createElement('button');
    button.className = 'mtp-device-settings-button';
    button.type = 'button';
    button.innerHTML = '<span class="mtp-device-settings-icon">◈</span><span>Device & OS Mode</span>';
    button.onclick = openDeviceSettings;
    nav.parentNode.insertBefore(button, nav.nextSibling);
  }

  const observer = new MutationObserver(() => { addSidebarButton(); decorateCards(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(loadState, 150));
  window.addEventListener('mtp2026:apps-changed', loadState);
  setTimeout(loadState, 600);
})();
