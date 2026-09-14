import { getInstalledVexaApps, installVexaStoreSlug, syncInstalledVexaApps } from './vexaStoreInstaller.js';

const STORE_URL = 'https://www.vexastore.2bd.net/';
const ROOT_ID = 'mtp2026-device-os';
const MARK = '/branding/mtp2026-mark.svg';

function openStore() {
  const url = new URL(STORE_URL);
  url.searchParams.set('mtp2026Install', '1');
  window.open(url.toString(), '_blank');
}

function launch(app) {
  if (!app?.url) return;
  try { window.MTP2026NativePlatform?.nativeOpenExternal?.(app.url); }
  catch (_) { window.open(app.url, '_blank', 'noopener,noreferrer'); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderInstalled(target) {
  if (!target) return;
  const apps = getInstalledVexaApps().slice(0, 6);
  target.innerHTML = apps.length ? apps.map(app => `<button type="button" data-mtp-app="${encodeURIComponent(app.slug || app.id || app.url)}" style="border:1px solid rgba(17,24,39,.07);background:#fff;border-radius:13px;padding:9px;text-align:left;display:flex;align-items:center;gap:8px;min-width:0"><img src="${escapeHtml(app.iconUrl || MARK)}" alt="" style="width:28px;height:28px;border-radius:8px;object-fit:cover"><span style="min-width:0"><b style="display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(app.name || app.title || 'WebApp')}</b><small style="display:block;color:#8b8e98;font-size:9px">Installed</small></span></button>`).join('') : '<small style="grid-column:1/-1;color:#8b8e98;font-size:10px">No VexaStore WebApps installed yet.</small>';
  target.querySelectorAll('[data-mtp-app]').forEach(button => button.addEventListener('click', () => {
    const key = decodeURIComponent(button.dataset.mtpApp || '');
    const app = getInstalledVexaApps().find(x => (x.slug || x.id || x.url) === key);
    launch(app);
  }));
}

async function refreshLibrary(target) {
  await syncInstalledVexaApps();
  renderInstalled(target);
}

function inject() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const home = root.querySelector('.mtp-ios-home');
  if (!home || home.querySelector('[data-mtp-vexastore-panel]')) return;
  const grid = home.querySelector('.mtp-ios-app-grid');
  if (!grid) return;

  const panel = document.createElement('section');
  panel.dataset.mtpVexastorePanel = '1';
  panel.style.cssText = 'margin:18px 0 8px;padding:14px;border-radius:20px;background:rgba(255,255,255,.72);border:1px solid rgba(17,24,39,.06);box-shadow:0 8px 22px rgba(15,23,42,.06)';
  panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div style="display:flex;align-items:center;gap:10px"><img src="${MARK}" alt="MTP2026" style="width:38px;height:38px;border-radius:11px"><div><b style="display:block;font-size:14px">VexaStore</b><small style="display:block;color:#737784;font-size:11px;margin-top:2px">Install and launch MTP2026 WebApps</small></div></div><button data-mtp-store-open type="button" style="border:0;border-radius:11px;padding:9px 12px;background:#07101b;color:#fff;font-weight:700;font-size:11px">Open Store</button></div><div data-mtp-installed style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px"></div>`;
  grid.insertAdjacentElement('afterend', panel);
  panel.querySelector('[data-mtp-store-open]')?.addEventListener('click', openStore);
  const target = panel.querySelector('[data-mtp-installed]');
  renderInstalled(target);
  refreshLibrary(target).catch(() => {});
}

async function consumeInstallRequest() {
  const params = new URLSearchParams(location.search);
  if (params.get('vexastoreInstall') !== '1') return;
  const slug = params.get('slug');
  history.replaceState({}, '', location.pathname + location.hash);
  if (!slug) return;
  try {
    await installVexaStoreSlug(slug);
  } catch (error) {
    console.error('MTP2026 VexaStore install failed:', error);
    const message = error?.message || 'VexaStore installation failed';
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-install-error', { detail: { message } }));
  }
}

window.addEventListener('mtp2026:vexastore-installed', () => inject());
window.addEventListener('mtp2026:vexastore-library-synced', () => inject());
window.addEventListener('mtp2026:guest-profile-applied', () => inject());
new MutationObserver(inject).observe(document.documentElement, { childList:true, subtree:true });
window.setTimeout(() => { consumeInstallRequest(); inject(); }, 500);
