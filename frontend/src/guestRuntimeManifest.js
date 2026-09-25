/* MTP2026 guest runtime manifest loader. */

const STATIC_MANIFEST_URL = '/arm64/guest-manifest.json';
const CANONICAL_GUEST_IDS = Object.freeze(['mtp2026','android','desktop','gaming']);

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
  const ids = CANONICAL_GUEST_IDS.filter(id => base.guests?.[id] || overlay.guests?.[id]);
  return {
    ...base,
    ...overlay,
    controlKernel: { ...(base.controlKernel || {}), ...(overlay.controlKernel || {}) },
    guests: Object.fromEntries(ids.map(id => [id, mergeGuestProfile(base.guests?.[id], overlay.guests?.[id])])),
  };
}

function hasUsablePhysicalSources(manifest) {
  const guests = manifest?.guests || {};
  return CANONICAL_GUEST_IDS.every(id => Boolean(guests[id]?.imageSource?.url && guests[id]?.imageSource?.sha256));
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
  const url = source.url || profile.imageUrl || profile.kernelUrl || null;
  const sha256 = source.sha256 || profile.bundleSha256 || null;
  return { ...profile, imageSource: { ...source, url: url ? String(url) : null, sha256 } };
}
export async function getGuestImageSource(id) {
  const contract = await getGuestImageContract(id);
  const source = contract?.imageSource || {};
  const url = source.url || contract.imageUrl || contract.kernelUrl || null;
  const sha256 = source.sha256 || contract.bundleSha256 || null;
  return { ...source, url: url ? String(url) : null, sha256, configured: Boolean(url && sha256) };
}
export async function validateGuestImageContract(id, metadata = {}) {
  const contract = await getGuestImageContract(id);
  if (contract.architecture !== 'arm64') throw new Error(`GUEST_ARCHITECTURE_UNSUPPORTED_${id}`);
  if (metadata.guestId && metadata.guestId !== id) throw new Error('GUEST_IMAGE_ID_MISMATCH');
  if (metadata.architecture && metadata.architecture !== 'arm64') throw new Error('GUEST_IMAGE_ARCHITECTURE_MISMATCH');
  const source = await getGuestImageSource(id);
  if (contract.imageRequired && (!source.url || !source.sha256)) throw new Error('GUEST_RUNTIME_SOURCE_UNAVAILABLE');
  const expected = String(source.sha256 || '').toLowerCase();
  if (expected && metadata.sha256 && String(metadata.sha256).toLowerCase() !== expected) throw new Error('GUEST_IMAGE_SHA256_MISMATCH');
  return contract;
}

window.MTP2026GuestRuntimeManifest = Object.freeze({ getGuestRuntimeManifest, getGuestImageContract, getGuestImageSource, validateGuestImageContract });
