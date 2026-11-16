# MakerCottage – Fortschrittsprotokoll

Einfachste Chronologie: **jüngster Eintrag oben**.
Aufgabenliste: `AUFGABEN.md` · Gesamtplan: siehe Chat-Verlauf.

---

## 2026-11-16 – v0.7.0: Versions-Bump (T45 Electron-Wrapper)
- **Minor-Bump `0.6.0` → `0.7.0`** (neue Fähigkeit: gebautes Desktop-App-Bundle
  via Electron / Option C). Konsistent in allen Quellen:
  - `server/package.json`, `web/package.json`, `electron/package.json` → `0.7.0`
  - `web/src/version.js` `VERSION` → `'0.7.0'` (+ Changelog-Kommentar v0.7.0)
  - `server/database.js` `defaultSettings` `version` → `'0.7.0'`
    (nur neue DBs; bestehende behalten ihren gespeicherten Wert)
  - alle 3 `package-lock.json`-Roots synchron (server/electron `0.6.0`→`0.7.0`;
    web war bereits drift bei `0.1.0` → jetzt `0.7.0`)
  - `db_version` bleibt `5` (kein Schema-Änderung).
- **`AUFGABEN.md`** „Stand: 2026-11-16 · v0.7.0".
- **Verifizierung:** `node --check` (server/launcher), Vite-Build grün,
  `GET /api/version` → `0.7.0`, Electron-Build `MakerCottage-0.7.0-arm64.*`.
- **Historische `0.6.0`-Referenzen** (FORTSCHRITT/PLAN/Code-Kommentare)
  bewusst belassen – sie dokumentieren „erledigt in v0.6.0".

---

## 2026-11-16 (GUI-Live-Test) – T45: Fenster-Start + Icon-Fix
- **GUI-Fenster live getestet** (der letzte noch ungetestete Teil von T45):
  gebautes `.app` startet auf Port 4056, `bin/node`-Kindprozess läuft,
  `openUI=win.loadURL()` lädt die UI, Log zeigt `[launcher] UI geöffnet:
  http://127.0.0.1:4056` + Frontend-Assets (`/`, JS, CSS) + alle API-
  Endpoints (`/api/config`, `/api/types`, `/api/version`, `/api/update/check`,
  `/MakerCottage_logo.svg`) liefern 200. Sauberes Beenden via SIGTERM
  (Fenster → `shutdown('SIGTERM')`) bestätigt.
- **Icon-Pfad-Fix** (gefunden im Live-Log): `Failed to load image from
  '.../app.asar/resources/icon.png'`. Ursache: im gepackten App ist
  `__dirname` in `app.asar` → `path.join(__dirname,'resources','icon.png')`
  führte zu einem inexistenten Pfad. Fix: `iconPath` nutzt im gepackten App
  `process.resourcesPath/icon.png` (via neue `extraResources`-Entry
  `resources/icon.png → icon.png`), in der Entwicklung `__dirname/resources`.
  `icon.png` liegt jetzt unter `Contents/Resources/`; Warnung im Log weg.
- **T45 damit: Code + Build + GUI-Start verifiziert.** Offen bleiben nur
  externe Abhängigkeiten (Signing/Notarization, native Cross-Platform-Builds).

---

## 2026-11-16 (Fortsetzung) – T45: Icons + electron-builder-Test (ohne Signing)
- **Icon-Generierung** (`scripts/generate-icons.sh` + `scripts/ico-from-png.mjs`):
  aus `web/public/MakerCottage_Favicon.png` (1024×1024) →
  `electron/resources/icon.icns` (macOS, via `sips`+`iconutil`, 10 Größen),
  `icon.png` (512×512, Linux), `icon.ico` (256×256-PNG im .ico, Windows 7+;
  Node-Fallback, da `png2ico` offline nicht verfügbar). Alle drei validiert
  (`file` + `iconutil`-Reverse-Check).
- **Kritischer Bundling-Fix** (gefunden durch Inspektion des `.app`):
  `app/node_modules` fehlte komplett im Bundle → der Server hätte
  `better-sqlite3` nicht laden können und beim Start gecrasht. Ursache:
  `extraResources`-Filter `node_modules/**` wird von electron-builder nicht
  rekursiv kopiert. **Fix:** `node_modules` als **eigene, filterfreie**
  `extraResources`-Entry (`../server/node_modules` → `app/node_modules`);
  Server-JS-Entry schließt `package/`, `.env`, `config.json` aus.
- **`scripts/build-electron.sh`** (5 Schritte, statt 6): totes `.stage/`-Staging
  entfernt (electron-builder staged selbst via `extraResources`); **Cache-Pfad-Bug
  gefixt** (`sed arm64→aarch64` passte nicht zum Cache-Ordner `darwin-arm64`);
  `UNSIGNED=1` → `CSC_IDENTITY_AUTO_DISCOVERY=false` (ohne Signing).
- **`.gitignore`**: `bin/` (147 MB Node-Binär, Build-Artefakt) ausgeschlossen;
  toter `electron/.stage/`-Eintrag entfernt.
- **`electron-builder --mac` un-signiert getestet** – baut `.dmg` (198 MB) +
  `.zip` + `.app`; „no node modules found in collection" bestätigt die
  Architektur (besser-sqlite3 läuft auf `bin/node` als Kindprozess, **kein
  electron-rebuild nötig**).
- **End-to-End-Smoke aus dem `.app`-Bundle** (nicht-invasiv, `NO_OPEN=1`):
  Server startet aus `.app`'s `bin/node`; `/api/config` + `/api/update/check`
  (P2b: `configured:true, current:0.6.0, source:github:Eguf72/makercottage`,
  graceful `available:false` da noch keine GitHub-Releases) antworten.
- **Offen für T45:** GUI-Fenster-Start (braucht Display), native Cross-Platform-
  Builds (CI), Code-Signing + Notarization (Apple Developer ID, 99 €/Jahr).

---

## 2026-11-16 – T45 (Fertig Code): Electron-Wrapper Option C + Security-Patch
- **`@fastify/static` Major-Bump** `^8.0.3` → `^10.1.11` (T59, Fertig):
  3 Security-Vulns geschlossen (path traversal, route guard bypass, auth bypass);
  `npm audit` → 0 Vulnerabilities; Server-Smoke-Test (Port 4099) bestanden.
- **Launcher-Interface erweitert** (`launcher/launcher.mjs`): `launch()` gibt
  jetzt `{ child, shutdown }` zurück (statt nur `child`), damit Electron den
  sauberen SIGTERM + SIGKILL-Fallback aufrufen kann.
- **`electron/main.js`** (CommonJS, `contextIsolation:true`, `nodeIntegration:false`):
  - `BrowserWindow` (1400×900, min 1024×700, `backgroundColor:#384b41`,
    macOS `titleBarStyle:'hiddenInset'`, `trafficLightPosition`);
  - `openUI = win.loadURL(url)` (erst `ready-to-show` → `show()`, kein weißer Blitz);
  - `MC_HOME = app.getPath('userData')` (platform-nativ, nur wenn nicht gesetzt);
  - `webContents.setWindowOpenHandler` → `shell.openExternal` (externe Links im Browser);
  - `mainWindow.on('closed')` → `shutdown('SIGTERM')` (SIGKILL-Fallback in 2 s);
  - macOS: `window-all-closed` ≠ `app.quit()` (Dock bleibt); Win/Linux: `app.quit()`;
  - Menü: Datei/Ebearbeiten/Ansicht (plattform-abhängig, `Menu.buildFromTemplate`).
- **`electron/preload.js`**: Absichtlich leer – `contextIsolation:true` +
  `nodeIntegration:false`; keine IPC-Brücke nötig (Kommunikation läuft über HTTP).
- **`electron/package.json`**: `electron@^45` + `electron-builder@^26`;
  `extraResources`: `launcher/`, `server/` (nur `*.js` + `package.json` +
  `node_modules/`), `web/dist/`, `bin/node`; Build-Ziele: macOS (dmg/zip,
  `hardenedRuntime:true`), Linux (AppImage/deb), Windows (NSIS).
- **`scripts/build-electron.sh`** (6 Schritte):
  (1) Vite-Build → `web/dist/`, (2) Node-Binär aus Cache/Download → `bin/`,
  (3) Staging-Verzeichnis (`electron/.stage/`), (4) `npm install` in `electron/`,
  (5) `electron-builder` (Target `mac|linux|win|all`), (6) Output-Listing.
- **`.gitignore`**: `GitHub.txt` hinzugefügt (Token lokal, nie committed).
- **Verifiziert:** `node --check` (main.js + preload.js) grün;
  `launcher.mjs` `node --check` grün.
- **Offen für T45:** native Builds (CI/Plattform), Icon-Dateien
  (`.icns`/`.ico`/`.png`), Code-Signing + Notarization (macOS, kostenpflichtig),
  Versions-Bump (v0.7.0, Entscheidung offen).

