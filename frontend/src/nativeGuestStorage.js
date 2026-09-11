/* MTP2026 native guest storage bridge.
 * Capacitor APK mode stores guest data in the app's private Data directory.
 * Web/PWA continues to use guestImageStore's IndexedDB fallback.
 */

let filesystemPromise;
const root = 'mtp2026/guests';

async function filesystem() {
  filesystemPromise ||= import('@capacitor/filesystem').then(module => module.Filesystem);
  return filesystemPromise;
}

function pathFor(id, name) {
  return `${root}/${encodeURIComponent(id)}/${name}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
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
  try {
    await filesystem();
  } catch (_) {
    return null;
  }

  return Object.freeze({
    async saveImage(id, bytes, metadata = {}) {
      await saveFile(id, 'image.bin', bytes);
      await saveFile(id, 'metadata.json', new TextEncoder().encode(JSON.stringify({ ...metadata, id, updatedAt: new Date().toISOString() })));
      return { id, byteLength: bytes.byteLength || bytes.length, location: 'capacitor-private-data' };
    },
    async loadImage(id) {
      try {
        const bytes = await readFile(id, 'image.bin');
        let metadata = {};
        try {
          const raw = await readFile(id, 'metadata.json');
          metadata = JSON.parse(new TextDecoder().decode(raw));
        } catch (_) {}
        return { bytes, metadata };
      } catch (_) {
        return null;
      }
    },
    async removeImage(id) {
      await removeFile(id, 'image.bin');
      await removeFile(id, 'metadata.json');
      return true;
    },
    async saveMetadata(id, metadata) {
      await saveFile(id, 'guest.json', new TextEncoder().encode(JSON.stringify({ ...metadata, id, updatedAt: new Date().toISOString() })));
      return true;
    },
    async loadMetadata(id) {
      try {
        const bytes = await readFile(id, 'guest.json');
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch (_) {
        return null;
      }
    },
    async removeMetadata(id) {
      return removeFile(id, 'guest.json');
    },
    async requestPermission() {
      // Capacitor's app-private Data directory does not require broad shared-storage permission.
      return true;
    },
  });
}

void createNativeGuestStorage().then(storage => {
  if (storage) window.MTP2026NativeGuestStorage = storage;
});
