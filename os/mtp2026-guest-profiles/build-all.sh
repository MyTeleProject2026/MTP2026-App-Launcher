#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"

# Four user-facing profiles are canonical. The legacy ios alias may still be
# explicitly requested by older physical-test workflows, but is never exposed
# as a fifth selectable MTP2026 OS.
BUILD_PROFILES="${MTP2026_BUILD_PROFILES:-mtp2026 android desktop gaming}"
BROWSER_RUNTIME="${ROOT}/mtp2026-linux-arm64/out/browser-runtime"

# Build one real ARM64 Chromium-compatible runtime and bake it into every guest image.
# CI enables this explicitly; local builds can disable it with MTP2026_BUILD_BROWSER_RUNTIME=0.
if [ "${MTP2026_BUILD_BROWSER_RUNTIME:-1}" = "1" ]; then
  bash "${ROOT}/../tools/build-arm64-browser-runtime.sh" "$BROWSER_RUNTIME"
fi

bash "${ROOT}/../tools/build-mtp2026-firmware.sh" "${BUILD_ROOT}/out/firmware"

for profile in ${BUILD_PROFILES}; do
  echo "=== Building ${profile} ==="
  MTP2026_PROFILE="$profile" MTP2026_BROWSER_RUNTIME_DIR="$BROWSER_RUNTIME" bash "${BUILD_ROOT}/build.sh"
  bash "${ROOT}/../tools/build-mtp2026-boot-disk.sh" "$profile"
done

MANIFEST="${BUILD_ROOT}/out/artifacts/mtp2026-arm64-guest-manifest.json"
cat > "$MANIFEST" <<'EOF'
{
  "schema": "mtp2026-guest-runtime-v8",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "controlKernel": {"id":"mtp2026-control-kernel","role":"launcher-control-plane","realOs":false},
  "osModel": {
    "owner":"MTP2026",
    "type":"MTP2026-owned-ARM64-guest-profiles",
    "kernelFoundation":"Linux 6.16 AArch64",
    "proprietaryFirmwareIncluded":false,
    "note":"The four profiles reproduce the requested interaction families and system contracts without redistributing proprietary Apple, Microsoft or ASUS/ROG firmware. Licensed/user-owned real guest images remain an optional native-VM path."
  },
  "applicationRuntime": {
    "identityProvider":"VexaAccount",
    "storeProvider":"VexaStore",
    "storeUrl":"https://www.vexastore.2bd.net/",
    "installProtocol":"MTP2026_VEXASTORE_INSTALL",
    "portableWebAppLayer":true,
    "nativePackageLayer":"host-installer-only"
  },
  "runtimeSources": {
    "mtp2026Arm64": {"type":"repository-source","repository":"MyTeleProject2026/MTP2026-App-Launcher","url":"https://github.com/MyTeleProject2026/MTP2026-App-Launcher","role":"MTP2026-owned-AArch64-Linux-guest-foundation"},
    "qemuWasmAarch64": {"type":"github-source","repository":"ktock/qemu-wasm","url":"https://github.com/ktock/qemu-wasm","role":"browser-AArch64-system-emulator"}
  },
  "guests": {
    "mtp2026": {"id":"mtp2026","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"mtp2026","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","navigation":"gesture","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-native-host-installer"},
    "android": {"id":"android","name":"MTP2026 Android OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"android","runtimeSource":"mtp2026Arm64","externalOsReference":"Android ARM64 GSI","externalOsReferenceUrl":"https://developer.android.com/topic/generic-system-image/releases","profileFamily":"Android-style","profileLayout":"mobile","navigation":"gesture-or-three-button","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-package-installer"},
    "desktop": {"id":"desktop","name":"MTP2026 Desktop OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"desktop","runtimeSource":"mtp2026Arm64","externalOsReference":"Microsoft MTP2026 Desktop ARM64","externalOsReferenceUrl":"https://www.microsoft.com/software-download/desktoparm64","profileFamily":"Desktop-style","profileLayout":"desktop","navigation":"taskbar","accountProvider":"VexaAccount","appStore":"VexaStore","notMicrosoftFirmware":true,"appRuntime":"webapp-registry-plus-host-installer"},
    "gaming": {"id":"gaming","name":"MTP2026 Gaming OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"gaming","runtimeSource":"mtp2026Arm64","externalOsReference":"ARM64 gaming Linux reference","externalOsReferenceUrl":"https://github.com/batocera-linux/batocera.linux","profileFamily":"Gaming-style","profileLayout":"gaming","navigation":"controller","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-installer"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
