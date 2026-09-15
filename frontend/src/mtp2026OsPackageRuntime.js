/* MTP2026 OS package runtime.
 *
 * This is the common application-install contract shared by all four
 * MTP2026-owned guest profiles. WebApps are real installable applications
 * inside the MTP2026 application registry. Native packages are handed to the
 * real host installer only when the host exposes an approved installer API.
 * Browser code never pretends an APK/IPA/EXE was installed when it was not.
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

function readRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; }
}

function writeRegistry(value) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(value));
}

export function getMTPInstalledPackages() {
  return Object.values(readRegistry());
}

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
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      source: 'VexaStore',
      guestMode: mode,
      guestModes: MODES,
      installSource: 'vexastore',
      installProtocol: 'vexastore-install-manifest-v5',
    }),
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
  return window.MTP2026NativePlatform.nativeInstallPackage(url, nativePackage.version || '', {
    mode,
    packageType: nativePackage.packageType || mode,
    packageName: nativePackage.packageName || null,
    versionCode: nativePackage.versionCode || null,
    sha256: nativePackage.sha256 || null,
  });
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

  // Every MTP2026-owned guest profile gets the WebApp registry entry. This is
  // the portable application layer shared by the four guest personalities.
  if (web?.url) {
    try { cloudApp = await registerWebApp({ ...manifest.app, url: web.url }, mode); } catch (error) {
      // A logged-out launcher can still keep a local installation intent. The
      // authenticated sync endpoint will reconcile it after VexaAccount login.
      window.dispatchEvent(new CustomEvent('mtp2026:package-sync-pending', { detail: { error: String(error?.message || error), mode, slug: manifest.app.slug } }));
    }
    mirrorPackage({ ...manifest.app, url: web.url }, mode, { type: 'webapp', cloudRegistered: Boolean(cloudApp), version: web.version || null });
  }

  // Android: use the real Android PackageInstaller bridge when available.
  if (mode === 'android' && manifest.nativePackages?.android?.url && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
    const nativeResult = await nativeInstall(manifest.nativePackages.android, mode);
    return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
  }

  // Windows: use the native installer bridge if a Windows desktop build exposes
  // it; otherwise keep the WebApp installation and hand off the native package.
  if (mode === 'windows11' && manifest.nativePackages?.windows?.url) {
    const nativeResult = await nativeInstall(manifest.nativePackages.windows, mode);
    return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
  }

  // Gaming profile: WebApps are first-class; native packages are optional.
  if (mode === 'gaming' && manifest.nativePackages?.gaming?.url && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
    const nativeResult = await nativeInstall(manifest.nativePackages.gaming, mode);
    return { success: true, mode, webAppInstalled: Boolean(web?.url), native: nativeResult, app: manifest.app };
  }

  // MTP2026 Device OS deliberately uses the WebApp application layer. An IPA
  // cannot be silently sideloaded from browser code, so an Apple package is not
  // falsely reported as installed.
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
