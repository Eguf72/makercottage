// Pfade für NUTZER-DATEN – stabil und außerhalb des Code-Ordners.
//
// WARUM: Ein Code-Update (neu entpacken) ersetzt den Code-Ordner, aber NICHT
// diesen Daten-Ordner. So bleiben die SQLite-DB und die config.json nach jedem
// Update erhalten – „Update ohne Datenverlust" (v0.4.0).
//
// Standort, in dieser Reihenfolge:
//   1) MC_HOME            – Umgebungsvariable; überschreibt den Standard.
//   2) ~/.makercottage    – Standard auf allen Plattformen (portabel, leicht
//                           auffindbar). Ein pro-Plattform-Ordner
//                           (z. B. Windows %APPDATA%\makercottage) kann per
//                           MC_HOME gesetzt werden.
//
// Diese Datei liegt in server/ und wird beim Build MIT in das Bundle kopiert
// (siehe scripts/build-macos.sh). Sie ist die EINE Quelle für alle Daten-Pfade;
// database.js und config.js importieren sie statt einen eigenen Pfad zu rechen.

import { mkdirSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url)); // <root>/server

// --- Ziel: Nutzer-Daten-Ordner -------------------------------------------------
const MC_HOME_DEFAULT = join(homedir(), '.makercottage');
export const DATA_DIR = process.env.MC_HOME || MC_HOME_DEFAULT;
export const DB_PATH = join(DATA_DIR, 'makercottage.db');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');

// Ordner einmalig beim Import sicherstellen (recursive -> idempotent).
mkdirSync(DATA_DIR, { recursive: true });

// --- Einmalige, idempotente Migration aus den alten Standorten -----------------
// Alte Standorte lagen im Code-Ordner (wurden bei einem Update ersetzt) –
// deshalb migrieren wir sie einmalig in den stabilen Daten-Ordner:
const LEGACY_DB = join(__dirname, '..', '.cache', 'makercottage.db');
const LEGACY_CONFIG = join(__dirname, 'config.json');

// Kopiere ALT -> ZIEL NUR, wenn das Ziel fehlt (nicht destruktiv, idempotent).
// Der Altbestand bleibt als Backup erhalten (nie gelöscht). Falls beim Kopieren
// etwas schiefgeht, wird gewarnt – das Programm fährt mit dem (leeren) Ziel fort,
// damit ein fehlerhafter Altbestand den Start nicht blockiert.
function migrateOnce(src, dest, mode, label) {
  if (existsSync(dest)) return; // Ziel schon da -> nichts tun (kein Überschreiben)
  if (!existsSync(src)) return; // kein Altbestand -> nichts zu migrieren
  try {
    copyFileSync(src, dest);
    if (mode != null) chmodSync(dest, mode);
    console.log(
      `[paths] ${label} migriert: ${src} → ${dest} (Altkopie bleibt als Backup)`,
    );
  } catch (err) {
    console.warn(`[paths] Migration „${label}" fehlgeschlagen: ${err.message}`);
  }
}

// config.json zuerst (klein, sensibel -> 0o600), dann die DB (0o644 reicht).
migrateOnce(LEGACY_CONFIG, CONFIG_PATH, 0o600, 'config.json');
migrateOnce(LEGACY_DB, DB_PATH, null, 'makercottage.db');
