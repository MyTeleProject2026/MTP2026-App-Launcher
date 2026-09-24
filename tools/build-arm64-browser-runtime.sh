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
if [ -f "$MARKER" ] && [ -x "$OUT/usr/bin/chromium" ]; then
  echo "Using cached ARM64 browser runtime: $OUT"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NAME="mtp2026-browser-runtime-$$"

docker pull --platform linux/arm64 "$IMAGE" >/dev/null

docker run --platform linux/arm64 --name "$NAME" "$IMAGE" bash -lc '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu fonts-liberation
  rm -rf /var/lib/apt/lists/*
' >/dev/null

docker cp "$NAME:/usr/bin/chromium" "$TMP/chromium"
docker cp "$NAME:/usr/lib/chromium" "$TMP/chromium-dir"
docker cp "$NAME:/usr/lib/aarch64-linux-gnu" "$TMP/aarch64-linux-gnu"
docker cp "$NAME:/usr/share/chromium" "$TMP/chromium-share" 2>/dev/null || true
docker cp "$NAME:/etc/ssl/certs" "$TMP/certs"
docker cp "$NAME:/etc/fonts" "$TMP/fonts" 2>/dev/null || true
docker rm "$NAME" >/dev/null

rm -rf "$OUT"
mkdir -p "$OUT/usr/bin" "$OUT/usr/lib" "$OUT/etc/ssl" "$OUT/etc/fonts"
cp -a "$TMP/chromium" "$OUT/usr/bin/chromium"
cp -a "$TMP/chromium-dir" "$OUT/usr/lib/chromium"
cp -a "$TMP/aarch64-linux-gnu/." "$OUT/usr/lib/"
cp -a "$TMP/certs" "$OUT/etc/ssl/certs"
if [ -d "$TMP/fonts" ]; then cp -a "$TMP/fonts/." "$OUT/etc/fonts/"; fi
chmod +x "$OUT/usr/bin/chromium"

printf '%s\n' "MTP2026 ARM64 Chromium-compatible runtime" > "$OUT/MANIFEST"
printf '%s\n' "Base image: $IMAGE" >> "$OUT/MANIFEST"
"$OUT/usr/bin/chromium" --version >> "$OUT/MANIFEST" 2>&1 || true
touch "$MARKER"
echo "Built ARM64 browser runtime at $OUT"
