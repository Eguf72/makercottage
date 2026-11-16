#!/usr/bin/env bash
# MakerCottage – Electron-Build (Option C, T45)
# Erzeugt platform-spezifische Installer via electron-builder.
#
# electron-builder übernimmt das eigentliche Staging (siehe electron/package.json
# -> extraResources: ../launcher, ../server, ../web/dist, ../bin). Dieses Script
# stellt nur die VORAUSSETZUNGEN bereit und ruft electron-builder auf.
#
# Architektur (WICHTIG für native Cross-Platform-Builds):
#   - Der Server läuft als KINDPROZESS auf der mitgelieferten bin/node. Der
#     Native-Modul better-sqlite3 nutzt N-API (ABI-stabil) und liefert alle
#     Plattform-Prebuilds im npm-Paket mit (server/node_modules/…/prebuilds/).
#     Zur Laufzeit wird der passende *.node gewählt – es muss NICHTS re-kompiliert
#     werden (kein electron-rebuild / node-gyp).
#   - Die EINZIGE plattformspezifische Sache ist also die Node-Binär in bin/.
#     Dieses Script lädt deshalb pro PLATFORM die passende native Binär aus
#     nodejs.org (self-contained: nur System-Libs, kein Homebrew).
#
# Voraussetzungen:
#   - Node.js 18+ (zum Ausführen dieses Scripts + npm ci)
#   - In electron/: npm ci (installiert electron + electron-builder)
#
# Ausgabe (je nach TARGET/PLATFORM) – in dist/electron/:
#   - MakerCottage-<ver>-arm64.dmg   + .zip   (macOS)
#   - MakerCottage-<ver>-x64.AppImage + .deb (Linux)
#   - MakerCottage-Setup-<ver>-x64.exe        (Windows, via build-electron.ps1)
#
# Konfiguration (Umgebungsvariablen):
#   PLATFORM=mac|linux        – Zielplattform. Default: auto (Darwin->mac, sonst linux).
#   ARCH=arm64|x64            – Architektur. Default: native des Runners.
#   TARGET=mac|linux          – überschreibt die electron-builder-Ziel-Flag.
#                               Default: aus PLATFORM abgeleitet.
#   NODE_VERSION=v26.13.0     – Node-Tarball-Version (muss zu den Prebuilds passen;
#                               N-API -> ABI-stabil über Versionen hinweg).
#   UNSIGNED=1                – ohne Code-Signing (kein Apple-Developer-ID).
#                               Setzt CSC_IDENTITY_AUTO_DISCOVERY=false.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$ROOT/electron"
OUT="$ROOT/dist/electron"
NODE_VERSION="${NODE_VERSION:-v26.13.0}"

# --- 0) Plattform + Architektur bestimmen ------------------------------------
# Explicit PLATFORM/ARCH überschreiben die Auto-Erkennung (wichtig im CI).
if [ -n "${PLATFORM:-}" ]; then
  : # explizit vorgegeben
elif [ "$(uname -s)" = "Darwin" ]; then
  PLATFORM=mac
else
  PLATFORM=linux
fi

# uname -m -> nodejs.org-Nomenklatur (x86_64->x64, aarch64->arm64, arm64->arm64)
case "$(uname -m)" in
  x86_64)        UNAME_ARCH=x64 ;;
  aarch64|arm64) UNAME_ARCH=arm64 ;;
  *)             UNAME_ARCH="$(uname -m)" ;;
esac
ARCH="${ARCH:-$UNAME_ARCH}"

# nodejs.org-Tarball-Namen: mac->darwin, linux->linux, win->win (nicht die
# electron-builder-Target-Namen! macOS heisst dort "mac", nodejs.org "darwin").
case "$PLATFORM" in
  mac)   NODE_PLAT=darwin ;;
  linux) NODE_PLAT=linux ;;
  *)     NODE_PLAT="$PLATFORM" ;;
esac
NODE_CACHE="$ROOT/dist/.node-cache/${NODE_PLAT}-${ARCH}/$NODE_VERSION"

echo "==> MakerCottage Electron-Build (Option C)"
echo "    PLATFORM=$PLATFORM  ARCH=$ARCH  NODE_VERSION=$NODE_VERSION"

# 1) Frontend bauen (web/dist)
echo "==> (1/5) Frontend bauen (web/dist)"
( cd "$ROOT/web" && npm ci --no-audit --no-fund && npm run build )

# 2) Node-Binär: zuerst aus dem wiederverwendbaren Cache, sonst herunterladen
echo "==> (2/5) Node-Binär ($PLATFORM-$ARCH; Cache: dist/.node-cache/...)"
mkdir -p "$ROOT/bin"
if [ -x "$NODE_CACHE/bin/node" ]; then
  cp "$NODE_CACHE/bin/node" "$ROOT/bin/node"
  echo "    aus Cache: $PLATFORM-$ARCH/$NODE_VERSION"
else
  URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_PLAT}-${ARCH}.tar.xz"
  echo "    Herunterladen: $URL"
  TAR="$(mktemp -t mcnode).tar.xz"
  curl -fsSL "$URL" -o "$TAR"
  mkdir -p "$NODE_CACHE"
  tar -xJf "$TAR" -C "$NODE_CACHE"
  rm -f "$TAR"
  SRC="$NODE_CACHE/node-${NODE_VERSION}-${NODE_PLAT}-${ARCH}/bin/node"
  if [ ! -x "$SRC" ]; then
    echo "    FEHLER: erwartete Binär nicht gefunden: $SRC" >&2
    exit 1
  fi
  cp "$SRC" "$ROOT/bin/node"
  echo "    Version: $( "$ROOT/bin/node" -p 'process.version' )"
fi
chmod +x "$ROOT/bin/node"

# 3) server-Dependencies installieren (better-sqlite3 + Prebuilds, plattform-nativ)
echo "==> (3/5) server-Dependencies (npm ci, lädt den native-Prebuild von better-sqlite3)"
( cd "$ROOT/server" && npm ci --no-audit --no-fund )

# 3b) electron-Build-Abhängigkeiten (electron + electron-builder)
echo "==> (3b/5) electron-Build-Abhängigkeiten (npm ci)"
( cd "$ELECTRON_DIR" && npm ci --no-audit --no-fund )

# 4) electron-builder ausführen (TARGET -> Plattform-Flag)
echo "==> (4/5) electron-builder"
TARGET="${TARGET:-$PLATFORM}"
case "$TARGET" in
  mac)   BUILD_CMD="npm run build:mac" ;;
  linux) BUILD_CMD="npm run build:linux" ;;
  *)     echo "    Unbekanntes TARGET=$TARGET (erwartet: mac|linux)" >&2; exit 1 ;;
esac
# UNSIGNED=1: kein Apple-Developer-ID -> un-signiert bauen (lokaler Test + CI)
if [ "${UNSIGNED:-0}" = "1" ]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  echo "    (UNSIGNED=1 -> CSC_IDENTITY_AUTO_DISCOVERY=false, ohne Signing)"
fi
( cd "$ELECTRON_DIR" && $BUILD_CMD )

# 5) Ausgabe
echo "==> (5/5) Fertig"
echo "    Ausgabe-Verzeichnis: $OUT"
ls -la "$OUT" 2>/dev/null || echo "    (kein Output – evtl. cross-compile nicht unterstützt)"
