#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-mtp2026}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"
IMAGE="${BUILD_ROOT}/out/artifacts/${PROFILE}/mtp2026-${PROFILE}-arm64-linux.Image"
INITRD="${BUILD_ROOT}/out/artifacts/${PROFILE}/mtp2026-${PROFILE}-initramfs.cpio.gz"

case "$PROFILE" in
  mtp2026|android|desktop|gaming) ;;
  *) echo "Usage: $0 {mtp2026|android|desktop|gaming}" >&2; exit 2 ;;
esac

if [ ! -f "$IMAGE" ] || [ ! -f "$INITRD" ]; then
  echo "Profile is not built. Run: MTP2026_PROFILE=$PROFILE bash $BUILD_ROOT/build.sh" >&2
  exit 1
fi

exec qemu-system-aarch64 \
  -M virt \
  -cpu max \
  -m "${MTP2026_RAM:-2048}" \
  -nographic \
  -kernel "$IMAGE" \
  -initrd "$INITRD" \
  -append 'console=ttyAMA0 rdinit=/init'
