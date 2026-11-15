# MakerCottage

Ein schlanker **Web-Prototyp**, um **3D-Druck-Dateien** zu verwalten. 
Er listet die Dateien eines NAS-Ordners auf und erlaubt **Filter und
Suche**. Neben den Metadaten speichert er **Tags und
Druckinformationen** in einer lokalen **SQLite**-Datei. Die App ist bewusst
klein gehalten und für spätere Erweiterungen gebaut (3D-Ansicht,
Druck-Schlange, Desktop-Wrapper).


## Voraussetzungen
- **Node.js 18+** (am besten 20/22) – lokal ist v26 installiert.
- Entweder ein **NAS** mit **SMB**-Freigabe (im lokalen Netzwerk) **oder** ein
  **lokales Verzeichnis** auf dem Server-Rechner (absoluter Pfad).

## Installation
```bash
# 1) Backend
cd server
npm install

# 2) Frontend
cd ../web
npm install
```

## NAS-Zugang eintragen (2 Wege)
1. **Über die App:** Im Browser „NAS finden" nutzen oder Host/Share/Benutzer/Passwort
   eingeben und „Speichern" klicken. Die Daten liegen danach in
   `~/.makercottage/config.json` (lokal, Mode `0o600`).
2. **Per Datei:** `.env.example` als `server/.env` kopieren und ausfüllen
   (`.env` liegt im `.gitignore` und enthält Zugangsdaten; `config.json` liegt
   im Daten-Ordner `~/.makercottage/`).

## Starten
**Produktiv (ein Port – aktueller Betrieb):**
```bash
cd web && npm run build      # baut nach web/dist
cd ../server && npm start    # serviert Frontend + API unter http://localhost:4000
```
`@fastify/static` bedient `web/dist` direkt vom Disk → ein `npm run build` wirkt
**ohne** Server-Neustart; nur Code-Änderungen im Backend brauchen einen Neustart.

**Entwicklung (zwei Terminals):**
```bash
# Terminal 1 – Backend auf Port 4000
cd server && npm run dev
# Terminal 2 – Frontend auf Port 5173 (leitet /api an 4000 weiter)
cd web && npm run dev
```
Dann im Browser: **http://localhost:5173**

## Desktop-App (portable, v0.6.0)

Aus der Web-App wird ein **portabler Ordner** pro Betriebssystem: ein
vorkompilierter **Node-Laufzeit**-Bundle + Server + `node_modules` (inkl.
`better-sqlite3`-Prebuilds) + gebautes Frontend + eine **Start-Datei**. Der
Launcher startet das Backend **ohne Installation** und öffnet danach den
Browser – Basis für einen späteren Electron-Wrapper (echtes Fenster).

**Prinzip:** ein geteilter, plattformübergreifender Kern
(`launcher/launcher.mjs`) startet den Server als **Kindprozess** mit der
**mitgelieferten** `bin/node`, wartet per TCP auf den Port und öffnet die UI
per **injizierbarer** `openUI`-Strategie:

| | jetzt (Option A) | später (Option C: Electron) |
|---|---|---|
| `openUI(url)` | `open` / `xdg-open` / `start` (Browser) | `new BrowserWindow().loadURL(url)` |
| Server | Node-Kindprozess `bin/node` | **derselbe** |
| Rest | identisch | identisch |

→ **Sprung A → C** ist ein Einzeiler (`launch({ openUI: … })`); Server,
Prebuilds und Frontend bleiben unverändert.

**Bauen (macOS, arm64):**
```bash
cd scripts && ./build-macos.sh
# → dist/makercottage-macos-arm64/  und  dist/makercottage-macos-arm64.zip
```
Das Skript lädt per Default die **offizielle, self-contained** Node-Binär
(`NODE_SOURCE=download`, Cache in `dist/.node-cache/`) – `otool -L` zeigt
nur macOS-System-Libs, **kein Homebrew** → lauffähig auf jedem Mac. Am Ende
läuft ein **Smoke-Test** (Launcher + Port + `/api/config`).

**Starten:** Das **gebaute** `MakerCottage.command` doppelklicken → Browser
öffnet `http://127.0.0.1:4000`. Das Terminal-Fenster hält das Backend am Leben
(Tab/Schließen beendet es). NAS-Zugang wie gewohnt im Tab „Einstellungen".

