# MakerCottage – Aufgabenliste

> Stand: 2026-11-15 · v0.6.0
> Fortschritt im Detail: `FORTSCHRITT.md`

## Legende (Zustand)
- **Fertig** – erledigt
- **Fertig (Code)** – geschrieben, aber nicht im Betrieb verifiziert
- **In Arbeit** – aktuell dran
- **Blockiert** – wartet auf Voraussetzung (z. B. fehlende Toolchain)
- **Ausgeschoben** – bewusst nicht im Prototyp, später

---

## Phase 0 – Vorbereitung
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T01 | Projektstruktur & Repo-Setup (`server/`, `web/`, `package.json`, `.gitignore`) | Fertig | Struktur angelegt |
| T02 | `.env.example` + `.gitignore` | Fertig | Zugangsdaten ausgeschlossen |

## Phase 1 – Backend (Node.js + Fastify + SMB)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T03 | Fastify-Server (`server/index.js`) | Fertig (Code) | API + statisches Frontend |
| T04 | `server/config.js` – `.env` / `config.json` | Fertig (Code) | config.json hat Vorrang |
| T05 | `server/smb.js` – Verbindung + Ordner-Scan | Fertig | `@winlinux/smb2` + `@winlinux/auth` (NTLM); flach + optionales `MAX_DEPTH`; Fehlerpfad getestet |
| T06 | `server/scan.js` – Typ-Erkennung + Filter + Sort + Suche | Fertig (Code) | STL/3MF/Gcode/OBJ/AMF/PLY |
| T07 | API-Endpunkte (`/api/files`, `/config`, `/types`, `/nas/discover`) | Fertig (Code) | Passwort nie zurückgegeben |

## Phase 2 – Frontend (Vite + React)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T08 | Vite + React Setup (`web/`) | Fertig (Code) | Proxy `/api` → 4000 |
| T09 | `web/src/api.js` – API-Client | Fertig (Code) | |
| T10 | `FileList` (Tabelle: Name, Typ, Größe, Datum, Pfad) | Fertig (Code) | |
| T11 | Filter nach Typ | Fertig (Code) | |
| T12 | Textsuche nach Name | Fertig (Code) | |
| T13 | Sortierung (Name/Größe/Datum/Typ) | Fertig (Code) | |
| T14 | Fehler- & Leerzustände | Fertig (Code) | |
| T19 | `ConfigForm` + Button „NAS finden" | Fertig (Code) | Persistenz via T18 |

## Phase 3 – Doku & Abschluss
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T15 | `README.md` mit Start-Anleitung | Fertig | |
| T16 | Läuft lokal durch: NAS-Liste + Filter/Suche sichtbar | Fertig | Server läuft auf Port 4000, listet 6 Einträge gegen echtes NAS (4× 3MF + 2 Ordner); Fehler- (502) und Erfolgs-Pfad bestätigt |

## Sonderaufgaben
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T17 | `server/discover.js` + `GET /api/nas/discover` (Netzwerk-Suche) | Fertig | `bonjour-service` korrekt (`find()`/`up`/`stop()`); Fehlerpfad getestet |
| T18 | NAS-Zugang vom Nutzer speichern (`POST /api/config` → `config.json`) | Fertig (Code) | 0o600, Passwort erhalten |

---

## Branding & Versionierung
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T20 | Umbenennen → MakerCottage (Branding + Ordner) | Fertig | Altname „3D Projektmanager" entfernt |
| T21 | Logo transparent (hellgrau + orangener Pfeil), 168px, ohne weißen Container | Fertig | `MakerCottage_logo.svg`, JPG entfernt |
| T22 | Favicon JPG → PNG + `manifest.json`; redundantes JPG gelöscht | Fertig | 1024/512/192; `index.html` zeigt PNG |
| T23 | Farbschema: Oliven-Grund `#384b41` + harmonisierte Palette, Akzent Blau→Orange `#e8833a` | Fertig | reversibel, ein Wert in `style.css` |
| T24 | Footer: `MakerCottage · v{VERSION}` + `created by Eguf72` | Fertig | Version aus `version.js` |
| T25 | Versionierung v0.0.1 (Fix→Patch+1, Feature→Minor+1/Patch 0), Single Source `version.js` | Fertig | Startwert 0.0.1 |

---

