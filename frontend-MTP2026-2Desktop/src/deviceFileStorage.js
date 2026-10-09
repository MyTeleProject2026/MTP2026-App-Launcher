/* Device-file content storage for the MTP2026 browser/PWA shell.
 * Bytes live in IndexedDB for this web origin, not on the Render server.
 * Browsers cannot silently enumerate or write arbitrary Android/iOS folders;
 * use the file picker to import and the download flow to export.
 */
const DB_NAME = 'mtp2026-device-files';
const STORE = 'files';
function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('DEVICE_FILE_STORAGE_UNAVAILABLE'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('DEVICE_FILE_STORAGE_OPEN_FAILED'));
  });
}
export async function saveDeviceFile(file) {
  const id = globalThis.crypto?.randomUUID?.() || `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, lastModified: file.lastModified || Date.now(), blob: file, savedAt: new Date().toISOString() };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve({ id, name: record.name, type: record.type, size: record.size, lastModified: record.lastModified, savedAt: record.savedAt }); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_SAVE_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_SAVE_ABORTED')); };
  });
}
export async function readDeviceFile(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error('DEVICE_FILE_READ_FAILED')); };
  });
}
export async function deleteDeviceFile(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_DELETE_FAILED')); };
  });
}
export async function getBrowserStorageEstimate() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    return { usage: Number.isFinite(estimate?.usage) ? estimate.usage : null, quota: Number.isFinite(estimate?.quota) ? estimate.quota : null, persistent: Boolean(persisted), source: 'browser-origin' };
  } catch {
    return { usage: null, quota: null, persistent: false, source: 'browser-origin' };
  }
}
