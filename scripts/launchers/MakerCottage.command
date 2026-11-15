#!/usr/bin/env bash
# MakerCottage – Start-Datei (macOS). Doppelklick im Finder.
# Ruft den geteilten Launcher-Kern mit der mitgelieferten Node-Binär auf.
# exec -> wenn das Backend beendet wird, schließt sich das Terminal-Fenster.
#
# Guard: Diese Datei ist die LAUFZEIT-Datei des GEBAUTEN Bundles. Wird sie
# versehentlich aus dem Quell-Ordner (scripts/launchers/) gestartet, fehlt dort
# bin/node -> klare Meldung + warten statt "blitzschnell zu".
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$DIR/bin/node"

if [ ! -x "$NODE_BIN" ]; then
  echo
  echo "  ╭─────────────────────────────────────────────────────────────╮"
  echo "  │  MakerCottage konnte nicht starten.                          │"
  echo "  │                                                               │"
  echo "  │  Die mitgelieferte Node-Binär fehlt hier:                    │"
  echo "  │    $NODE_BIN"
  echo "  │                                                               │"
  echo "  │  Du hast höchstwahrscheinlich die FALSCHE Datei gestartet:   │"
  echo "  │  einen Quell-Ordner statt des gebauten Bundles.             │"
  echo "  │                                                               │"
  echo "  │  Richtig ist der GEBRAUTE Ordner (mit eigener bin/node):     │"
  echo "  │    dist/makercottage-macos-arm64/MakerCottage.command        │"
  echo "  │                                                               │"
  echo "  │  Bei neuem Code erst bauen:  npm run build   (Projekt-Ordner) │"
  echo "  ╰─────────────────────────────────────────────────────────────╯"
  echo
  echo "  [Enter zum Schließen] ..."
  read -r _ || true
  exit 1
fi

exec "$NODE_BIN" "$DIR/launcher/launcher.mjs" "$@"