## Navigation / UI
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T26 | Tab-Menü „Dateien / Einstellungen"; NAS-Zugang in „Einstellungen" | Fertig | `useState`-Tab in `App.jsx`, `.tabs` in `style.css`; v0.1.0 (Minor +1) |
| T27 | Subtitle „3D-Druck-Dateien vom NAS verwalten" entfernen | Fertig | `<p className="subtitle">` + `.subtitle`-Regel entfernt; v0.1.1 (Patch +1) |
| T28 | Quelle wählen: NAS/SMB oder lokales Verzeichnis (`SOURCE`) | Fertig | `config.js` (SOURCE + `configSource`); `/api/files` verzweigt; v0.2.0 (Minor +1) |
| T29 | Pfad-Picker (Durchsuchen statt tippen) für NAS + lokal | Fertig | `server/local.js` + `browseNas` + `POST /api/browse`; `ConfigForm.jsx`; v0.2.0 |
| T30 | Versteckte Ordner im Pfad-Picker ausblenden + Umschalter „Versteckte anzeigen" | Fertig (v0.2.1) | `local.js`/`smb.js` filtern nach führendem Punkt; `ConfigForm.jsx` mit Checkbox; `index.js` weitergereicht; Patch +1 → `0.2.1` |
| T31 | Dateiliste zeigt nur Dateien, keine Ordner/versteckten | Fertig (v0.2.2) | `listFiles`/`collectFiles` (smb.js) + `listFilesLocal`/`collectLocal` (local.js) filtern `!isDirectory && !isHidden`; Picker unbeeinflusst; Patch +1 → `0.2.2` |

---

