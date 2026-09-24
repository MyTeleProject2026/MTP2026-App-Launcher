/* MTP2026 guest runtime manifest loader. */

const STATIC_MANIFEST_URL = '/arm64/guest-manifest.json';

const BUILT_IN_GUEST_IMAGE_SOURCES = Object.freeze({
  mtp2026: { url: 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test/mtp2026-mtp2026-arm64-guest.tar.gz', sha256: '2c26dd065354c7c96e14039b90560ca486cb1061d5443bf37810e84bdcbcfaf0', kind: 'arm64-qemu-guest-bundle' },
  android: { url: 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test/mtp2026-android-arm64-guest.tar.gz', sha256: '36d1cde816a86314404c223abb0f4d0367277f53eff466bf37e2fab935078ac5', kind: 'arm64-qemu-guest-bundle' },
  windows11: { url: 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test/mtp2026-windows11-arm64-guest.tar.gz', sha256: '95334be8a1b362d4356c5bfdb4a32a8a8339d7c48e760f7ea9ddd4d868794ec9', kind: 'arm64-qemu-guest-bundle' },
  gaming: { url: 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test/mtp2026-gaming-arm64-guest.tar.gz', sha256: '61b73f41f52ce3db5367f40af1f4b02d69785f9b7a50233aa088d9ad800f56b6', kind: 'arm64-qemu-guest-bundle' }
});
let manifestPromise = null;

export const GUEST_IMAGE_STATES = Object.freeze({ missing: 'missing', downloading: 'downloading', installed: 'installed', ready: 'ready', failed: 'failed' });

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`GUEST_MANIFEST_FETCH_${response.status}`);
  return response.json();
}

function mergeGuestProfile(base = {}, overlay = {}) {
  const merged = { ...base, ...overlay };
  const baseSource = base.imageSource || {};
  const overlaySource = overlay.imageSource || {};
  const source = { ...baseSource, ...overlaySource };
  if (source.url || source.sha256) merged.imageSource = source;
  else if (base.imageSource) merged.imageSource = base.imageSource;
  else delete merged.imageSource;
  return merged;
}

function mergeManifests(base, overlay) {
  const ids = Object.keys({ ...(base.guests || {}), ...(overlay.guests || {}) });
  return {
    ...base,
    ...overlay,
    controlKernel: { ...(base.controlKernel || {}), ...(overlay.controlKernel || {}) },
    guests: Object.fromEntries(ids.map(id => [id, mergeGuestProfile(base.guests?.[id], overlay.guests?.[id])])),
  };
}

function hasUsablePhysicalSources(manifest) {
  const guests = manifest?.guests || {};
  return ['mtp2026', 'android', 'windows11', 'gaming'].every(id => Boolean(guests[id]?.imageSource?.url && guests[id]?.imageSource?.sha256));
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      // Do not make the static asset a single point of failure. A stale CDN,
      // service-worker cache, or a frontend deployment that omitted the
      // asset must not prevent the backend physical-runtime contract from
      // supplying the four real ARM64 image sources.
      let canonical = null;
      let remote = null;
      try { canonical = await readJson(STATIC_MANIFEST_URL); } catch (_) {}
      try {
        const response = await fetch('/api/guest-runtime-manifest', { cache: 'no-store', credentials: 'same-origin' });
        if (response.ok) remote = await response.json();
      } catch (_) {}

      if (!canonical && !remote) throw new Error('GUEST_MANIFEST_UNAVAILABLE');
      let manifest = canonical && remote ? mergeManifests(canonical, remote) : (remote || canonical);
      if (!manifest || typeof manifest !== 'object') throw new Error('GUEST_MANIFEST_INVALID');
      // The physical-test release is rebuilt on every firmware change, so its
      // published bundle digests are authoritative and must override stale
      // static fallback hashes before native verification.
      const physicalManifestUrl = manifest.physicalTestManifestUrl || 'https://github.com/MyTeleProject2026/MTP2026-App-Launcher/releases/download/mtp2026-physical-test/physical-test-manifest.json';
      try {
        const physical = await readJson(physicalManifestUrl);
        if (physical?.guests) {
          manifest = mergeManifests(manifest, { guests: Object.fromEntries(Object.entries(physical.guests).map(([id, guest]) => [id, {
            imageSource: guest.imageSource,
            kernelName: guest.kernelName,
            initrdName: guest.initrdName,
            firmwareName: guest.firmwareName,
            bootDiskName: guest.bootDiskName
          }]))});
        }
      } catch (_) {}
      manifest.runtimeState = hasUsablePhysicalSources(manifest) ? 'physical-sources-configured' : 'browser-shell';
      return manifest;
    })().catch(error => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

export async function getGuestRuntimeManifest() { return loadManifest(); }
export async function getGuestImageContract(id) {
  const manifest = await loadManifest();
  const profile = manifest?.guests?.[id];
  if (!profile) throw new Error(`GUEST_PROFILE_NOT_FOUND_${id}`);
  const source = profile.imageSource || {};
  const fallback = BUILT_IN_GUEST_IMAGE_SOURCES[id] || {};
  const url = source.url || profile.imageUrl || profile.kernelUrl || fallback.url || null;
  const sha256 = source.sha256 || profile.bundleSha256 || fallback.sha256 || null;
  return { ...profile, imageSource: { ...fallback, ...source, url: url ? String(url) : null, sha256 } };
}
export async function getGuestImageSource(id) {
  const contract = await getGuestImageContract(id);
  const source = contract?.imageSource || {};
  const fallback = BUILT_IN_GUEST_IMAGE_SOURCES[id] || {};
  const url = source.url || contract.imageUrl || contract.kernelUrl || fallback.url || null;
  const sha256 = source.sha256 || contract.bundleSha256 || fallback.sha256 || null;
  return { ...fallback, ...source, url: url ? String(url) : null, sha256, configured: Boolean(url && sha256), fallback: Boolean(!source.url && fallback.url) };
}
export async function validateGuestImageContract(id, metadata = {}) {
  const contract = await getGuestImageContract(id);
  if (contract.architecture !== 'arm64') throw new Error(`GUEST_ARCHITECTURE_UNSUPPORTED_${id}`);
  if (metadata.guestId && metadata.guestId !== id) throw new Error('GUEST_IMAGE_ID_MISMATCH');
  if (metadata.architecture && metadata.architecture !== 'arm64') throw new Error('GUEST_IMAGE_ARCHITECTURE_MISMATCH');
  const source = await getGuestImageSource(id);
  if (contract.imageRequired && (!source.url || !source.sha256)) throw new Error(`GUEST_IMAGE_SOURCE_NOT_CONFIGURED_${id}`);
  const expected = String(source.sha256 || '').toLowerCase();
  if (expected && metadata.sha256 && String(metadata.sha256).toLowerCase() !== expected) throw new Error('GUEST_IMAGE_SHA256_MISMATCH');
  return contract;
}

window.MTP2026GuestRuntimeManifest = Object.freeze({ getGuestRuntimeManifest, getGuestImageContract, getGuestImageSource, validateGuestImageContract });
