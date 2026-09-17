#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"

# Four user-facing profiles are canonical. The legacy ios alias may still be
# explicitly requested by older physical-test workflows, but is never exposed
# as a fifth selectable MTP2026 OS.
BUILD_PROFILES="${MTP2026_BUILD_PROFILES:-mtp2026 android windows11 gaming}"

for profile in ${BUILD_PROFILES}; do
  echo "=== Building ${profile} ==="
  MTP2026_PROFILE="$profile" bash "${BUILD_ROOT}/build.sh"
done

MANIFEST="${BUILD_ROOT}/out/artifacts/mtp2026-arm64-guest-manifest.json"
cat > "$MANIFEST" <<'EOF'
{
  "schema": "mtp2026-guest-runtime-v7",
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
    "qemuWasmAarch64": {"type":"github-source","repository":"ktock/qemu-wasm","url":"https://github.com/ktock/qemu-wasm","role":"browser-AArch64-system-emulator"},
    "androidGsiReference": {"type":"official-source-reference","url":"https://developer.android.com/topic/generic-system-image/releases","role":"optional-user-obtained-Android-ARM64-reference-media","bundled":false},
    "gamingBatocera": {"type":"published-github-project-reference","repository":"batocera-linux/batocera.linux","url":"https://github.com/batocera-linux/batocera.linux","role":"optional-ARM64-gaming-Linux-reference","bundled":false},
    "windows11Arm64Reference": {"type":"official-source-reference","url":"https://www.microsoft.com/software-download/windows11arm64","role":"optional-user-obtained-licensed-Windows-ARM64-reference","bundled":false},
    "appleIOSReference": {"type":"platform-restricted-reference","role":"Apple-authorized/native-environment-only","bundled":false}
  },
  "guests": {
    "mtp2026": {"id":"mtp2026","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"mtp2026","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","navigation":"gesture","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-native-host-installer"},
    "android": {"id":"android","name":"MTP2026 Android OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"android","runtimeSource":"mtp2026Arm64","externalOsReference":"Android ARM64 GSI","externalOsReferenceUrl":"https://developer.android.com/topic/generic-system-image/releases","profileFamily":"Android-style","profileLayout":"mobile","navigation":"gesture-or-three-button","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-package-installer"},
    "windows11": {"id":"windows11","name":"MTP2026 Desktop OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"windows11","runtimeSource":"mtp2026Arm64","externalOsReference":"Microsoft Windows 11 ARM64","externalOsReferenceUrl":"https://www.microsoft.com/software-download/windows11arm64","profileFamily":"Desktop-style","profileLayout":"desktop","navigation":"taskbar","accountProvider":"VexaAccount","appStore":"VexaStore","notMicrosoftFirmware":true,"appRuntime":"webapp-registry-plus-host-installer"},
    "gaming": {"id":"gaming","name":"MTP2026 Gaming OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"gaming","runtimeSource":"mtp2026Arm64","externalOsReference":"ARM64 gaming Linux reference","externalOsReferenceUrl":"https://github.com/batocera-linux/batocera.linux","profileFamily":"Gaming-style","profileLayout":"gaming","navigation":"controller","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-installer"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
