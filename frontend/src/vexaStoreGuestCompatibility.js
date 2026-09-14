/* Unified VexaStore capability contract for the four MTP2026 guest profiles. */

export const VEXASTORE_GUEST_CAPABILITIES = Object.freeze({
  ios: Object.freeze({
    profile: 'MTP2026 Device OS',
    webApp: true,
    pwa: true,
    apk: false,
    nativePackage: false,
    behavior: 'webapp-pwa',
  }),
  android: Object.freeze({
    profile: 'Android-style ARM64',
    webApp: true,
    pwa: true,
    apk: true,
    nativePackage: true,
    behavior: 'webapp-or-apk',
  }),
  windows11: Object.freeze({
    profile: 'Windows 11-style ARM64',
    webApp: true,
    pwa: true,
    apk: false,
    nativePackage: true,
    behavior: 'desktop-webapp-or-native',
  }),
  gaming: Object.freeze({
    profile: 'Gaming OS',
    webApp: true,
    pwa: true,
    apk: false,
    nativePackage: true,
    behavior: 'gaming-webapp-or-native',
  }),
});

export function normalizeGuestId(id) {
  if (id === 'windows') return 'windows11';
  return VEXASTORE_GUEST_CAPABILITIES[id] ? id : 'android';
}

export function getVexaStoreGuestCapabilities(id) {
  return VEXASTORE_GUEST_CAPABILITIES[normalizeGuestId(id)];
}

export function canInstallVexaStoreArtifact(id, artifactType) {
  const capability = getVexaStoreGuestCapabilities(id);
  if (artifactType === 'web' || artifactType === 'pwa') return capability.webApp;
  if (artifactType === 'apk') return capability.apk;
  if (artifactType === 'native') return capability.nativePackage;
  return false;
}

window.MTP2026VexaStoreGuestCompatibility = Object.freeze({
  VEXASTORE_GUEST_CAPABILITIES,
  normalizeGuestId,
  getVexaStoreGuestCapabilities,
  canInstallVexaStoreArtifact,
});
