/* MTP2026 guest runtime manifest loader.
 * The launcher has one control-plane ARM64 kernel, but each selectable OS
 * profile is a separate guest-image contract. A profile is never considered
 * a real Android/iOS/Windows/Gaming guest merely because the control kernel
 * executed successfully.
 */

const MANIFEST_URL = '/arm64/guest-manifest.json';
let manifestPromise = null;

export const GUEST_IMAGE_STATES = Object.freeze({
  missing: 'missing',
  downloading: 'downloading',
  installed: 'installed',
  ready: 'ready',
  failed: 'failed',
});

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store', credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`GUEST_MANIFEST_FETCH_${response.status}`);
        return response.json();
      })
      .catch(error => {
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
  validateGuestImageContract,
});
