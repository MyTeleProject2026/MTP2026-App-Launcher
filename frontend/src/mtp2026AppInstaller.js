/* MTP2026 application installation bridge. VexaStore is the package source. */
(() => {
  if (window.__MTP2026_APP_INSTALLER__) return;
  const trustedStoreHosts = new Set(['www.vexastore.2bd.net', 'vexastore.2bd.net']);
  function nativeBridge() { return window.MTP2026Native || window.MTP2026NativePlatform?.nativeBridge || null; }
  function trustedUrl(rawUrl) {
    try { const url = new URL(rawUrl, window.location.href); return url.protocol === 'https:' && trustedStoreHosts.has(url.hostname.toLowerCase()); }
    catch (_) { return false; }
  }
  function isNativeInstallerAvailable() { return Boolean(nativeBridge()?.installApkFromUrl); }
  async function installApk({ url, packageName = '', appName = 'Application' } = {}) {
    if (!trustedUrl(url)) throw new Error('VEXASTORE_SOURCE_NOT_TRUSTED');
    const bridge = nativeBridge();
    if (bridge?.installApkFromUrl) {
      bridge.installApkFromUrl(String(url), String(packageName || ''));
      return { status: 'native-install-started', appName };
    }
    const message = `${appName} is ready to install, but this browser cannot install APK packages. Install the native MTP2026 Android build to use VexaStore APK installation.`;
    window.dispatchEvent(new CustomEvent('mtp2026:app-install-unavailable', { detail: { url, appName, message } }));
    throw new Error('NATIVE_APK_INSTALLER_UNAVAILABLE');
  }
  window.MTP2026AppInstaller = Object.freeze({ installApk, isNativeInstallerAvailable, trustedUrl });
})();
