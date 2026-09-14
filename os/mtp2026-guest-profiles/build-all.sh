#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"

for profile in mtp2026 android ios windows11 gaming; do
  echo "=== Building ${profile} ==="
  MTP2026_PROFILE="$profile" bash "${BUILD_ROOT}/build.sh"
done

MANIFEST="${BUILD_ROOT}/out/artifacts/mtp2026-arm64-guest-manifest.json"
cat > "$MANIFEST" <<'EOF'
{
  "schema": "mtp2026-guest-runtime-v5",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "controlKernel": {"id":"mtp2026-control-kernel","role":"launcher-control-plane","realOs":false},
  "runtimeSources": {
    "mtp2026Arm64": {"type":"repository-artifact","repository":"MyTeleProject2026/MTP2026-App-Launcher","url":"https://github.com/MyTeleProject2026/MTP2026-App-Launcher"},
    "qemuWasmAarch64": {"type":"github-source","repository":"ktock/qemu-wasm","url":"https://github.com/ktock/qemu-wasm"},
    "androidGsiReference": {"type":"official-source-reference","url":"https://developer.android.com/topic/generic-system-image/releases"}
  },
  "guests": {
    "mtp2026": {"id":"mtp2026","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"mtp2026","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore"},
    "android": {"id":"android","name":"MTP2026 Android OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"android","runtimeSource":"mtp2026Arm64","externalOsReference":"Android ARM64 GSI","externalOsReferenceUrl":"https://developer.android.com/topic/generic-system-image/releases","profileFamily":"Android-style","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore"},
    "ios": {"id":"ios","name":"MTP2026 Device OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"ios","runtimeSource":"mtp2026Arm64","profileFamily":"MTP2026","profileLayout":"mobile","accountProvider":"VexaAccount","appStore":"VexaStore","notAppleFirmware":true},
    "windows11": {"id":"windows11","name":"MTP2026 Desktop OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"windows11","runtimeSource":"mtp2026Arm64","externalOsReference":"Microsoft Windows 11 ARM64","externalOsReferenceUrl":"https://www.microsoft.com/software-download/windows11arm64","profileFamily":"Desktop-style","profileLayout":"desktop","accountProvider":"VexaAccount","appStore":"VexaStore","notMicrosoftFirmware":true},
    "gaming": {"id":"gaming","name":"MTP2026 Gaming OS","architecture":"arm64","imageKind":"mtp2026-owned-arm64-linux-profile","imageRequired":true,"runtimeBackend":"qemu-aarch64-virt-or-native-qemu","bootProtocol":"linux-arm64-guest","installSlot":"gaming","runtimeSource":"mtp2026Arm64","profileFamily":"Gaming-style","profileLayout":"gaming","accountProvider":"VexaAccount","appStore":"VexaStore"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