---

## 2026-11-15 – v0.6.0: Remote-Update-Check (P2b)
- **Geteiltes Modul `server/updatecheck.js`** (kein Fastify/React → von **Server
  UND Launcher** importiert): `checkForUpdate()` (wirft **nie**),
  `compareVersions()` (semver-Kern, `v`-Präfix + Prerelease-Strip),
  `resolveConfig()`, In-Memory-Cache (TTL `MC_UPDATE_CACHE_MS`=5 min).
- **Konfiguration** via Env: `MC_UPDATE_REPO` (Default `Eguf72/makercottage`;
  leer → `configured:false` → sauberer manueller Pfad, **kein Crash**),
  `MC_UPDATE_GH_TOKEN` (Bearer → GitHub-Rate-Limit 60→5000/h),
  `MC_UPDATE_GITHUB_API` (Enterprise/Proxy), `MC_UPDATE_TIMEOUT_MS` (8 s).
- **Endpunkte/Pfade:**
  - `server/index.js`: `GET /api/update/check` → `checkForUpdate({ current: APP_VERSION })`
    (serverseitig → **umgeht Browser-CORS** gegen GitHub).
  - `launcher/launcher.mjs`: `--check` tut echten Remote-Check, **ohne
    Server-Start** (dynamischer Import des Nachbar-Moduls `app/updatecheck.js`);
    asynchron + `handled`-Flag verhindert den Fall-Through in `launch()`;
    `printCheckResult()` zeigt bei `available:true` Download-/Release-Links,
    sonst den manuellen Pfad. `--help`/Env-Übersicht ergänzt.
  - `web/src/api.js`: `getUpdateCheck()`; `App.jsx`: `updateInfo`-State +
    Footer-Banner `⚠ Update verfügbar v{latest} · Herunterladen` (nur bei
    `available:true`, anklickbar → Download/Release); `style.css` `.footer-update`.
- **Fehlerpfade** (Netz/Timeout/Rate-Limit/404/unbekannt) →
  `{ available:false, error:<menschenlesbar> }` → UI/CLI zeigen den manuellen Pfad.
- **Versions-Sync `0.6.0`** (Minor, neue Fähigkeit): `version.js` (+Changelog),
  `server/package.json`, `web/package.json`, `database.js` defaultSettings
  (`db_version` bleibt 5 – keine Schema-Änderung); `build-macos.sh` nimmt
  `updatecheck.js` in die `app/`-Kopie auf.
- **Neuer `AUFGABEN.md`-Eintrag T58** (P2b → Fertig v0.6.0) + neue Sektion
  „Remote-Update-Check (v0.6.0)"; `PLAN_update_faehigkeit_v0.4.0.md` §5-Entscheidungen
  + neuer §6 (Realisierung) aktualisiert.
- **Verifiziert:** `node --check` (updatecheck/index/launcher/api) grün;
  `npm run build` (Vite) grün, `0.6.0` im Bundle; macOS-Build + Smoke-Test
  bestanden; `/api/update/check` live – Default `Eguf72/makercottage` → 404 →
  `available:false` + error, `MC_UPDATE_REPO=nodejs/node` → `available:true`
  (mit `downloadUrl`/`releaseUrl`); `--check` im Bundle (beide Fälle, Exit 0,
  kein Server-Start).
- **Offen danach:** nur `@fastify/static`-Major-Bump (breaking) + Electron/T45
  (Option C). Nutzer setzt `MC_UPDATE_REPO` auf das reale Repo (kein Host fix).

---

## 2026-11-15 – v0.5.1: CLI `--version`/`--check`/`--help` + README „Aktualisieren" (P2a)
- **CLI-Flags im Launcher** (`launcher/launcher.mjs`), ausgewertet vor dem
  `import.meta.main`-Start (Import durch Electron bleibt unberührt):
  - `--version`/`-v`: Version aus `app/package.json` (Einzige Quelle = Backend-Build)
    + Daten-Ordner (`MC_HOME || ~/.makercottage`, spiegelt `server/paths.js`);
    `MC_HOME`-Hinweis falls gesetzt.
  - `--check`: manueller Update-Pfad (neuen Ordner daneben entpacken, Daten
    bleiben in `~/.makercottage/`); **kein Remote-Check** = Stub für P2b.
  - `--help`/`-h`: Übersicht (Flags + Env `PORT/MC_HOST/MC_HOME/NO_OPEN`).
- **Argument-Passthrough** in den Start-Dateien: `.command`/`.sh` → `"$@"`,
  `.bat` → `%*` → `MakerCottage.command --version` etc. erreichbar (Doppelklick
  = keine Args = unverändert).
- **README.md** neuer Abschnitt „## Aktualisieren" (daneben entpacken → Launcher
  starten → Daten in `~/.makercottage/` bleiben) + Desktop-App-Titel
  `v0.3.0 → v0.5.1`; `build-macos.sh` README.txt um „Aktualisieren"-Block +
  CLI-Hinweis ergänzt.
- **Versions-Sync `0.5.1`** (Patch, alle Quellen): `version.js` (+Changelog),
  `server/package.json`, `web/package.json`, `database.js` defaultSettings
  (`db_version` bleibt 5 – keine Schema-Änderung).
- **Neuer `AUFGABEN.md`-Eintrag T57** (P2a → Fertig v0.5.1).
- **Offen danach:** nur noch P2b (Remote-Update-Check, nach Electron/T45; jetzt
  als `--check`-Stub) + `@fastify/static`-Major-Bump (beide bewusst offen).

---

## 2026-11-15 – Alt-Backups aufgeräumt (`.cache/makercottage.db` + `server/config.json`)
- **Löschung:** Die beiden veralteten Alt-Quellen aus der P0-Migration wurden
  entfernt — `.cache/makercottage.db` (11.11., 24 KB) + das dadurch leere
  `.cache/` (mit `rmdir`) und `server/config.json` (09.11., 235 B). In
  `server/` bleiben nur noch die legitimen Quellen (`config.js`,
  `package-lock.json`, `package.json`).
- **Sicherheitsnetz:** Vor dem Löschen ein dated Snapshot in den genehmigten
  Temp-Ordner (`…/opencode/makercottage_altbackup_<Timestamp>/`) — kurzfristig
  wiederherstellbar. Die eigentliche Sicherheit: die aktuellen Daten leben in
  `~/.makercottage/` (`config.json` 15.11. 11:51, `makercottage.db` 14.11. 15:06).
- **Prüfung vor Löschung (alles bestätigt):**
  - Live-Server (PID 41496, Port 4000) liest per `lsof` **nur**
    `~/.makercottage/makercottage.db`; `.cache` bei keinem Prozess offen.
  - `config.json`-Diff: die NEUE (`~/.makercottage/`) ist strikte Obermenge der
    alten — `NAS_PATH` korrigiert (`/Users/oliverfuge/3D` statt Testordner
    `.testprintfiles`) + Feld `SLICER: bambustudio`; kein Datenverlust.
  - Migrations-Logik `paths.js` nicht-destruktiv + idempotent (`migrateOnce`
    kopiert nur bei fehlendem Ziel) → Alt-Quellen weder neu angelegt noch beim
    nächsten Start angesprochen; kein Code schreibt mehr in `.cache/` /
    `server/config.json`.
- **Verifiziert nach Löschung:** Altpfade weg; `~/.makercottage/` intakt;
  Server weiter aktiv; `GET /api/version` → `0.5.0`; `GET /api/config` liefert
  `slicer: bambustudio` + `path /Users/oliverfuge/3D` (beweist: aus NEU gelesen).
- **Offen danach:** nur noch P2a (CLI `--version`/`--check`) +
  `@fastify/static`-Major-Bump (beide bewusst offen, siehe unten).

---

## 2026-11-15 – v0.5.0: UI-Enhancements + Slicer-Konfiguration + Review-Bugfixes
- **Drei UI-Features (v0.5.0):**
  1. **📂-Button aus der Dateiliste entfernt** (der 📁-Marker vor Ordner-Zeilen
     bleibt) – `web/src/FileList.jsx`.
  2. **Slicer-Button „🧩 Slicer öffnen"** im Detail-Druck-Tab –
     `web/src/FileDetail.jsx`; Server-Endpunkt `POST /api/db/file/openInSlicer`
     (`server/index.js`); config-Feld `slicer` (getConfig/publicConfig/saveConfig,
     `server/config.js`).
  3. **Hintergrund-Klick** auf die leere Fläche der Liste hebt die Auswahl auf
     (`currentFile` → `null`, Rückkehr zur Übersicht); ignoriert Klick auf `tr`
     oder `.filelist-detail` – `web/src/FileList.jsx`.