> **Wichtig – richtige Datei:** Doppelklickbar ist das `MakerCottage.command`
> im **gebauten Ordner** `dist/makercottage-macos-arm64/` (dort liegt die
> mitgelieferte `bin/node`). Die Datei in `scripts/launchers/` ist nur die
> **Vorlage** ohne `bin/node` – ein Start aus dem Quell-Ordner meldet jetzt
> eine klare Fehlerbox und wartet auf Enter (statt blitzschnell zu schließen).

**Erster Start (Gatekeeper):** macOS blockt evtl. das Skript mit
„unklarer Quelle" → Rechtsklick → „Öffnen", oder:
`xattr -dr com.apple.quarantine <Ordner>`.

> **Voraussetzung:** `better-sqlite3` v13 liefert fertige Prebuilds für **alle**
> Zielplattformen im Paket; der Loader wählt automatisch die richtige aus –
> das einzige native Modul „passt" ohne Sortieren. Linux-/Windows-Builds sind
> vorbereitet (`MakerCottage.sh`/`.bat`), laufen aber erst auf der jeweiligen
> Zielplattform.

## Aktualisieren
Ein Update **überschreibt nur den Code, nicht die Daten** (DB + `config.json`
liegen in `~/.makercottage/`, also außerhalb des Code-Ordners). Deshalb:

1. **Neuen Ordner _daneben_ entpacken** (Zip neben den bestehenden ziehen –
   _nicht_ über den alten).
2. Darin die Start-Datei ausführen: `MakerCottage.command` (macOS),
   `MakerCottage.sh` (Linux) bzw. `MakerCottage.bat` (Windows).
3. Das Backend startet neu, der Browser öffnet sich.
4. Alle Nutzerdaten (DB in `~/.makercottage/makercottage.db`, `config.json`)
   bleiben **unberührt**. Alte Daten aus `.cache/makercottage.db` +
   `server/config.json` werden beim ersten Start automatisch nach
   `~/.makercottage/` migriert (Altkopien bleiben als Backup).

> **CLI-Info (v0.6.0):** `MakerCottage.command --version` zeigt Version +
> Daten-Ordner; `--check` prüft **automatisch** auf ein neues Release (GitHub,
> via `MC_UPDATE_REPO`, Default `Eguf72/makercottage`) und meldet „Update verfügbar
> v… · Herunterladen" – ohne Konfiguration (bzw. bei Fehlern) den manuellen Pfad;
> `--help` die Übersicht. Ohne Flag startet wie gewohnt das Backend + UI. Der
> UI-Footer meldet ebenfalls „⚠ Update verfügbar v… · Herunterladen", sobald eine
> neuere Version da ist (Endpunkt `GET /api/update/check`, serverseitig – umgeht
> den Browser-CORS gegen GitHub).
>
> **Umgebung (optional):** `MC_UPDATE_REPO=owner/repo` (leer = kein Remote-Check,
> manueller Pfad), `MC_UPDATE_GH_TOKEN` (Bearer → GitHub-Rate-Limit 60→5000/h),
> `MC_UPDATE_GITHUB_API` (GitHub-Enterprise/Proxy), `MC_UPDATE_TIMEOUT_MS` (8 s),
> `MC_UPDATE_CACHE_MS` (5 min). Siehe `AUFGABEN.md` T58 / `FORTSCHRITT.md` v0.6.0.

## Optik / Branding
- **Logo:** transparentes SVG (`MakerCottage_logo.svg`), hellgrauer Schriftzug +
  orangener Pfeil, sitzt **direkt** auf dem Oliven-Grund (kein weißer Container).
  Höhe im Header: `168px`.
- **Favicon:** quadrates PNG (`MakerCottage_Favicon.png`, 1024) + `favicon-192/512`,
  über `manifest.json` registriert; `index.html` verweist auf PNG (kein JPG).
- **Farbschema** (`style.css :root`), harmonisiert auf den Oliven-Grund:
  | Variable | Wert | Bedeutung |
  |---|---|---|
  | `--bg` | `#384b41` | Hintergrund (Oliv) |
  | `--panel` | `#42564a` | Karten/Flächen |
  | `--panel-2` | `#4c6055` | Sekundär-Flächen |
  | `--text` | `#f0f2ee` | Haupttext |
  | `--muted` | `#aeb9b1` | Sekundärtext |
  | `--accent` | `#e8833a` | Akzent (Orange, passt zum Logo-Pfeil) |
  | `--border` | `#55685c` | Linien/Ränder |
- **Footer:** `MakerCottage · v<VERSION>` + eine zweite, gedämpfte Zeile
  `created by Eguf72`.

