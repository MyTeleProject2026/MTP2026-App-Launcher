/* MTP2026 <-> VexaStore installer bridge.
 * Web apps can be installed into the MTP2026 app registry immediately.
 * Native packages are delegated to a native host when it exposes an installer;
 * browsers cannot silently install APK/IPA/EXE files by themselves.
 */

const VEXASTORE_API = 'https://api-vexastore.onrender.com/api';
const REGISTRY_KEY = 'mtp2026-installed-vexastore-apps-v1';

function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch (_) { return {}; }
}
function saveRegistry(registry) { localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); }
function currentMode() { return document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'android'; }

export function getInstalledVexaApps() { return Object.values(getRegistry()); }

export async function fetchVexaStoreManifest(slug) {
  const response = await fetch(`${VEXASTORE_API}/platform/apps/${encodeURIComponent(slug)}/install-manifest`, { credentials: 'omit' });
  if (!response.ok) throw new Error(`VEXASTORE_MANIFEST_${response.status}`);
  const payload = await response.json();
  if (!payload.success || !payload.data) throw new Error('VEXASTORE_INVALID_INSTALL_MANIFEST');
  return payload.data;
}

export async function installVexaStoreApp(manifest) {
  if (!manifest?.app?.slug) throw new Error('VEXASTORE_INVALID_APP');
  const mode = currentMode();
  const webUrl = manifest.webApp?.url;

  // MTP2026 Device OS and any web-capable guest install web applications into
  // the MTP2026 registry. This is the real install mechanism for web apps.
  if (webUrl && (mode === 'ios' || mode === 'mtp2026' || mode === 'android' || mode === 'windows' || mode === 'gaming')) {
    const registry = getRegistry();
    registry[manifest.app.slug] = {
      ...manifest.app,
      installedAt: new Date().toISOString(),
      version: manifest.webApp.version,
      url: webUrl,
      installMode: 'mtp2026-webapp',
      guestMode: mode,
    };
    saveRegistry(registry);
    window.dispatchEvent(new CustomEvent('mtp2026:vexastore-installed', { detail: registry[manifest.app.slug] }));
    return { success: true, mode, type: 'webapp', app: registry[manifest.app.slug] };
  }

  const native = manifest.nativePackages?.[mode] || manifest.nativePackages?.android;
  if (!native?.url) throw new Error(`VEXASTORE_NATIVE_PACKAGE_UNAVAILABLE_${mode}`);

  const bridge = window.MTP2026NativePlatform;
  if (typeof bridge?.nativeInstallPackage === 'function') {
    return bridge.nativeInstallPackage(native.url, native.version);
  }

  // Do not claim silent installation in a browser. Hand the package URL to
  // the host/browser so the platform can apply its own security confirmation.
  window.open(native.url, '_blank', 'noopener,noreferrer');
  return { success: true, mode, type: 'native-handoff', requiresUserApproval: true, url: native.url };
}

export async function installVexaStoreSlug(slug) {
  const manifest = await fetchVexaStoreManifest(slug);
  return installVexaStoreApp(manifest);
}

window.MTP2026VexaStoreInstaller = { fetchVexaStoreManifest, installVexaStoreApp, installVexaStoreSlug, getInstalledVexaApps };
