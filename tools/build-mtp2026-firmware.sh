#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/os/mtp2026-linux-arm64/out/firmware}"
SRC="$OUT/src"
UBOOT_VERSION="${MTP2026_UBOOT_VERSION:-v2025.01}"
JOBS="${JOBS:-$(nproc)}"
mkdir -p "$SRC" "$OUT"
if [ -s "$OUT/mtp2026-arm64-boot-firmware.bin" ]; then exit 0; fi
tarball="$SRC/u-boot.tar.gz"
if [ ! -f "$tarball" ]; then curl -L --fail --retry 3 -o "$tarball" "https://github.com/u-boot/u-boot/archive/refs/tags/${UBOOT_VERSION}.tar.gz"; fi
if [ ! -d "$SRC/u-boot-${UBOOT_VERSION#v}" ]; then tar -xzf "$tarball" -C "$SRC"; fi
UBOOT="$SRC/u-boot-${UBOOT_VERSION#v}"
export CROSS_COMPILE="${CROSS_COMPILE:-aarch64-linux-gnu-}"
make -C "$UBOOT" qemu_arm64_defconfig
if [ -x "$UBOOT/scripts/config" ]; then
  # MTP2026 boots through QEMU virt + U-Boot + VirtIO boot media.
  # EFI capsule tooling is not part of this boot path. Disable the optional
  # host utility so the firmware build does not depend on GnuTLS headers.
  "$UBOOT/scripts/config" --disable CONFIG_TOOLS_MKEFICAPSULE || true
  "$UBOOT/scripts/config" --disable CONFIG_EFI_CAPSULE_FIRMWARE_MANAGEMENT || true
  "$UBOOT/scripts/config" --enable CONFIG_BOOTSTD_FULL || true
  "$UBOOT/scripts/config" --enable CONFIG_BOOTSTD_DEFAULTS || true
  "$UBOOT/scripts/config" --enable CONFIG_BOOTMETH_EXTLINUX || true
  "$UBOOT/scripts/config" --enable CONFIG_CMD_VIRTIO || true
  "$UBOOT/scripts/config" --enable CONFIG_VIRTIO || true
  "$UBOOT/scripts/config" --enable CONFIG_VIRTIO_BLK || true
  make -C "$UBOOT" olddefconfig
  grep -Eq '^CONFIG_BOOTSTD_FULL=y$' "$UBOOT/.config"
  grep -Eq '^CONFIG_BOOTMETH_EXTLINUX=y$' "$UBOOT/.config"
fi
make -C "$UBOOT" -j"$JOBS" CROSS_COMPILE="$CROSS_COMPILE"
cp "$UBOOT/u-boot.bin" "$OUT/mtp2026-arm64-boot-firmware.bin"
cat > "$OUT/firmware-manifest.json" <<EOF
{"schema":"mtp2026-arm64-firmware-v1","owner":"MTP2026","architecture":"arm64","machine":"qemu-aarch64-virt","bootloader":"U-Boot qemu_arm64_defconfig","sourceVersion":"$UBOOT_VERSION","proprietaryFirmware":false,"bootFlow":["QEMU virt power-on","MTP2026 boot firmware","VirtIO boot media discovery","Linux ARM64 kernel","MTP2026 initramfs","MTP2026 system services","MTP2026 graphical shell"]}
EOF