- **Slicer jetzt in „Einstellungen" konfigurierbar** (dieser Session ergänzt,
  `web/src/ConfigForm.jsx`): Preset-Dropdown Cura/PrusaSlicer/BambuStudio/
  OrcaSlicer/SuperSlicer + „Eigener …" (Freitext). Wert → `config.slicer`
  (`SLICER` in `~/.makercottage/config.json`). Bekannter Preset (case-insensitiv)
  → App-Name; sonst Freitext. Server `resolveSlicerApp` + `startSlicer`
  (plattformabhängig: macOS `open -a`, Windows `start`, Linux direct spawn).
- **Review-Bugfixes (fanden den Build blockiert / Features unsichtbar):**
  - `server/index.js`: `POST /api/db/file/reveal` war **leer** (`{ }`) →
    „Im Ordner öffnen" (T49) funktionslos; Handler-Körper wiederhergestellt.
  - `server/index.js`: orphaniertes Code-Block (Alter reveal-Körper) vor
    `/api/db/overview` entfernt (Syntaxfehler entfernt).
  - `web/src/FileDetail.jsx`: `const reveal = async (v) => {` war durch eine
    frühere Edit **weggefallen** → `await` auf Modulstufe → **Build rot**.
    Deklaration wiederhergestellt + Name auf `reveal` (Call-Site
    `onClick={() => reveal(view)}` passt wieder).
  - `web/src/FileDetail.jsx`: `slicerMsg` wurde gesetzt, aber **nie gerendert**
    → Slicer-Button gab dem Nutzer kein Feedback; `{slicerMsg && …}` neben
    `{revealMsg && …}` ergänzt.
- **Versions-Sync `0.5.0`** (alle Quellen): `web/src/version.js` (+Changelog
  v0.5.0-Eintrag), `server/package.json`, `web/package.json`.
- **Build/Doku:**
  - `web`-Build grün (37 Module), **Dist-Bundle neu gebaut**
    (`scripts/build-macos.sh`, Node aus Cache, v26.13.0/ABI 147); **Smoke-Test
    bestanden** (Launcher + Port 4099 + `GET /api/config` antwortet + sauber
    gestoppt).
  - `dist/makercottage-macos-arm64` trägt alle Fixes: `app/index.js`
    (reveal + openInSlicer), `app/config.js` (slicer), `app/paths.js`,
    Web-Bundle v0.5.0 + 5 Slicer-Presets.
  - `README.md` „Aktueller Stand" → v0.5.0 + UI/Slicer-Satz.
- **Verifiziert:** `node --check` für alle 9 Server-Dateien OK; `npm run build`
  grün; Dist-Grep bestätigt Endpunkte, slicer-Feld, paths.js, Version 0.5.0,
  Presets im Bundle.
