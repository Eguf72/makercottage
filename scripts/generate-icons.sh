#!/usr/bin/env bash
# MakerCottage – Icon-Generierung für den Electron-Wrapper (T45)
#
# Erzeugt aus dem 1024x1024-Quell-Bild die platform-spezifischen Icons:
#   electron/resources/icon.icns  (macOS,  via sips + iconutil)
#   electron/resources/icon.png   (Linux,  512x512)
#   electron/resources/icon.ico   (Windows, via png2ico / Node-Fallback)
#
# Voraussetzungen (macOS): sips + iconutil (systemeigen).
# Windows-Linux-CI: png2ico optional (npm).
#
# Konfiguration:
#   SRC=...  Quell-PNG (Default: web/public/MakerCottage_Favicon.png, 1024x1024)
#   OUT=...  Ziel-Verzeichnis (Default: electron/resources)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SRC:-$ROOT/web/public/MakerCottage_Favicon.png}"
OUT="${OUT:-$ROOT/electron/resources}"
TMP="$(mktemp -d /tmp/mc-icons.XXXXXX)"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "==> MakerCottage Icon-Generierung"
echo "    Quelle: $SRC"
echo "    Ziel:   $OUT"
mkdir -p "$OUT"

# --- 0) Quellbild auf 1024x1024 normalisieren (falls nötig) ------------------
SRC_NORM="$TMP/base-1024.png"
if [ -f "$SRC" ]; then
  sips -Z 1024 "$SRC" --out "$SRC_NORM" >/dev/null
else
  echo "    WARNUNG: Quelle nicht gefunden: $SRC – abgebrochen" >&2
  exit 1
fi

# --- 1) macOS: .icns via .iconset + iconutil ---------------------------------
ICONSET="$TMP/MakerCottage.iconset"
mkdir -p "$ICONSET"
# Dateiname  ->  Zielgröße
declare -a PAIRS=(
  "icon_16x16.png:16"
  "icon_16x16@2x.png:32"
  "icon_32x32.png:32"
  "icon_32x32@2x.png:64"
  "icon_128x128.png:128"
  "icon_128x128@2x.png:256"
  "icon_256x256.png:256"
  "icon_256x256@2x.png:512"
  "icon_512x512.png:512"
  "icon_512x512@2x.png:1024"
)
for pair in "${PAIRS[@]}"; do
  name="${pair%%:*}"
  size="${pair##*:}"
  sips -z "$size" "$size" "$SRC_NORM" --out "$ICONSET/$name" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
echo "    ✓ electron/resources/icon.icns  (macOS)"

# --- 2) Linux: .png (512x512) -------------------------------------------------
sips -z 512 512 "$SRC_NORM" --out "$OUT/icon.png" >/dev/null
echo "    ✓ electron/resources/icon.png   (Linux, 512x512)"

# --- 3) Windows: .ico ----------------------------------------------------------
#    Vorrangig png2ico (falls global installiert); sonst Node-Fallback, der eine
#    256x256-PNG in ein .ico einbettet (Windows 7+ unterstützt PNG-Icons und
#    skaliert 256 auf alle UI-Größen selbst).
ICO_PNG="$TMP/icon-256.png"
sips -z 256 256 "$SRC_NORM" --out "$ICO_PNG" >/dev/null
if command -v png2ico >/dev/null 2>&1; then
  echo "    ...png2ico gefunden – .ico mit Multi-Size-Resolution"
  png2ico --iconsize 256,128,64,48,32,16 --iconname icon "$SRC_NORM" "$OUT/icon.ico"
  echo "    ✓ electron/resources/icon.ico  (Windows, multi-size)"
else
  echo "    ...png2ico nicht vorhanden – Node-Fallback (256x256-PNG im .ico)"
  node "$ROOT/scripts/ico-from-png.mjs" "$ICO_PNG" "$OUT/icon.ico"
  echo "    ✓ electron/resources/icon.ico  (Windows, 256x256, Fallback)"
fi

echo "==> Fertig. Inhalt von $OUT:"
ls -la "$OUT"