## Versionierung
Die Versionsnummer hat **eine einzige Quelle**: `web/src/version.js`
(`export const VERSION = '0.0.1'`); `web/package.json` ist darauf abgestimmt.
Der Footer importiert sie (`v{VERSION}`).

Schema `MAJOR.MINOR.PATCH` (Major bleibt `0`), ausgehend von **0.0.1**:

| Anlass | Aktion | Beispiel |
|---|---|---|
| Fehlerkorrektur | 3. Zähler (Patch) **+1** | `0.0.1 → 0.0.2` |
| Neue Funktion | 2. Zähler (Minor) **+1**, 3. auf **0** | `0.0.1 → 0.1.0` |

Nach jeder Änderung nur die `VERSION` in `version.js` anpassen und `npm run build`
(im Produktionsbetrieb ohne Neustart).

## Funktionen (Prototyp)
- **Untermenü „Dateien / Einstellungen"** (Tab in der Kopfzeile, orange aktiv)
- Datei-Liste **nur nach Name** im Tab **„Dateien"** (Details im Detailfenster);
  Typ-Filter und Textsuche bleiben oben in der Leiste; die Liste ist
  standardmäßig nach Name aufsteigend sortiert. Angezeigt wird der
  **Druckname** (Platzhalter beim Scannen: der Dateiname), den man im
  Detailfenster beliebig überschreiben kann.
- **Detailfenster:** klickbarer Dateiname öffnet einen Modal mit zwei Tabs
  (**Druck** aktiv / **Metadaten**), schließbar per ✕, ESC oder Hintergrund-Klick.
- **Druck-Tab:** pro Datei editierbar – Name, Druckzeit (Min), Druckkosten (€),
  benötigte Filamente (Material + Menge je Zeile, mehrfach), Nozelgröße, Anzahl
  Druckplatten, Bemerkung; **automatische Kostenschätzung**
  `(gramm/1000) × Referenzpreis` mit „≈ übernehmen".
- **Metadaten-Tab:** Endung, Größe, letzte Änderung, Erstellt (optional),
  **vollständiger Pfad**, DB-ID (optional).
- **SQLite-Persistenz** (`~/.makercottage/makercottage.db`): Metadaten, Tags und
  Druckdaten überleben ein Neuladen und einen neuen Scan (beim Scan werden die
  Druck-Felder nicht überschrieben).
- **Quelle wählen:** „NAS (SMB)" (Standard) oder **„Lokales Verzeichnis"** im Tab
  **„Einstellungen"**; `SOURCE` wird in `~/.makercottage/config.json` gespeichert.
- **Pfad-Picker:** Pfad durchstöbern statt tippen – Breadcrumb +
  „✓ Diesen Pfad wählen", funktioniert für NAS und lokal.
