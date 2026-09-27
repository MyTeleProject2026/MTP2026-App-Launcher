/* MTP2026 <-> VexaStore application bridge.
 * Keeps VexaStore as the application publisher while the launcher remains the
 * user's VexaAccount application workspace. WebApps are installed into the
 * MTP2026 cloud library; native packages continue through platform installers.
 */
(() => {
  if (window.__MTP2026_VEXASTORE_BRIDGE__) return;
  window.__MTP2026_VEXASTORE_BRIDGE__ = true;

  const STORE_URL = 'https://www.vexastore.2bd.net/';
  const STORE_ORIGIN = 'https://www.vexastore.2bd.net';
  const API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
  const INSTALL_EVENT = 'mtp2026:vexastore-installed';

  function toast(message, ok = true) {
    const old = document.getElementById('mtp2026-vexastore-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'mtp2026-vexastore-toast';
    el.textContent = message;
    el.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:2147483646;max-width:360px;padding:12px 16px;border-radius:14px;background:${ok ? 'rgba(8,44,35,.96)' : 'rgba(70,18,25,.96)'};border:1px solid ${ok ? 'rgba(52,211,153,.35)' : 'rgba(248,113,113,.35)'};color:#eef6ff;font:600 13px system-ui;box-shadow:0 18px 50px rgba(0,0,0,.35)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function openStore() {
    const url = new URL(STORE_URL);
    url.searchParams.set('mtp2026Install', '1');
    // Keep window.opener available so VexaStore can securely post the selected
    // WebApp back to this authenticated MTP2026 launcher tab.
    window.open(url.toString(), '_blank');
  }

  async function installWebApp(app) {
    if (!app?.url) throw new Error('VEXASTORE_WEBAPP_URL_MISSING');
    const target = new URL(app.url);
    if (target.protocol !== 'https:') throw new Error('VEXASTORE_WEBAPP_HTTPS_REQUIRED');

    const response = await fetch(`${API}/apps`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target.toString() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `MTP2026_INSTALL_FAILED_${response.status}`);

    const installed = {
      ...(body.app || body.data || {}),
      title: app.title || body.app?.title || body.data?.title || target.hostname,
      url: target.toString(),
      iconUrl: app.iconUrl || body.app?.iconUrl || body.data?.iconUrl || null,
      source: 'VexaStore',
      installedAt: new Date().toISOString(),
    };
    try {
      const current = JSON.parse(localStorage.getItem('mtp2026-vexastore-installed') || '[]');
      const next = [installed, ...current.filter(x => x.url !== installed.url)].slice(0, 100);
      localStorage.setItem('mtp2026-vexastore-installed', JSON.stringify(next));
    } catch (_) {}
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT, { detail: installed }));
    toast(`${installed.title} was added to your MTP2026 application library.`);
    return installed;
  }

  function injectStoreButton() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.querySelector('[data-mtp-vexastore]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mtpVexastore = '1';
    button.innerHTML = '<span class="ico" style="display:inline-grid;place-items:center;font-size:16px">▦</span> VexaStore';
    button.title = 'Browse and install applications from VexaStore';
    button.addEventListener('click', openStore);
    nav.appendChild(button);
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== STORE_ORIGIN) return;
    const data = event.data || {};
    if (data.type !== 'MTP2026_VEXASTORE_INSTALL') return;
    try {
      await installWebApp(data.app || {});
      toast('VexaStore application installed into MTP2026. Refreshing your library…');
      setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      toast(error?.message || 'Unable to install the VexaStore WebApp.', false);
    }
  });

  window.MTP2026VexaStore = Object.freeze({
    openStore,
    installWebApp,
    getInstalled: () => {
      try { return JSON.parse(localStorage.getItem('mtp2026-vexastore-installed') || '[]'); } catch (_) { return []; }
    },
  });

  const observer = new MutationObserver(injectStoreButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(injectStoreButton, 700);
})();
