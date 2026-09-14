/* MTP2026 guest-system registry.
 * Four selectable guest profiles are independent image/runtime contracts.
 * The bundled ARM64 control kernel is NOT an Android/iOS/Windows kernel.
 * The ios slot is the MTP2026 Device OS profile and is not Apple firmware.
 */

export const GUEST_SYSTEMS = Object.freeze({
  android: Object.freeze({
    id: 'android', name: 'MTP2026 Android OS', architecture: 'arm64', class: 'mobile', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: true,
    installSlot: 'android', bootProtocol: 'linux-arm64-guest', runtimeBackend: 'native-vm-or-wasm-emulator', profileBrand: 'MTP2026 Android OS',
    identityProvider: 'VexaAccount', applicationStore: 'VexaStore'
  }),
  ios: Object.freeze({
    id: 'ios', name: 'MTP2026 Device OS', architecture: 'arm64', class: 'mobile', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: true,
    installSlot: 'ios', bootProtocol: 'mtp2026-arm64-guest', runtimeBackend: 'native-vm-or-wasm-emulator', profileBrand: 'MTP2026 Device OS',
    identityProvider: 'VexaAccount', applicationStore: 'VexaStore', notAppleFirmware: true
  }),
  windows11: Object.freeze({
    id: 'windows11', name: 'MTP2026 Desktop OS', architecture: 'arm64', class: 'desktop', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: true,
    installSlot: 'windows11', bootProtocol: 'mtp2026-desktop-arm64-guest', runtimeBackend: 'native-vm-or-wasm-emulator', profileBrand: 'MTP2026 Desktop OS',
    identityProvider: 'VexaAccount', applicationStore: 'VexaStore', inspiredBy: 'Windows-style desktop UX', notMicrosoftFirmware: true
  }),
  gaming: Object.freeze({
    id: 'gaming', name: 'MTP2026 Gaming OS', architecture: 'arm64', class: 'gaming', imageKind: 'mtp2026-owned-arm64-linux-profile', requiresImage: true,
    installSlot: 'gaming', bootProtocol: 'mtp2026-gaming-arm64-guest', runtimeBackend: 'native-vm-or-wasm-emulator', profileBrand: 'MTP2026 Gaming OS',
    identityProvider: 'VexaAccount', applicationStore: 'VexaStore', inspiredBy: 'gaming-console UX'
  }),
});

export function normalizeGuestSystem(value) {
  const id = value === 'windows' ? 'windows11' : value;
  return GUEST_SYSTEMS[id] ? id : 'android';
}

export function getGuestSystem(value) { return GUEST_SYSTEMS[normalizeGuestSystem(value)]; }
export function listGuestSystems() { return Object.values(GUEST_SYSTEMS); }

export function getGuestRequirements(value) {
  const system = getGuestSystem(value);
  return {
    id: system.id, name: system.name, architecture: system.architecture, imageKind: system.imageKind, requiresImage: system.requiresImage,
    nativeExecutionRequired: true, browserExecution: system.runtimeBackend, installSlot: system.installSlot,
    bootProtocol: system.bootProtocol, runtimeBackend: system.runtimeBackend, profileBrand: system.profileBrand,
    identityProvider: system.identityProvider || null, applicationStore: system.applicationStore || null,
    notAppleFirmware: Boolean(system.notAppleFirmware), notMicrosoftFirmware: Boolean(system.notMicrosoftFirmware),
  };
}