- NAS-Zugang über Formular + **Netzwerk-Suche** („NAS finden") im Tab **„Einstellungen"**
- Fehler-/Leerzustände
- Branding (Logo/Favicon/Oliv-Farbe) + Versions- & Credit-Zeile im Footer

## API
| Methode | Pfad | Zweck |
|---|---|---|
| GET  | `/api/config` | Aktuelle (öffentliche) Konfiguration – **ohne** Passwort |
| POST | `/api/config` | NAS-Zugang speichern |
| GET  | `/api/types` | Verfügbare Typen zum Filtern |
| GET  | `/api/nas/discover` | Netzwerk-Suche nach SMB-Diensten |
| POST | `/api/nas/shares` | Shares des NAS auflisten (Share-Picker) |
| POST | `/api/browse` | Unterverzeichnisse + Breadcrumb für den Pfad-Picker (NAS + lokal) |
| GET  | `/api/files?type=&q=&sort=&order=` | Gefilterte/sortierte Datei-Liste (indexiert die Funde) |
| GET  | `/api/db/files?type=&q=&tags=` | Indexierte Dateien aus der SQLite-DB |
| POST | `/api/db/scan` | Verzeichnis scannen + in die DB indexieren (`source`/`path`) |
| GET  | `/api/db/file?name=` | Einzelnen DB-Eintrag (Metadaten + Druckdaten + `pricePerKg`) |
| POST | `/api/db/file/tags` | Tags einer Datei aktualisieren (Upsert nach Name) |
| POST | `/api/db/file/print` | Druckinformationen einer Datei aktualisieren (Upsert nach Name) |
| GET  | `/api/db/settings?key=` | Einstellung(en) lesen (z. B. `filament_price_per_kg`) |
| POST | `/api/db/settings` | Einstellung schreiben (`key`/`value`) |

> **Referenzpreis** `filament_price_per_kg` (Standard `20` €/kg) liegt in der DB und
> wird von `GET /api/db/file` als `pricePerKg` mitgeliefert – er treibt die
> automatische Kostenschätzung im Druck-Tab. Er ist im UI nicht direkt editierbar.

## Konfiguration
| Variable | Standard | Bedeutung |
|---|---|---|
| `SOURCE` | `nas` | Quelle: `nas` (SMB) oder `local` (lokales Verzeichnis) |
| `NAS_HOST` | – | Host/IP des NAS |
| `NAS_SHARE` | – | Freigabe (Share) |
| `NAS_USER` | – | Benutzer |
| `NAS_DOMAIN` | – | Domain für Windows/AD-Shares (z. B. `CORP`); bei typischen NAS meist leer |
| `NAS_PASS` | – | Passwort |
| `NAS_PATH` | `/` | Zu scannender Ordner im Share |
| `NAS_PORT` | `445` | SMB-Port |
| `MAX_DEPTH` | `0` | Such-Tiefe (0 = nur direkte Ebene) |
| `PORT` | `4000` | Port des Backends |

## Datenbank (SQLite)
Alle Dateien und ihre Metadaten werden in einer lokalen SQLite-Datei
(`~/.makercottage/makercottage.db`, Modul `server/database.js`, `better-sqlite3`)
gespeichert – ohne externe DB-Instanz.

> **Daten-Ort / Update ohne Datenverlust:** DB und config liegen seit v0.4.0 im
> stabilen Ordner **`~/.makercottage/`** (nicht im Code-Ordner). Über die
> Umgebungsvariable **`MC_HOME`** ist der Ort überschreibbar. Beim ersten Start
> migriert `server/paths.js` alte Daten aus `.cache/makercottage.db` und
> `server/config.json` einmalig, idempotent und **nicht destruktiv** (Altkopien
> bleiben als Backup) in den neuen Ordner – so überleben Nutzer-Daten ein
> Code-Update.

| Tabelle | Zweck |
|---|---|
| `file_index` | Je Datei ein Eintrag: Name, Endung, Typ, Größe, Pfad, `last_modified`, Tags + Druck-Felder |
| `scan_history` | Protokoll der Scans (Quelle, Pfad, Dateizahl, STEP-Zahl) |
| `settings` | Schlüssel-Wert-Einstellungen (z. B. `filament_price_per_kg`, `version`, `db_version`) |

- **Idempotentes Indexing:** Beim Auflisten (`GET /api/files`) und beim Scan
  (`POST /api/db/scan`) wird jede gefundene Datei idempotent upserted – ein
  Scan schreibt **nicht** in die Druck-Felder (`print_name`, `print_time_min`,
  `print_cost`, `filaments`, `nozzle_size`, `print_plates`, `print_notes`),
  damit gespeicherte Druckdaten über einen Neuscan hinweg erhalten bleiben.
- **Migration:** Fehlende Druck-Spalten werden bei Eröffnung idempotent
  nachgetragen (`ALTER TABLE … ADD COLUMN`, nicht destruktiv).
- `better-sqlite3` ist ein **natives Modul** → bei Plattformwechsel
  `npm rebuild`/`npm install` im `server/` ausführen.

## Nächste Schritte (Ausblick)
- 3D-Vorschau der Modelle (`react-three-fiber` + `/api/files/:id/preview`)
- **Druck-Schlange** (Status „gedruckt / geplant" + Sortierung) – Druckdaten sind
  bereits gespeichert, eine Queue fehlt noch
- **UI-Feld für den Referenzpreis** `filament_price_per_kg` (aktuell nur per
  `POST /api/db/settings` änderbar)
- Desktop-Wrapper: **Option A (portabler Launcher) Fertig v0.3.0** (macOS,
  `MakerCottage.command`); **Option C (Electron)** + Linux-/Windows-Builds offen
  (Kern bereits Electron-fähig, `launch({ openUI })` injizierbar)

> **Bereits umgesetzt** (früher als Ausblick geführt): Tags/Kategorien,
> Druckinformationen pro Datei und **SQLite** als Datenspeicher
> (früher `.cache/makercottage.db`, seit v0.4.0 in `~/.makercottage/`) –
> siehe Detailfenster oben.