- **Live-Status: v0.5.0 ist live (Neustart 15.11. 11:48).** Vorher lief der
  Prozess vom 14.11. (PID 29051) noch v0.4.0 (`GET /api/version` → `0.4.0`).
  Der v0.5.0-Bundle (`dist/makercottage-macos-arm64/`, gebaut 11:25) wurde jetzt
  neu gestartet: **alter Prozess (Launcher 29046 → Server 29051) sauber per
  SIGTERM gestoppt, Port 4000 freigegeben**, dann **neuer Launcher 41495 →
  Server 41496** (11:48, `NO_OPEN=1` = kein Browser-Popup). **Bestätigt:**
  `GET /api/version` → **`0.5.0`**; `GET /api/config` liefert jetzt das Feld
  `slicer`; `POST /api/db/file/openInSlicer` antwortet korrekt (404
  `„Pfad der Datei nicht bekannt"` für eine nicht in der Index enthaltene Datei,
  wie auch `GET /api/db/file`). **Daten-Trennung erhalten:** der neue Prozess
  liest per `lsof` `~/.makercottage/makercottage.db` (Migration gelaufen,
  **kein Überschreiben**; Altkopien `.cache/…` + `server/config.json`
  blieben bis 15.11. → **aufgeräumt** (mit Snapshot), siehe oben, Eintrag
  „Alt-Backups aufgeräumt").
  Browser/`MakerCottage.command` öffnet bei Bedarf per Doppelklick die UI.

---

## 2026-11-14 – Launcher-Guard: klare Fehlermeldung statt Crash (v0.4.0, UX)
- **Problem:** Nutzer doppelklickte `scripts/launchers/MakerCottage.command`
  (die **Vorlage**, dort liegt **kein** `bin/node`) statt des gebauten Bundles
  `dist/makercottage-macos-arm64/MakerCottage.command` (mit eigener `bin/node`).
  `exec "$DIR/bin/node"` fehl → „No such file or directory" → Terminal schließt
  blitzschnell, Fehler unsichtbar.
- **Fix (Guard in allen drei Start-Dateien)** – `scripts/launchers/MakerCottage.{command,sh,bat}`:
  - Prüft vor `exec`, ob `$DIR/bin/node` existiert.
  - **Fehlt er:** klare Box-/Text-Meldung („falsche Datei, richtiger Pfad
    `dist/makercottage-macos-arm64/MakerCottage.command`, `npm run build") +
    `read`/`pause` → Terminal wartet auf Enter statt sofort zu schließen.
  - **Vorhanden:** Guard läuft durch → normales `exec` (Bundle unverändert).
- **Distributed:** gleicher Guard in `dist/makercottage-macos-arm64/MakerCottage.command`
  (ohne Rebuild, robust bei Verschieben). Build übernimmt die Vorlage automatisch.
- **Doku:** `README.md` „Starten"-Block jetzt explizit: nur das `MakerCottage.command`
  im **gebauten** Ordner; Vorlage in `scripts/launchers/` ist ohne `bin/node`.
- **Verifiziert:**
  - Falscher Pfad (`scripts/launchers/`) → meldet klar + wartet (exit 1), kein Crash.
  - Richtiger Pfad (dist-Bundle, `NO_OPEN=1`, Port 4002) → Guard durch, Backend
    startet, `GET /api/version` → `0.4.0`, sauber beendet.

---

## 2026-11-14 – Daten-Trennung + einmalige Migration (v0.4.0, P0)
- **Wunsch:** „Update ohne Datenverlust". Daten (DB + config) liegen bislang im
  Code-Ordner (`.cache/makercottage.db`, `server/config.json`) → ein Code-Update
  (neu entpacken) kann sie überschreiben. P0 = Daten raus aus dem Code-Ordner.
- **Neu `server/paths.js`** – EINE Quelle für alle Daten-Pfade:
  - `DATA_DIR = MC_HOME || ~/.makercottage`, `DB_PATH`, `CONFIG_PATH`;
    `mkdirSync(..., {recursive})` beim Import (idempotent).
  - **Einmalige, idempotente, nicht-destruktive Migration**: ALT → ZIEL nur bei
    fehlendem Ziel (`copyFileSync`), Altkopien bleiben als Backup, Fehler nur
    gewarnt (kein Start-Block). `config.json` → `0o600`, DB ohne Modus.
  - Migration läuft beim Import (also beim ersten Start) — keine separate Routine.
- **`server/database.js`** – harter `.cache/`-Pfad entfernt; `DB_PATH` importiert
  aus `./paths.js`. `defaultSettings`: `version 0.4.0`, `db_version 4` (Marker).
- **`server/config.js`** – `CONFIG_PATH` jetzt aus `./paths.js`; `.env`-Laden bleibt
  (nutzt noch `__dirname`/`join`).
- **Versions-Sync `0.4.0`** (alle Quellen): `web/src/version.js` (+Changelog
  P0-Eintrag), `server/package.json`, `web/package.json`, `database.js`
  `defaultSettings` (`db_version 4`).
- **Build/Doku/Launcher:**
  - `scripts/build-macos.sh` – `paths.js` in Kopier-Liste (sonst Build-Fehler);
    README-Text im Bundle auf `~/.makercottage/` + „kein Datenverlust".
  - `launcher/launcher.mjs` – `MC_HOME`-Kommentar (erbt env an den Kindprozess).
  - `README.md` – alle `.cache/`-/`config.json`-Referenzen auf
    `~/.makercottage/` umgestellt (Stand-Block, Datei-Baum, NAS-Zugang, SQLite,
    Daten-Ort/Hinweis); `.cache/` als LEGACY (v<0.4.0) markiert.
  - `AUFGABEN.md` – T50 (Version-Signal) + v0.4.0-Plan-Kontext.
  - `PLAN_update_faehigkeit_v0.4.0.md` – Status „P0 offen · v0.4.0 noch nicht
    umgesetzt" korrigiert; T49–T52 konsistent.
- **Verifiziert (Testlauf, `MC_HOME` = Temp-Ordner, echte Alt-Quellen als Source):**
  - Migration: `config.json` + `makercottage.db` byte-identisch kopiert;
    `config.json` Rechte `0600`; API liest aus neuem Ort (`GET /api/version` →
    `0.4.0`).
  - **Idempotent:** 2. Lauf kopiert nichts (Ziel vorhanden).
  - **Nicht-destruktiv:** Alt-Quellen (`.cache/makercottage.db`,
    `server/config.json`) SHA-256 unverändert (bleiben als Backup).
  - `node --check` (paths/database/config/index) OK; `npm run build` grün;
    `0.4.0` im gebauten Bundle (`web/dist`), `0.3.3` ist weg.
- **Live-Migration: erledigt (nachgetragen 2026-11-15).** Ursprünglich
  „noch offen": der Live-Server sollte beim nächsten Start migrieren.
  Bestätigt am 15.11. per `lsof`: der laufende Prozess (PID 29051, Port 4000)
  liest bereits `~/.makercottage/makercottage.db` — die Migration
  `.cache/… → ~/.makercottage/…` ist also **erledigt** (DB + `config.json` im
  stabilen Daten-Ordner, 14.11. 15:06). Alt-Quellen `.cache/makercottage.db`
  (11.11.) + `server/config.json` (09.11.) blieben zunächst als nicht-destruktive
  Backups erhalten → **15.11. aufgeräumt** (mit Snapshot), siehe oben, Eintrag
  „Alt-Backups aufgeräumt".
- **Noch offen (v0.5.0):** *erledigt (nachgetragen 2026-11-15).* Ursprünglich lief
  der Prozess noch v0.4.0 (14.11.). **Am 15.11. 11:48 wurde neu gestartet** → alter
  Prozess (Launcher 29046 → Server 29051) per SIGTERM gestoppt, neuer Launcher 41495 →
  Server 41496; `GET /api/version` liefert jetzt `0.5.0`, Daten-Trennung erhalten
  (kein Überschreiben; Altkopien `.cache/…` + `server/config.json` blieben →
  15.11. aufgeräumt). Siehe
  oben, Eintrag „2026-11-15 – v0.5.0".
- **Nicht verändert:** `@fastify/static` bleibt `^8.0.3` (3 CVEs → bewusst
  `^10.1.10` als spätere Release-Entscheidung, Major-Bump breaking).

---

## 2026-11-13 – Datei-Öffnen + Version-Signal (v0.3.3)
- **Wunsch:** (1) Datei per Klick im nativen Dateimanager öffnen; (2) Version-Signal,
  das UI- und Server-Version vergleicht und bei Skew warnt.
- **Datei im Ordner öffnen** (`server/index.js` + `web/src/FileList.jsx` +
  `web/src/FileDetail.jsx` + `web/src/api.js` + `web/src/style.css`):
  - `POST /api/db/file/reveal` (`{ name, path? }`): absoluter Pfad aus
    `join(config.path, relativer Pfad aus DB/Request)`; `revealInFileManager()`
    nach Muster von `launcher.mjs`: macOS `open -R`, Windows `explorer /select,`,
    Linux `xdg-open`. NAS-Quelle → kein lokales Öffnen möglich, liefert Hinweis
    mit Share-Pfad statt Fehler.
  - `FileList.jsx`: 📂-Symbol rechts neben jedem Dateinamen (nicht bei Ordnern),
    `stopPropagation`, kurze Statuszeile „Geöffnet in: …" (4 s).
  - `FileDetail.jsx`: prominenter Button „📂 Im Ordner öffnen" im Metadaten-Tab
    unter der Pfad-Zeile (`.reveal-btn-lg`); `api.revealFile()`.
- **Version-Signal / Skew** (`server/index.js` + `web/src/App.jsx` +
  `web/src/api.js` + `web/src/style.css`):
  - `GET /api/version` → `{ version }` aus `server/package.json` (ESM:
    `readFileSync` + `JSON.parse`, kein `require`).
  - `api.getVersion()`; Footer zeigt „MakerCottage · UI v{VERSION} · Server v{serverVersion}";
    bei Abweichung roter Skew-Hinweis „⚠ Server v… ≠ UI v… – bitte neu entpacken"
    (`.footer-skew`), Tooltip: „Update-Quelle folgt (kein Remote-Check jetzt)".
- **Versionsnummer:** Patch `0.3.2 → 0.3.3` (nur diese Funktionen; „Update ohne
  Datenverlust" = v0.4.0, noch offen, da P0 Daten-Trennung fehlt). Synchron in
  `web/src/version.js` (+Changelog), `server/package.json`, `web/package.json`,
  `server/database.js` `settings.version` (`db_version` unverändert `3`).
- **Verifiziert:** `node --check` OK; `npm run build` grün; `GET /api/version`
  → `{"version":"0.3.3"}`; `POST /api/db/file/reveal` mit echter Datei → HTTP 200
  + korrekter absoluter Pfad (Finder öffnet), Fehlerzweige 400/404 korrekt.
- **Nicht verändert:** Bestehende Funktionen unverändert; Daten-Trennung (P0) und
  Update-CLI/Doku (P2a) bleiben im v0.4.0-Plan offen.

---

## 2026-11-12 – Übersicht rechts: Donut nach Endung + jüngste 5 Dateien (v0.3.2)
- **Wunsch:** Auf der rechten Seite ein Diagram der gespeicherten Daten
  (wie viele Dateien je Endung) + Auflistung der letzten 5 hinzugefügten
  Dateien; rechter Bereich breiter.
- **Backend** (`server/database.js` + `server/index.js`):
  - `getTypeCounts()` – `GROUP BY extension` absteigend (echte Endung,
    z. B. `step`, `3mf`).
  - `getRecentFiles(limit=5)` – jüngst indexierte (nach `created_at DESC, id DESC`).
  - `GET /api/db/overview` liefert `{ total, byType, recent }` in einer Runde.
- **Frontend** (`web/src/Overview.jsx` + `web/src/FileList.jsx` + `web/src/api.js`):
  - `Overview.jsx`: SVG-Donut (Stroke-Dasharray, 8er-Farbpalette, olive-/orange-
    harmonisch), Legende (2-Spalten-Raster: Farbe + Endung + Anzahl + %),
    Abschnitt „Zuletzt hinzugefügt" (Name gekürzt + Datum).
  - `FileList.jsx`: `Overview` ist **Standard-Ansicht** rechts, solange keine
    Datei gewählt ist; bei Klick wird `FileDetail` inline eingeblendet.
  - `api.js`: `getOverview()`.
  - `style.css`: rechte Spalte `420→540px` (min `440px`); neue `.overview`-Stile.
- **Fehler beim Verifizieren gefunden + behoben (T48):** In der gestapelten
  Ansicht (< 800px) kollabiert `.filelist-table-wrap` auf Höhe 0, weil das
  geerbte `flex: 1 1 0` in `column`-Richtung mit auto-Höhe des Containers 0
  als Basis gibt – die 5 Zeilen existierten in der DOM, waren aber geklippt.
  Fix: `@media (max-width: 800px) .filelist-table-wrap { flex: none }`
  (Inhaltshöhe, max `45vh`).
- **Verifiziert** (Chrome-Headless + CDP, ohne Browser-Session):
  - 1024px: `flexDirection row`, Detail/Übersicht je 540px, `overflow false`,
    max Name-Länge 20 (≤ 30) ✓
  - 780px: `flexDirection column`, Liste 226px hoch **sichtbar** oben,
    Übersicht 523px darunter, `overflow false` ✓
  - Endpunkt `GET /api/db/overview` → HTTP 200 (`total 6`, 5 Endungen, 5 recent).
- **Nicht verändert:** Bestehende Funktion unverändert; Übersicht ist die neue
  Default-Ansicht, Detail erscheint bei Auswahl wie gewohnt.
- **Build:** `npm run build` OK (CSS 8.65 → 10.31 kB durch neue Styles,
  JS ~162.5 → 165.17 kB durch `Overview.jsx`).
- **Screenshots:** `docs/screenshots/mc-08-overview-1024.png`,
  `mc-09-overview-780.png`.

---

## 2026-11-12 – Name-Spalte auf 30 Zeichen begrenzt (v0.3.1)
- **Wunsch:** In der Dateiliste nur max 30 Zeichen des Namens anzeigen.
- **Lösung:** `web/src/FileList.jsx` – Konstante `MAX_NAME_LEN = 30`; der
  angezeigte Text (`print_name || name`) wird auf `29 + „…"` gekürzt, der
  volle Name bleibt im `title` (Hover-Tooltip) erreichbar. `web/src/style.css`
  – `.table td` bekommt `white-space: nowrap` (Name bleibt auf einer Zeile).
- **Verifiziert:** Logik isoliert getestet (70→30, 36→30, 20/29 unverändert);
  reale UI via Chrome-Headless/CDP: alle Zellen `<= 30` Zeichen, `title` =
  voller Name. Screenshot `docs/screenshots/mc-07-name-trunc.png`.
- **Nicht verändert:** Funktion unverändert; kurze Namen zeigen voll, nur
  längere werden gekürzt.

---

## 2026-11-12 – Responsive-Härtung: Side-by-Side stapelt bei enger Breite (v0.3.1)
- **Wunsch:** Das Side-by-Side-Layout soll auch bei schmaler Breite sauber
  funktionieren (Liste oben, Detail darunter) statt horizontalen Überlaufs.
- **Problem:** Die Detail-Spalte ist fest `420px` (min `340px`); unter ~700px
  überlagert sie die Liste und die Seite läuft horizontal über
  (gemessen: 390px → `scrollWidth 477 > clientWidth 390`, `overflow: true`).
- **Lösung:** `web/src/style.css` – neue `@media (max-width: 800px)`:
  `.filelist-body` wird `flex-direction: column`; Detail-Spalte `width: 100%` /
  `min-width: 0`; `.file-detail-inline { height: auto }`, Liste `max-height: 45vh`,
  Detail-Body `max-height: none`. Das (vorhandene) 480px-Print-Grid bleibt.
- **Visuelle Verifizierung** (Chrome-Headless + CDP, ohne Browser-Session):
  - 1024px: `flexDirection: row`, Detail 420px + Tabelle 486px nebeneinander,
    kein Überlauf ✓
  - 780px: `flexDirection: column`, beide Spalten 706px breit, Detail unter der
    Liste, `overflow: false` ✓ (vorher `true`)
  - 4 Zustands-Screenshots in `docs/screenshots/` (mc-01 … mc-06).
- **Nicht verändert:** Funktion unverändert; nur die Optik bei enger Breite.
- **Build:** `npm run build` OK (CSS 8.38 → 8.63 kB, JS unverändert ~162.5 kB).

---

## 2026-11-12 – GUI Umgstaltung: Side-by-Side Layout (v0.3.1)
- **Wunsch:** Filelist nach links, Detail-Infos der selektierten Datei rechts daneben.
- **Lösung:**
  - `web/src/FileList.jsx`: neuer `.filelist-body` Flex-Container mit zwei Kindern –
    Tabelle links + inline `FileDetail` rechts. Platzhalter, wenn nichts gewählt ist.
  - `web/src/FileDetail.jsx`: neue `inline`-Prop – überspringt Overlay/Dialog-Wrapper,
    rendert ein kompaktes Karten-Panel. Footer zeigt im inline-Modus nur „Speichern"
    (kein „Abbrechen"/„Schließen" – man wählt einfach eine andere Datei).
  - `web/src/style.css`: neue Klassen `.filelist-body`, `.filelist-table-wrap`
    (flex:1, scroll), `.filelist-detail` (420px), `.file-detail-inline` + Platzhalter.
- **Nicht verändert:** Funktion identisch – Druck-/Metadaten-Tabs, Speichern, ESC
  (nur Modal-Modus). Alle UI-Texte bleiben deutsch.
- **Nachkontrolle (Review) – 3 Fehler gefunden und behoben:**
  1. **Chinesischer Platzhalter** in `FileList.jsx` (`选择一个文件…`) → deutsch
     „Wähle eine Datei, um Details anzuzeigen".
  2. **UI-Texte waren ins Englische übersetzt** (Tab „Print/Metadata", „Print name" …)
     → komplette deutsche Beschriftungen wiederhergestellt (Druck, Metadaten,
     Druckname, Bemerkung …) – Regression gegen „Funktionen beibehalten".
  3. **Echtes React-Bug:** `DetailContent` war als *verschachtelte Komponenten-
     Funktion* definiert → bei jedem Render neuer Typ → Subtree remount → Tipp-
     fokus ging in den Eingabefeldern verloren. Jetzt als JSX-Variable (`body`)
     in beiden Render-Zweigen → kein Remount, Fokus bleibt stabil.
  - Zudem: englische CSS-Kommentare beim Umbauen auf Deutsch zurückgeführt,
    entfernte deutsche Kommentare (z. B. „Radio-Umschalter", „Pfad-Feld …")
    wieder eingefügt – Codebase-Konsistenz.
- **Version:** Minor `0.3.0 → 0.3.1`, in `version.js`, `database.js`,
  `server/package.json`, `web/package.json` synchron; `npm run build` OK
  (JS ~162.5 kB, CSS 8.38 kB).

---

## 2026-11-11 – Desktop-Wrapper / portabler Launcher (v0.3.0)
- **Wunsch:** Aus der Web-App ein plattformübergreifendes „Programm" machen, das
  auf macOS/Linux/Windows **ohne Installation** läuft – jeweils eine Start-Datei.
- **Entscheidung:** Option A (portabler Ordner + gebündelte Node-Runtime),
  **zuerst macOS**. Echte native Fenster (Option C: Electron) folgen später; der
  Kern ist von Anfang an **Electron-fähig**.
- **Lösung:**
  - `launcher/launcher.mjs` – geteilter, plattformübergreifender Kern: startet
    den Server als **Kindprozess** mit der **expliziten** Binär `bin/node`
    (nicht `process.execPath`, damit die `better-sqlite3`-Prebuild-ABI korrekt
    bleibt), wartet per echtem **TCP-`net.connect`** auf den Port (keine
    curl-/Bash-Abhängigkeit), öffnet die UI per **injizierbarer** `openUI`
    (A: `open`/`xdg-open`/`start`; C: `BrowserWindow.loadURL`). Signal-Weiterleitung
    (SIGINT/SIGTERM → Kindprozess), `NO_OPEN=1` für Smoke-Tests/CI. Autostart nur
    als Skript (`import.meta.main`), beim Import durch Electron nicht.
  - `scripts/build-macos.sh` – baut `dist/makercottage-macos-arm64/` + `.zip`:
    Frontend bauen → Server-Code (nur Runtime-Dateien) + `node_modules` (inkl.
    `better-sqlite3/prebuilds/*.node`, plattformübergreifend) + Launcher +
    Node-Binär (Modus `copy` = `process.execPath`, `download` = offizielles
    Tarball) → `MakerCottage.command` (Start-Datei) + `README.txt`.
  - `AUFGABEN.md`: T43 (Launcher, Fertig), T44 (Linux/Windows ausrollen, In
    Arbeit), T45 (Electron, In Arbeit); F04 umgeschrieben.
- **Wichtige Erkenntnis:** `better-sqlite3` v13 liefert fertige Prebuilds für
  **alle** Zielplattformen direkt im Paket (`prebuilds/darwin-arm64`,
  `darwin-x64`, `linux-*`, `win32-*`), der Loader wählt automatisch nach
  `platform`/`arch` → das einzige native Modul „passt" ohne Sortieren.
  `@winlinux/smb2`/`auth` sind reine JS (keine native Abhängigkeit).
- **Vorbereitung A→C:** Server als Child + `openUI` injizierbar + relative
  `/api`-Pfade (`api.js`, kein fester Origin) → der spätere Sprung zu Electron
  ist ein Einzeiler (`launch({ openUI: (u) => win.loadURL(u) })`), ohne
  `electron-rebuild`, ohne Frontend-Change.
- **Node-Runtime-Fix (Nachtrag):** Die lokal per `copy` genutzte **Homebrew-Node**
  ist **nicht self-contained** – `otool -L` zeigt ~30 Abhängigkeiten über
  `/opt/homebrew/…` (`libnode.147.dylib`, `libuv`, `llhttp`, `abseil` …) →
  auf anderen Rechnern nicht lauffähig. **Lösung:** `scripts/build-macos.sh`
  nutzt jetzt per Default **`NODE_SOURCE=download`** → die **offizielle**
  Node-Binär von nodejs.org, die **voll self-contained** ist (`otool -L` nur
  `/usr/lib`-System-Libs: CoreFoundation, Security, libc++, libSystem).
  `copy` bleibt als schneller Lokaltest (mit Hinweis „nicht portabel").
  Download wird per Cache (`dist/.node-cache/darwin-arch/VERSION`) wiederverwendet.
- **Verifiziert:** Smoke-Test im Build-Skript (Launcher mit `NO_OPEN=1` startet
  das Backend, wartet auf den Port, prüft `/api/config`, beendet per SIGTERM)
  – **bestanden**. `bin/node` selbst geladen: `modules=147` = genau die
  `better-sqlite3`-Prebuild-ABI. Ergebnis: **80 M zip**, `.cache` (Runtime-DB)
  aus der Distribution exkludiert, `MakerCottage.command` doppelklickbar.
- **Offen:** Linux-/Windows-Builds (T44) + Electron-Wrapper (T45) – Skripte
  vorbereitet, native Builds brauchen die jeweilige Zielplattform (oder CI).
- **Version:** Minor `0.2.10 → 0.3.0` (neue Funktion), in `version.js`,
  `database.js` (`settings.version`), `server/package.json`, `web/package.json`
  synchron.

---

## 2026-11-11 – Nur Druckname in der Datei-Übersicht (v0.2.10)
- **Problem:** Die v0.2.9-Lösung zeigte Dateiname **und** (abweichenden)
  Drucknamen als zweite Zeile – wirkt überladen. Wunsch: nur der Druckname
  sichtbar; beim Scannen der Dateiname als Platzhalter in den Drucknamen
  eingetragen.
- **Lösung:**
  - `server/database.js`: `upsertFile` füllt bei **Neuanlage** `print_name` mit
    dem Dateinamen (Platzhalter); bestehende Einträge (UPDATE) behalten ihren
    Drucknamen. Einmaliger, idempotenter **Backfill** füllt leere `print_name`
    älterer Einträge mit dem Dateinamen. `getPrintNameMap` fällt auf den
    Dateinamen zurück (Semantik „leer = Dateiname").
  - `server/index.js`: `withPrintNames()` liefert jetzt immer einen Drucknamen
    (Fallback `f.name` statt `''`).
  - `web/src/FileList.jsx`: Zeile zeigt nur noch `print_name` (Fallback
    Dateiname); der echte Dateiname bleibt als Hover-`title` erhalten.
    Zweizeiliger Druck-/Dateiname und die `.file-sub`-Regel entfallen.
  - `web/src/FileDetail.jsx`: Feld heißt jetzt „Druckname",
    `placeholder="Leer lassen = Dateiname"`.
- **Version:** Patch `0.2.9 → 0.2.10`, in `version.js`, `database.js`
  (`settings.version`), `server/package.json`, `web/package.json` synchron.

---

## 2026-11-10 – Druckname in der Datei-Übersicht (v0.2.9)
- **Problem:** Der pro Datei im Detailfenster gesetzte Druckname (`print_name`,
  kann vom Dateinamen abweichen) war in der Datei-Übersicht nicht sichtbar.
- **Lösung:**
  - `server/database.js`: neue `getPrintNameMap()` – eine Abfrage liefert eine
    `name -> print_name`-Map (jüngster Eintrag gewinnt, konsistent mit
    `getFileByName`).
  - `server/index.js`: `/api/files` (lokal **und** NAS-Zweig) reichert jedes
    Ergebnis über `withPrintNames()` um `print_name` an; nach `indexFoundFiles`
    sind alle gefundenen Dateien frisch in der DB, der Key ist der Dateiname.
  - `web/src/FileList.jsx`: Unterzeile `.file-sub` unter dem Dateinamen, nur
    wenn `print_name` gesetzt **und** vom Dateinamen abweicht (kein redundanter
    Echo); `title="Druckname"` für den Hover-Hinweis.
  - `web/src/style.css`: `.table .file-sub` (muted, klein, leichter Abstand).
- **Nicht verändert:** Spaltenstruktur bleibt (eine Spalte „Name"); die Unterzeile
  ist bewusst dezent gehalten, da das Design noch weiter angepasst wird.
- **Version:** Patch `0.2.8 → 0.2.9`, in `version.js`, `database.js`
  (`settings.version`), `server/package.json`, `web/package.json` synchron.

---

## 2026-11-10 – Datei-Ansicht aufgeräumt (v0.2.8)
- **Problem:** In der Datei-Ansicht stand „Dateien" zweimal – als
  Navigationstabs-Button **und** als Abschnitts-Überschrift `<h2>Dateien</h2>`.
  Zudem gab es ein Sortier-Dropdown (Name / Größe / Datum / Typ) + eine
  ↑/↓-Richtungstaste, die der Übersichtlichkeit halber entfielen.
- **Lösung:**
  - `web/src/App.jsx`: doppelte Überschrift `<h2>Dateien</h2>` entfernt
    (der Navigationstabs-Button reicht; „Einstellungen" hat keine solche Duplikation).
  - `web/src/FileList.jsx`: Sortier-Dropdown + ↑/↓-Richtungstaste entfernt,
    State `sort`/`order` sowie `setSort`/`setOrder` entfernt; `load`/`apply`/
    `onSaved` senden jetzt nur noch `{ q, type }`; Kopfkommentar auf
    „Tabelle mit Filter und Suche" korrigiert.
  - Sortierung bleibt standardmäßig **Name, aufsteigend** (Backend-Default
    `sort=name`/`order=asc` in `server/index.js`), das Verhalten der Liste
    ändert sich nicht sichtbar.
- **Nicht verändert:** Typ-Filter und Suche bleiben; die Tabellen-Spaltenüberschrift
  „Name" bleibt (sie ist die einzige Spalte).
- **Version:** Patch `0.2.7 → 0.2.8`, in `version.js`, `database.js`
  (`settings.version`), `server/package.json`, `web/package.json` synchron;
  `npm run build` OK (JS ~162.1 kB, CSS 7.64 kB).

---

## 2026-11-10 – Metadaten-Tab-Footer bereinigt (v0.2.7)
- **Problem:** Der Metadaten-Tab ist read-only (keine Tags-Fläche mehr), aber
  der Footer-Button rief weiterhin `handleSaveTags()` auf → er speicherte
  unveränderte Tags. `tags`, `editing`, `saved`, `handleSaveTags`,
  `api.updateFileTags` und die CSS-Regeln `.tags-section` waren toter Code;
  Header-/Tab-Kommentare nannten veraltete Felder („bearbeitbare Tags").
- **Lösung (`web/src/FileDetail.jsx`):**
  - toter Code entfernt: State `tags`/`editing`/`saved`, Funktion
    `handleSaveTags`, abgeleitete `busy`/`primaryLabel`/`primaryDisabled`,
    der Erfolgshinweis „✓ Tags gespeichert" und der ESC-Blocker `!editing`.
  - Footer jetzt tab-abhängig: **Druck-Tab** → „Druckdaten speichern" +
    „Abbrechen"; **Metadaten-Tab** → ein einziger „Schließen"-Button
    (read-only, nichts zu speichern).
  - `web/src/api.js`: `updateFileTags` entfernt (kein Aufrufer mehr).
  - `web/src/style.css`: tote `.tags-section`/`.tags-section strong` entfernt
    (CSS 7.81 → 7.64 kB).
  - JSDoc-/Tab-Kommentare auf den aktuellen Zustand gebracht
    („Druck … editierbar", „Metadaten … nur Anzeigen").
- **Nicht verändert:** Backend-Endpunkt `POST /api/db/file/tags` bleibt als
  öffentliche API (bewusst); DB-Spalte `tags` bleibt erhalten.
- **Version:** Patch `0.2.6 → 0.2.7` (Fehlerkorrektur), in `version.js`,
  `database.js` (`settings.version`), `server/package.json`, `web/package.json`
  synchron; `npm run build` OK (JS ~162.6 kB, CSS ~7.64 kB).

---

## 2026-11-10 – Detailfenster + Druckdaten + Versions-Sync (v0.2.3 → v0.2.6)
- **v0.2.3 – Detailfenster:** Klick auf den Dateinamen öffnet einen Modal
  (`web/src/FileDetail.jsx`) mit zwei Tabs. Beim Öffnen wird der DB-Eintrag
  (`GET /api/db/file?name=`) geladen, fehlt er, entsteht er beim Speichern.
  Schließen per ✕, ESC (nicht während Speichern) oder Hintergrund-Klick.
- **v0.2.4 – Tab „Druck":** editierbare Felder pro Datei – Name,
  Druckzeit (Min), Druckkosten (€), benötigte Filamente (Material + Menge je Zeile,
  mehrfach), Nozelgröße, Anzahl Druckplatten, Bemerkung. **Automatische
  Kostenschätzung** `(gramm/1000) × filament_price_per_kg` mit „≈ übernehmen".
  Speicherbar per `POST /api/db/file/print` (Upsert nach Name).
- **v0.2.5 – Tab „Herstellen" entfernt**, die bearbeitbaren Tags in den Tab
  „Metadaten" verlagert → zwei Tabs: **Druck** (aktiv) / **Metadaten**.
- **v0.2.6 – Metadaten-Tab:** Pfad-Feld (vollständiger Pfad) ergänzt,
  Tags-Fläche entfernt; **Versionen in allen Dateien synchronisiert**
  (`version.js`, `database.js` `settings.version`, `server/package.json`,
  `web/package.json` → **0.2.6**).
- **Backend / DB:** `server/database.js` (SQLite, `better-sqlite3`,
  `.cache/makercottage.db`) mit Tabellen `file_index` (+ Druck-Spalten),
  `scan_history`, `settings`; Migration trägt fehlende Druck-Spalten idempotent
  nach. `upsertFile` (Scan/Liste) **rührt die Druck-Felder nicht** an →
  gespeicherte Druckdaten überleben einen Neuscan. Endpunkte `GET /api/db/file`,
  `POST /api/db/file/tags`, `POST /api/db/file/print`, `GET/POST /api/db/settings`,
  `GET /api/db/files`, `POST /api/db/scan`.
- **Referenzpreis** `filament_price_per_kg` (Standard `20` €/kg) in `settings`,
  von `GET /api/db/file` als `pricePerKg` mitgeliefert; im UI nicht direkt editierbar.
- **Frontend:** `web/src/api.js` um `getDbFile`, `updateFileTags`,
  `updateFilePrint`, `getDbFiles`; `FileList.jsx` jetzt Name-only + Klick →
  `FileDetail`; Footer kontextabhängig („Druckdaten speichern" / „Tags speichern").
- **CSS:** `.print-grid` mit ausgeblendeten Zahl-Pfeilen (`input[type=number]`),
  `.detail-tabs`, `.dialog`/`.dialog-body`-Styling.
- **Version:** Patch-Kette `0.2.2 → 0.2.3 → 0.2.4 → 0.2.5 → 0.2.6`,
  `npm run build` OK (JS ~163 kB).
- **Hinweis:** Der in v0.2.6 als Nacharbeit notierte Metadaten-Tab-Footer
  (toter Tags-Code + `handleSaveTags`) wurde in **v0.2.7** bereinigt
  (siehe oberer Eintrag).

---

## 2026-11-08 – Dateiliste: nur Dateien, keine Ordner/versteckten (v0.2.2)
- **Problem:** Die Dateiliste (`/api/files`) zeigte Dateien und Ordner gemischt;
  zudem erschienen versteckte Einträge (`.cache`, `.Trash`, `.DS_Store`, `._*`).
- **Lösung:** `listFiles()` / `collectFiles()` in `server/smb.js` und
  `listFilesLocal()` / `collectLocal()` in `server/local.js` filtern jetzt:
  - **keine Ordner:** nur `!isDirectory` wird in die Ergebnisliste aufgenommen;
  - **keine versteckten:** `isHidden(name)` (führender Punkt) wird ausgeschlossen.
  - AppleDouble-Einträge (`.DS_Store`, `._*`) wurden bereits übersprungen –
    die neue `isHidden`-Prüfung deckt alle führenden-Punkt-Fälle ab.
- **Picker unbeeinflusst:** `browseNas()` / `browseLocal()` sind separate
  Funktionen und listen weiterhin nur Ordner für die Navigation – mit dem
  `showHidden`-Umschalter wie bei v0.2.1.
- **Funktionstest:** Simulierte Eingabe (3× 3MF + 2 Ordner + 4 versteckte) →
  Ergebnis: exakt 3 3MF-Dateien, 0 Ordner, 0 versteckte → PASS.
- **Version:** Fehlerkorrektur → **Patch +1** → `0.2.1 → 0.2.2`
  (`version.js` + beide `package.json`), `npm run build` + Server-Neustart.

---

## 2026-11-08 – Quelle wählen (NAS/SMB oder lokal) + Pfad-Picker (v0.2.0)
- **Quelle wählbar:** In „Einstellungen" gibt es jetzt einen Radio-Umschalter
  **„NAS (SMB)"** (Standard, rückwärtskompatibel) und **„Lokales Verzeichnis"**.
  Die Auswahl wird in `config.json` als `SOURCE` persistiert; fehlt sie, gilt `'nas'`.
  `config.json`-Struktur bleibt sonst unverändert (NAS-Werte werden übernommen).
- **Lokaler Pfad:** Für „Lokales Verzeichnis" ist `path` ein **absoluter** Pfad
  (z. B. `/Users/du/Dokumente/3D-Projekte`); Host/Share/Benutzer/Passwort werden
  dann ignoriert. `publicConfig` liefert `source` (Datenquelle) + `configSource`
  (Herkunft von config.json/.env) getrennt.
- **Pfad-Picker:** Statt den Pfad freihändig zu tippen, klickt man „🔎" und
  durchstöbert die Ordner. Breadcrumb + Unterverzeichnisse + „✓ Diesen Pfad wählen".
  Funktioniert für **beide** Quellen. Beim Quellenwechsel schließt sich der Picker,
  damit kein veralteter Inhalt der anderen Quelle gezeigt wird.
- **Backend:** neuer Endpunkt `POST /api/browse` (gibt `{current, breadcrumb,
  entries}` für NAS + lokal zurück); `/api/files` verzweigt auf `cfg.source`
  (lokal: `listFilesLocal`); neue Datei `server/local.js` (`listFilesLocal` +
  `browseLocal`); `server/smb.js` um `browseNas` ergänzt.
- **Frontend:** `web/src/api.js` um `api.browse()`; `ConfigForm.jsx` mit
  Quell-Umschalter + Picker; `style.css` um `.source-row`, `.radio`, `.field-block`,
  `.input-row`, `.picker`, `.breadcrumb`, `.crumb`; `App.jsx` verbindet `onBrowse`.
- **Version:** neue Funktion → **Minor +1** → `0.1.1 → 0.2.0`
  (`version.js` + `package.json`), `npm run build` + **einmaliger Server-Neustart**
  (neuer Endpunkt + Modul). Danach live.
- **Verifiziert:** im Browser Quellen-Umschalter NAS↔lokal, NAS-Picker
  (Breadcrumb `Share-Root / Dokumente / 3D-Projekte` + 2 Unterverzeichnisse),
  lokaler Modus verbirgt NAS-Felder und zeigt absoluten Pfad-Placeholder,
  `/api/files` liefert Dateien für **beide** Quellen; Footer `MakerCottage · v0.2.1`.
- **Versteckte im Picker:** Standardmäßig ausgeblendet (Namen mit führendem Punkt wie `.cache`, `.npm`, `.android`). Der Pfad-Picker zeigt nur sichtbare Einträge. Der Umschalter „Versteckte anzeigen" blendet sie wieder ein. → **Patch +1 → 0.2.1**.

---

## 2026-11-08 – Subtitle „3D-Druck-Dateien vom NAS verwalten" entfernt (v0.1.1)
- **Subtitle entfernt:** Die Zeile unter dem Logo (`App.jsx`, `<p className="subtitle">`) ist
  weg; der Header zeigt jetzt nur noch das Logo, direkt über dem Tab-Menü.
- **CSS aufgeräumt:** Die jetzt ungenutzte `.subtitle`-Regel in `style.css` wurde
  gelöscht. Abstand Logo → Tabs bleibt sauber (ca. 10px).
- **Version:** kleine sichtbare UI-Änderung → **Patch +1** → `0.1.0 → 0.1.1`
  (`version.js` + `package.json`), `npm run build` (wirkt ohne Server-Neustart).
- **Verifiziert:** im Browser keine Subtitle mehr, Footer `MakerCottage · v0.1.1`,
  Dateiliste 6 Einträge, 0 Konsolenfehler.

---

## 2026-11-08 – Untermenü „Einstellungen" (v0.1.0)
- **Neues Tab-Menü** in der Kopfzeile (`App.jsx`): **„Dateien"** (Standard) und
  **„Einstellungen"**. Aktiver Tab ist orange unterstrichen; Umstellung per
  `useState`-State, keine Route nötig.
- **NAS-Zugang verschoben:** Das frühere `ConfigForm`-Feld (Host/Share/Benutzer/
  Passwort/Pfad/Port/Such-Tiefe + „NAS finden" + „Shares laden") sitzt jetzt
  ausschließlich im Tab **„Einstellungen"** – die Dateiliste ist unter
  **„Dateien"** sauber allein sichtbar.
- **Verhalten:** Nach „Speichern" bleibt man im Tab (Status „Gespeichert ✓"), die
  `refreshKey`-Bump frisches `FileList`-Daten beim nächsten Wechsel. Rundweg im
  Browser verifiziert: Einstellungen → NAS-Formular (192.168.2.101 / `daten` /
  `oliverfuge`, Passwort „bereits gespeichert"); Dateien → **6 Einträge**
  (4× 3MF + 2 Ordner). Keine Konsolenfehler.
- **Version:** neues Feature → **Minor +1, Patch → 0** → `0.0.1 → 0.1.0`
  (`version.js` + `package.json`), `npm run build` (wirkt ohne Server-Neustart).
- **Stile:** neue `.tabs`-Klasse in `style.css` (Oliv/Orange, transparenter
  Tab, orange Aktive-Kante), 100% im bestehenden Design-System.

---

## 2026-11-08 – Branding, Optik & Versionierung (v0.0.1)
- **Umbenennen:** Projekt und Ordner → **MakerCottage** (sichtbares Branding +
  Ordnername `MakerCottage/`); Altname „3D Projektmanager" entfernt.
- **Logo:** in transparentes SVG umgewandelt (`MakerCottage_logo.svg`, hellgrauer
  Schriftzug + orangener Pfeil, ~40 KB); alte JPG entfernt. Sitzt **direkt** auf
  dem Grund (weißer Container entfernt), Höhe im Header **168px**.
- **Favicon:** von **JPG → PNG** (`MakerCottage_Favicon.png` 1024, `favicon-192/512`);
  `manifest.json` hinzugefügt, `index.html` zeigt PNG + Manifest; redundantes
  `MakerCottage_Favicon.jpg` aus `public/` + `dist/` gelöscht. (JPG ist kein
  Standard-Favicon-Format + harte Browser-Cache war der Grund, dass der Tab-Icon
  nicht sichtbar war.)
- **Farbschema:** Hintergrund auf **Oliv `#384b41`** gesetzt, komplette Palette
  harmonisiert (`--panel #42564a`, `--panel-2 #4c6055`, `--border #55685c`,
  `--text #f0f2ee`, `--muted #aeb9b1`); Akzent **Blau → Orange `#e8833a`**
  (passt zum Logo-Pfeil; über ein Wert in `style.css` reversibel).
- **Footer:** `MakerCottage · v<VERSION>` + zweite Zeile `created by Eguf72`
  (gedämpft, kleiner).
- **Versionierung eingeführt:** Start bei **v0.0.1**; Fehlerfix → 3. Zähler (Patch)
  +1, neue Funktion → 2. Zähler (Minor) +1 und 3. auf 0, Major bleibt 0. Einzelne
  Quelle `web/src/version.js` (`VERSION = '0.0.1'`), `package.json` abgestimmt,
  Footer importiert sie. (Doku-Aktualisierungen sind Wartung → kein Version-Bump;
  `0.0.1` ist der Baseline-Wert.)
- **T16 aufgelöst (echte NAS-Liste):** Server läuft produktiv auf **Port 4000**
  (PID 25187, `web/dist` vom Disk), listet **6 Einträge** gegen das echte NAS
  (192.168.2.101 / `daten` / `Dokumente/3D-Projekte`, Tiefe 2): 4× `3MF`
  (Bottle_holder, Christmas_Panels, Maggi_Würzpaste_Box, Ring_Lamp_Thicker_110_Scale)
  + 2 Ordner (Küchen Helfer, Lampen). Fehler- (502) und Erfolgs-Pfad sind jetzt
  beide bestätigt.
- **Hinweis:** `/MakerCottage_Favicon.jpg` liefert HTTP 200, weil der SPA-Fallback
  jede unbekannte Pfad auf `index.html` umleitet; das JPG-Asset selbst ist weg
  (gelöst).

---

## 2026-11-07 – NAS-Einbindung gefixt (SMB-Fehler behoben)
- **Ursache:** `server/package.json` forderte `smb2@^1.0.3`, diese Version existiert
  auf npm nicht (höchste ist `0.2.11`) → `npm install` brach mit `ETARGET` ab, das
  Backend konnte gar nicht starten. Zudem passte die in `smb.js` angenommene API
  (`new Client()`, `connect()`, `treeConnect()`, `tree.stat()`, `import { Client }`)
  zu keinem realen Paket (es war eine erfundene API).
- **Lösung:** Umstellung auf die moderne, gepflegte Bibliothek `@winlinux/smb2`
  (SMB 2.0.2–3.1.1, Signing/Encryption, `AbortSignal`) + `@winlinux/auth`
  (NTLM, reine JS – passend für typische NAS-Zugänge, keine native Abhängigkeit).
  - `server/smb.js` komplett auf die echte API umgeschrieben
    (`connect({host,port,authProvider,credentials})`, `session.list(share, dir)`,
    `session.close()`); Pfade sind share-relativ mit `/` (wie in `NAS_PATH`).
  - `server/package.json`: `smb2` entfernt, `@winlinux/smb2` + `@winlinux/auth`
    (`^1.1.0`) hinzugefügt → `npm install` läuft wieder durch.
  - `server/config.js` + `.env.example`: optionale `NAS_DOMAIN` (für Windows/AD-Shares).
  - `server/scan.js`: Bug in der **Datum-Sortierung** gefixt (ISO-Strings wurden
    subtrahiert → `NaN`, Sortierung funktionierte nicht); jetzt als Zeitstempel.
  - `server/discover.js`: **Bug behoben** – `bonjour-service` nutzt `find()` + Event
    `up` + `stop()`, nicht `browser()`/`service`/`destroy()`; zuvor `500:
    bns.browser is not a function`, jetzt `200` (leere Liste ohne Fund).
  - `server/index.js`: Fehlerdetail in `/api/files` verbessert (zeigt
    `SmbConnectionError`/`SmbAuthError` usw. mit Kontext).
- **Verifikation (im Sandbox):**
  - `npm install` erfolgreich (131 Pakete), alle Server-Dateien `node --check` OK.
  - Server startet; `/api/config`, `/api/types`, `POST /api/config`,
    `/api/nas/discover` arbeiten; Passwort wird nicht mitgegeben.
  - `/api/files` gegen ein unerreichbares NAS liefert ein sauberes `502` mit
    `SmbConnectionError: cannot connect to …` (statt `Client is not a constructor`).
  - Sortier-/Filter-/Such-Logik per Einheitstest geprüft (Datum/Größe/Typ/Name).
- **Noch offen (T16):** Echte Datei-Liste gegen **dein** NAS verifizieren –
  der Fehlerpfad ist getestet, eine erfolgreiche Liste braucht ein reales SMB-Target.
- **Hinweis (separat, nicht vom SMB-Fehler):** `@fastify/static@^8.0.3` zieht
  veraltete `glob`/`minimatch` (3 Security-Vulns). Fix per Major-Bump
  (`@fastify/static@^10.1.10`) – vorerst bewusst nicht angewandt (breaking change).

---

## 2026-11-07 – Prototyp-Code erstellt (Phase 0–3)
- **Backend** (`server/`):
  - `index.js` – Fastify-Server, Endpunkte `GET/POST /api/config`, `GET /api/types`,
    `GET /api/nas/discover`, `GET /api/files`, statisches Frontend (Produktiv).
  - `config.js` – `.env` + `config.json` (Nutzer-Vorrang), `publicConfig` ohne Passwort,
    `saveConfig` schreibt `config.json` (Mode 0o600).
  - `smb.js` – `smb2`-Verbindung + Ordner-Scan, flach + optionales `MAX_DEPTH` (rekursiv).
  - `scan.js` – Typ-Erkennung (STL/3MF/Gcode/OBJ/AMF/PLY) + Filter/Suche/Sortierung.
  - `discover.js` – Netzwerk-Suche via `bonjour-service` (`_smb._tcp`, `_afp._tcp`).
- **Frontend** (`web/`, Vite + React):
  - `App.jsx` – Orchestrator; `ConfigForm.jsx` – NAS-Zugang + „NAS finden";
    `FileList.jsx` – Tabelle + Filter/Suche/Sortierung; `api.js` – API-Client.
  - `style.css` – dunkles, sauberes Layout.
- **Doku/Config:** `README.md`, `.env.example`, `.gitignore`.
- **Korrekturen:** `api`-Import in `FileList.jsx` nach oben verschoben;
  Tippfehler „Gepliant"/„geschütst" korrigiert.

### Blocker
- **Node.js/npm ist auf der Maschine nicht installiert** (kein Homebrew/nvm/fnm/volta).
  → **T16** (lokaler Durchlauf) ist **Blockiert**: `npm install` und Start sind hier
  nicht möglich. Der Code ist vollständig, aber **nicht im Betrieb verifiziert**.
- Vorgehen: Node.js installieren (z. B. `brew install node`), dann
  `cd server && npm install`, `cd web && npm install`, Backend `npm run dev`,
  Frontend `npm run dev` (→ http://localhost:5173).

---

## 2026-11-07 – Entscheidungen (2. Runde)
- **Scan** flach (ein Ordner) + optionales `MAX_DEPTH` für Rekursion.
- **NAS-Zugang** wird vom Nutzer selbst eingetragen (Konfig-Formular + `config.json`).
- **Netzwerk-Suche** gewünscht → `bonjour-service` + Button „NAS finden" (Fallback: manuell).

## 2026-11-07 – Planung (Prototyp)
- Anforderungen: Web-App zuerst (Desktop später), Einzelnutzer, Dateien auf NAS (SMB/NFS),
  Prototyp-Kern = Liste + Filter + Suche.
- Stack: Backend Node.js + Fastify + `smb2`; Frontend Vite + React; keine DB im Prototyp;
  Konfiguration über `.env`/`config.json` (Zugangsdata lokal, `.gitignore`).

## 2026-11-07 – Projektstart
- Projektordner als Basis (leer) erkannt; Aufgabenliste + Fortschrittsprotokoll angelegt.
