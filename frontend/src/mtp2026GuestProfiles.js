/* MTP2026 guest OS personality registry. These are MTP2026-owned operating-system shells running on top of the ARM64 guest/runtime layer. They intentionally do not impersonate proprietary firmware. */

export const MTP2026_GUEST_PROFILES = Object.freeze({
  mtp2026: { id:'mtp2026', label:'MTP2026 Device OS', shortLabel:'MTP2026', family:'MTP2026', layout:'mobile', navigation:'gesture', accent:'#12c8ff', features:['VexaAccount','VexaStore','Files','Control Center','Vexa Apps'] },
  ios: { id:'ios', label:'MTP2026 Device OS', shortLabel:'MTP2026', family:'MTP2026', layout:'mobile', navigation:'gesture', accent:'#12c8ff', features:['VexaAccount','VexaStore','Files','Control Center','Vexa Apps'] },
  android: { id:'android', label:'MTP2026 Android OS', shortLabel:'Android', family:'Android-style', layout:'mobile', navigation:'three-button-or-gesture', accent:'#3ddc84', features:['App Drawer','Quick Settings','VexaAccount','VexaStore','APK handoff'] },
  windows: { id:'windows', label:'MTP2026 Desktop OS', shortLabel:'MTP2026 Desktop', family:'Desktop-style', layout:'desktop', navigation:'taskbar', accent:'#4aa8ff', features:['Start Menu','Taskbar','File Explorer','VexaAccount','VexaStore'] },
  windows11: { id:'windows11', label:'MTP2026 Desktop OS', shortLabel:'MTP2026 Desktop', family:'Desktop-style', layout:'desktop', navigation:'taskbar', accent:'#4aa8ff', features:['Start Menu','Taskbar','File Explorer','VexaAccount','VexaStore'] },
  gaming: { id:'gaming', label:'MTP2026 Gaming OS', shortLabel:'MTP Gaming', family:'Gaming-style', layout:'gaming', navigation:'controller', accent:'#ff3d81', features:['Game Library','Performance Overlay','Controller Center','VexaAccount','VexaStore'] },
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
