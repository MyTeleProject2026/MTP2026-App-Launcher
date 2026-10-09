/* MTP2026 device-file storage.
 * Native Capacitor builds write a copy to the app's Documents/MTP2026 folder.
 * Web/PWA builds use IndexedDB for this origin and browser download/export.
 * Neither path silently grants unrestricted access to arbitrary device folders.
 */
const DB_NAME = 'mtp2026-device-files';
const STORE = 'files';
const NATIVE_ROOT = 'MTP2026/Files';
let filesystemPromise;

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
function nativeCapable() {
  const cap = globalThis.Capacitor;
  try {
    if (typeof cap?.isNativePlatform === 'function') return cap.isNativePlatform();
    if (typeof cap?.getPlatform === 'function') return cap.getPlatform() !== 'web';
  } catch (_) {}
  return false;
}
async function nativeFilesystem() {
  if (!nativeCapable()) return null;
  filesystemPromise ||= import('@capacitor/filesystem').then(module => {
    if (!module?.Filesystem || !module?.Directory?.Documents) throw new Error('CAPACITOR_FILESYSTEM_UNAVAILABLE');
    return { fs: module.Filesystem, Directory: module.Directory };
  });
  return filesystemPromise;
}
function safeFileName(name) {
  const clean = String(name || 'file').replaceAll('/', '_').replaceAll(String.fromCharCode(92), '_').replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, '_').slice(0, 180);
  return clean || 'file';
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function saveNativeCopy(file, id) {
  const native = await nativeFilesystem();
  if (!native) return null;
  const path = `${NATIVE_ROOT}/${id}-${safeFileName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await native.fs.mkdir({ path: NATIVE_ROOT, directory: native.Directory.Documents, recursive: true }).catch(() => {});
  await native.fs.writeFile({
    path,
    data: bytesToBase64(bytes),
    directory: native.Directory.Documents,
    recursive: true,
  });
  return { path, directory: 'Documents', source: 'capacitor-documents' };
}
async function readNativeCopy(record) {
  if (!record?.nativePath) return null;
  const native = await nativeFilesystem();
  if (!native) return null;
  const result = await native.fs.readFile({ path: record.nativePath, directory: native.Directory.Documents });
  const bytes = base64ToBytes(result.data);
  return new Blob([bytes], { type: record.type || 'application/octet-stream' });
}
function storeRecord(record) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_SAVE_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_SAVE_ABORTED')); };
  }));
}
export async function saveDeviceFile(file) {
  const id = globalThis.crypto?.randomUUID?.() || `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let native = null;
  let nativeError = null;
  try { native = await saveNativeCopy(file, id); } catch (error) { nativeError = String(error?.message || error); }
  const record = {
    id, name: file.name, type: file.type || 'application/octet-stream',
    size: file.size, lastModified: file.lastModified || Date.now(),
    blob: file, nativePath: native?.path || null, savedAt: new Date().toISOString(),
  };
  await storeRecord(record);
  return {
    id, name: record.name, type: record.type, size: record.size,
    lastModified: record.lastModified, savedAt: record.savedAt,
    storage: native ? native.source : 'browser-origin',
    nativePath: native?.path || null,
    nativeError,
  };
}
export async function readDeviceFile(id) {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('DEVICE_FILE_READ_FAILED'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('DEVICE_FILE_READ_FAILED')); };
  });
  if (!record) return null;
  try {
    const nativeBlob = await readNativeCopy(record);
    if (nativeBlob) return { ...record, blob: nativeBlob };
  } catch (_) {
    // The IndexedDB copy remains a safe fallback if native storage was cleared.
  }
  return record;
}
export async function deleteDeviceFile(id) {
  const existing = await readDeviceFile(id).catch(() => null);
  if (existing?.nativePath) {
    try {
      const native = await nativeFilesystem();
      if (native) await native.fs.deleteFile({ path: existing.nativePath, directory: native.Directory.Documents });
    } catch (_) {}
  }
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
    return {
      usage: Number.isFinite(estimate?.usage) ? estimate.usage : null,
      quota: Number.isFinite(estimate?.quota) ? estimate.quota : null,
      persistent: Boolean(persisted),
      source: 'browser-origin',
      nativeFilesystem: nativeCapable(),
    };
  } catch {
    return { usage: null, quota: null, persistent: false, source: 'browser-origin', nativeFilesystem: nativeCapable() };
  }
}
