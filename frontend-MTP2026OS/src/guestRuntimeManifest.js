/* MTP2026 guest runtime manifest loader. */

import { API } from './auth.js';

const STATIC_MANIFEST_URL = '/arm64/guest-manifest.json';
const CANONICAL_GUEST_IDS = Object.freeze(['mtp2026', 'android', 'desktop', 'gaming']);

let manifestPromise = null;

export const GUEST_IMAGE_STATES = Object.freeze({
  missing: 'missing',
  downloading: 'downloading',
  installed: 'installed',
  ready: 'ready',
  failed: 'failed'
});

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
    guests: Object.fromEntries(ids.map(id => [id, mergeGuestProfile(base.guests?.[id], overlay.guests?.[id])]))
  };
}

function hasUsablePhysicalSources(manifest) {
  const guests = manifest?.guests || {};
  return CANONICAL_GUEST_IDS.every(id => Boolean(guests[id]?.imageSource?.url && guests[id]?.imageSource?.sha256));
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      // The launcher only needs its local/backend runtime contract to start.
      // Do not contact the GitHub physical-test release during normal browser
      // startup. A missing release must never produce a visible network error
      // or block the MTP2026 web runtime.
      let canonical = null;
      let remote = null;

      try { canonical = await readJson(STATIC_MANIFEST_URL); } catch (_) {}
      // Backend boot metadata lives on the API origin. The frontend Render
      // service uses SPA fallback for unknown paths, so calling /api/... on
      // this origin can return index.html with HTTP 200 instead of JSON.
      try {
        const response = await fetch(`${API}/guest-runtime-manifest`, {
          cache: 'no-store',
          credentials: 'include'
        });
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) remote = await response.json();
      } catch (_) {}

      if (!canonical && !remote) throw new Error('GUEST_MANIFEST_UNAVAILABLE');

      const manifest = canonical && remote
        ? mergeManifests(canonical, remote)
        : (remote || canonical);

      if (!manifest || typeof manifest !== 'object') {
        throw new Error('GUEST_MANIFEST_INVALID');
      }

      manifest.runtimeState = hasUsablePhysicalSources(manifest)
        ? 'physical-sources-configured'
        : 'browser-shell';

      return manifest;
    })().catch(error => {
      manifestPromise = null;
      throw error;
    });
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
  return {
    ...profile,
    imageSource: { ...source, url: url ? String(url) : null, sha256 }
  };
}

export async function getGuestImageSource(id) {
  const contract = await getGuestImageContract(id);
  const source = contract?.imageSource || {};
  const url = source.url || contract.imageUrl || contract.kernelUrl || null;
  const sha256 = source.sha256 || contract.bundleSha256 || null;
  return {
    ...source,
    url: url ? String(url) : null,
    sha256,
    configured: Boolean(url && sha256)
  };
}

export async function validateGuestImageContract(id, metadata = {}) {
  const contract = await getGuestImageContract(id);
  if (contract.architecture !== 'arm64') {
    throw new Error(`GUEST_ARCHITECTURE_UNSUPPORTED_${id}`);
  }
  if (metadata.guestId && metadata.guestId !== id) {
    throw new Error('GUEST_IMAGE_ID_MISMATCH');
  }
  if (metadata.architecture && metadata.architecture !== 'arm64') {
    throw new Error('GUEST_IMAGE_ARCHITECTURE_MISMATCH');
  }

  const source = await getGuestImageSource(id);
  if (contract.imageRequired && (!source.url || !source.sha256)) {
    throw new Error('MTP2026_GUEST_BUNDLE_UNAVAILABLE');
  }
  const expected = String(source.sha256 || '').toLowerCase();
  if (expected && metadata.sha256 && String(metadata.sha256).toLowerCase() !== expected) {
    throw new Error('GUEST_IMAGE_SHA256_MISMATCH');
  }
  return contract;
}

window.MTP2026GuestRuntimeManifest = Object.freeze({
  getGuestRuntimeManifest,
  getGuestImageContract,
  getGuestImageSource,
  validateGuestImageContract
});
