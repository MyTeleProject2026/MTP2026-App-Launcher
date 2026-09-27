/* MTP2026 native guest storage bridge.
 * This module is intentionally web-safe: the Capacitor Filesystem plugin is
 * never imported, awaited, or touched while running in a browser/PWA.
 */

const root = 'mtp2026/guests';
let filesystemPromise = null;

function isNativeHost() {
  try {
    const capacitor = globalThis.Capacitor;
    if (!capacitor) return false;
    if (typeof capacitor.isNativePlatform === 'function') return Boolean(capacitor.isNativePlatform());
    if (typeof capacitor.getPlatform === 'function') return capacitor.getPlatform() !== 'web';
  } catch (_) {}
  return false;
}

async function filesystem() {
  if (!isNativeHost()) throw new Error('NATIVE_FILESYSTEM_UNAVAILABLE_ON_WEB');
  if (!filesystemPromise) {
    // Do not use Filesystem as a thenable. Capacitor exposes a proxy object
    // whose web implementation deliberately does not implement .then().
    filesystemPromise = (async () => {
      const module = await import('@capacitor/filesystem');
      if (!module?.Filesystem) throw new Error('CAPACITOR_FILESYSTEM_UNAVAILABLE');
      return module.Filesystem;
    })();
  }
  return filesystemPromise;
}

function pathFor(id, name) { return `${root}/${encodeURIComponent(id)}/${name}`; }
function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function saveFile(id, name, bytes) {
  const fs = await filesystem();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await fs.mkdir({ path: `${root}/${encodeURIComponent(id)}`, directory: 'DATA', recursive: true }).catch(() => {});
  await fs.writeFile({ path: pathFor(id, name), data: bytesToBase64(data), directory: 'DATA', recursive: true });
}
async function readFile(id, name) {
  const fs = await filesystem();
  const result = await fs.readFile({ path: pathFor(id, name), directory: 'DATA' });
  return base64ToBytes(result.data);
}
async function removeFile(id, name) {
  const fs = await filesystem();
  await fs.deleteFile({ path: pathFor(id, name), directory: 'DATA' }).catch(() => {});
  return true;
}

export async function createNativeGuestStorage() {
  if (!isNativeHost()) return null;
  try { await filesystem(); } catch (_) { return null; }
  return Object.freeze({
    async saveImage(id, bytes, metadata = {}) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      await saveFile(id, 'image.bin', data);
      await saveFile(id, 'metadata.json', new TextEncoder().encode(JSON.stringify({ ...metadata, id, updatedAt: new Date().toISOString() })));
      return { id, byteLength: data.byteLength, location: 'capacitor-private-data' };
    },
    async loadImage(id) {
      try {
        const bytes = await readFile(id, 'image.bin');
        let metadata = {};
        try { metadata = JSON.parse(new TextDecoder().decode(await readFile(id, 'metadata.json'))); } catch (_) {}
        return { bytes, metadata };
      } catch (_) { return null; }
    },
    async removeImage(id) { await removeFile(id, 'image.bin'); await removeFile(id, 'metadata.json'); return true; },
    async saveMetadata(id, metadata) { await saveFile(id, 'guest.json', new TextEncoder().encode(JSON.stringify({ ...metadata, id, updatedAt: new Date().toISOString() }))); return true; },
    async loadMetadata(id) { try { return JSON.parse(new TextDecoder().decode(await readFile(id, 'guest.json'))); } catch (_) { return null; } },
    async removeMetadata(id) { return removeFile(id, 'guest.json'); },
    async requestPermission() { return true; },
  });
}

// Only the native host gets an eager bridge. Browsers never import Capacitor Filesystem.
if (isNativeHost()) void createNativeGuestStorage().then(storage => { if (storage) globalThis.MTP2026NativeGuestStorage = storage; }).catch(() => {});
