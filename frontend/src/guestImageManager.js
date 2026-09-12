/* MTP2026 real guest-image installer/downloader.
 * The control kernel is intentionally separate from guest OS images.
 * This module downloads/imports an actual ARM64 guest image, validates its
 * identity/integrity metadata, persists it through guestImageStore, and records
 * the install state for guestBootController.
 */

import { getGuestSystem } from './guestSystemRegistry.js';
import { getGuestImageContract } from './guestRuntimeManifest.js';
import { requestPersistentStorage, saveGuestMetadata, loadGuestMetadata } from './guestStorage.js';
import { installGuestImage as persistGuestImage } from './guestBootController.js';

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA256_UNAVAILABLE');
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

function emit(id, state, detail = {}) {
  window.dispatchEvent(new CustomEvent('mtp2026:guest-image', { detail: { id, state, ...detail } }));
}

export async function installGuestImageFromBytes(id, bytes, metadata = {}) {
  const system = getGuestSystem(id);
  if (!system.requiresImage) throw new Error('GUEST_IMAGE_NOT_REQUIRED');
  const contract = await getGuestImageContract(system.id);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.byteLength) throw new Error('GUEST_IMAGE_EMPTY');
  const digest = await sha256(data.buffer);
  const expected = String(metadata.sha256 || metadata.imageSha256 || '').toLowerCase();
  if (expected && expected !== digest) throw new Error('GUEST_IMAGE_SHA256_MISMATCH');

  await requestPersistentStorage();
  emit(system.id, 'installing', { byteLength: data.byteLength, sha256: digest });
  const result = await persistGuestImage(system.id, data, {
    ...metadata,
    guestId: system.id,
    architecture: 'arm64',
    imageKind: contract.imageKind,
    bootProtocol: contract.bootProtocol,
    sha256: digest,
  });

  await saveGuestMetadata(system.id, {
    ...(await loadGuestMetadata(system.id).catch(() => null)),
    guestId: system.id,
    architecture: 'arm64',
    imageKind: contract.imageKind,
    bootProtocol: contract.bootProtocol,
    sha256: digest,
    image: { stored: true, byteLength: data.byteLength },
    status: 'installed',
  });
  emit(system.id, 'installed', { byteLength: data.byteLength, sha256: digest });
  return { ...result, sha256: digest, contract };
}

export async function downloadGuestImage(id, url, metadata = {}, onProgress) {
  const system = getGuestSystem(id);
  if (!system.requiresImage) throw new Error('GUEST_IMAGE_NOT_REQUIRED');
  const target = new URL(String(url), window.location.href);
  if (target.protocol !== 'https:' && target.origin !== window.location.origin) throw new Error('GUEST_IMAGE_HTTPS_REQUIRED');

  emit(system.id, 'downloading', { url: target.toString() });
  const response = await fetch(target, { cache: 'no-store', credentials: target.origin === window.location.origin ? 'same-origin' : 'omit' });
  if (!response.ok) throw new Error(`GUEST_IMAGE_DOWNLOAD_${response.status}`);

  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  const chunks = [];
  let received = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.({ received, total, progress: total ? received / total : null });
        emit(system.id, 'downloading', { received, total });
      }
    }
  } else {
    const buffer = await response.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    received = buffer.byteLength;
    onProgress?.({ received, total: received, progress: 1 });
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return installGuestImageFromBytes(system.id, bytes, { ...metadata, sourceUrl: target.toString() });
}

export async function guestImageStatus(id) {
  const metadata = await loadGuestMetadata(id).catch(() => null);
  return metadata?.status === 'installed' ? metadata : { id, status: 'missing' };
}

window.MTP2026GuestImageManager = Object.freeze({
  installGuestImageFromBytes,
  downloadGuestImage,
  guestImageStatus,
});
