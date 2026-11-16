// Semantische Versionsnummer — Einzige Quelle der Wahrheit (Single Source of Truth).
//
// Schema: MAJOR.MINOR.PATCH, Major bleibt 0.
//   - Fehlerkorrektur  -> 3. Zähler (Patch) +1          (z. B. 0.0.1 -> 0.0.2)
//   - Neue Funktion    -> 2. Zähler (Minor) +1,
//                        3. Zähler (Patch) auf 0         (z. B. 0.0.1 -> 0.1.0)
//
// Startwert: 0.0.1
// v0.1.0 – neues Untermenü „Einstellungen" (NAS-Zugang verschoben) -> Minor +1
// v0.1.1 – Subtitle „3D-Druck-Dateien vom NAS verwalten" entfernt -> Patch +1
// v0.2.0 – Quelle „NAS/Lokales Verzeichnis" + Pfad-Picker (wählen statt tippen) -> Minor +1
// v0.2.1 – Picker blendet versteckte Ordner/Dateien aus (+ Umschalter „Versteckte anzeigen") -> Patch +1
// v0.2.2 – Dateiliste zeigt nur Dateien, keine Ordner/versteckten Einträge -> Patch +1
// v0.2.3 – Detailfenster mit zwei Tabs (Herstellen/Metadaten) + bearbeitbare Tags -> Patch +1
// v0.2.4 – Tab „Druck" mit Druckzeit, Filament, Material, Drucker, Status, Kosten, Notizen -> Patch +1
// v0.2.5 – Tab „Herstellen" entfernt, bearbeitbare Tags in den Tab „Metadaten" verlagert -> Patch +1
// v0.2.6 – Metadaten-Tab: Pfad-Feld ergänzt, Tags-Fläche entfernt; Versionen in allen
//          Dateien synchronisiert (Single Source of Truth: version.js) -> Patch +1
// v0.2.7 – Metadaten-Tab-Footer bereinigt: „Tags speichern" entfernt (Tab ist read-only),
//          toter Tags-Code (State, handleSaveTags, api.updateFileTags, .tags-section)
//          und veraltete Kommentare entfernt -> Patch +1
// v0.2.8 – Datei-Ansicht aufgeräumt: doppelte Überschrift „Dateien" entfernt (nav-Tab
//          + <h2>) und Sortier-Dropdown (Name/Größe/Datum/Typ) + Richtungstaste entfernt;
//          Liste bleibt standardmäßig nach Name aufsteigend -> Patch +1
// v0.2.9 – Datei-Übersicht zeigt den Druckname als dezentem Unterzeile unter dem
//          Dateinamen (nur wenn gesetzt und abweichend); Druckname kommt jetzt aus
//          der DB (getPrintNameMap) im /api/files-Ergebnis mit -> Patch +1
// v0.2.10 – Datei-Übersicht zeigt nur noch den Drucknamen (kein zweizeiliger
//          Druck-/Datei-Name mehr); beim Scannen wird der Dateiname als
//          Platzhalter in print_name eingetragen (Backfill + Fallback „leer =
//          Dateiname"); Detail-Feld heißt „Druckname" mit Platzhalter-Hinweis -> Patch +1
// v0.3.0  – Desktop-Wrapper (portable Launcher, Option A): geteilter
//          plattformübergreifender Launcher-Kern (launcher/launcher.mjs) startet
//          den Server als Kindprozess (bin/node), wartet auf den Port und öffnet
//          die UI; Start-Datei pro OS; Electron-fähig (openUI injizierbar). -> Minor +1
// v0.3.1 – Side-by-Side-Layout (Liste links, Detail rechts) + Responsive-Härtung
//          (≤800px stapeln), Name-Spalte max 30 Zeichen -> Patch +1
// v0.3.2 – Übersicht rechts (Standard-Ansicht): Donut nach Endung + jüngste 5
//          Dateien, rechter Bereich breiter; Backend GET /api/db/overview -> Patch +1
// v0.3.3 – Version-Signal: GET /api/version (Server-Version aus package.json) +
//          API-Client getVersion; Footer zeigt UI- und Server-Version und warnt
//          bei Skew („Server ≠ UI – bitte neu entpacken"). Update-Quelle folgt
//          (kein Remote-Check jetzt). -> Patch +1
// v0.4.0 – Daten-Trennung (P0): Nutzer-Daten wandern in den stabilen Ordner
//          ~/.makercottage/ (DB + config.json), per MC_HOME überschreibbar.
//          server/paths.js führt beim ersten Start eine einmalige, idempotente,
//          nicht-destruktive Migration aus den alten Standorten (.cache/makercottage.db,
//          server/config.json) durch – Altkopien bleiben als Backup. Damit
//          überlebt ein Code-Update die Daten. -> Minor +1
// v0.5.0 – Datei-Übersicht aufgeräumt + Slicer: 📂-Button in der Liste entfernt
//          (der 📁-Marker vor Ordner-Zeilen bleibt), Slicer-Button „🧩 Slicer
//          öffnen" im Druck-Tab (POST /api/db/file/openInSlicer) – konfigurierbar
//          über ein Preset-Dropdown (Cura/PrusaSlicer/BambuStudio/OrcaSlicer/
//          SuperSlicer) + Freitext in den „Einstellungen" (Feld config.slicer),
//          Klick auf die leere Fläche der Liste hebt die Auswahl auf (Rückkehr zur
//          Übersicht). Version-Signal 0.5.0 in allen Quellen synchron. -> Minor +1
// v0.5.1 – CLI-Flags im Launcher: --version/--check/--help (Version aus
//          app/package.json, Daten-Ort MC_HOME || ~/.makercottage; manueller
//          Update-Pfad als Stub) + README-Abschnitt „Aktualisieren". -> Patch +1
// v0.6.0 – Remote-Update-Check (P2b): server/getupdatecheck.js (geteilt, nie
//          hart) + GET /api/update/check (GitHub-Releases, umgeht Browser-CORS)
//          + Launcher --check (echter Check, kein Server-Start) + UI-Footer-Banner
//          „⚠ Update verfügbar v… · Herunterladen". Konfigurierbar via
//          MC_UPDATE_REPO (Default Eguf72/makercottage), -GH_TOKEN, -GITHUB_API,
//          -TIMEOUT_MS, -CACHE_MS; leerer/fehlender Wert -> manueller Pfad.
//          -> Minor +1 (neue Fähigkeit).
// v0.7.0 – Electron-Wrapper (Option C, T45): gebautes Desktop-App-Bundle
//          (.dmg/.zip/.app via electron-builder) mit BrowserWindow (openUI=
//          loadURL), platform-nativem MC_HOME (app.getPath('userData')),
//          Menü + sauberem Beenden (Fenster → SIGTERM). Server läuft weiter
//          als Kindprozess auf bin/node (better-sqlite3-ABI). Icons aus dem
//          Favicon; un-signiert lokal testbar (UNSIGNED=1). Offen: Signing/
//          Notarization + native Cross-Platform-Builds (CI). -> Minor +1
export const VERSION = '0.7.0';
