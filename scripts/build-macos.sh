#!/usr/bin/env bash
# MakerCottage – Build des portablen macOS-Bundles (arm64)
# Erzeugt:  dist/makercottage-macos-arm64/   (Lauffähig, doppelklickbar)
#            dist/makercottage-macos-arm64.zip
#
# Konfiguration über Umgebungsvariablen:
#   NODE_SOURCE=download  (Default) – offizielles Node-Tarball von nodejs.org.
#                                   Die offizielle Binär ist SELF-CONTAINED
#                                   (nur /usr/lib-System-Libs, kein Homebrew) →
#                                   läuft auf JEDEM Mac ohne Installation. Das ist
#                                   der einzige Weg für ein wirklich portables Bundle.
#   NODE_SOURCE=copy                  – nutzt die lokale Node-Binär
#                                       (process.execPath). Nur zum Schnell-Test
#                                       auf DIESEM Rechner: die Homebrew-Binär ist
#                                       NICHT self-contained (bindet ~30 /opt/homebrew
#                                       -dylib) → auf anderen Rechnern nicht lauffähig.
#   NODE_VERSION=v26.13.0          – Version für den Download (ABI = modules 147,
#                                   muss zu den better-sqlite3-Prebuilds passen)
#   ARCH=arm64                    – Architektur (arm64 | x64)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="makercottage-macos-arm64"
OUT="$ROOT/dist"
STAGE="$OUT/$NAME"

NODE_SOURCE="${NODE_SOURCE:-download}"
NODE_VERSION="${NODE_VERSION:-v26.13.0}"
ARCH="${ARCH:-arm64}"
# Cache: heruntergeladene, entpackte Node-Binär wiederverwenden (kein erneutes Laden)
NODE_CACHE="$OUT/.node-cache/darwin-${ARCH}/$NODE_VERSION"

echo "==> Stage: $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/bin" "$STAGE/launcher" "$STAGE/app" "$STAGE/web"

# 1) Frontend bauen
echo "==> (1/6) Frontend bauen (web/dist)"
( cd "$ROOT/web" && npm run build )
cp -R "$ROOT/web/dist" "$STAGE/web/dist"

# 2) Server-Code (nur Runtime-Dateien – keine Dev-Tests / config.json / .env)
echo "==> (2/6) Server-Code kopieren"
for f in config.js database.js discover.js index.js local.js network.js \
         package.json paths.js scan.js smb.js updatecheck.js; do
  cp "$ROOT/server/$f" "$STAGE/app/$f"
done

# 3) node_modules (inkl. better-sqlite3/prebuilds/*.node – plattformübergreifend)
echo "==> (3/6) node_modules kopieren"
cp -R "$ROOT/server/node_modules" "$STAGE/app/node_modules"

# 4) Launcher-Kern
echo "==> (4/6) Launcher kopieren"
cp "$ROOT/launcher/launcher.mjs" "$STAGE/launcher/launcher.mjs"

# 5) Node-Binär
echo "==> (5/6) Node-Binär (Quelle: $NODE_SOURCE)"
mkdir -p "$STAGE/bin"
if [ "$NODE_SOURCE" = "download" ]; then
  if [ -x "$NODE_CACHE/bin/node" ]; then
    echo "    aus Cache (bereits geladen): $NODE_CACHE"
    cp "$NODE_CACHE/bin/node" "$STAGE/bin/node"
  else
    URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${ARCH}.tar.xz"
    echo "    Herunterladen: $URL"
    # Portables Tempfile: X's AM ENDE der Template (mind. 3, hier 6). Kein
    # .tar.xz-Suffix; "tar -xJf" erzwengt Xz-Extraktion ohne Dateiendung.
    TAR="$(mktemp "${TMPDIR:-/tmp}/mcnode-XXXXXX")"
    curl -fsSL "$URL" -o "$TAR"
    # erst in den Cache entpacken, dann in den Bundle kopieren
    mkdir -p "$NODE_CACHE"
    tar -xJf "$TAR" -C "$NODE_CACHE"
    rm -f "$TAR"
    SRC="$NODE_CACHE/node-${NODE_VERSION}-darwin-${ARCH}/bin/node"
    if [ ! -x "$SRC" ]; then
      echo "    FEHLER: erwartete Binär nicht gefunden: $SRC" >&2
      exit 1
    fi
    cp "$SRC" "$STAGE/bin/node"
  fi
  echo "    Version: $( "$STAGE/bin/node" -p 'process.version' )  (ABI modules=$( "$STAGE/bin/node" -p 'process.versions.modules'))"
else
  BIN="$(node -e "process.stdout.write(process.execPath)")"
  cp "$BIN" "$STAGE/bin/node"
  echo "    kopiert aus: $BIN  (Version: $(node -p 'process.version'))"
  echo "    HINWEIS: copy-Modus ist NICHT self-contained (Homebrew-Runtime) – nur zum lokalen Test."
