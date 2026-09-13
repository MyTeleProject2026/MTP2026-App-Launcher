#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${ROOT}/out"
SRC="${OUT}/src"
ROOTFS="${OUT}/rootfs"
mkdir -p "$SRC" "$ROOTFS" "${OUT}/artifacts"

LINUX_VERSION="6.16"
BUSYBOX_VERSION="1_37_0"
JOBS="${JOBS:-$(nproc)}"

fetch() {
  local url="$1" dest="$2"
  if [ ! -f "$dest" ]; then
    curl -L --fail --retry 3 -o "$dest" "$url"
  fi
}

fetch "https://github.com/torvalds/linux/archive/refs/tags/v${LINUX_VERSION}.tar.gz" "${SRC}/linux.tar.gz"
fetch "https://github.com/mirror/busybox/archive/refs/tags/${BUSYBOX_VERSION}.tar.gz" "${SRC}/busybox.tar.gz"

if [ ! -d "${SRC}/linux-${LINUX_VERSION}" ]; then
  tar -xzf "${SRC}/linux.tar.gz" -C "$SRC"
fi
if [ ! -d "${SRC}/busybox-${BUSYBOX_VERSION}" ]; then
  tar -xzf "${SRC}/busybox.tar.gz" -C "$SRC"
fi

export ARCH=arm64
export CROSS_COMPILE=aarch64-linux-gnu-

KERNEL="${SRC}/linux-${LINUX_VERSION}"
BUSYBOX="${SRC}/busybox-${BUSYBOX_VERSION}"

make -C "$KERNEL" defconfig
make -C "$KERNEL" scripts -j"$JOBS"
"$KERNEL/scripts/config" --enable CONFIG_BLK_DEV_INITRD
"$KERNEL/scripts/config" --enable CONFIG_DEVTMPFS
"$KERNEL/scripts/config" --enable CONFIG_DEVTMPFS_MOUNT
"$KERNEL/scripts/config" --enable CONFIG_SERIAL_AMBA_PL011
"$KERNEL/scripts/config" --enable CONFIG_SERIAL_AMBA_PL011_CONSOLE
"$KERNEL/scripts/config" --enable CONFIG_VIRTIO
"$KERNEL/scripts/config" --enable CONFIG_VIRTIO_MMIO
"$KERNEL/scripts/config" --enable CONFIG_EXT4_FS
"$KERNEL/scripts/config" --enable CONFIG_TMPFS
make -C "$KERNEL" olddefconfig

rm -rf "$ROOTFS"
mkdir -p "$ROOTFS"/{bin,sbin,etc,proc,sys,dev,tmp,run,mnt,home,usr/bin}

make -C "$BUSYBOX" defconfig
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' "$BUSYBOX/.config"
make -C "$BUSYBOX" olddefconfig
make -C "$BUSYBOX" -j"$JOBS" CROSS_COMPILE="$CROSS_COMPILE"
make -C "$BUSYBOX" CONFIG_PREFIX="$ROOTFS" install

cp "$ROOT/rootfs/init" "$ROOTFS/init"
cp "$ROOT/rootfs/os-release" "$ROOTFS/etc/os-release"
cp "$ROOT/rootfs/motd" "$ROOTFS/etc/motd"
chmod +x "$ROOTFS/init"
ln -sf /bin/busybox "$ROOTFS/sbin/init"

(
  cd "$ROOTFS"
  find . -print0 | cpio --null -ov --format=newc | gzip -9
) > "$OUT/artifacts/mtp2026-initramfs.cpio.gz"

make -C "$KERNEL" -j"$JOBS" Image
cp "$KERNEL/arch/arm64/boot/Image" "$OUT/artifacts/mtp2026-arm64-linux.Image"

echo "MTP2026 ARM64 Linux image: $OUT/artifacts/mtp2026-arm64-linux.Image"
echo "MTP2026 initramfs:      $OUT/artifacts/mtp2026-initramfs.cpio.gz"
