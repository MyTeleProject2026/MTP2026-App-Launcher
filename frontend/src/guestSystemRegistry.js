/* MTP2026 guest-system registry.
 *
 * A system profile describes a real guest target, not a fake browser skin. The
 * launcher only marks a guest as bootable when a native/VM provider is able to
 * execute it. Proprietary Windows/iOS images are never bundled or fabricated.
 */

export const GUEST_SYSTEMS = Object.freeze({
  android: Object.freeze({
    id: 'android',
    name: 'Android',
    architecture: 'arm64',
    class: 'mobile',
    requiresImage: true,
    legalImage: 'user-supplied-or-licensed',
  }),
  ios: Object.freeze({
    id: 'ios',
    name: 'iOS',
    architecture: 'arm64',
    class: 'mobile',
    requiresImage: true,
    legalImage: 'user-supplied-or-licensed',
  }),
  windows11: Object.freeze({
    id: 'windows11',
    name: 'Windows 11',
    architecture: 'arm64',
    class: 'desktop',
    requiresImage: true,
    legalImage: 'user-supplied-or-licensed',
  }),
  gaming: Object.freeze({
    id: 'gaming',
    name: 'Gaming OS',
    architecture: 'arm64',
    class: 'gaming',
    requiresImage: true,
    legalImage: 'open-source-or-user-supplied',
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
    browserExecution: 'provider-dependent',
    note: system.legalImage,
  };
}
