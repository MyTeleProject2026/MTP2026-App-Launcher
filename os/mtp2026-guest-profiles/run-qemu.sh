#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-mtp2026}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/mtp2026-linux-arm64"
ARTIFACTS="${BUILD_ROOT}/out/artifacts/${PROFILE}"
FIRMWARE="${ARTIFACTS}/mtp2026-arm64-boot-firmware.bin"
BOOTDISK="${ARTIFACTS}/mtp2026-${PROFILE}-boot-disk.img"
DATA="${ARTIFACTS}/mtp2026-${PROFILE}-data.qcow2"
KERNEL="${ARTIFACTS}/mtp2026-${PROFILE}-arm64-linux.Image"
INITRD="${ARTIFACTS}/mtp2026-${PROFILE}-initramfs.cpio.gz"

case "$PROFILE" in
  mtp2026|android|desktop|gaming) ;;
  *) echo "Usage: $0 {mtp2026|android|desktop|gaming}" >&2; exit 2 ;;
esac

if [ ! -f "$FIRMWARE" ] || [ ! -f "$BOOTDISK" ]; then
  echo "Profile firmware/boot disk is not built. Run: bash $ROOT/../mtp2026-guest-profiles/build-all.sh" >&2
  exit 1
fi

if [ ! -f "$DATA" ]; then
  command -v qemu-img >/dev/null || { echo "qemu-img is required" >&2; exit 2; }
  qemu-img create -f qcow2 "$DATA" "${MTP2026_DATA_SIZE:-64G}" >/dev/null
fi

exec qemu-system-aarch64   -M virt   -cpu cortex-a72   -m "${MTP2026_RAM:-2048}"   -bios "$FIRMWARE"   -drive "if=none,id=bootdisk,format=raw,file=$BOOTDISK"   -device virtio-blk-pci,drive=bootdisk   -drive "if=none,id=datadisk,format=qcow2,file=$DATA"   -device virtio-blk-pci,drive=datadisk   -device virtio-gpu-pci   -device virtio-keyboard-pci   -device virtio-mouse-pci   -device virtio-tablet-pci   -device virtio-net-pci,netdev=net0   -netdev user,id=net0   -audiodev driver=none,id=mtp2026audio   -device virtio-sound-pci,audiodev=mtp2026audio   -nographic