## Datenbank, Detailfenster & Druckdaten
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T32 | SQLite-Modul `server/database.js` (`file_index`, `scan_history`, `settings`) | Fertig (v0.2.3) | `better-sqlite3`; DB ursprünglich in `.cache/makercottage.db`, seit v0.5.0 (P0) in `~/.makercottage/` (Migration, `server/paths.js`); idempotente Migration |
| T33 | Datei-Index-Endpunkte (`/api/db/files`, `/api/db/scan`, `/api/db/file`, `/settings`) | Fertig (v0.2.3) | Upsert nach Name; Scan berührt Druck-Felder nicht |
| T34 | Detailfenster `FileDetail.jsx` (Modal, zwei Tabs, ESC/✕/Hintergrund) | Fertig (v0.2.3) | `FileList.jsx` Name-only + Klick → Detailfenster |
| T35 | Tab „Druck": Zeit, Kosten, Filamente, Nozzle, Platten, Notizen + Kostenschätzung | Fertig (v0.2.4) | `POST /api/db/file/print`; Schätzung `(g/1000) × filament_price_per_kg` |
| T36 | Tab „Herstellen" entfernen, Tags in „Metadaten" | Fertig (v0.2.5) | zwei Tabs: Druck (aktiv) / Metadaten |
| T37 | Metadaten-Tab: Pfad-Feld, Tags-Fläche entfernen | Fertig (v0.2.6) | vollständiger Pfad sichtbar |
| T38 | Versionen auf `0.2.6` synchronisieren | Fertig (v0.2.6) | `version.js` + `database.js` + beide `package.json` |
| T39 | Metadaten-Tab-Footer bereinigen (Tab ist read-only, toter Tags-Code entfernen) | Fertig (v0.2.7) | Footer tab-abhängig (Metadaten-Tab → „Schließen"); `api.updateFileTags` + `.tags-section` entfernt; `POST /api/db/file/tags` bleibt |
| T40 | Datei-Ansicht aufräumen: doppelte „Dateien"-Überschrift + Sortier-Dropdown entfernen | Fertig (v0.2.8) | `<h2>Dateien</h2>` weg (nav-Tab reicht); Sortier-Dropdown + ↑/↓-Taste + State `sort`/`order` entfernt; Liste bleibt Name/aufsteigend (Backend-Default) |
| T41 | Druckname in der Datei-Übersicht anzeigen | Fertig (v0.2.9) | `getPrintNameMap()` + `withPrintNames()` im `/api/files`; dezentem Unterzeile `.file-sub` (nur wenn gesetzt **und** abweichend) |
| T42 | Nur Druckname in der Liste + Dateiname als Platzhalter beim Scan | Fertig (v0.2.10) | `upsertFile` füllt `print_name` mit Dateiname (Backfill); `withPrintNames` Fallback `f.name`; `FileList` zeigt nur `print_name` (Dateiname als `title`); `.file-sub` entfernt |

---

## Desktop-Wrapper (v0.3.0)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T43 | Portabler Launcher (Option A) + Electron-fähiger Kern | Fertig | `launcher/launcher.mjs` (geteilter, plattformübergreifender Kern): startet den Server als **Kindprozess** mit `bin/node` (nicht `process.execPath`, damit die `better-sqlite3`-ABI stimmt), wartet per **TCP-`net.connect`** auf den Port, öffnet die UI per injizierbarer `openUI` (A: `open`/`xdg-open`/`start` · C: `BrowserWindow.loadURL`); Signal-Weiterleitung (SIGINT/SIGTERM→Kind), `NO_OPEN=1` für Tests/CI. Start-Datei pro OS: macOS `MakerCottage.command` (`.sh`/`.bat` vorbereitet). Build: `scripts/build-macos.sh` → `dist/makercottage-macos-arm64/` + `.zip`. **Node-Binär: `download` (Default)** = offizielle, **self-contained** Binär (`otool -L` nur `/usr/lib`-System-Libs, kein Homebrew) → lauffähig auf jedem Mac; `copy` nur als schneller Lokaltest. `better-sqlite3`-Prebuilds kommen mit `node_modules`. **Smoke-Test im Build (bestanden).** `.cache` aus Distribution exkludiert. A→C = nur `openUI` austauschen. |
| T44 | Linux- & Windows-Build ausrollen (Skripte vorhanden) | In Arbeit | `MakerCottage.sh` / `.bat` + Build-Hook vorbereitet; native BUILDS für Linux/Windows erfordern die jeweilige Zielplattform (oder CI). |
| T45 | Electron-Wrapper (Option C) | In Arbeit | `launcher/launch({ openUI })` bereits injizierbar; `electron` + `electron-builder` + Signing/Notarization folgt. |

---

## Übersicht rechts & Name-Spalte (v0.3.1–v0.3.2)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T46 | Name-Spalte max 30 Zeichen (Rest im Tooltip) | Fertig (v0.3.1) | `FileList.jsx` `MAX_NAME_LEN = 30` (29 + „…"), voller Name als `title`; `.table td { white-space: nowrap }`; isoliert + visuell geprüft |
| T47 | Übersicht rechts: Donut nach Endung + jüngste 5 Dateien | Fertig (v0.3.2) | `database.js` `getTypeCounts()` + `getRecentFiles(5)`; `GET /api/db/overview` (`total`/`byType`/`recent`); `Overview.jsx` (SVG-Donut + Legende + Liste) als **Standard-Ansicht** rechts (ersetzt `FileDetail` bei Auswahl); rechte Spalte `420→540px` |
| T48 | Übersicht-Stacking-Härtung: Liste kollabiert bei <800px nicht auf 0 | Fertig (v0.3.2) | `@media (max-width:800px)` `.filelist-table-wrap { flex: none }` (sonst ererbtes `flex:1 1 0` → in column-Modus Höhe 0, Zeilen geklippt); visuell geprüft |
| T49 | Datei im Ordner öffnen (📂 Button + `POST /api/db/file/reveal`) | Fertig (v0.3.3) | `server/index.js` `revealInFileManager()` (macOS `open -R`, Win `explorer /select,`, Linux `xdg-open`); NAS-Quelle → Hinweis mit Share-Pfad statt Fehler; `FileDetail.jsx` Button im Metadaten-Tab; `api.revealFile()`; `style.css` `.reveal-btn`/`.reveal-btn-lg`/`.reveal-msg`. **v0.5.0:** 📂 aus der Liste entfernt (nur Detail-Button, 📁-Marker vor Ordner-Zeilen bleibt, T51); der `reveal`-Endpunkt + `FileDetail`-`reveal()`-Handler waren durch eine frühere Edit clobbered/leer und wurden wiederhergestellt (T55). |
| T50 | Version-Signal / Skew-Hinweis (P1) | Fertig (v0.3.3) | `GET /api/version` liest `server/package.json`; `api.getVersion()`; Footer zeigt UI- + Server-Version, bei Abweichung „⚠ Server vX ≠ UI vY – bitte neu entpacken"; `style.css` `.footer-skew`. **P0 (Daten-Trennung + Migration) ist jetzt fertig** (T56, v0.5.0); P2a (CLI `--version`/`--check`) bleibt separat offen. |

---

## UI-Enhancements, Slicer & Daten-Trennung (v0.5.0)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T51 | 📂-Button aus der Dateiliste entfernen | Fertig (v0.5.0) | `FileList.jsx`: 📂-Zeilen-Button weg; 📁-Marker vor Ordner-Zeilen bleibt (Visuelles für Ordner). |
| T52 | Slicer-Button „🧩 Slicer öffnen" im Detail + `POST /api/db/file/openInSlicer` + config-Feld `slicer` | Fertig (v0.5.0) | `FileDetail.jsx` Button im Druck-Tab + `openInSlicer()`; `api.openInSlicer()`; `server/index.js` Endpunkt (`resolveSlicerApp` + `startSlicer`, plattformabhängig macOS/Windows/Linux); NAS → Hinweis mit Share-Pfad; `config.js` `slicer` (getConfig/publicConfig/saveConfig, `SLICER`). |
| T53 | Slicer in „Einstellungen" konfigurierbar (Preset + Freitext) | Fertig (v0.5.0) | `ConfigForm.jsx`: Dropdown Cura/PrusaSlicer/BambuStudio/OrcaSlicer/SuperSlicer + „Eigener …"; Wert → `config.slicer` (`~/.makercottage/config.json`); Preset case-insensitiv, sonst Freitext. |
| T54 | Hintergrund-Klick hebt Auswahl auf (Rückkehr zur Übersicht) | Fertig (v0.5.0) | `FileList.jsx`: Klick auf `.filelist-body`-Fläche setzt `currentFile` → `null`; ignoriert Klick auf `tr` oder `.filelist-detail`. |
| T55 | Review-Bugfixes (Build blockiert / Features unsichtbar) | Fertig (v0.5.0) | `index.js`: `POST /api/db/file/reveal` war leer + orphaniertes Code-Block → Handler wiederhergestellt, Block entfernt. `FileDetail.jsx`: `reveal()`-Deklaration fehlte (await auf Modulstufe → Build rot) + Name auf `reveal` (Call-Site) + `slicerMsg` nie gerendert → `{slicerMsg && …}` ergänzt. |
| T56 | Daten-Trennung P0 + einmalige Migration (v0.4.0-Plan, in v0.5.0 veröffentlicht) | Fertig (v0.5.0) | `server/paths.js`: `DATA_DIR = MC_HOME \|\| ~/.makercottage`, `DB_PATH`, `CONFIG_PATH`, idempotente/nicht-destruktive Migration (ALT → ZIEL bei fehlendem Ziel, Altkopie bleibt, `config.json` `0o600`). `database.js`/`config.js` importieren Pfade aus `paths.js`. Versions-Sync `0.5.0` (version.js + Changelog, beide package.json). |
| T57 | CLI `--version`/`--check`/`--help` im Launcher + README „Aktualisieren" (P2a, v0.4.0-Plan) | Fertig (v0.5.1) | `launcher.mjs`: Flags vor dem `import.meta.main`-Start (Version aus `app/package.json`, Daten-Ort `MC_HOME \|\| ~/.makercottage`, spiegelt `paths.js`); `--check` = manueller Update-Pfad (kein Remote = Stub für P2b). Skripte `.command/.sh/.bat` reichen `"$@"`/`%*` durch. `README.md` „Aktualisieren"-Abschnitt; `build-macos.sh` README.txt ergänzt. Versions-Sync `0.5.1` (version.js + Changelog, beide package.json, `database.js` defaultSettings, `db_version` bleibt 5). |

---

## Remote-Update-Check (v0.6.0, P2b)
| ID | Aufgabe | Zustand | Notiz |
|----|---------|---------|-------|
| T58 | Remote-Update-Check: GitHub-Releases via `getupdatecheck.js` + `GET /api/update/check` + Launcher `--check` + UI-Footer-Banner | Fertig (v0.6.0) |
| T59 | `@fastify/static` Major-Bump `^8.0.3` → `^10.1.11` (3 Security-Vulns geschlossen) | Fertig | **Geteiltes Modul** `server/updatecheck.js` (kein Fastify/React → von **Server UND Launcher** importiert): `checkForUpdate()` (wirft **nie**), `compareVersions()` (semver-Kern, `v`-Präfix + Prerelease-Strip), `resolveConfig()`, In-Memory-Cache (TTL `MC_UPDATE_CACHE_MS`=5 min). **Konfiguration** via Env: `MC_UPDATE_REPO` (Default `Eguf72/makercottage`; leer → `configured:false` → sauberer manueller Pfad, kein Crash), `MC_UPDATE_GH_TOKEN` (Bearer → Rate-Limit 60→5000/h), `MC_UPDATE_GITHUB_API` (Enterprise/Proxy), `MC_UPDATE_TIMEOUT_MS` (8 s). **Endpunkte/Pfade:** `GET /api/update/check` (serverseitig → umgeht Browser-CORS gegen GitHub); Launcher `--check` (echter Check, **kein Server-Start** – dynamischer Import des Nachbar-Moduls; asynchron + `handled`-Flag, damit `launch()` nicht durchläuft); UI-Footer `⚠ Update verfügbar v{latest} · Herunterladen` (nur bei `available:true`, `style.css` `.footer-update`). **Fehlerpfade** (Netz/Timeout/Rate-Limit/404/unbekannt) → `{available:false, error:<menschenlesbar>}`. **Versions-Sync 0.6.0** (version.js + Changelog, beide package.json, `database.js` defaultSettings; `db_version` bleibt 5). **Verifiziert:** `node --check` grün; Vite-Build grün; macOS-Bundle + Smoke-Test bestanden; `/api/update/check` live (404→`available:false`, `nodejs/node`→`available:true`); `--check` in Bundle (beide Fälle, Exit 0). |

---

## Ausblick (nicht im Prototyp)
| ID | Aufgabe | Zustand |
|----|---------|---------|
| F01 | 3D-Ansicht: `react-three-fiber` + `/api/files/:id/preview` | Ausgeschoben |
| F02 | Tags / Kategorien (+ SQLite) | **Fertig** (v0.2.3) |
| F03 | Druckstatus / Druck-Schlange (Queue) | Druckdaten Fertig (v0.2.4), Queue offen |
| F04 | Desktop-Wrapper – Option A (portabel) **Fertig v0.3.0**; Option C (Electron) offen | In Arbeit | T43 (A), T45 (C) |
| F07 | GUI-Umgstaltung: Side-by-Side-Layout | **Fertig** (v0.3.1) | Liste links + Detail rechts inline; Review: 3 Fehler behoben. **Responsive:** < 800px stapelt (Liste oben, Detail darunter, kein horizontaler Überlauf) + visuelle Verifizierung via Chrome-Headless/CDP (`docs/screenshots/`) |
| F05 | NFS-Adapter neben SMB | Ausgeschoben |
| F06 | UI-Feld für Referenzpreis `filament_price_per_kg` | Ausgeschoben (aktuell per API) |

---

## Offene Entscheidungen / Blocker
- [x] Scan **flach** + optionales `MAX_DEPTH`
- [x] NAS-Zugang vom Nutzer eingegeben
- [x] **Netzwerk-Suche** umgesetzt (T17/T19)
- [x] **Blocker (gelöst):** Node.js 18+ / npm ist installiert (v26).
- [x] **Blocker (gelöst):** falsches SMB-Paket `smb2@^1.0.3` (existiert nicht) → jetzt `@winlinux/smb2` + `@winlinux/auth`, `npm install` läuft durch.
- [x] **T16 (erledigt):** Echte NAS-Liste gegen das eigene NAS bestätigt – 6 Einträge (4× 3MF + 2 Ordner) auf Port 4000; Fehlerpfad (502) ebenfalls getestet.
- [x] **T26 (erledigt):** Untermenü „Einstellungen" (v0.1.0) – NAS-Zugang in den Tab verschoben, Dateiliste unter „Dateien"; im Browser verifiziert.
- [x] **T28/T29 (erledigt):** Quelle „NAS/Lokales Verzeichnis" + Pfad-Picker (v0.2.0) – `SOURCE` in `config.json`, `POST /api/browse` + `server/local.js`, im Browser verifiziert (beide Quellen).
- [x] **T32–T42 (erledigt):** SQLite-DB + Detailfenster + Druckdaten (v0.2.3–v0.2.10) – im Browser verifiziert; Versionen synchron. T39: Metadaten-Tab-Footer bereinigt (read-only, toter Tags-Code entfernt). T40: Datei-Ansicht aufgeräumt (doppelte „Dateien"-Überschrift + Sortier-Dropdown entfernt). T41: Druckname in der Liste. T42: nur noch Druckname sichtbar; Dateiname als Platzhalter beim Scan (Backfill + Fallback).
- [x] **T59 (erledigt):** `@fastify/static@^8.0.3` → `^10.1.11` – 3 Security-Vulns geschlossen (path traversal, route guard bypass, auth bypass). `npm audit` = 0 Vulnerabilities. Server-Smoke-Test bestanden.
- [x] **T39 (erledigt):** Metadaten-Tab-Footer bereinigt (v0.2.7) – toter Tags-Code (`tags`/`editing`/`saved`, `handleSaveTags`) + `api.updateFileTags` + `.tags-section` entfernt, Footer tab-abhängig (Metadaten-Tab → „Schließen"); veraltete Kommentare korrigiert.
- [x] **T40 (erledigt):** Datei-Ansicht aufgeräumt (v0.2.8) – doppelte Überschrift `<h2>Dateien</h2>` in `App.jsx` entfernt (Navigationstabs-Button reicht) und Sortier-Dropdown (Name/Größe/Datum/Typ) + ↑/↓-Richtungstaste + State `sort`/`order` in `FileList.jsx` entfernt; Liste sortiert weiterhin standardmäßig nach Name aufsteigend (Backend-Default `sort=name`/`order=asc`).
- [x] **T41 (erledigt):** Druckname in der Datei-Übersicht (v0.2.9) – `getPrintNameMap()` (eine DB-Abfrage, Name→Druck-Name, jüngster gewinnt) + `withPrintNames()` reichern `/api/files` (lokal + NAS) um `print_name`; `FileList.jsx` zeigt ihn als dezentem Unterzeile `.file-sub` nur wenn gesetzt **und** vom Dateinamen abweichend; `style.css` ergänzt.
- [x] **T42 (erledigt):** Nur Druckname in der Liste (v0.2.10) – `upsertFile` füllt `print_name` beim Neuanlegen mit dem Dateinamen (Platzhalter) + Backfill für ältere leere Einträge; `getPrintNameMap`/`withPrintNames` mit Fallback `f.name`; `FileList.jsx` zeigt nur `print_name` (Dateiname als `title`); Detail-Feld heißt „Druckname" mit `placeholder="Leer lassen = Dateiname"`; `.file-sub` entfernt.
- [x] **F07 (erledigt) + Responsive-Härtung (v0.3.1):** Side-by-Side-Layout (Liste links + Detail rechts inline) + **Responsive**: neue `@media (max-width: 800px)` stapelt die Spalten (`flex-direction: column`, Detail volle Breite / `min-width: 0`, Liste `max-height: 45vh`, Detail-Body `max-height: none`). **Visuell verifiziert** via **Chrome-Headless + CDP** (keine Browser-Session nötig): gemessen `flexDirection` `row`→`column`, `overflow` `false` bei 780px (vorher `true` bei 390px); 4 Zustands-Screenshots in `docs/screenshots/` (Platzhalter, Druck-Tab, Metadaten-Tab, gestapelt). Funktion unverändert.
- [x] **T46 (erledigt, v0.3.1):** Name-Spalte auf max 30 Zeichen gekürzt – `FileList.jsx` `MAX_NAME_LEN = 30` (29 Zeichen + „…"), voller Name im `title` (Hover-Tooltip), `.table td { white-space: nowrap }`; alle Zellen ≤ 30 Zeichen (gemessen 20) visuell bestätigt.
- [x] **T47/T48 (erledigt, v0.3.2):** Übersicht rechts als **Standard-Ansicht** – Donut nach Endung (`getTypeCounts()` → `byType`, mit % + Legende) + jüngste 5 Dateien (`getRecentFiles(5)` → `recent`); Backend `GET /api/db/overview` liefert `{total, byType, recent}` in einer Runde; `Overview.jsx` mit SVG-Donut (Stroke-Dasharray), 2-Spalten-Legende und „Zuletzt hinzugefügt"-Liste; rechte Spalte `420→540px`. Bei Dateiauswahl wird das Detail inline eingeblendet. **Verifiziert:** CDP 1024px `row`/540px/`overflow false`; 780px `column`/Liste 226px hoch + Übersicht darunter/`overflow false` (T48-Fix: `flex: none` statt ererbtem `flex:1 1 0`). Build OK (CSS 10.31 kB, JS 165.17 kB).
