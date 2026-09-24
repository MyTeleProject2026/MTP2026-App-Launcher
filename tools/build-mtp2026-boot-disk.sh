#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:?profile required}"
ARTIFACTS="$ROOT/os/mtp2026-linux-arm64/out/artifacts/$PROFILE"
FIRMWARE="$ROOT/os/mtp2026-linux-arm64/out/firmware"
OUT="$ARTIFACTS/mtp2026-$PROFILE-boot-disk.img"
SIZE="${MTP2026_BOOT_DISK_SIZE:-256M}"
command -v mke2fs >/dev/null || exit 2
command -v debugfs >/dev/null || exit 2
test -s "$ARTIFACTS/mtp2026-$PROFILE-arm64-linux.Image"
test -s "$ARTIFACTS/mtp2026-$PROFILE-initramfs.cpio.gz"
test -s "$FIRMWARE/mtp2026-arm64-boot-firmware.bin"
rm -f "$OUT"; truncate -s "$SIZE" "$OUT"; mke2fs -q -t ext4 -F -L MTP2026-BOOT "$OUT"
TMP="$ARTIFACTS/.bootfs"; rm -rf "$TMP"; mkdir -p "$TMP/extlinux"
cp "$ARTIFACTS/mtp2026-$PROFILE-arm64-linux.Image" "$TMP/Image"
cp "$ARTIFACTS/mtp2026-$PROFILE-initramfs.cpio.gz" "$TMP/initrd.cpio.gz"
cat > "$TMP/extlinux/extlinux.conf" <<EOF
TIMEOUT 1
DEFAULT mtp2026
LABEL mtp2026
  MENU LABEL MTP2026 $PROFILE
  KERNEL /Image
  INITRD /initrd.cpio.gz
  APPEND console=ttyAMA0 rdinit=/init mtp2026.data_device=/dev/vdb
EOF
(cd "$TMP"; printf 'mkdir /extlinux\nwrite extlinux/extlinux.conf /extlinux/extlinux.conf\nwrite Image /Image\nwrite initrd.cpio.gz /initrd.cpio.gz\n' | debugfs -w -f - "$OUT" >/dev/null 2>&1)
rm -rf "$TMP"
cp "$FIRMWARE/mtp2026-arm64-boot-firmware.bin" "$ARTIFACTS/mtp2026-arm64-boot-firmware.bin"
cp "$FIRMWARE/firmware-manifest.json" "$ARTIFACTS/firmware-manifest.json"
cat > "$ARTIFACTS/boot-manifest.json" <<EOF
{"schema":"mtp2026-guest-boot-v1","profile":"$PROFILE","architecture":"arm64","firmware":"mtp2026-arm64-boot-firmware.bin","bootDisk":"mtp2026-$PROFILE-boot-disk.img","kernel":"Image","initrd":"initrd.cpio.gz","bootloaderConfig":"extlinux/extlinux.conf","dataDevice":"/dev/vdb","flow":"firmware -> virtio boot disk -> Linux kernel -> initramfs -> MTP2026 userspace"}
EOF
