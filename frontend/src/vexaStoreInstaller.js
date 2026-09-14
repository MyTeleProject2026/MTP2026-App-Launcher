/* MTP2026 <-> VexaStore installer bridge.
 * WebApps are registered in the authenticated MTP2026 application library and
 * mirrored locally for all four MTP2026-owned guest profiles. Native packages
 * are delegated to the host platform installer; browser code never bypasses
 * Android/iOS/Windows security controls.
 */

const VEXASTORE_API = 'https://api-vexastore.onrender.com/api';
const VEXASTORE_ORIGIN = 'https://www.vexastore.2bd.net';
const MTP_API = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
const REGISTRY_KEY = 'mtp2026-installed-vexastore-apps-v3';
const VALID_MODES = new Set(['mtp2026', 'ios', 'android', 'windows11', 'gaming']);

function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; }
}
function saveRegistry(registry) { localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); }
function currentMode() {
  const value = document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android';
  return value === 'windows' ? 'windows11' : VALID_MODES.has(value) ? value : 'android';
}
function assertTrustedUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('VEXASTORE_URL_MUST_BE_HTTPS');
  return url.toString();
}

export function getInstalledVexaApps() { return Object.values(getRegistry()); }

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
      registry[key] = {
        id: app.id,
        slug: app.slug || app.id,
        name: app.title || app.name || 'VexaApp',
        title: app.title || app.name || 'VexaApp',
        description: app.description || '',
        url: app.url,
        iconUrl: app.userIconUrl || app.iconUrl || null,
        version: app.version || null,
        source: 'VexaStore',
        installedAt: app.installedAt || app.lastOpenedAt || new Date().toISOString(),
        guestModes: ['mtp2026', 'ios', 'android', 'windows11', 'gaming'],
        guestMode: currentMode(),
      };
    }
    saveRegistry(registry);
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-library-synced', { detail: apps }));
    return Object.values(registry);
  } catch (_) {
    return getInstalledVexaApps();
  }
}

export async function fetchVexaStoreManifest(slug) {
  const response = await fetch(`${VEXASTORE_API}/platform/apps/${encodeURIComponent(slug)}/install-manifest`, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`VEXASTORE_MANIFEST_${response.status}`);
  const payload = await response.json();
  if (!payload.success || !payload.data) throw new Error('VEXASTORE_INVALID_INSTALL_MANIFEST');
  return payload.data;
}

async function registerWebAppInMtp2026(app) {
  const url = assertTrustedUrl(app.url);
  const response = await fetch(`${MTP_API}/apps`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `MTP2026_INSTALL_FAILED_${response.status}`);
  return body.app || body.data || body;
}

async function installNativePackage(native, mode) {
  if (!native?.url) throw new Error(`VEXASTORE_NATIVE_PACKAGE_UNAVAILABLE_${mode}`);
  const url = assertTrustedUrl(native.url);
  const bridge = window.MTP2026NativePlatform;
  if (typeof bridge?.nativeInstallPackage === 'function') {
    return bridge.nativeInstallPackage(url, native.version, {
      mode,
      packageName: native.packageName || null,
      sha256: native.sha256 || null,
      versionCode: native.versionCode || null,
    });
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return { success: true, mode, type: 'native-handoff', requiresUserApproval: true, url };
}

export async function installVexaStoreApp(manifest) {
  if (!manifest?.app?.slug) throw new Error('VEXASTORE_INVALID_APP');
  const mode = currentMode();

  // Android has a native package path when VexaStore publishes an APK. Prefer it
  // when the native bridge is present; otherwise keep the WebApp registry usable.
  if (mode === 'android' && manifest.nativePackages?.android?.url && typeof window.MTP2026NativePlatform?.nativeInstallPackage === 'function') {
    return installNativePackage(manifest.nativePackages.android, mode);
  }

  const webUrl = manifest.webApp?.url;
  if (webUrl && VALID_MODES.has(mode)) {
    let registered = null;
    try {
      registered = await registerWebAppInMtp2026({ url: webUrl });
    } catch (error) {
      if (String(error?.message || '').includes('401') || String(error?.message || '').includes('AUTH')) throw error;
    }

    const registry = getRegistry();
    const key = String(manifest.app.id || manifest.app.slug || webUrl);
    registry[key] = {
      ...manifest.app,
      ...(registered || {}),
      name: manifest.app.name,
      title: manifest.app.name,
      url: webUrl,
      iconUrl: manifest.app.iconUrl || registered?.iconUrl || null,
      installedAt: new Date().toISOString(),
      version: manifest.webApp.version || registered?.version || null,
      installMode: 'mtp2026-webapp',
      guestMode: mode,
      guestModes: ['mtp2026', 'ios', 'android', 'windows11', 'gaming'],
      source: 'VexaStore',
      manifestUrl: manifest.installIntent?.manifestUrl || `${VEXASTORE_ORIGIN}/api/platform/apps/${encodeURIComponent(manifest.app.slug)}/install-manifest`,
    };
    saveRegistry(registry);
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-installed', { detail: registry[key] }));
    return { success: true, mode, type: 'webapp', cloudRegistered: Boolean(registered), app: registry[key] };
  }

  return installNativePackage(manifest.nativePackages?.[mode], mode);
}

export async function installVexaStoreSlug(slug) {
  const manifest = await fetchVexaStoreManifest(slug);
  return installVexaStoreApp(manifest);
}

window.MTP2026VexaStoreInstaller = { fetchVexaStoreManifest, installVexaStoreApp, installVexaStoreSlug, getInstalledVexaApps, syncInstalledVexaApps };