fi
chmod +x "$STAGE/bin/node"

# 6) Start-Datei + README + Zip
echo "==> (6/6) Start-Datei + README + Zip"
cp "$ROOT/scripts/launchers/MakerCottage.command" "$STAGE/MakerCottage.command"
chmod +x "$STAGE/MakerCottage.command"

# Version aus der Single-Source-of-Truth auslesen
MC_VERSION="$(node -e "const t=require('node:fs').readFileSync('$ROOT/web/src/version.js','utf8');const m=t.match(/VERSION = '([^']+)'/);process.stdout.write(m?m[1]:'?');" 2>/dev/null || echo '?')"

cat > "$STAGE/README.txt" <<EOF
MakerCottage v$MC_VERSION – portable (macOS, $ARCH)
====================================================

Starten:
  Doppelklick auf „MakerCottage.command" (Finder).
  Danach öffnet sich automatisch der Browser unter http://127.0.0.1:4000
  Das Terminal-Fenster hält das Backend am Leben – Tab/„x" schließt es.

Erster Start (Gatekeeper):
  macOS blockt evtl. das Skript mit „unklarer Quelle". Dann:
    1) Rechtsklick auf MakerCottage.command -> „Öffnen" -> „Öffnen".
  oder in der Kommandozeile (Pfad auf den Ordner dieses Start-Skripts zeigen):
    xattr -dr com.apple.quarantine „<Ordner>/MakerCottage-macos-arm64"

Einstellungen / NAS-Zugang:
  Im Browser im Tab „Einstellungen" eintragen (wird in
  ~/.makercottage/config.json gespeichert, Rechte 0o600).
  Alle Nutzer-Daten (DB + config) liegen in ~/.makercottage/ und sind über
  die Umgebungsvariable MC_HOME an einen anderen Ort verschievbar.
  Ein Update ersetzt nur den Code-Ordner, NICHT die Daten -> kein Datenverlust.
  (Alte Daten aus .cache/ und server/config.json werden beim ersten Start
  automatisch nach ~/.makercottage/ migriert; Altkopien bleiben als Backup.)

Beenden:
  Terminal-Terminator schließen oder „x" im Terminal-Tab.

Aktualisieren:
  Neuen Ordner DABEIN entpacken (Zip neben den bestehenden ziehen) und dort
  MakerCottage.command starten – das Backend startet neu, der Browser öffnet
  sich. Alle Nutzerdaten (DB + config.json in ~/.makercottage/) bleiben
  unberührt, weil sie außerhalb des Code-Ordners liegen.
  Info:  MakerCottage.command --version  (Version + Daten-Ordner)
         MakerCottage.command --check    (Update-Check via GitHub-Releases,
                                          MC_UPDATE_REPO; ohne Konfiguration
                                          -> manueller Update-Pfad)
         MakerCottage.command --help     (Übersicht + Umgebungsvariablen)
EOF

cd "$OUT"
rm -f "${NAME}.zip"
# .cache (Runtime-DB aus dem Smoke-Test) gehört NICHT in die Distribution
zip -r -q "${NAME}.zip" "$NAME" -x "${NAME}/.cache/*"

echo "==> (7/7) Smoke-Test (Launcher + Port + /api/config, NO_OPEN=1)"
# Eigener Port, damit der Test nicht mit einem laufenden Dev-Server auf 4000 kollidiert
PORT="${SMOKE_PORT:-4099}"
SMOKE_OK=0
# Launcher im Hintergrund (Browser wird durch NO_OPEN=1 NICHT geöffnet)
NO_OPEN=1 PORT="$PORT" "$STAGE/bin/node" "$STAGE/launcher/launcher.mjs" &
LPID=$!
# bis zu ~15 s auf den Port warten
for i in $(seq 1 75); do
  if curl -fsS "http://127.0.0.1:$PORT/api/config" >/dev/null 2>&1; then
    echo "    /api/config antwortet (nach $((i*200)) ms, Port $PORT)"
    SMOKE_OK=1
    break
  fi
  sleep 0.2
done
if [ "$SMOKE_OK" = "1" ]; then
  echo "    Smoke-Test bestanden."
else
  echo "    WARNUNG: Port $PORT wurde nicht bedient – Backend konnte nicht starten." >&2
fi
# sauber beenden (Kindprozesse mit)
kill "$LPID" 2>/dev/null || true
wait "$LPID" 2>/dev/null || true

echo "==> Fertig:"
echo "    Ordner:  $STAGE  (doppelklickbar: MakerCottage.command)"
echo "    Archiv:  $OUT/${NAME}.zip"
