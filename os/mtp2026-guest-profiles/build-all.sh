#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"

# Keep the existing five-profile build as the default for the normal launcher
# build. Release workflows can provide a space-separated subset when they only
# need the physical-test profiles, avoiding an unnecessary fifth guest build.
BUILD_PROFILES="${MTP2026_BUILD_PROFILES:-mtp2026 android ios windows11 gaming}"

for profile in ${BUILD_PROFILES}; do
  echo "=== Building ${profile} ==="
  MTP2026_PROFILE="$profile" bash "${BUILD_ROOT}/build.sh"
done

MANIFEST="${BUILD_ROOT}/out/artifacts/mtp2026-arm64-guest-manifest.json"
cat > "$MANIFEST" <<'EOF'
{
  "schema": "mtp2026-guest-runtime-v6",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "controlKernel": {"id":"mtp2026-control-kernel","role":"launcher-control-plane","realOs":false},
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
    "androidLineageQemu": {"type":"published-github-project-reference","repository":"jqssun/android-lineage-qemu","url":"https://github.com/jqssun/android-lineage-qemu","role":"optional-Android-ARM64-reference-media","bundled":false},
    "androidGsiReference": {"type":"official-source-reference","url":"https://developer.android.com/topic/generic-system-image/releases","role":"official-Android-ARM64-reference-media","bundled":false},
    "gamingBatocera": {"type":"published-github-project-reference","repository":"batocera-linux/batocera.linux","url":"https://github.com/batocera-linux/batocera.linux","role":"optional-ARM64-gaming-Linux-reference","bundled":false},
    "windows11Arm64Reference": {"type":"official-source-reference","url":"https://www.microsoft.com/software-download/windows11arm64","role":"user-obtained-licensed-Windows-ARM64-reference","bundled":false},
    "appleIOSReference": {"type":"platform-restricted-reference","role":"Apple-authorized/native-environment-only","bundled":false}
  },
  "guests": {
    "mtp2026": {"id":"mtp2026","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"mtp2026","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-native-host-installer"},
    "android": {"id":"android","name":"MTP2026 Android OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"android","runtimeSource":"mtp2026Arm64","externalOsReference":"Android ARM64 GSI","externalOsReferenceUrl":"https://developer.android.com/topic/generic-system-image/releases","profileFamily":"Android-style","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-package-installer"},
    "ios": {"id":"ios","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"ios","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore","notAppleFirmware":true,"appRuntime":"webapp-registry"},
    "windows11": {"id":"windows11","name":"MTP2026 Desktop OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"windows11","runtimeSource":"mtp2026Arm64","externalOsReference":"Microsoft Windows 11 ARM64","externalOsReferenceUrl":"https://www.microsoft.com/software-download/windows11arm64","profileFamily":"Desktop-style","profileLayout":"desktop","accountProvider":"VexaAccount","appStore":"VexaStore","notMicrosoftFirmware":true,"appRuntime":"webapp-registry-plus-host-installer"},
    "gaming": {"id":"gaming","name":"MTP2026 Gaming OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"gaming","runtimeSource":"mtp2026Arm64","externalOsReference":"Batocera ARM64 gaming Linux","externalOsReferenceUrl":"https://github.com/batocera-linux/batocera.linux","profileFamily":"Gaming-style","profileLayout":"gaming","accountProvider":"VexaAccount","appStore":"VexaStore","appRuntime":"webapp-registry-plus-host-installer"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
