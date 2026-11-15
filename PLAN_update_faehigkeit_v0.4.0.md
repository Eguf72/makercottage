# Plan: Update-Fähigkeit ohne Datenverlust (v0.4.0)

**Status**: P0 (Daten-Trennung + Migration) **erledigt (v0.5.0)** · P2a (CLI `--version`/`--check`/`--help` + README „Aktualisieren") **erledigt (v0.5.1)** · P2b (Remote-Update-Check) **erledigt (v0.6.0)** · Stand 2026-11-15  
**Erledigt**: P1 Version-Signal + Datei-im-Ordner-öffnen (v0.3.3); P0 Daten-Trennung + einmalige Migration (v0.5.0, `~/.makercottage/`); P2a CLI + README (v0.5.1); P2b Remote-Update-Check (v0.6.0, `getupdatecheck.js` + `GET /api/update/check` + Launcher `--check` + UI-Footer-Banner).  
**Noch offen**: nur `@fastify/static`-Major-Bump (breaking, Release-Entscheidung) + Electron/T45 (Option C).  
**Ziel**: Ein Update kann einspielt werden, ohne `.cache/makercottage.db` und `config.json` zu überschreiben. Nutzerdaten bleiben erhalten.

> Hinweis: `0.3.3` ist als **Patch** bewusst gewählt, weil „Update ohne Datenverlust" erst
> dann stimmt, wenn P0 (Daten in `~/.makercottage/`, nicht im Code-Ordner) real ist.
> Bis dahin gilt weiterhin: Code-Update überschreibt den Code-Ordner, die Daten liegen
> noch in `.cache/` (DB) und `config.json` (beide im Projektordner) und sind beim
> Entpacken einer neuen Version nicht automatisch geschützt.

---

## 1. P0 – Daten-Trennung + einmalige Migration (Fundament)

### 1.1 Neue Datei: `server/paths.js`
- **Inhalt**:
  ```js
  import { mkdirSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { dirname, join } from 'node:path';

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // --- Nutzer-Daten-Ordner (stabil & übertragbar) -----------------
  // MC_HOME überschreiben; fallback auf plattformübergreifendes Heimat-Verzeichnis.
  // Windows: %APPDATA%/makercottage   macOS: ~/Library/Application Support/makercottage
  // Linux: ~/.config/makercottage (optional, hier: ~/.makercottage)
  const MC_HOME_DEFAULT = join(
    process.platform === 'win32' ? process.env.APPDATA
      : process.platform === 'darwin' ? require('os').homedir()
      : require('os').homedir(),         // Linux fallback
    '.makercottage'
  );
  export const DATA_DIR = process.env.MC_HOME || MC_HOME_DEFAULT;
  export const DB_PATH = join(DATA_DIR, 'makercottage.db');
  export const CONFIG_PATH = join(DATA_DIR, 'config.json');

  // Sicherstellen, dass der Ordner existiert (einmalig beim Modul-Import)
  mkdirSync(DATA_DIR, { recursive: true });
  ```
- **Aufgabe**: `database.js` und `config.js` ersetzen ihren harten Pfad durch Importe aus `./paths.js`.

### 1.2 `server/database.js` ändern
- **Entfernen** (Zeilen 9–14):
  ```js
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dbPath = join(__dirname, '..', '.cache', 'makercottage.db');
  // Stelle sicher, dass das .cache-Verzeichnis existiert
  import { mkdirSync } from 'node:fs';
  mkdirSync(dirname(dbPath), { recursive: true });
  ```
- **Hinzufügen** am Dateianfang:
  ```js
  import { DB_PATH } from './paths.js';
  ```
- **Ersetzen** `new Database(dbPath)` → `new Database(DB_PATH)`.
- **Kommentar oben** aktualisieren auf „Pfad: siehe paths.js (DATA_DIR)“.

### 1.3 `server/config.js` ändern
- **Entfernen** (Zeile 7):
  ```js
  const CONFIG_PATH = join(__dirname, 'config.json');
  ```
- **Hinzufügen** am Dateianfang:
  ```js
  import { CONFIG_PATH } from './paths.js';
  ```
- `.env`-Laden bleibt unverändert (dev-default, kein Nutzer-Datensatz).

### 1.4 Einmalige, idempotente Migration (in `paths.js` bereits enthalten)
- `mkdirSync(DATA_DIR, { recursive: true })` erstellt den Ordner bei erstem Import.
- **Kopier-Logik** (optional extra in `database.js` beim ersten Start, wenn DB_PATH noch nicht existiert):
  - Falls `~/.cache/makercottage.db` existiert UND `~/.makercottage/makercottage.db` NICHT existiert:
    - `import { copyFileSync } from 'node:fs'; copyFileSync(oldPath, DB_PATH);`
    - Log: `console.log('[paths] DB migriert von .cache nach ~/.makercottage')`.
  - Falls `server/config.json` existiert UND `~/.makercottage/config.json` NICHT existiert:
    - `copyFileSync` mit Modus `0o600`.
    - Log: `console.log('[paths] config migriert nach ~/.makercottage')`.
- **Wichtig**: Alte Dateien bleiben erhalten (Backup). Sie werden im Zip (`build-macos.sh:124`) ausgeschlossen, also bei Neu-Entpacken nicht mitkopiert.

### 1.5 `launcher/launcher.mjs`
- Kein Code-Change nötig: `MC_HOME` wird bereits via `env: {...process.env}` geerbt.
- **Kommentar aktualisieren**: „Umgebungsvariable MC_HOME überschreibt den Standard-Ordner für Nutzerdaten (`~/.makercottage/`).“

### 1.6 `scripts/build-macos.sh`
- **README.txt** (Zeile 115): „Daten liegen in `~/.makercottage/` (über `MC_HOME` überschreibbar).“
- **Zeile 124** beibehalten: `zip -r -q "${NAME}.zip" "$NAME" -x "${NAME}/.cache/*"` (`.cache` aus Distribution exkludieren).

### 1.7 Version-Sync (v0.4.0)
- `web/src/version.js`: `VERSION = '0.4.0'` (Changelog-Zeile am Ende hinzufügen).
- `server/package.json`: version auf `0.4.0` ändern.
- `web/package.json`: version auf `0.4.0` ändern.
- `server/database.js` defaultSettings: `['version', '0.4.0']` und `['db_version', '4']` setzen (Migration marker).

---

## 2. P1 – Version-Signal (Skew + Stub)

### 2.1 `server/index.js` ändern
- Neue Route am Ende vor `app.listen`:
  ```js
  app.get('/api/version', async () => {
    const pkg = require('../package.json'); // server/package.json
    return { version: pkg.version };
  });
  ```
  *(Alternativ: zentrale const aus package.json lesen, um Duplizierung zu vermeiden.)*

### 2.2 `web/src/api.js` ändern
- Funktion hinzufügen:
  ```js
  getVersion: () => request('/api/version'),
  ```

### 2.3 `web/src/App.jsx` ändern (Footer)
- Im `useEffect` nach Config/Types `getVersion` hinzufügen und Zustand `serverVersion` halten.
- Im Footer: zeige `v{VERSION}` (aus version.js) + `console-vergleich`.
- **Skew-Hinweis**: Wenn `serverVersion !== VERSION` → `<div>⚠ Server v{serverVersion} ≠ UI v{VERSION} – bitte neu entpacken</div>`.
- **Stub-Tooltip**: „Update-Quelle folgt (kein Remote-Check jetzt)“.

---

## 3. P2a – Sicheres manuelles Update (Doku + CLI)

### 3.1 `launcher/launcher.mjs` ändern
- **`--version`/`-v` Flag**: Am Ende von `launch()` vor Rückkehr den folgenden Block voranstellen:
  ```js
  // --version/--check handling (vereinfacht)
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`MakerCottage v${VERSION} (aus version.js)`);
    console.log(`Daten-Ordner: ${DATA_DIR || '~/.makercottage (Default)'}`);
    // MC_HOME falls gesetzt:
    if (process.env.MC_HOME) console.log(`MC_HOME=${process.env.MC_HOME}`);
    process.exit(0);
  }
  if (args.includes('--check')) {
    console.log('Update-Check: Keine Remote-Quelle konfiguriert (Stub).');
    console.log('Manuell: Neuen Ordner daneben entpacken, Launcher starten – Daten bleiben erhalten.');
    process.exit(0);
  }
  ```
- **Platzierung**: Den Block **vor** den `if (import.meta.main)` Abschnitt setzen, damit er auch beim Import (`import launch from './launcher.mjs'`) funktioniert, oder den gesamten `launch()`-Aufruf im `if (import.meta.main)` blockieren und vorher die Args prüfen.

### 3.2 `README.md` ändern
- Neuer Abschnitt **„Aktualisieren"**:
  ```
  ## Aktualisieren
  1. Neuen Ordner daneben entpacken (Zip neben den bestehenden Ordner ziehen).
  2. Darin die Datei `MakerCottage.command` (macOS) / `MakerCottage.sh` / `MakerCottage.bat` (Linux/Windows) starten.
  3. Das Backend startet neu, der Browser öffnet sich.
  4. Alle Nutzerdaten (DB in `~/.makercottage/makercottage.db`, config.json) bleiben unberührt – sie liegen außerhalb des Code-Ordners.
  ```
- Falls bereits README-Abschnitt "Erste Start" etc. vorhanden, einfach ergänzen.

### 3.3 `scripts/build-macos.sh` README.txt
- Kurz ergänzen: „Zum Aktualisieren neuen Ordner daneben entpacken.“

### 3.4 `AUFGABEN.md` / `FORTSCHRITT.md` ändern (erledigt, Stand 2026-11-15)
- **AUFGABEN.md**: P0 (Daten-Trennung + Migration) = **T56 → Fertig (v0.5.0)**;
  P2a (CLI + README) = **T57 → Fertig (v0.5.1)** (beide in der Sonderaufgaben-
  Tabelle; die finale Nummernreihe weicht von dieser frühen Planung ab, die P0 als
  „T51" notierte). T49 (Datei-Öffnen) + T50 (Version-Signal) = **Fertig (v0.3.3)**.
- **FORTSCHRITT.md**: v0.3.3- (2026-11-13), v0.5.0- (UI/P0/Live-Neustart),
  Alt-Backups-Aufräumen- und v0.5.1-P2a-Eintrag (alle 2026-11-15) stehen.

---

## 4. Verifikations-Checkliste (nach Implementierung)

### 4.1 Dev-Umgebung
1. Server einmal starten (`node server/index.js` oder Launcher).
2. Prüfen: `~/.makercottage/makercottage.db` existiert und **byte-identisch** mit `server/.cache/makercottage.db` (diff).
3. Prüfen: `~/.makercottage/config.json` existiert und **byte-identisch** mit `server/config.json`.
4. `.cache/makercottage.db` **unberührt** (immer noch im alten Pfad).
5. Zweiten Start: Log „nichts zu tun" (idempotent – Migration nur einmal).
6. `GET /api/version` → `{ version: '0.4.0' }`.
7. Footer zeigt UI-Version + optional Skew-Hinweis (wenn Server-Version abweicht).

### 4.2 Build (Smoke-Test)
1. `scripts/build-macos.sh` ausführen.
2. Build-Ordner `dist/makercottage-macos-arm64/` prüfen:
   - `.cache` **fehlt** (ist aus Zip ausgeschlossen).
   - `config.json` **fehlt** im App-Ordner (wurde beim letzten Lauf migriert, nicht neu mitkopiert).
   - `package.json` (im App-Ordner) enthält version `0.4.0`.
3. Launcher im Smoke-Test (`NO_OPEN=1 PORT=4099 ...`) startet Server, `/api/config` antwortet, `/api/version` antwortet.

### 4.3 Update-Szenario (Hand-Test)
1. Aktuellen Ordner `MakerCottage-macos-arm64` als Backup behalten.
2. Neues Zip herunterladen (bzw. neuen Build-Ordnern extrahieren).
3. Neuen Ordner **daneben** entpacken (nicht überschreiben).
4. `MakerCottage.command` starten.
5. Prüfen: Datenbank und Config sind die gleichen wie vorher (Pfad `~/.makercottage/`).
6. Dateiliste, Overview, alle Metadaten sind erhalten.

### 4.4 Vorschau-Bilder (v0.4.0)
1. 3MF-Datei → eingebettetes PNG erscheint in Detail-Ansicht (beide Modi: inline + Modal).
2. STL/OBJ/PLY/AMF → gecachtes PNG unter `~/.makercottage/thumbnails/<hash>.png`, zweiter Aufruf schnell (Cache-Hit).
3. Gcode/STEP → eleganter Platzhalter „Keine Vorschau verfügbar", kein Fehler im Log.
4. `GET /api/file/preview/info` liefert `kind`, Cache im 2. Aufruf genutzt.
5. Build läuft; `.cache`/`thumbnails` bleiben im Code-Ordner *nicht* (nur in `DATA_DIR`).

## 5. Entscheidungen (final)

| Thema | Entscheidung |
|-------|------------|
| **Versionsprung** | v0.4.0 (Minor – neue Fähigkeit + sichtbare Daten-Orts-Änderung) |
| **Migration** | Kopieren nach `~/.makercottage/`, alte Dateien als Backup behalten |
| **P1-Footer** | Server- vs. UI-Version vergleichen (Skew-Hinweis); „Update verfügbar" **real** (P2b, v0.6.0): `⚠ Update verfügbar v{latest} · Herunterladen` (nur bei `available:true`), `.footer-update` |
| **Update-Pfad** | Manuell: Neuen Ordner daneben entpacken, Launcher starten – Daten bleiben in `~/.makercottage/`; **plus** automatischer Remote-Check (P2b) |
| **MC_HOME** | Umgebungsvariable override für Daten-Ordner; später bei Electron auf `app.getPath('userData')` umstellbar |
| **Remote-Quelle (P2b)** | GitHub-Releases via konfigurierbarer `MC_UPDATE_REPO` (Default `Eguf72/makercottage`); leer → sauberer manueller Pfad (kein Crash). ~~Kein GitHub jetzt~~ erledigt v0.6.0 (T58) |
| **Vorschau-Bilder** | Server-seitiger Rasterizer (rein JS, keine native Dep): 3MF-Thumbnail + Mesh-Render für STL/OBJ/PLY/AMF, Platzhalter für Gcode/STEP. Bündel in v0.4.0. |

---

## 6. P2b – Remote-Update-Check (Realisierung, v0.6.0, T58)

**Geteiltes Modul `server/updatecheck.js`** (kein Fastify/React → wird von
**Server UND Launcher** importiert):
- `checkForUpdate({ current, env })` → JSON-Objekt; **wirft nie** (alle Fehler →
  `{ available:false, error:<menschenlesbar> }`).
- `compareVersions(a,b)` (semver-Kern `MAJOR.MINOR.PATCH`, `v`-Präfix +
  Prerelease-Strip → konservative Gleichsetzung), `resolveConfig(env)`,
  In-Memory-Cache (TTL `MC_UPDATE_CACHE_MS` = 5 min).
- Konfiguration via Env: `MC_UPDATE_REPO` (Default `Eguf72/makercottage`; leer →
  `configured:false` → manueller Pfad, kein Crash), `MC_UPDATE_GH_TOKEN`
  (Bearer → Rate-Limit 60→5000/h), `MC_UPDATE_GITHUB_API` (Enterprise/Proxy),
  `MC_UPDATE_TIMEOUT_MS` (8 s).

**Anbindungen:**
- `server/index.js`: `GET /api/update/check` → `checkForUpdate({ current: APP_VERSION })`
  (serverseitig → umgeht Browser-CORS gegen GitHub; Share-CORS-bereit).
- `launcher/launcher.mjs`: `--check` ruft `checkForUpdate()` per **dynamischem
  Import** des Nachbar-Moduls auf (kein `launch()` → kein Server-Start);
  asynchron + `handled`-Flag, damit `launch()` nicht durchläuft; `printCheckResult()`
  zeigt bei `available:true` Download-/Release-Links, sonst den manuellen Pfad.
- `web/src/api.js`: `getUpdateCheck()`; `App.jsx`: `updateInfo`-State + Footer-Banner
  `⚠ Update verfügbar v{latest} · Herunterladen` (nur bei `available:true`);
  `style.css` `.footer-update`.
- `build-macos.sh`: `updatecheck.js` in die `app/`-Kopie aufgenommen.

**Versions-Sync `0.6.0`** (Minor, neue Fähigkeit): `version.js` (+Changelog),
`server/package.json`, `web/package.json`, `database.js` defaultSettings
(`db_version` bleibt 5 – keine Schema-Änderung).

**Verifiziert:** `node --check` (updatecheck/index/launcher/api) grün;
`npm run build` (Vite) grün, `0.6.0` im Bundle; macOS-Build + Smoke-Test
bestanden; `/api/update/check` live – Default `Eguf72/makercottage` → 404 →
`available:false` + error, `MC_UPDATE_REPO=nodejs/node` → `available:true`
(mit `downloadUrl`/`releaseUrl`); `--check` im Bundle (beide Fälle, Exit 0,
kein Server-Start). **Nächster Schritt:** kein fester Host → Nutzer setzt
`MC_UPDATE_REPO` auf das reale Repo; `@fastify/static`-Major-Bump bleibt offen.

Ende des Plans.