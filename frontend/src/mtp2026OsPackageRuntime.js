/* MTP2026 OS package runtime.
 *
 * Common application-install contract for all four MTP2026-owned guest
 * profiles. WebApps are real applications in the MTP2026 registry. Native
 * packages use a real host installer when available; otherwise the verified
 * package is acquired by the guest package runtime for a compatible native
 * guest implementation instead of being falsely reported as executable.
 */

const STORE_ORIGIN = 'https://www.vexastore.2bd.net';
const STORE_API = 'https://api-vexastore.onrender.com/api';
const MTP_API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const REGISTRY_KEY = 'mtp2026-os-package-registry-v1';
const MODES = ['mtp2026', 'android', 'windows11', 'gaming'];

function currentMode() {
  const raw = String(document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'mtp2026').toLowerCase();
  if (raw === 'ios') return 'mtp2026';
  if (raw === 'windows') return 'windows11';
  return MODES.includes(raw) ? raw : 'mtp2026';
}

function trustedHttps(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:') throw new Error('MTP_PACKAGE_HTTPS_REQUIRED');
  if (url.username || url.password) throw new Error('MTP_PACKAGE_INVALID_URL');
  return url.toString();
}

function readRegistry() { try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; } }
function writeRegistry(value) { localStorage.setItem(REGISTRY_KEY, JSON.stringify(value)); }
export function getMTPInstalledPackages() { return Object.values(readRegistry()); }

function mirrorPackage(app, mode, result = {}) {
  const registry = readRegistry();
  const key = String(app.id || app.slug || app.url);
  const old = registry[key] || {};
  registry[key] = {
    ...old,
    id: app.id || old.id || key,
    slug: app.slug || old.slug || key,
    name: app.name || app.title || old.name || 'MTP Application',
    title: app.title || app.name || old.title || 'MTP Application',
    description: app.description || old.description || '',
    iconUrl: app.iconUrl || app.icon_url || old.iconUrl || null,
    webUrl: app.url || app.webUrl || old.webUrl || null,
    source: 'VexaStore',
    installedProfiles: Array.from(new Set([...(old.installedProfiles || []), ...MODES])),
    lastInstalledMode: mode,
    installedAt: old.installedAt || new Date().toISOString(),
    installResult: result,
  };
  writeRegistry(registry);
  window.dispatchEvent(new CustomEvent('mtp2026:package-installed', { detail: registry[key] }));
  return registry[key];
}

async function registerWebApp(app, mode) {
  const url = trustedHttps(app.url || app.webUrl);
  const response = await fetch(`${MTP_API}/apps`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, source: 'VexaStore', guestMode: mode, guestModes: MODES, installSource: 'vexastore', installProtocol: 'vexastore-install-manifest-v5' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `MTP_WEBAPP_REGISTER_FAILED_${response.status}`);
  return body.app || body.data || body;
}

async function nativeInstall(nativePackage, mode) {
  if (!nativePackage?.url) throw new Error(`MTP_NATIVE_PACKAGE_UNAVAILABLE_${mode}`);
  const url = trustedHttps(nativePackage.url);
  if (typeof window.MTP2026NativePlatform?.nativeInstallPackage !== 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return { status: 'external-handoff', requiresUserApproval: true, mode, url };
  }
  return window.MTP2026NativePlatform.nativeInstallPackage(url, nativePackage.version || '', { mode, packageType: nativePackage.packageType || mode, packageName: nativePackage.packageName || null, versionCode: nativePackage.versionCode || null, sha256: nativePackage.sha256 || null });
}

async function guestAcquire(nativePackage, mode) {
  const runtime = window.MTP2026GuestPackageRuntime;
  if (typeof runtime?.acquireGuestPackage !== 'function') return null;
  return runtime.acquireGuestPackage({ ...nativePackage, packageType: nativePackage.packageType || mode }, mode);
}

export async function fetchMTPVexaStoreManifest(slug) {
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  if (!safeSlug) throw new Error('MTP_STORE_SLUG_REQUIRED');
  const response = await fetch(`${STORE_API}/platform/apps/${safeSlug}/install-manifest`, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`MTP_STORE_MANIFEST_${response.status}`);
  const body = await response.json();
  if (!body?.success || !body?.data) throw new Error('MTP_STORE_INVALID_MANIFEST');
  return body.data;
}

