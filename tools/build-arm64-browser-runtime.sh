#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/os/mtp2026-linux-arm64/out/browser-runtime}"
IMAGE="${MTP2026_BROWSER_BASE_IMAGE:-debian:bookworm-slim}"
mkdir -p "$OUT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build the ARM64 Chromium-compatible runtime." >&2
  exit 2
fi

MARKER="$OUT/.runtime-complete"
if [ -f "$MARKER" ] && [ -x "$OUT/usr/bin/chromium" ] && [ -f "$OUT/lib/ld-linux-aarch64.so.1" ]; then
  echo "Using cached ARM64 browser runtime: $OUT"
  exit 0
fi

TMP="$(mktemp -d)"
NAME="mtp2026-browser-runtime-$$"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

docker pull --platform linux/arm64 "$IMAGE" >/dev/null
docker create --platform linux/arm64 --name "$NAME" "$IMAGE" bash -lc '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu fonts-liberation libgbm1 libdrm2 libegl1 libgl1 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libpango-1.0-0 libpangocairo-1.0-0 libxkbcommon0 libxshmfence1 libasound2 mesa-dri-drivers
  rm -rf /var/lib/apt/lists/*
  mkdir -p /opt/mtp2026-browser-runtime
  cp -a /usr/bin/chromium /opt/mtp2026-browser-runtime/chromium-launcher
  cp -a /usr/lib/chromium /opt/mtp2026-browser-runtime/chromium
  cp -a /usr/share/chromium /opt/mtp2026-browser-runtime/chromium-share
  cp -a /usr/lib/aarch64-linux-gnu /opt/mtp2026-browser-runtime/aarch64-linux-gnu
  cp -a /lib/aarch64-linux-gnu /opt/mtp2026-browser-runtime/lib-aarch64-linux-gnu
  cp -a /lib/ld-linux-aarch64.so.1 /opt/mtp2026-browser-runtime/ld-linux-aarch64.so.1
  cp -a /usr/lib/chromium/icudtl.dat /opt/mtp2026-browser-runtime/icudtl.dat 2>/dev/null || true
  cp -a /etc/ssl/certs /opt/mtp2026-browser-runtime/certs
  cp -a /etc/fonts /opt/mtp2026-browser-runtime/fonts
  printf "%s\\n" "MTP2026 ARM64 Chromium-compatible runtime" > /opt/mtp2026-browser-runtime/MANIFEST
  printf "%s\\n" "Base image: Debian Bookworm ARM64 package environment" >> /opt/mtp2026-browser-runtime/MANIFEST
  /usr/bin/chromium --version >> /opt/mtp2026-browser-runtime/MANIFEST 2>&1 || true
'
docker start "$NAME" >/dev/null
docker wait "$NAME" >/dev/null
docker cp "$NAME:/opt/mtp2026-browser-runtime" "$TMP/runtime"

rm -rf "$OUT"
mkdir -p "$OUT/usr/bin" "$OUT/usr/lib" "$OUT/lib" "$OUT/etc/ssl" "$OUT/etc/fonts" "$OUT/usr/share"
cp -a "$TMP/runtime/mtp2026-browser-runtime/chromium-launcher" "$OUT/usr/bin/chromium"
cp -a "$TMP/runtime/mtp2026-browser-runtime/chromium" "$OUT/usr/lib/chromium"
cp -a "$TMP/runtime/mtp2026-browser-runtime/chromium-share" "$OUT/usr/share/chromium"
cp -a "$TMP/runtime/mtp2026-browser-runtime/aarch64-linux-gnu/." "$OUT/usr/lib/"
cp -a "$TMP/runtime/mtp2026-browser-runtime/lib-aarch64-linux-gnu/." "$OUT/lib/"
cp -a "$TMP/runtime/mtp2026-browser-runtime/ld-linux-aarch64.so.1" "$OUT/lib/ld-linux-aarch64.so.1"
if [ -f "$TMP/runtime/mtp2026-browser-runtime/icudtl.dat" ]; then cp -a "$TMP/runtime/icudtl.dat" "$OUT/usr/lib/chromium/icudtl.dat"; fi
cp -a "$TMP/runtime/mtp2026-browser-runtime/certs" "$OUT/etc/ssl/certs"
cp -a "$TMP/runtime/mtp2026-browser-runtime/fonts/." "$OUT/etc/fonts/"
chmod +x "$OUT/usr/bin/chromium" "$OUT/usr/lib/chromium/chromium"
cp -a "$TMP/runtime/mtp2026-browser-runtime/MANIFEST" "$OUT/MANIFEST"
touch "$MARKER"
echo "Built ARM64 browser runtime at $OUT"
echo "Runtime manifest:"
cat "$OUT/MANIFEST"
