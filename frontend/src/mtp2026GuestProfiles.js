/* MTP2026 guest OS personality registry.
 * These are MTP2026-owned operating-system shells. They provide familiar
 * interaction patterns while remaining distinct from proprietary firmware.
 */

export const MTP2026_GUEST_PROFILES = Object.freeze({
  mtp2026: {
    id:'mtp2026', label:'MTP2026 Device OS', shortLabel:'MTP2026', family:'MTP2026', layout:'mobile', navigation:'gesture', accent:'#12c8ff',
    features:['MTP2026 Home','VexaAccount','VexaStore','Files','Control Center','Vexa Apps','In-App WebApp Runtime']
  },
  ios: {
    id:'ios', label:'MTP2026 Device OS', shortLabel:'MTP2026', family:'MTP2026', layout:'mobile', navigation:'gesture', accent:'#12c8ff',
    features:['MTP2026 Home','VexaAccount','VexaStore','Files','Control Center','Vexa Apps','In-App WebApp Runtime']
  },
  android: {
    id:'android', label:'MTP2026 Android OS', shortLabel:'MTP Android', family:'MTP2026 Android', layout:'mobile', navigation:'three-button-or-gesture', accent:'#3ddc84',
    features:['Home','App Drawer','Quick Settings','VexaAccount','VexaStore','APK host handoff','In-App WebApp Runtime']
  },
  windows: {
    id:'windows', label:'MTP2026 Desktop OS', shortLabel:'MTP Desktop', family:'MTP2026 Desktop', layout:'desktop', navigation:'taskbar', accent:'#4aa8ff',
    features:['Desktop','Start Menu','Taskbar','File Explorer','VexaAccount','VexaStore','In-App WebApp Runtime']
  },
  windows11: {
    id:'windows11', label:'MTP2026 Desktop OS', shortLabel:'MTP Desktop', family:'MTP2026 Desktop', layout:'desktop', navigation:'taskbar', accent:'#4aa8ff',
    features:['Desktop','Start Menu','Taskbar','File Explorer','VexaAccount','VexaStore','In-App WebApp Runtime']
  },
  gaming: {
    id:'gaming', label:'MTP2026 Gaming OS', shortLabel:'MTP Gaming', family:'MTP2026 Gaming', layout:'gaming', navigation:'controller', accent:'#ff3d81',
    features:['Game Hub','Performance Overlay','Controller Center','VexaAccount','VexaStore','Game Library','In-App WebApp Runtime']
  },
});

export function normalizeMTP2026GuestProfile(mode) {
  const value = String(mode || '').toLowerCase();
  return MTP2026_GUEST_PROFILES[value] || MTP2026_GUEST_PROFILES.mtp2026;
}
export function getMTP2026GuestProfile(mode) { return normalizeMTP2026GuestProfile(mode); }
export function applyMTP2026GuestProfile(mode) {
  const profile = normalizeMTP2026GuestProfile(mode);
  const root = document.documentElement;
  root.dataset.mtpGuestProfile = profile.id;
  root.dataset.mtpGuestLayout = profile.layout;
  root.dataset.mtpGuestNavigation = profile.navigation;
  root.style.setProperty('--mtp-guest-accent', profile.accent);
  window.dispatchEvent(new CustomEvent('mtp2026:guest-profile-applied', { detail: profile }));
  return profile;
}
window.MTP2026GuestProfiles = Object.freeze({ profiles:MTP2026_GUEST_PROFILES, get:getMTP2026GuestProfile, apply:applyMTP2026GuestProfile });