export async function installMTPPackage(manifest, requestedMode = null) {
  if (!manifest?.app?.slug) throw new Error('MTP_STORE_INVALID_APP');
  const mode = requestedMode || currentMode();
  const web = manifest.webApp;
  let cloudApp = null;

  if (web?.url) {
    try { cloudApp = await registerWebApp({ ...manifest.app, url: web.url }, mode); } catch (error) {
      window.dispatchEvent(new CustomEvent('mtp2026:package-sync-pending', { detail: { error: String(error?.message || error), mode, slug: manifest.app.slug } }));
    }
    mirrorPackage({ ...manifest.app, url: web.url }, mode, { type: 'webapp', cloudRegistered: Boolean(cloudApp), version: web.version || null });
  }

  if (mode === 'android' && manifest.nativePackages?.android?.url) {
    const host = window.MTP2026NativePlatform?.nativeHost?.();
    if (host === 'android' && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
      const nativeResult = await nativeInstall(manifest.nativePackages.android, mode);
      return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
    }
    const pending = await guestAcquire(manifest.nativePackages.android, mode);
    if (pending) return { success: true, mode, webAppInstalled: Boolean(web?.url), native: pending, app: manifest.app, reason: 'ANDROID_PACKAGE_DOWNLOADED_PENDING_GUEST_RUNTIME' };
  }

  if (mode === 'windows11' && manifest.nativePackages?.windows?.url) {
    const host = window.MTP2026NativePlatform?.nativeHost?.();
    if (host === 'windows' && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
      const nativeResult = await nativeInstall(manifest.nativePackages.windows, mode);
      return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
    }
    const pending = await guestAcquire(manifest.nativePackages.windows, mode);
    if (pending) return { success: true, mode, webAppInstalled: Boolean(web?.url), native: pending, app: manifest.app, reason: 'WINDOWS_PACKAGE_DOWNLOADED_PENDING_GUEST_RUNTIME' };
  }

  if (mode === 'gaming' && manifest.nativePackages?.gaming?.url) {
    const host = window.MTP2026NativePlatform?.nativeHost?.();
    if ((host === 'windows' || host === 'android') && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
      const nativeResult = await nativeInstall(manifest.nativePackages.gaming, mode);
      return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
    }
    const pending = await guestAcquire(manifest.nativePackages.gaming, mode);
    if (pending) return { success: true, mode, webAppInstalled: Boolean(web?.url), native: pending, app: manifest.app, reason: 'GAMING_PACKAGE_DOWNLOADED_PENDING_GUEST_RUNTIME' };
  }

  return { success: Boolean(web?.url), mode, webAppInstalled: Boolean(web?.url), native: null, app: manifest.app, reason: web?.url ? 'WEBAPP_RUNTIME_INSTALLED' : 'NATIVE_PACKAGE_REQUIRES_HOST_INSTALLER' };
}

export async function installMTPVexaStoreSlug(slug, requestedMode = null) {
  const manifest = await fetchMTPVexaStoreManifest(slug);
  return installMTPPackage(manifest, requestedMode);
}

function handleStoreMessage(event) {
  if (event.origin !== STORE_ORIGIN) return;
  const data = event.data || {};
  if (data.type !== 'MTP2026_VEXASTORE_INSTALL') return;
  const slug = data.app?.slug;
  if (!slug) return;
  void installMTPVexaStoreSlug(slug, data.app?.guestMode || currentMode()).then(result => {
    try { event.source?.postMessage({ type: 'MTP2026_VEXASTORE_INSTALL_RESULT', success: true, result }, event.origin); } catch (_) {}
  }).catch(error => {
    try { event.source?.postMessage({ type: 'MTP2026_VEXASTORE_INSTALL_RESULT', success: false, error: String(error?.message || error) }, event.origin); } catch (_) {}
  });
}

window.addEventListener('message', handleStoreMessage);
window.MTP2026OsPackageRuntime = { fetchMTPVexaStoreManifest, installMTPPackage, installMTPVexaStoreSlug, getMTPInstalledPackages };
