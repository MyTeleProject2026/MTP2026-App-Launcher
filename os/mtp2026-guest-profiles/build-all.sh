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
  "schema": "mtp2026-arm64-guest-v2",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "controlKernel": {
    "id": "mtp2026-control-kernel",
    "role": "launcher-control-plane",
    "realOs": false,
    "bootProtocol": "linux-arm64-control"
  },
  "profiles": {
    "mtp2026": {"name":"MTP2026 Device OS","family":"MTP2026","layout":"mobile","navigation":"gesture","imageKind":"mtp2026-owned-arm64-linux-profile","image":"mtp2026/mtp2026-mtp2026-arm64-linux.Image","initramfs":"mtp2026/mtp2026-mtp2026-initramfs.cpio.gz"},
    "android": {"name":"MTP2026 Android OS","family":"Android-style","layout":"mobile","navigation":"gesture-or-three-button","imageKind":"mtp2026-owned-arm64-linux-profile","image":"android/mtp2026-android-arm64-linux.Image","initramfs":"android/mtp2026/mtp2026-android-initramfs.cpio.gz"},
    "ios": {"name":"MTP2026 Device OS","family":"MTP2026","layout":"mobile","navigation":"gesture","imageKind":"mtp2026-owned-arm64-linux-profile","image":"ios/mtp2026-ios-arm64-linux.Image","initramfs":"ios/mtp2026-ios-initramfs.cpio.gz","notAppleFirmware":true},
    "windows11": {"name":"MTP2026 Desktop OS","family":"Desktop-style","layout":"desktop","navigation":"taskbar","imageKind":"mtp2026-owned-arm64-linux-profile","image":"windows11/mtp2026-windows11-arm64-linux.Image","initramfs":"windows11/mtp2026-windows11-initramfs.cpio.gz","notMicrosoftFirmware":true},
    "gaming": {"name":"MTP2026 Gaming OS","family":"Gaming-style","layout":"gaming","navigation":"controller","imageKind":"mtp2026-owned-arm64-linux-profile","image":"gaming/mtp2026-gaming-arm64-linux.Image","initramfs":"gaming/mtp2026-gaming-initramfs.cpio.gz"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
