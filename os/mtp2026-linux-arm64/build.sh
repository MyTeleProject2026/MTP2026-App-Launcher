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
BUSYBOX_VERSION="1.36.1"

# Four user-facing MTP2026-owned ARM64 guest systems. The ios value remains
# only as a backwards-compatible alias for older physical-test automation.
case "$PROFILE" in
  mtp2026)
    PROFILE_NAME="MTP2026 Device OS"; PROFILE_FAMILY="MTP2026"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture"; PROFILE_CLASS="device" ;;
  android)
    PROFILE_NAME="MTP2026 Android OS"; PROFILE_FAMILY="Android-style"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture-or-three-button"; PROFILE_CLASS="android" ;;
  ios)
    PROFILE_NAME="MTP2026 Device OS"; PROFILE_FAMILY="MTP2026"; PROFILE_LAYOUT="mobile"; PROFILE_NAV="gesture"; PROFILE_CLASS="device" ;;
  windows11)
    PROFILE_NAME="MTP2026 Desktop OS"; PROFILE_FAMILY="Desktop-style"; PROFILE_LAYOUT="desktop"; PROFILE_NAV="taskbar"; PROFILE_CLASS="desktop" ;;
  gaming)
    PROFILE_NAME="MTP2026 Gaming OS"; PROFILE_FAMILY="Gaming-style"; PROFILE_LAYOUT="gaming"; PROFILE_NAV="controller"; PROFILE_CLASS="gaming" ;;
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
  if [ -f "$dest" ]; then return 0; fi
  local url
  for url in "$@"; do
    echo "Fetching source: $url"
    if curl -L --fail --retry 3 --retry-delay 2 -o "$dest" "$url"; then return 0; fi
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
"$KERNEL/scripts/config" --enable CONFIG_VIRTIO_BLK
"$KERNEL/scripts/config" --enable CONFIG_VIRTIO_NET
"$KERNEL/scripts/config" --enable CONFIG_NET
"$KERNEL/scripts/config" --enable CONFIG_INET
"$KERNEL/scripts/config" --enable CONFIG_EXT4_FS
"$KERNEL/scripts/config" --enable CONFIG_TMPFS
"$KERNEL/scripts/config" --enable CONFIG_FUSE_FS
"$KERNEL/scripts/config" --set-str CONFIG_LOCALVERSION "-mtp2026-${PROFILE}"
make -C "$KERNEL" olddefconfig

rm -rf "$ROOTFS"
mkdir -p "$ROOTFS"/{bin,sbin,etc,proc,sys,dev,tmp,run,mnt,home,usr/bin,var/lib/mtp2026/apps,etc/mtp2026}

make -C "$BUSYBOX" defconfig
# The guest needs a first-boot formatter for its persistent virtio disk.
sed -i 's/^# CONFIG_MKFS_EXT2 is not set/CONFIG_MKFS_EXT2=y/' "$BUSYBOX/.config"
sed -i 's/^CONFIG_TC=y/# CONFIG_TC is not set/' "$BUSYBOX/.config"
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' "$BUSYBOX/.config"
make -C "$BUSYBOX" -j"$JOBS" CROSS_COMPILE="$CROSS_COMPILE"
make -C "$BUSYBOX" CONFIG_PREFIX="$ROOTFS" install

# Profile capability contract. These are MTP2026-owned system services and
# interfaces; they are not copies of proprietary Apple, Microsoft, ASUS or ROG firmware.
cat > "$ROOTFS/etc/mtp2026/capabilities.json" <<EOF
{
  "schema": "mtp2026-guest-capabilities-v1",
  "profile": "${PROFILE}",
  "name": "${PROFILE_NAME}",
  "architecture": "arm64",
  "kernel": "Linux ${LINUX_VERSION}",
  "machine": "qemu-aarch64-virt",
  "identity": {"provider":"VexaAccount","session":"launcher-managed"},
  "apps": {"store":"VexaStore","webApps":true,"nativePackages":"host-installer-handoff"},
  "system": {
    "boot":"initramfs",
    "power":"reboot,poweroff",
    "storage":"virtual-ext4-tmpfs",
    "network":"virtio-net",
    "display":"${PROFILE_LAYOUT}",
    "input":"${PROFILE_NAV}"
  },
  "features": {
    "deviceAndOsSwitcher":true,
    "notifications":true,
    "settings":true,
    "fileManager":true,
    "webAppRuntime":true,
    "accountCenter":true,
    "store":true,
    "nativeHostHandoff":true,
    "proprietaryFirmware":false
  }
}
EOF

