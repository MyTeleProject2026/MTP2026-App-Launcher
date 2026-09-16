/* MTP2026 guest package runtime.
 *
 * Provides a real package acquisition/verification layer for MTP2026-owned
 * guest profiles. It never claims that a browser has executed an APK/EXE.
 * Native execution is delegated to the host installer when one exists.
 * When running purely in the browser, packages are downloaded into OPFS when
 * available and recorded as "downloaded-pending-runtime" so a future native
 * guest runtime can consume the exact verified package.
 */

const ROOT = 'mtp2026-guest-packages-v1';
const MODES = new Set(['mtp2026', 'android', 'windows11', 'gaming']);

function modeOf(value) {
  const raw = String(value || document.documentElement.dataset.mtpDeviceMode || localStorage.getItem('mtp2026-default-system-os') || 'mtp2026').toLowerCase();
  if (raw === 'ios') return 'mtp2026';
  if (raw === 'windows') return 'windows11';
  return MODES.has(raw) ? raw : 'mtp2026';
}

function registry() {
  try { return JSON.parse(localStorage.getItem(ROOT) || '{}'); } catch (_) { return {}; }
}
function save(value) { localStorage.setItem(ROOT, JSON.stringify(value)); }

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function writeOPFS(path, buffer) {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('mtp2026-packages', { create: true });
  const safe = String(path || 'package.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
  const handle = await dir.getFileHandle(safe, { create: true });
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
  return `opfs://mtp2026-packages/${safe}`;
}

export async function acquireGuestPackage(pkg, requestedMode = null) {
  const mode = modeOf(requestedMode);
  if (!pkg?.url) throw new Error(`MTP_GUEST_PACKAGE_URL_MISSING_${mode}`);
  const url = new URL(String(pkg.url));
  if (url.protocol !== 'https:') throw new Error('MTP_GUEST_PACKAGE_HTTPS_REQUIRED');

  window.dispatchEvent(new CustomEvent('mtp2026:guest-package-status', { detail: { status: 'downloading', mode, url: url.toString(), package: pkg } }));
  const response = await fetch(url.toString(), { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`MTP_GUEST_PACKAGE_DOWNLOAD_${response.status}`);
  const buffer = await response.arrayBuffer();
  const actualSha = await sha256(buffer);
  const expectedSha = String(pkg.sha256 || '').toLowerCase().trim();
  if (expectedSha && actualSha !== expectedSha) throw new Error('MTP_GUEST_PACKAGE_SHA256_MISMATCH');

  window.dispatchEvent(new CustomEvent('mtp2026:guest-package-status', { detail: { status: 'verified', mode, sha256: actualSha, bytes: buffer.byteLength, package: pkg } }));
  const storagePath = await writeOPFS(`${pkg.packageName || pkg.version || 'package'}-${actualSha.slice(0, 12)}.${pkg.packageType === 'android' ? 'apk' : 'bin'}`, buffer).catch(() => null);

  const key = `${mode}:${pkg.packageName || pkg.url}`;
  const data = registry();
  data[key] = {
    key,
    mode,
    packageType: pkg.packageType || mode,
    packageName: pkg.packageName || null,
    version: pkg.version || null,
    versionCode: pkg.versionCode || null,
    url: url.toString(),
    sha256: actualSha,
    bytes: buffer.byteLength,
    storagePath,
    status: 'downloaded-pending-runtime',
    installedAt: new Date().toISOString(),
  };
  save(data);

  window.dispatchEvent(new CustomEvent('mtp2026:guest-package-status', { detail: { status: 'downloaded-pending-runtime', mode, package: data[key] } }));
  return data[key];
}

export function getGuestPackages(mode = null) {
  const data = Object.values(registry());
  return mode ? data.filter(item => item.mode === modeOf(mode)) : data;
}

export function getGuestPackage(key) { return registry()[String(key || '')] || null; }

window.MTP2026GuestPackageRuntime = { acquireGuestPackage, getGuestPackages, getGuestPackage };
