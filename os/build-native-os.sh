#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${ROOT}/out"; mkdir -p "$OUT"
BUSYBOX_VERSION="1.36.1"; LINUX_VERSION="6.12.49"; ARCH="arm64"; CROSS="aarch64-linux-gnu-"
fetch(){ local url="$1" dst="$2"; if [[ ! -s "$dst" ]]; then curl -L --fail --retry 4 --retry-delay 2 "$url" -o "$dst"; fi; }
fetch "https://busybox.net/downloads/busybox-${BUSYBOX_VERSION}.tar.bz2" "$OUT/busybox.tar.bz2"
fetch "https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-${LINUX_VERSION}.tar.xz" "$OUT/linux.tar.xz"
rm -rf "$OUT/busybox-${BUSYBOX_VERSION}" "$OUT/linux-${LINUX_VERSION}" "$OUT/rootfs"
tar -xjf "$OUT/busybox.tar.bz2" -C "$OUT"; tar -xJf "$OUT/linux.tar.xz" -C "$OUT"
ROOTFS="$OUT/rootfs"; mkdir -p "$ROOTFS"/{bin,sbin,etc,proc,sys,dev,run,tmp,var,usr/bin,usr/sbin,mnt}
cd "$OUT/busybox-${BUSYBOX_VERSION}"
make ARCH="$ARCH" CROSS_COMPILE="$CROSS" defconfig
sed -i 's/# CONFIG_STATIC is not set/CONFIG_STATIC=y/' .config
make -j"$(nproc)" ARCH="$ARCH" CROSS_COMPILE="$CROSS"
make ARCH="$ARCH" CROSS_COMPILE="$CROSS" CONFIG_PREFIX="$ROOTFS" install
install -Dm755 "$ROOT/init" "$ROOTFS/init"
install -Dm755 "$ROOT/rootfs/usr/bin/mtp2026-shell" "$ROOTFS/usr/bin/mtp2026-shell"
install -Dm644 "$ROOT/rootfs/etc/hostname" "$ROOTFS/etc/hostname"; install -Dm644 "$ROOT/rootfs/etc/motd" "$ROOTFS/etc/motd"
cd "$OUT/linux-${LINUX_VERSION}"
make ARCH="$ARCH" CROSS_COMPILE="$CROSS" defconfig
./scripts/config --enable CONFIG_DEVTMPFS --enable CONFIG_DEVTMPFS_MOUNT --enable CONFIG_SERIAL_8250 --enable CONFIG_SERIAL_8250_CONSOLE --enable CONFIG_VIRTIO --enable CONFIG_VIRTIO_MMIO --enable CONFIG_VIRTIO_BLK --enable CONFIG_VIRTIO_NET
make -j"$(nproc)" ARCH="$ARCH" CROSS_COMPILE="$CROSS" Image
cp arch/arm64/boot/Image "$OUT/Image"
cd "$ROOTFS"; find . -print0 | cpio --null -ov --format=newc | gzip -9 > "$OUT/mtp2026-desktop-arm64-initramfs.cpio.gz"
sha256sum "$OUT/Image" "$OUT/mtp2026-desktop-arm64-initramfs.cpio.gz" > "$OUT/SHA256SUMS"
cat > "$OUT/native-os-manifest.json" <<EOF
{
  "schema": "mtp2026-native-os-v1",
  "product": "MTP2026 Desktop OS",
  "edition": "Desktop Edition",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "kernel": "Linux ${LINUX_VERSION}",
  "rootfs": "BusyBox ${BUSYBOX_VERSION} initramfs",
  "bootable": true,
  "shell": "MTP2026 Desktop Edition"
}
EOF
