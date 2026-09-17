/* MTP2026 <-> VexaStore installer bridge.
 * WebApps are registered in the authenticated MTP2026 application library and
 * mirrored locally for all four MTP2026-owned guest profiles. Native packages
 * are delegated to the real host installer; browser code never bypasses
 * Android/iOS/Windows security controls.
 */

const VEXASTORE_API = 'https://api-vexastore.onrender.com/api';
const VEXASTORE_ORIGIN = 'https://www.vexastore.2bd.net';
const MTP_API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const REGISTRY_KEY = 'mtp2026-installed-vexastore-apps-v6';
const VALID_MODES = new Set(['mtp2026', 'ios', 'android', 'windows', 'windows11', 'gaming']);
const GUEST_MODES = ['mtp2026', 'android', 'windows11', 'gaming'];

function getRegistry() { try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; } }
function saveRegistry(registry) { localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); }
function normalizeMode(value) {
  const mode = String(value || '').toLowerCase();
  if (mode === 'ios') return 'mtp2026';
  if (mode === 'windows') return 'windows11';
  return VALID_MODES.has(mode) ? mode : 'mtp2026';
}
function currentMode() { return normalizeMode(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'mtp2026'); }
function activateMode(mode) {
  const normalized = normalizeMode(mode);
  localStorage.setItem('mtp2026-default-system-os', normalized);
  document.documentElement.dataset.mtpDeviceMode = normalized;
  window.dispatchEvent(new CustomEvent('mtp2026:device-mode', { detail: { mode: normalized, source: 'vexastore-install' } }));
  window.dispatchEvent(new CustomEvent('mtp2026:default-system-os', { detail: { mode: normalized } }));
  return normalized;
}
function emitInstallStatus(status, detail = {}) {
  window.dispatchEvent(new CustomEvent('mtp2026:vexastore-install-status', { detail: { status, mode: currentMode(), ...detail } }));
}
function assertTrustedUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('VEXASTORE_URL_MUST_BE_HTTPS');
  if (url.username || url.password) throw new Error('VEXASTORE_URL_INVALID');
  return url.toString();
}

export function getInstalledVexaApps() { return Object.values(getRegistry()); }
export function isVexaAppInstalled(slug) {
  const target = String(slug || '').toLowerCase();
  return getInstalledVexaApps().some(app => String(app.slug || '').toLowerCase() === target);
}
export function uninstallVexaStoreApp(slug) {
  const registry = getRegistry();
  const key = Object.keys(registry).find(id => String(registry[id]?.slug || '').toLowerCase() === String(slug || '').toLowerCase());
  if (!key) return false;
  delete registry[key];
  saveRegistry(registry);
  window.dispatchEvent(new CustomEvent('mtp2026:vexastore-uninstalled', { detail: { slug } }));
  return true;
}

export async function syncInstalledVexaApps() {
  try {
    const response = await fetch(`${MTP_API}/apps`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return getInstalledVexaApps();
    const apps = await response.json();
    if (!Array.isArray(apps)) return getInstalledVexaApps();
    const registry = getRegistry();
    for (const app of apps) {
      if (!app?.url) continue;
      const key = String(app.id || app.url);
      const existing = registry[key] || {};
      registry[key] = { ...existing, id: app.id, slug: app.slug || app.id, name: app.title || app.name || 'VexaApp', title: app.title || app.name || 'VexaApp', description: app.description || '', url: app.url, iconUrl: app.userIconUrl || app.iconUrl || null, version: app.version || null, source: 'VexaStore', installedAt: existing.installedAt || app.installedAt || app.lastOpenedAt || new Date().toISOString(), guestModes: GUEST_MODES, installedProfiles: existing.installedProfiles || GUEST_MODES, guestMode: currentMode() };
    }
    saveRegistry(registry);
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-library-synced', { detail: apps }));
    return Object.values(registry);
  } catch (_) { return getInstalledVexaApps(); }
}

export async function fetchVexaStoreManifest(slug) {
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  if (!safeSlug) throw new Error('VEXASTORE_SLUG_REQUIRED');
  emitInstallStatus('manifest-loading', { slug });
  const response = await fetch(`${VEXASTORE_API}/platform/apps/${safeSlug}/install-manifest`, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`VEXASTORE_MANIFEST_${response.status}`);
  const payload = await response.json();
  if (!payload.success || !payload.data?.app?.slug) throw new Error('VEXASTORE_INVALID_INSTALL_MANIFEST');
  return payload.data;
}

async function registerWebAppInMtp2026(app, guestMode) {
  const url = assertTrustedUrl(app.url);
  const response = await fetch(`${MTP_API}/apps`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, source: 'VexaStore', guestMode, guestModes: GUEST_MODES, installSource: 'vexastore' }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `MTP2026_INSTALL_FAILED_${response.status}`);
  return body.app || body.data || body;
}

