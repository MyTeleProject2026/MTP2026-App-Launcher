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
  "schema": "mtp2026-arm64-guest-v1",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "profiles": {
    "mtp2026": {"name":"MTP2026 Device OS","image":"mtp2026/mtp2026-mtp2026-arm64-linux.Image","initramfs":"mtp2026/mtp2026-mtp2026-initramfs.cpio.gz"},
    "android": {"name":"MTP2026 Android OS","image":"android/mtp2026-android-arm64-linux.Image","initramfs":"android/mtp2026-android-initramfs.cpio.gz"},
    "ios": {"name":"MTP2026 Device OS","image":"ios/mtp2026-ios-arm64-linux.Image","initramfs":"ios/mtp2026-ios-initramfs.cpio.gz"},
    "windows11": {"name":"MTP2026 Desktop OS","image":"windows11/mtp2026-windows11-arm64-linux.Image","initramfs":"windows11/mtp2026-windows11-initramfs.cpio.gz"},
    "gaming": {"name":"MTP2026 Gaming OS","image":"gaming/mtp2026-gaming-arm64-linux.Image","initramfs":"gaming/mtp2026-gaming-initramfs.cpio.gz"}
  }
}
EOF

echo "Guest manifest: $MANIFEST"
