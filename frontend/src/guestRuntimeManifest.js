/* MTP2026 guest runtime manifest loader. */

const STATIC_MANIFEST_URL = '/arm64/guest-manifest.json';
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
      const manifest = await readJson(STATIC_MANIFEST_URL);
      if (!manifest || typeof manifest !== 'object') throw new Error('GUEST_MANIFEST_INVALID');
      if (!hasUsablePhysicalSources(manifest)) throw new Error('GUEST_MANIFEST_INCOMPLETE');
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
  return profile;
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
  if (contract.imageRequired && !contract.imageSource?.url && !contract.imageUrl && !contract.kernelUrl) throw new Error(`GUEST_IMAGE_SOURCE_NOT_CONFIGURED_${id}`);
  const expected = String(contract.imageSource?.sha256 || contract.bundleSha256 || '').toLowerCase();
  if (expected && metadata.sha256 && String(metadata.sha256).toLowerCase() !== expected) throw new Error('GUEST_IMAGE_SHA256_MISMATCH');
  return contract;
}

window.MTP2026GuestRuntimeManifest = Object.freeze({ getGuestRuntimeManifest, getGuestImageContract, getGuestImageSource, validateGuestImageContract });
