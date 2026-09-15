/* MTP2026 Universal Guest OS runtime.
 * Four MTP2026-owned guest personalities share one application/runtime contract.
 * WebApps published by VexaStore run inside the active guest shell. Native APK/
 * EXE/IPA packages are handed to the real host installer when supported.
 */
import { getInstalledVexaApps, installVexaStoreSlug, syncInstalledVexaApps } from './vexaStoreInstaller.js';

const PROFILE_KEY = 'mtp2026-active-guest-profile';
const PROFILES = Object.freeze({
  mtp2026: { name: 'MTP2026 Device OS', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  ios: { name: 'MTP2026 Device OS', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  android: { name: 'MTP2026 Android OS', layout: 'mobile', nav: 'gesture', storeLabel: 'VexaStore' },
  windows: { name: 'MTP2026 Desktop OS', layout: 'desktop', nav: 'taskbar', storeLabel: 'VexaStore' },
  windows11: { name: 'MTP2026 Desktop OS', layout: 'desktop', nav: 'taskbar', storeLabel: 'VexaStore' },
  gaming: { name: 'MTP2026 Gaming OS', layout: 'gaming', nav: 'controller', storeLabel: 'VexaStore' },
});

function normalize(mode) { const value = String(mode || '').toLowerCase(); return PROFILES[value] ? value : 'mtp2026'; }
function currentProfile() { return normalize(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem(PROFILE_KEY) || 'mtp2026'); }
function setProfile(mode) {
  const id = normalize(mode); localStorage.setItem(PROFILE_KEY, id); document.documentElement.dataset.mtpGuestProfile = id; document.documentElement.dataset.mtpGuestLayout = PROFILES[id].layout; document.documentElement.dataset.mtpGuestNavigation = PROFILES[id].nav; document.documentElement.dataset.mtpGuestName = PROFILES[id].name;
  window.dispatchEvent(new CustomEvent('mtp2026:universal-os-profile', { detail: { id, ...PROFILES[id] } })); return { id, ...PROFILES[id] };
}
function emitStatus(status, detail = {}) { window.dispatchEvent(new CustomEvent('mtp2026:app-install-status', { detail: { status, mode: currentProfile(), ...detail } })); }
function appUrl(app) { return app?.url || app?.launchUrl || app?.webApp?.url || null; }
function ensureRuntimeHost() {
  let host = document.getElementById('mtp2026-app-runtime'); if (host) return host;
  host = document.createElement('section'); host.id = 'mtp2026-app-runtime'; host.hidden = true; host.setAttribute('aria-label', 'MTP2026 application runtime');
  host.innerHTML = '<div class="mtp2026-app-runtime-toolbar"><b data-runtime-title>MTP2026 App</b><span data-runtime-profile></span><button type="button" data-close-runtime>Close</button></div><div class="mtp2026-app-runtime-frame"></div>';
  document.body.appendChild(host);
  host.querySelector('[data-close-runtime]')?.addEventListener('click', () => { host.hidden = true; const frame = host.querySelector('.mtp2026-app-runtime-frame'); if (frame) frame.innerHTML = ''; });
  return host;
}
function trustedWebAppUrl(url) { const parsed = new URL(String(url || ''), window.location.href); if (parsed.protocol !== 'https:') throw new Error('MTP2026_APP_HTTPS_REQUIRED'); return parsed.toString(); }

async function openApp(app) {
  const url = appUrl(app); if (!url) throw new Error('MTP2026_APP_URL_MISSING');
  const mode = currentProfile(); const profile = PROFILES[mode]; const safeUrl = trustedWebAppUrl(url);
  window.dispatchEvent(new CustomEvent('mtp2026:app-launch', { detail: { app, mode, url: safeUrl } }));
  const target = ensureRuntimeHost(); target.querySelector('[data-runtime-title]').textContent = app?.name || app?.title || 'VexaApp'; target.querySelector('[data-runtime-profile]').textContent = profile.name;
  const frame = target.querySelector('.mtp2026-app-runtime-frame'); frame.innerHTML = '';
  const iframe = document.createElement('iframe'); iframe.title = app?.name || app?.title || 'VexaApp'; iframe.src = safeUrl; iframe.allow = 'fullscreen; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation; notifications'; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.loading = 'eager'; iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads');
  iframe.addEventListener('error', () => { target.hidden = true; window.open(safeUrl, '_blank', 'noopener,noreferrer'); });
  frame.appendChild(iframe); target.hidden = false;
  return { success: true, mode, profile: profile.name, type: 'webapp-runtime', url: safeUrl };
}

async function installFromLocation(slug, requestedMode = null) {
  if (!slug) return null;
  if (requestedMode) setProfile(requestedMode);
  emitStatus('starting', { slug, requestedMode: requestedMode || null });
  try { const result = await installVexaStoreSlug(slug, requestedMode || currentProfile()); emitStatus('completed', { slug, result }); return result; }
  catch (error) { emitStatus('failed', { slug, error: String(error?.message || error) }); throw error; }
}

function installBridgeListener(event) {
  const payload = event?.data; if (!payload || payload.type !== 'MTP2026_VEXASTORE_INSTALL') return; if (event.origin !== 'https://www.vexastore.2bd.net') return;
  const slug = payload.app?.slug; const requestedMode = payload.app?.guestMode || null; if (slug) void installFromLocation(slug, requestedMode).catch(() => {});
}

async function boot() {
  ensureRuntimeHost(); setProfile(currentProfile()); await syncInstalledVexaApps();
  const params = new URLSearchParams(location.search);
  if (params.get('vexastoreInstall') === '1' && params.get('slug')) void installFromLocation(params.get('slug'), params.get('guestMode')).catch(() => {});
  window.addEventListener('message', installBridgeListener);
  window.addEventListener('mtp2026:device-mode', event => setProfile(event.detail?.mode));
  window.addEventListener('mtp2026:guest-profile-applied', event => setProfile(event.detail?.id));
  window.addEventListener('mtp2026:vexastore-installed', event => emitStatus('registered', { app: event.detail }));
}

window.MTP2026UniversalOS = Object.freeze({ profiles: PROFILES, getProfile: currentProfile, setProfile, getInstalledApps: getInstalledVexaApps, syncApps: syncInstalledVexaApps, install: installFromLocation, openApp });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot()); else void boot();
