/* MTP2026 guest-system registry.
 *
 * The four selectable profiles are MTP2026-owned Web-OS personalities.
 * They share the ARM64 control/runtime foundation but do NOT require a
 * separate disk image just to launch the web guest shell. Native VM images
 * remain optional for hosts that provide a real ARM64 VM/emulator backend.
 *
 * The ios slot is MTP2026 Device OS and is not Apple firmware.
 */

const COMMON = {
  architecture: 'arm64',
  machine: 'qemu-aarch64-virt',
  identityProvider: 'VexaAccount',
  applicationStore: 'VexaStore',
  appRuntime: 'webapp-registry-plus-native-host-installer',
  runtimeBackend: 'native-vm-or-wasm-emulator',
  storageBackend: 'mtp2026-native-storage-or-opfs',
  networkStack: 'guest-network-through-host-runtime',
  updateChannel: 'MTP2026 managed profile updates',
};

export const GUEST_SYSTEMS = Object.freeze({
  android: Object.freeze({
    ...COMMON,
    id: 'android', name: 'MTP2026 Android OS', class: 'mobile', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: false, optionalNativeImage: true,
    installSlot: 'android', bootProtocol: 'mtp2026-android-arm64-webos', profileBrand: 'MTP2026 Android OS', profileFamily: 'Android-style',
    profileLayout: 'mobile', navigation: 'gesture-or-three-button',
    externalReference: 'https://github.com/jqssun/android-lineage-qemu',
    nativePackagePolicy: 'MTP2026 WebApp runtime by default. Android APK installation is available only through a real/native Android host PackageInstaller.',
  }),
  ios: Object.freeze({
    ...COMMON,
    id: 'ios', name: 'MTP2026 Device OS', class: 'mobile', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: false, optionalNativeImage: true,
    installSlot: 'ios', bootProtocol: 'mtp2026-device-arm64-webos', profileBrand: 'MTP2026 Device OS', profileFamily: 'MTP2026',
    profileLayout: 'mobile', navigation: 'gesture', notAppleFirmware: true,
    nativePackagePolicy: 'MTP2026 WebApp runtime. Apple-authorized native distribution is required for native Apple packages.',
  }),
  windows11: Object.freeze({
    ...COMMON,
    id: 'windows11', name: 'MTP2026 Desktop OS', class: 'desktop', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: false, optionalNativeImage: true,
    installSlot: 'windows11', bootProtocol: 'mtp2026-desktop-arm64-webos', profileBrand: 'MTP2026 Desktop OS', profileFamily: 'Desktop-style',
    profileLayout: 'desktop', navigation: 'taskbar', notMicrosoftFirmware: true,
    externalReference: 'https://www.microsoft.com/software-download/windows11arm64',
    nativePackagePolicy: 'MTP2026 WebApp runtime. Licensed Windows packages require a user-owned licensed Windows host/VM.',
  }),
  gaming: Object.freeze({
    ...COMMON,
    id: 'gaming', name: 'MTP2026 Gaming OS', class: 'gaming', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: false, optionalNativeImage: true,
    installSlot: 'gaming', bootProtocol: 'mtp2026-gaming-arm64-webos', profileBrand: 'MTP2026 Gaming OS', profileFamily: 'Gaming-style',
    profileLayout: 'gaming', navigation: 'controller',
    externalReference: 'https://github.com/batocera-linux/batocera.linux',
    nativePackagePolicy: 'MTP2026 WebApp runtime by default; compatible native gaming images require a supported host/runtime.',
  }),
});

export function normalizeGuestSystem(value) {
  const id = value === 'windows' ? 'windows11' : value === 'ios-device' ? 'ios' : value;
  return GUEST_SYSTEMS[id] ? id : 'android';
}

export function getGuestSystem(value) { return GUEST_SYSTEMS[normalizeGuestSystem(value)]; }
export function listGuestSystems() { return Object.values(GUEST_SYSTEMS); }

export function getGuestRequirements(value) {
  const system = getGuestSystem(value);
  return {
    id: system.id,
    name: system.name,
    architecture: system.architecture,
    machine: system.machine,
    imageKind: system.imageKind,
    requiresImage: system.requiresImage,
    optionalNativeImage: Boolean(system.optionalNativeImage),
    nativeExecutionRequired: false,
    browserExecution: system.runtimeBackend,
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
    externalReference: system.externalReference || null,
    nativePackagePolicy: system.nativePackagePolicy,
    notAppleFirmware: Boolean(system.notAppleFirmware),
    notMicrosoftFirmware: Boolean(system.notMicrosoftFirmware),
  };
}
