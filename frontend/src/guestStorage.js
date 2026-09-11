/* Cross-host guest storage layer.
 * Web: OPFS when available, otherwise IndexedDB.
 * Native: delegates to MTP2026NativeGuestStorage when supplied by the APK/desktop host.
 * No permission is requested merely to render the launcher; storage access happens
 * only when the user starts a guest installation/download.
 */

const DB_NAME = 'mtp2026-guest-storage';
const STORE = 'guest-images';
const VERSION = 1;

function nativeStorage() {
  return window.MTP2026NativeGuestStorage || null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('GUEST_STORAGE_OPEN_FAILED'));
  });
}

export async function storageCapabilities() {
  const native = nativeStorage();
  return {
    native: Boolean(native),
    opfs: Boolean(navigator.storage?.getDirectory),
    indexedDb: 'indexedDB' in window,
    persistentStorage: Boolean(navigator.storage?.persist),
  };
}

export async function requestPersistentStorage() {
  const native = nativeStorage();
  if (native?.requestPermission) return native.requestPermission();
  if (navigator.storage?.persist) return navigator.storage.persist();
  return false;
}

export async function saveGuestMetadata(id, metadata) {
  const native = nativeStorage();
  if (native?.saveMetadata) return native.saveMetadata(id, metadata);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...metadata, id, updatedAt: new Date().toISOString() }, `${id}:metadata`);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('GUEST_METADATA_SAVE_FAILED')); };
  });
}

export async function loadGuestMetadata(id) {
  const native = nativeStorage();
  if (native?.loadMetadata) return native.loadMetadata(id);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(`${id}:metadata`);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error('GUEST_METADATA_LOAD_FAILED')); };
  });
}

export async function removeGuestMetadata(id) {
  const native = nativeStorage();
  if (native?.removeMetadata) return native.removeMetadata(id);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(`${id}:metadata`);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('GUEST_METADATA_REMOVE_FAILED')); };
  });
}
