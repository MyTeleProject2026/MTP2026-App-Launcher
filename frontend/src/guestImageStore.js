/* MTP2026 guest image store.
 * Stores actual guest firmware/kernel bytes in the host's persistent storage.
 * Native APK hosts can provide a native implementation through
 * window.MTP2026NativeGuestStorage; Web/PWA uses IndexedDB.
 */

const DB_NAME = 'mtp2026-guest-storage';
const STORE = 'guest-images';
const VERSION = 2;

function nativeStorage() {
  return window.MTP2026NativeGuestStorage || null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('GUEST_STORAGE_OPEN_FAILED'));
  });
}

async function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  throw new TypeError('GUEST_IMAGE_BYTES_REQUIRED');
}

export async function saveGuestImage(id, image, metadata = {}) {
  const bytes = await toUint8Array(image);
  const native = nativeStorage();
  if (native?.saveImage) return native.saveImage(id, bytes.buffer, { ...metadata, byteLength: bytes.byteLength });
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      bytes,
      metadata: { ...metadata, byteLength: bytes.byteLength, updatedAt: new Date().toISOString() },
    }, `${id}:image`);
    tx.oncomplete = () => { db.close(); resolve({ id, byteLength: bytes.byteLength }); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('GUEST_IMAGE_SAVE_FAILED')); };
  });
}

export async function loadGuestImage(id) {
  const native = nativeStorage();
  if (native?.loadImage) {
    const result = await native.loadImage(id);
    if (!result) return null;
    return { bytes: await toUint8Array(result.bytes || result), metadata: result.metadata || {} };
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(`${id}:image`);
    request.onsuccess = () => {
      db.close();
      const value = request.result;
      resolve(value ? { bytes: new Uint8Array(value.bytes), metadata: value.metadata || {} } : null);
    };
    request.onerror = () => { db.close(); reject(request.error || new Error('GUEST_IMAGE_LOAD_FAILED')); };
  });
}

export async function removeGuestImage(id) {
  const native = nativeStorage();
  if (native?.removeImage) return native.removeImage(id);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(`${id}:image`);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('GUEST_IMAGE_REMOVE_FAILED')); };
  });
}

export async function inspectGuestImage(id) {
  const image = await loadGuestImage(id);
  if (!image) return null;
  return { id, byteLength: image.bytes.byteLength, metadata: image.metadata };
}

window.MTP2026GuestImageStore = Object.freeze({ saveGuestImage, loadGuestImage, removeGuestImage, inspectGuestImage });
