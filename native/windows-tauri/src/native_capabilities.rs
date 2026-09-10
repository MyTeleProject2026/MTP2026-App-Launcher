use std::collections::BTreeMap;

/// Returns the platform capabilities that the Windows native shell exposes.
/// The web layer must use this information instead of assuming browser APIs exist.
pub fn capabilities() -> BTreeMap<&'static str, bool> {
    BTreeMap::from([
        ("native", true),
        ("filesystem", true),
        ("notifications", true),
        ("clipboard", true),
        ("external_apps", true),
        ("gamepad", true),
        ("window_controls", true),
        ("fullscreen", true),
    ])
}
