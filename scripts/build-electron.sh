#!/usr/bin/env bash
# MakerCottage – Electron-Build (Option C, T45)
# Erzeugt platform-spezifische Installer via electron-builder.
#
# electron-builder übernimmt das eigentliche Staging (siehe electron/package.json
# -> extraResources: ../launcher, ../server, ../web/dist, ../bin). Dieses Script
# stellt nur die VORAUSSETZUNGEN bereit und ruft electron-builder auf.
#
# Voraussetzungen:
#   - Node.js 18+
#   - In electron/: npm install (installiert electron + electron-builder)
#
# Ausgabe (je nach TARGET):
#   - dist/electron/MakerCottage-<ver>-<arch>.dmg  (macOS)
#   - dist/electron/MakerCottage-<ver>-<arch>.zip   (macOS)
#   - dist/electron/MakerCottage-<ver>-<arch>.AppImage (Linux)
#   - dist/electron/MakerCottage-Setup-<ver>-<arch>.exe (Windows)
#
# Konfiguration:
#   TARGET=mac|linux|win|all  (Default: all – baut die native Plattform,
#                              cross-compile nur, wenn electron-builder es kann)
#   NODE_VERSION=v26.13.0     – Node-Tarball-Version (muss zu better-sqlite3-Prebuilds passen)
#   UNSIGNED=1                – ohne Code-Signing bauen (kein Apple-Developer-ID)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$ROOT/electron"
OUT="$ROOT/dist/electron"
NODE_VERSION="${NODE_VERSION:-v26.13.0}"
ARCH_CACHE="darwin-$(uname -m)"   # z. B. darwin-arm64 (passt zum Cache-Namen)

echo "==> MakerCottage Electron-Build (Option C)"

# 1) Frontend bauen (web/dist)
echo "==> (1/5) Frontend bauen (web/dist)"
( cd "$ROOT/web" && npm run build )

# 2) Node-Binär: zuerst aus dem wiederverwendbaren Cache, sonst herunterladen
echo "==> (2/5) Node-Binär (Cache: dist/.node-cache/$ARCH_CACHE)"
mkdir -p "$ROOT/bin"
if [ -x "$ROOT/dist/.node-cache/$ARCH_CACHE/$NODE_VERSION/bin/node" ]; then
  cp "$ROOT/dist/.node-cache/$ARCH_CACHE/$NODE_VERSION/bin/node" "$ROOT/bin/node"
  echo "    aus Cache: $ARCH_CACHE/$NODE_VERSION"
else
  ARCH="$(uname -m)"            # arm64 oder x86_64 – passt direkt zur Tarball-Nomenklatur
  URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${ARCH}.tar.xz"
  echo "    Herunterladen: $URL"
  TAR="$(mktemp -t mcnode).tar.xz"
  curl -fsSL "$URL" -o "$TAR"
  mkdir -p "$ROOT/dist/.node-cache/$ARCH_CACHE/$NODE_VERSION"
  tar -xJf "$TAR" -C "$ROOT/dist/.node-cache/$ARCH_CACHE/$NODE_VERSION"
  rm -f "$TAR"
  cp "$ROOT/dist/.node-cache/$ARCH_CACHE/$NODE_VERSION/node-${NODE_VERSION}-darwin-${ARCH}/bin/node" "$ROOT/bin/node"
  echo "    Version: $( "$ROOT/bin/node" -p 'process.version' )"
fi
chmod +x "$ROOT/bin/node"

# 3) electron + electron-builder installieren (falls noch nicht da)
echo "==> (3/5) electron-Build-Abhängigkeiten (falls nötig)"
if [ ! -d "$ELECTRON_DIR/node_modules" ]; then
  ( cd "$ELECTRON_DIR" && npm install --no-audit --no-fund 2>&1 | tail -5 )
fi

# 4) electron-builder ausführen (TARGET wählt die Plattform)
echo "==> (4/5) electron-builder"
TARGET="${TARGET:-all}"
case "$TARGET" in
  mac)   BUILD_CMD="npm run build:mac" ;;
  linux) BUILD_CMD="npm run build:linux" ;;
  win)   BUILD_CMD="npm run build:win" ;;
  *)     BUILD_CMD="npm run build" ;;
esac
# UNSIGNED=1: kein Apple-Developer-ID -> un-signiert bauen (lokaler Test)
if [ "${UNSIGNED:-0}" = "1" ]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  echo "    (UNSIGNED=1 -> CSC_IDENTITY_AUTO_DISCOVERY=false, ohne Signing)"
fi
( cd "$ELECTRON_DIR" && $BUILD_CMD )

# 5) Ausgabe
echo "==> (5/5) Fertig"
echo "    Ausgabe-Verzeichnis: $OUT"
ls -la "$OUT" 2>/dev/null || echo "    (kein Output – evtl. cross-compile nicht unterstützt)"
