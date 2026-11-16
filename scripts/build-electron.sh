#!/usr/bin/env bash
# MakerCottage – Electron-Build (Option C, T45)
# Erzeugt platform-spezifische Installer via electron-builder.
#
# Voraussetzungen:
#   - Node.js 18+
#   - In electron/: npm install (installiert electron + electron-builder)
#
# Ausgabe (je nach --target):
#   - dist/electron/MakerCottage-<arch>.dmg       (macOS)
#   - dist/electron/MakerCottage-<arch>.AppImage  (Linux)
#   - dist/electron/MakerCottage-Setup-<arch>.exe (Windows)
#
# Konfiguration:
#   TARGET=mac|linux|win|all  (Default: all – baut für alle Plattformen,
#                              wenn electron-builder cross-compile unterstützt;
#                              ansonsten: native Plattform)
#   NODE_VERSION=v26.13.0     – Node-Tarball-Version (muss zu better-sqlite3-Prebuilds passen)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$ROOT/electron"
OUT="$ROOT/dist/electron"
NODE_VERSION="${NODE_VERSION:-v26.13.0}"

echo "==> MakerCottage Electron-Build (Option C)"

# 1) Frontend bauen
echo "==> (1/6) Frontend bauen (web/dist)"
( cd "$ROOT/web" && npm run build )

# 2) Node-Binär aus dem macOS-Bundle-Cache bereitstellen (wiederverwendbar)
echo "==> (2/6) Node-Binär (Cache: dist/.node-cache)"
mkdir -p "$ROOT/bin"
if [ -x "$ROOT/dist/.node-cache/darwin-$(uname -m | sed 's/arm64/aarch64/g;/x86_64/x64/g')/$NODE_VERSION/bin/node" ]; then
  ARCH_DIR="darwin-$(uname -m)"
  cp "$ROOT/dist/.node-cache/$ARCH_DIR/$NODE_VERSION/bin/node" "$ROOT/bin/node"
  echo "    aus Cache: $ARCH_DIR/$NODE_VERSION"
else
  # Direkt in bin/ herunterladen
  ARCH="$(uname -m)"
  [ "$ARCH" = "x86_64" ] && ARCH="x64"
  [ "$ARCH" = "aarch64" ] && ARCH="arm64"
  URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${ARCH}.tar.xz"
  echo "    Herunterladen: $URL"
  TAR="$(mktemp -t mcnode).tar.xz"
  curl -fsSL "$URL" -o "$TAR"
  tar -xJf "$TAR" -C /tmp
  cp "/tmp/node-${NODE_VERSION}-darwin-${ARCH}/bin/node" "$ROOT/bin/node"
  rm -f "$TAR"
  echo "    Version: $( "$ROOT/bin/node" -p 'process.version' )"
fi

# 3) Server-Code + Launcher + Web-Dist in eine Staging-Struktur für electron-builder
echo "==> (3/6) Staging (server + launcher + web/dist + bin)"
STAGE="$ELECTRON_DIR/.stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/app" "$STAGE/launcher" "$STAGE/web/dist" "$STAGE/bin"

# Server-Code (nur Runtime-Dateien)
for f in config.js database.js discover.js index.js local.js network.js \
         package.json paths.js scan.js smb.js updatecheck.js; do
  cp "$ROOT/server/$f" "$STAGE/app/$f"
done
cp -R "$ROOT/server/node_modules" "$STAGE/app/node_modules"
cp "$ROOT/launcher/launcher.mjs" "$STAGE/launcher/launcher.mjs"
cp -R "$ROOT/web/dist" "$STAGE/web/dist/"
cp "$ROOT/bin/node" "$STAGE/bin/node"

# 4) electron-builder vorbereiten
echo "==> (4/6) electron install (falls noch nicht da)"
if [ ! -d "$ELECTRON_DIR/node_modules" ]; then
  ( cd "$ELECTRON_DIR" && npm install --no-audit --no-fund 2>&1 | tail -5 )
fi

# 5) electron-builder ausführen
echo "==> (5/6) electron-builder"
TARGET="${TARGET:-all}"
case "$TARGET" in
  mac)   BUILD_CMD="npm run build:mac" ;;
  linux) BUILD_CMD="npm run build:linux" ;;
  win)   BUILD_CMD="npm run build:win" ;;
  *)     BUILD_CMD="npm run build" ;;
esac
( cd "$ELECTRON_DIR" && $BUILD_CMD )

# 6) Ausgabe
echo "==> (6/6) Fertig"
echo "    Ausgabe-Verzeichnis: $OUT"
ls -la "$OUT" 2>/dev/null || echo "    (kein Output – evtl. cross-compile nicht unterstützt)"
