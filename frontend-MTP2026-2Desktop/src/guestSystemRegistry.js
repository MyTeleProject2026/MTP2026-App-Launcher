/* Dedicated MTP2026 Desktop OS runtime registry.
 * This frontend and its native packages expose one OS profile only: desktop.
 * Legacy mode identifiers are normalized to desktop so an old persisted
 * launcher selection can never switch this application into another shell.
 */
const DESKTOP_SYSTEM = Object.freeze({
  id: 'desktop',
  name: 'MTP2026 Desktop OS',
  class: 'desktop',
  architecture: 'arm64',
  machine: 'qemu-aarch64-virt',
  imageKind: 'mtp2026-owned-arm64-linux-profile',
  requiresImage: true,
  optionalNativeImage: false,
  installSlot: 'desktop',
  bootProtocol: 'mtp2026-desktop-arm64-webos',
  profileBrand: 'MTP2026 Desktop OS',
  profileFamily: 'MTP2026 Desktop-style',
  profileLayout: 'desktop',
  navigation: 'taskbar',
  identityProvider: 'VexaAccount',
  applicationStore: 'VexaStore',
  appRuntime: 'webapp-registry-plus-native-host-installer',
  runtimeBackend: 'native-vm-or-wasm-emulator',
  storageBackend: 'mtp2026-native-storage-or-opfs',
  networkStack: 'guest-network-through-host-runtime',
  updateChannel: 'MTP2026 Desktop OS managed updates',
  browserApp: Object.freeze({
    id: 'mtp2026-browser',
    name: 'MTP2026 Browser',
    engine: 'Chromium/WebView-compatible',
    embedded: true,
    supportsHttpsWebApps: true,
    supportsVexaAccountSso: true
  }),
  nativePackagePolicy: 'MTP2026 Desktop OS shell. Native package installation is delegated to the supported host platform.'
});

export const GUEST_SYSTEMS = Object.freeze({ desktop: DESKTOP_SYSTEM });

export function normalizeGuestSystem(_value) {
  return 'desktop';
}

export function getGuestSystem(_value) {
  return DESKTOP_SYSTEM;
}

export function listGuestSystems() {
  return [DESKTOP_SYSTEM];
}

export function getGuestRequirements(_value) {
  const system = DESKTOP_SYSTEM;
  return {
    id: system.id,
    name: system.name,
    architecture: system.architecture,
    machine: system.machine,
    imageKind: system.imageKind,
    requiresImage: system.requiresImage,
    optionalNativeImage: system.optionalNativeImage,
    nativeExecutionRequired: true,
    browserExecution: 'desktop-shell-with-optional-native-guest',
    installSlot: system.installSlot,
    bootProtocol: system.bootProtocol,
    runtimeBackend: system.runtimeBackend,
    profileBrand: system.profileBrand,
    profileFamily: system.profileFamily,
    profileLayout: system.profileLayout,
    navigation: system.navigation,
    identityProvider: system.identityProvider,
    applicationStore: system.applicationStore,
    appRuntime: system.appRuntime,
    storageBackend: system.storageBackend,
    networkStack: system.networkStack,
    updateChannel: system.updateChannel,
    nativePackagePolicy: system.nativePackagePolicy
  };
}