export async function installManualWebApp(payload = {}) {
  const url = assertTrustedUrl(payload.url);
  const mode = activateMode(payload.guestMode || currentMode());
  const parsed = new URL(url);
  const fallbackName = parsed.hostname.replace(/^www\./, '') || 'WebApp';
  const name = String(payload.name || fallbackName).trim().slice(0, 80) || fallbackName;
  const slug = `manual-${btoa(unescape(encodeURIComponent(url))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || Date.now()}`;
  const key = `manual:${url}`;
  const registry = getRegistry();
  const previous = registry[key] || {};
  let registered = null;
  try {
    registered = await registerWebAppInMtp2026({ url }, mode);
  } catch (error) {
    const message = String(error?.message || error);
    if (/401|AUTH/i.test(message)) throw error;
    emitInstallStatus('local-only', { url, reason: message });
  }
  const app = { ...previous, ...(registered || {}), id: registered?.id || key, slug: registered?.slug || slug, name: registered?.name || registered?.title || name, title: registered?.title || registered?.name || name, description: registered?.description || `Manual HTTPS WebApp from ${parsed.hostname}`, url, iconUrl: registered?.iconUrl || null, source: registered?.source || 'Manual WebApp', installMode: 'mtp2026-webapp-manual', guestMode: mode, guestModes: GUEST_MODES, installedProfiles: GUEST_MODES, installedAt: previous.installedAt || new Date().toISOString(), cloudRegistered: Boolean(registered) };
  registry[key] = app;
  saveRegistry(registry);
  window.dispatchEvent(new CustomEvent('mtp2026:vexastore-installed', { detail: app }));
  emitInstallStatus('completed', { url, app });
  return { success: true, type: 'webapp', mode, cloudRegistered: Boolean(registered), app };
}

function nativePackageForMode(manifest, mode) {
  const packages = manifest?.nativePackages || {};
  if (mode === 'windows11') return packages.windows11 || packages.windows || null;
  return packages[mode] || null;
}

async function installNativePackage(native, mode) {
  if (!native?.url) throw new Error(`VEXASTORE_NATIVE_PACKAGE_UNAVAILABLE_${mode}`);
  const url = assertTrustedUrl(native.url);
  const bridge = window.MTP2026NativePlatform;
  if (typeof bridge?.nativeInstallPackage === 'function') {
    emitInstallStatus('native-handoff', { mode, url, version: native.version || null, packageType: native.packageType || mode });
    const result = await bridge.nativeInstallPackage(url, native.version, { mode, packageType: native.packageType || mode, packageName: native.packageName || null, sha256: native.sha256 || null, versionCode: native.versionCode || null });
    return { ...result, url };
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return { success: true, mode, type: 'native-handoff', requiresUserApproval: true, url };
}

export async function installVexaStoreApp(manifest, requestedMode = null) {
  if (!manifest?.app?.slug) throw new Error('VEXASTORE_INVALID_APP');
  const mode = activateMode(requestedMode || currentMode());
  const appSlug = manifest.app.slug;
  emitInstallStatus('starting', { slug: appSlug, requestedMode: requestedMode || null });

  const native = nativePackageForMode(manifest, mode);
  if (native?.url && (mode === 'android' || mode === 'windows11' || mode === 'gaming')) {
    const host = window.MTP2026NativePlatform?.nativeHost?.();
    if ((mode === 'android' && host === 'android') || (mode === 'windows11' && host === 'windows') || (mode === 'gaming' && (host === 'windows' || host === 'android'))) {
      const result = await installNativePackage(native, mode);
      emitInstallStatus('completed', { slug: appSlug, result });
      return result;
    }
  }

  const webUrl = manifest.webApp?.url;
  if (webUrl && GUEST_MODES.includes(mode)) {
    emitInstallStatus('registering', { slug: appSlug });
    let registered = null;
    try { registered = await registerWebAppInMtp2026({ url: webUrl }, mode); }
    catch (error) {
      const message = String(error?.message || error);
      if (/401|AUTH/i.test(message)) throw error;
      emitInstallStatus('local-only', { slug: appSlug, reason: message });
    }

    const registry = getRegistry();
    const key = String(manifest.app.id || appSlug || webUrl);
    const previous = registry[key] || {};
    const installedProfiles = new Set(previous.installedProfiles || []);
    GUEST_MODES.forEach(profile => installedProfiles.add(profile));
    registry[key] = { ...previous, ...manifest.app, ...(registered || {}), name: manifest.app.name, title: manifest.app.name, url: webUrl, iconUrl: manifest.app.iconUrl || registered?.iconUrl || null, installedAt: previous.installedAt || new Date().toISOString(), version: manifest.webApp.version || registered?.version || null, installMode: 'mtp2026-webapp', guestMode: mode, guestModes: GUEST_MODES, installedProfiles: Array.from(installedProfiles), source: 'VexaStore', manifestUrl: manifest.installIntent?.manifestUrl || `${VEXASTORE_ORIGIN}/api/platform/apps/${encodeURIComponent(appSlug)}/install-manifest`, nativePackages: manifest.nativePackages || {} };
    saveRegistry(registry);
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-installed', { detail: registry[key] }));
    const result = { success: true, mode, type: 'webapp', cloudRegistered: Boolean(registered), app: registry[key] };
    emitInstallStatus('completed', { slug: appSlug, result });
    return result;
  }

  if (mode === 'mtp2026') throw new Error('VEXASTORE_WEBAPP_REQUIRED_FOR_MTP2026');
  if (mode === 'ios') throw new Error('VEXASTORE_IOS_USES_MTP2026_WEBAPP_OR_APPLE_AUTHORIZED_DISTRIBUTION');
  throw new Error(`VEXASTORE_INSTALL_TARGET_UNAVAILABLE_${mode}`);
}

export async function installVexaStoreSlug(slug, requestedMode = null) {
  const manifest = await fetchVexaStoreManifest(slug);
  return installVexaStoreApp(manifest, requestedMode);
}

window.MTP2026VexaStoreInstaller = { fetchVexaStoreManifest, installVexaStoreApp, installVexaStoreSlug, installManualWebApp, getInstalledVexaApps, isVexaAppInstalled, uninstallVexaStoreApp, syncInstalledVexaApps };
