#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/os/mtp2026-linux-arm64/out/firmware}"
SRC="$OUT/src"
UBOOT_VERSION="${MTP2026_UBOOT_VERSION:-v2025.01}"
JOBS="${JOBS:-$(nproc)}"
mkdir -p "$SRC" "$OUT"
if [ -s "$OUT/mtp2026-arm64-boot-firmware.bin" ]; then exit 0; fi

# U-Boot qemu_arm64 builds host tooling as part of the normal target build.
# Fail early with a useful diagnostic when the host GnuTLS development files
# are missing instead of producing a late mkeficapsule compiler failure.
if command -v pkg-config >/dev/null 2>&1 && ! pkg-config --exists gnutls; then
  export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig:${PKG_CONFIG_PATH:-}"
fi
if ! command -v pkg-config >/dev/null 2>&1 || ! pkg-config --exists gnutls; then
  echo "MTP2026 firmware build requires libgnutls28-dev (gnutls.pc)." >&2
  pkg-config --variable pc_path pkg-config 2>/dev/null || true
  find /usr -name gnutls.pc -print 2>/dev/null | head -20 || true
  exit 1
fi

tarball="$SRC/u-boot.tar.gz"
if [ ! -f "$tarball" ]; then
  curl -L --fail --retry 3 -o "$tarball" "https://github.com/u-boot/u-boot/archive/refs/tags/${UBOOT_VERSION}.tar.gz"
fi
if [ ! -d "$SRC/u-boot-${UBOOT_VERSION#v}" ]; then tar -xzf "$tarball" -C "$SRC"; fi
UBOOT="$SRC/u-boot-${UBOOT_VERSION#v}"
export CROSS_COMPILE="${CROSS_COMPILE:-aarch64-linux-gnu-}"
make -C "$UBOOT" qemu_arm64_defconfig

if [ -x "$UBOOT/scripts/config" ]; then
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
