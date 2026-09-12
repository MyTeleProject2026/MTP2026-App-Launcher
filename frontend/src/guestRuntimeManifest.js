/* MTP2026 guest runtime manifest loader.
 * The launcher has one control-plane ARM64 kernel, but each selectable OS
 * profile is a separate guest-image contract. A profile is never considered
 * a real Android/iOS/Windows/Gaming guest merely because the control kernel
 * executed successfully.
 *
 * Guest image URLs are deliberately runtime-configurable. This lets the
 * backend/native host point at an official or user-owned image without
 * bundling proprietary operating-system media into the launcher repository.
 */

const STATIC_MANIFEST_URL = '/arm64/guest-manifest.json';
const API_BASE = (window.__MTP_API_BASE__ || 'https://mtp2026-app-launcher-backend.onrender.com/api').replace(/\/$/, '');
let manifestPromise = null;

export const GUEST_IMAGE_STATES = Object.freeze({
  missing: 'missing',
  downloading: 'downloading',
  installed: 'installed',
  ready: 'ready',
  failed: 'failed',
});

async function readJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', credentials: options.credentials || 'omit' });
  if (!response.ok) throw new Error(`GUEST_MANIFEST_FETCH_${response.status}`);
  return response.json();
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      let staticManifest;
      try {
        staticManifest = await readJson(STATIC_MANIFEST_URL, { credentials: 'same-origin' });
      } catch (error) {
        staticManifest = { schema: 'mtp2026-guest-runtime-v2', architecture: 'arm64', guests: {} };
      }

      // The backend is the source of runtime image configuration. It may be
      // unavailable during static/offline startup, so the bundled manifest is
      // always retained as a safe fallback.
      try {
        const runtime = await readJson(`${API_BASE}/guest-runtime-manifest`);
        return {
          ...staticManifest,
          ...runtime,
          controlKernel: { ...(staticManifest.controlKernel || {}), ...(runtime.controlKernel || {}) },
          guests: Object.fromEntries(
            Object.keys({ ...(staticManifest.guests || {}), ...(runtime.guests || {}) }).map(id => [
              id,
              { ...(staticManifest.guests?.[id] || {}), ...(runtime.guests?.[id] || {}) },
            ]),
          ),
        };
      } catch (_) {
        return staticManifest;
      }
    })().catch(error => {
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

export async function getGuestRuntimeManifest() {
  return loadManifest();
}

export async function getGuestImageContract(id) {
  const manifest = await loadManifest();
  const profile = manifest?.guests?.[id];
  if (!profile) throw new Error(`GUEST_PROFILE_NOT_FOUND_${id}`);
  return profile;
}

export async function getGuestImageSource(id) {
  const contract = await getGuestImageContract(id);
  const source = contract?.imageSource || {};
  const url = source.url || contract.imageUrl || null;
  return {
    ...source,
    url: url ? String(url) : null,
    configured: Boolean(url),
  };
}

export async function validateGuestImageContract(id, metadata = {}) {
  const contract = await getGuestImageContract(id);
  if (contract.architecture !== 'arm64') throw new Error(`GUEST_ARCHITECTURE_UNSUPPORTED_${id}`);
  if (metadata.guestId && metadata.guestId !== id) throw new Error('GUEST_IMAGE_ID_MISMATCH');
  if (metadata.architecture && metadata.architecture !== 'arm64') throw new Error('GUEST_IMAGE_ARCHITECTURE_MISMATCH');
  if (contract.imageKind === 'real-os-image' && !metadata.imageSha256 && !metadata.sha256) {
    throw new Error('GUEST_IMAGE_INTEGRITY_METADATA_REQUIRED');
  }
  return contract;
}

window.MTP2026GuestRuntimeManifest = Object.freeze({
  getGuestRuntimeManifest,
  getGuestImageContract,
  getGuestImageSource,
  validateGuestImageContract,
});
