/* MTP2026 guest-system registry.
 * Four selectable guest profiles are independent image/runtime contracts.
 * The bundled ARM64 control kernel is NOT an Android/iOS/Windows kernel.
 * A profile becomes a real OS guest only after its matching image is installed
 * and an execution provider accepts that image.
 */

export const GUEST_SYSTEMS = Object.freeze({
  android: Object.freeze({
    id: 'android',
    name: 'Android',
    architecture: 'arm64',
    class: 'mobile',
    imageKind: 'real-os-image',
    requiresImage: true,
    installSlot: 'android',
    bootProtocol: 'linux-arm64-guest',
    runtimeBackend: 'native-vm-or-wasm-emulator',
  }),
  ios: Object.freeze({
    id: 'ios',
    name: 'iOS',
    architecture: 'arm64',
    class: 'mobile',
    imageKind: 'real-os-image',
    requiresImage: true,
    installSlot: 'ios',
    bootProtocol: 'apple-arm64-guest',
    runtimeBackend: 'native-vm-or-wasm-emulator',
  }),
  windows11: Object.freeze({
    id: 'windows11',
    name: 'Windows 11',
    architecture: 'arm64',
    class: 'desktop',
    imageKind: 'real-os-image',
    requiresImage: true,
    installSlot: 'windows11',
    bootProtocol: 'uefi-arm64-guest',
    runtimeBackend: 'native-vm-or-wasm-emulator',
  }),
  gaming: Object.freeze({
    id: 'gaming',
    name: 'Gaming OS',
    architecture: 'arm64',
    class: 'gaming',
    imageKind: 'real-os-image',
    requiresImage: true,
    installSlot: 'gaming',
    bootProtocol: 'uefi-or-linux-arm64-guest',
    runtimeBackend: 'native-vm-or-wasm-emulator',
  }),
});

export function normalizeGuestSystem(value) {
  const id = value === 'windows' ? 'windows11' : value;
  return GUEST_SYSTEMS[id] ? id : 'android';
}

export function getGuestSystem(value) {
  return GUEST_SYSTEMS[normalizeGuestSystem(value)];
}

export function listGuestSystems() {
  return Object.values(GUEST_SYSTEMS);
}

export function getGuestRequirements(value) {
  const system = getGuestSystem(value);
  return {
    id: system.id,
    architecture: system.architecture,
    imageKind: system.imageKind,
    requiresImage: system.requiresImage,
    nativeExecutionRequired: true,
    browserExecution: system.runtimeBackend,
    installSlot: system.installSlot,
    bootProtocol: system.bootProtocol,
    runtimeBackend: system.runtimeBackend,
  };
}
