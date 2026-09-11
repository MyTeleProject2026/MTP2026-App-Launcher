/* MTP2026 guest-system registry.
 * Each selectable profile targets an ARM64 guest runtime. The profile itself
 * contains the guest identity and execution contract; the selected runtime
 * supplies the actual guest image/kernel and storage.
 */

export const GUEST_SYSTEMS = Object.freeze({
  android: Object.freeze({
    id: 'android',
    name: 'Android',
    architecture: 'arm64',
    class: 'mobile',
    requiresImage: false,
    runtimeImage: 'mtp2026-arm64-kernel',
  }),
  ios: Object.freeze({
    id: 'ios',
    name: 'iOS',
    architecture: 'arm64',
    class: 'mobile',
    requiresImage: false,
    runtimeImage: 'mtp2026-arm64-kernel',
  }),
  windows11: Object.freeze({
    id: 'windows11',
    name: 'Windows 11',
    architecture: 'arm64',
    class: 'desktop',
    requiresImage: false,
    runtimeImage: 'mtp2026-arm64-kernel',
  }),
  gaming: Object.freeze({
    id: 'gaming',
    name: 'Gaming OS',
    architecture: 'arm64',
    class: 'gaming',
    requiresImage: false,
    runtimeImage: 'mtp2026-arm64-kernel',
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
    requiresImage: system.requiresImage,
    nativeExecutionRequired: true,
    browserExecution: 'unicorn-js-wasm-worker',
    runtimeImage: system.runtimeImage,
  };
}
