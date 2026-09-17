#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROFILE="${MTP2026_PROFILE:-mtp2026}"
OUT="${ROOT}/out"
SRC="${OUT}/src"
ROOTFS="${OUT}/rootfs"
ARTIFACTS="${OUT}/artifacts/${PROFILE}"
JOBS="${JOBS:-$(nproc)}"
LINUX_VERSION="6.16"
# BusyBox 1.37.0 currently fails against the Ubuntu 24.04 ARM64 cross-build
# headers used by the physical-test runner (removed CBQ headers and the
# SHA-NI symbol).  Keep the guest foundation on the stable 1.36.1 release,
# which builds cleanly with the runner toolchain and provides the same required
# initramfs utilities.
BUSYBOX_VERSION="1.36.1"

case "$PROFILE" in
  mtp2026) PROFILE_NAME="MTP2026 Device OS"; PROFILE_FAMILY="MTP2026"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture" ;;
  android) PROFILE_NAME="MTP2026 Android OS"; PROFILE_FAMILY="Android-style"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture-or-three-button" ;;
  ios) PROFILE_NAME="MTP2026 Device OS"; PROFILE_FAMILY="MTP2026"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture" ;;
  windows11) PROFILE_NAME="MTP2026 Desktop OS"; PROFILE_FAMILY="Desktop-style"; PROFILE_LAYOUT="desktop"; PROFILE_NAV="taskbar" ;;
  gaming) PROFILE_NAME="MTP2026 Gaming OS"; PROFILE_FAMILY="Gaming-style"; PROFILE_LAYOUT="gaming"; PROFILE_NAV="controller" ;;
  *) echo "Unsupported MTP2026 guest profile: $PROFILE" >&2; exit 2 ;;
esac

mkdir -p "$SRC" "$ROOTFS" "$ARTIFACTS"

fetch() {
  local url="$1" dest="$2"
  if [ ! -f "$dest" ]; then
    curl -L --fail --retry 3 -o "$dest" "$url"
  fi
}

fetch_with_fallback() {
  local dest="$1"
  shift
  if [ -f "$dest" ]; then
    return 0
  fi

  local url
  for url in "$@"; do
    echo "Fetching source: $url"
    if curl -L --fail --retry 3 --retry-delay 2 -o "$dest" "$url"; then
      return 0
    fi
    rm -f "$dest"
    echo "Source unavailable, trying next mirror: $url" >&2
  done

  echo "Unable to download required source: $dest" >&2
  return 1
}

fetch "https://github.com/torvalds/linux/archive/refs/tags/v${LINUX_VERSION}.tar.gz" "${SRC}/linux.tar.gz"
fetch_with_fallback "${SRC}/busybox.tar.bz2" \
  "https://busybox.net/downloads/busybox-${BUSYBOX_VERSION}.tar.bz2" \
  "https://ftp.funet.fi/pub/Linux/INSTALL/Debian/pool/main/b/busybox/busybox_${BUSYBOX_VERSION}.orig.tar.bz2"

if [ ! -d "${SRC}/linux-${LINUX_VERSION}" ]; then tar -xzf "${SRC}/linux.tar.gz" -C "$SRC"; fi
if [ ! -d "${SRC}/busybox-${BUSYBOX_VERSION}" ]; then tar -xjf "${SRC}/busybox.tar.bz2" -C "$SRC"; fi

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
mkdir -p "$ROOTFS"/{bin,sbin,etc,proc,sys,dev,tmp,run,mnt,home,usr/bin,var/lib/mtp2026/apps,etc/mtp2026}

make -C "$BUSYBOX" defconfig
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' "$BUSYBOX/.config"
# BusyBox 1.36.1 does not require an olddefconfig pass here.  defconfig
# creates the complete configuration and the static toggle above is the only
# intentional change before the cross-build.
make -C "$BUSYBOX" -j"$JOBS" CROSS_COMPILE="$CROSS_COMPILE"
make -C "$BUSYBOX" CONFIG_PREFIX="$ROOTFS" install

sed -e "s/@PROFILE@/${PROFILE}/g" -e "s/@PROFILE_NAME@/${PROFILE_NAME}/g" \
  "$ROOT/rootfs/init.template" > "$ROOTFS/init"
cp "$ROOT/rootfs/mtp2026-app-install" "$ROOTFS/usr/bin/mtp2026-app-install"
chmod +x "$ROOTFS/usr/bin/mtp2026-app-install"
cat > "$ROOTFS/etc/os-release" <<EOF
NAME="${PROFILE_NAME}"
ID=mtp2026-${PROFILE}
VERSION="2026.1"
VERSION_ID="2026.1"
PRETTY_NAME="${PROFILE_NAME} ARM64"
HOME_URL="https://github.com/MyTeleProject2026/MTP2026-App-Launcher"
VARIANT="MTP2026 ${PROFILE_FAMILY} guest profile"
EOF

cat > "$ROOTFS/etc/mtp2026/profile.json" <<EOF
{
  "schema": "mtp2026-guest-os-profile-v2",
  "id": "${PROFILE}",
  "name": "${PROFILE_NAME}",
  "family": "${PROFILE_FAMILY}",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "layout": "${PROFILE_LAYOUT}",
  "navigation": "${PROFILE_NAV}",
  "accountProvider": "VexaAccount",
  "applicationStore": "VexaStore",
  "applicationProtocol": "vexastore-install-manifest-v2",
  "applicationInstallRoot": "/var/lib/mtp2026/apps",
  "webApps": true,
  "nativePackageHandoff": true,
  "proprietaryFirmware": false
}
EOF

cat > "$ROOTFS/etc/motd" <<EOF
========================================
          MTP2026 GUEST SYSTEM
========================================
${PROFILE_NAME}
ARM64 Linux guest foundation
Profile family: ${PROFILE_FAMILY}
Layout: ${PROFILE_LAYOUT}
Navigation: ${PROFILE_NAV}
VexaAccount identity • VexaStore applications
========================================
EOF

cat > "$ROOTFS/usr/bin/mtp2026-os-info" <<'EOF'
#!/bin/sh
printf '%s\n' 'MTP2026 OS profile:'
cat /etc/mtp2026/profile.json
EOF
chmod +x "$ROOTFS/usr/bin/mtp2026-os-info"
chmod +x "$ROOTFS/init"
ln -sf /bin/busybox "$ROOTFS/sbin/init"

(
  cd "$ROOTFS"
  find . -print0 | cpio --null -ov --format=newc | gzip -9
) > "$ARTIFACTS/mtp2026-${PROFILE}-initramfs.cpio.gz"

make -C "$KERNEL" -j"$JOBS" Image
cp "$KERNEL/arch/arm64/boot/Image" "$ARTIFACTS/mtp2026-${PROFILE}-arm64-linux.Image"

if [ "$PROFILE" = "mtp2026" ]; then
  cp "$ARTIFACTS/mtp2026-${PROFILE}-initramfs.cpio.gz" "$OUT/artifacts/mtp2026-initramfs.cpio.gz"
  cp "$ARTIFACTS/mtp2026-${PROFILE}-arm64-linux.Image" "$OUT/artifacts/mtp2026-arm64-linux.Image"
fi

printf '%s\n' "Built MTP2026 ARM64 profile: $PROFILE" "Kernel: $ARTIFACTS/mtp2026-${PROFILE}-arm64-linux.Image" "Initramfs: $ARTIFACTS/mtp2026-${PROFILE}-initramfs.cpio.gz" "Profile: $ROOTFS/etc/mtp2026/profile.json" "VexaStore installer: $ROOTFS/usr/bin/mtp2026-app-install"