cat > "$ROOTFS/etc/mtp2026/profile.json" <<EOF
{
  "schema": "mtp2026-guest-os-profile-v3",
  "id": "${PROFILE}",
  "name": "${PROFILE_NAME}",
  "family": "${PROFILE_FAMILY}",
  "architecture": "arm64",
  "machine": "qemu-aarch64-virt",
  "kernelVersion": "${LINUX_VERSION}",
  "kernelLocalVersion": "-mtp2026-${PROFILE}",
  "layout": "${PROFILE_LAYOUT}",
  "navigation": "${PROFILE_NAV}",
  "profileClass": "${PROFILE_CLASS}",
  "accountProvider": "VexaAccount",
  "applicationStore": "VexaStore",
  "applicationProtocol": "vexastore-install-manifest-v2",
  "applicationInstallRoot": "/var/lib/mtp2026/apps",
  "webApps": true,
  "nativePackageHandoff": true,
  "deviceAndOsSwitcher": true,
  "notifications": true,
  "settings": true,
  "fileManager": true,
  "proprietaryFirmware": false
}
EOF

cat > "$ROOTFS/usr/bin/mtp2026-system-info" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' 'MTP2026 system information'
printf 'Profile: '; sed -n 's/.*"id": "\([^"]*\)".*/\1/p' /etc/mtp2026/profile.json
printf 'Name: '; sed -n 's/.*"name": "\([^"]*\)".*/\1/p' /etc/mtp2026/profile.json
printf 'Kernel: '; uname -a
printf 'Machine: '; uname -m
printf 'Identity: VexaAccount\nStore: VexaStore\n'
EOF
chmod +x "$ROOTFS/usr/bin/mtp2026-system-info"

cat > "$ROOTFS/usr/bin/mtp2026-service" <<'EOF'
#!/bin/sh
set -eu
SERVICE="${2:-}"
ACTION="${1:-status}"
case "$SERVICE" in
  account|store|webapp|notifications|settings|files|device-os)
    case "$ACTION" in
      status) echo "mtp2026-$SERVICE: active (launcher-managed)" ;;
      start|restart) echo "mtp2026-$SERVICE: launcher-managed; request accepted" ;;
      stop) echo "mtp2026-$SERVICE: launcher-managed; stop requested" ;;
      *) echo "usage: mtp2026-service {status|start|stop|restart} <service>" >&2; exit 2 ;;
    esac ;;
    ;;
  *) echo "Unknown MTP2026 service: $SERVICE" >&2; exit 2 ;;
esac
EOF
chmod +x "$ROOTFS/usr/bin/mtp2026-service"

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

cat > "$ROOTFS/etc/motd" <<EOF
========================================
          MTP2026 GUEST SYSTEM
========================================
${PROFILE_NAME}
ARM64 Linux guest foundation
Kernel: Linux ${LINUX_VERSION}-mtp2026-${PROFILE}
Profile family: ${PROFILE_FAMILY}
Layout: ${PROFILE_LAYOUT}
Navigation: ${PROFILE_NAV}
VexaAccount identity • VexaStore applications
MTP2026-owned firmware/runtime profile
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

printf '%s\n' "Built MTP2026 ARM64 profile: $PROFILE" "Kernel: $ARTIFACTS/mtp2026-${PROFILE}-arm64-linux.Image" "Initramfs: $ARTIFACTS/mtp2026-${PROFILE}-initramfs.cpio.gz" "Profile: $ROOTFS/etc/mtp2026/profile.json" "Capabilities: $ROOTFS/etc/mtp2026/capabilities.json" "VexaStore installer: $ROOTFS/usr/bin/mtp2026-app-install"
