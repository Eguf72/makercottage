import Fastify from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

import db, {
  getFiles,
  recordScan,
  getSetting,
  setSetting,
  indexFile,
  upsertFile,
  getFileByName,
  getPrintNameMap,
  updateFileTagsByName,
  updateFilePrint,
  getTypeCounts,
  getRecentFiles,
} from './database.js';
import { getConfig, publicConfig, saveConfig } from './config.js';
import { listFiles, listShares, browseNas } from './smb.js';
import { listFilesLocal, browseLocal } from './local.js';
import { discoverNetwork } from './discover.js';
import { SUPPORTED_TYPES, filterSearchSort } from './scan.js';
import { checkForUpdate } from './updatecheck.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

// CORS für die Vite-Dev-Version (anderer Port)
try {
  const cors = (await import('@fastify/cors')).default;
  await app.register(cors, { origin: true });
} catch {
  /* CORS optional */
}

// Konfiguration (Nutzer-Zugang, lokal gespeichert)
app.get('/api/config', async () => publicConfig());
app.post('/api/config', async (req) => saveConfig(req.body || {}));

// Verfügbare Typen zum Filtern
app.get('/api/types', async () => ({ types: SUPPORTED_TYPES }));

// Netzwerk-Suche: mDNS-Dienste + Subnetz-Scan (ARP + Port-445-Check)
app.get('/api/nas/discover', async (req) => {
  const timeout = Number(req.query.timeout) || 3000;
  const probe = req.query.probe !== 'false'; // Default: an
  const probePort = req.query.probePort ? Number(req.query.probePort) : 445;
  const { services, hosts, probed, note } = await discoverNetwork({
    timeout,
    probePort,
    probe,
  });
  return { services, hosts, probed, probedPort: probePort, note };
});

// Shares des NAS auflisten (Share-Picker: echter Name statt Raten).
// Nutzt die Zugangsdaten aus dem Formular (Body); fehlt ein Feld, wird auf
// die gespeicherte config.json zurückgegriffen. Passwort nie im Response.
app.post('/api/nas/shares', async (req, reply) => {
  const body = req.body || {};
  const base = getConfig();
  const cfg = {
    host: body.host || base.host,
    share: base.share,
    user: body.user || base.user,
    pass: body.pass || base.pass,
    domain: body.domain || base.domain,
    port: Number(body.port || base.port || 445),
  };
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return reply
      .code(400)
      .send({
        error:
          'Für die Share-Liste sind Host, Benutzer und Passwort erforderlich ' +
          '(im Formular oder bereits gespeichert).',
      });
  }
  try {
    const shares = await listShares(cfg);
    return { shares, count: shares.length, host: cfg.host };
  } catch (err) {
    app.log.error({ err }, 'Fehler beim Share-Auflisten');
    const detail =
      err?.name && err.name !== 'Error'
        ? `${err.name}: ${err.message}`
        : err?.message;
    return reply.code(502).send({ error: 'NAS nicht erreichbar', detail });
  }
});

// Pfad-Picker: Unterverzeichnisse + Breadcrumb auflisten, damit der Pfad in den
// Einstellungen gewählt statt getippt werden kann. Funktioniert für beide
// Quellen: 'local' (absoluter Pfad) und 'nas' (share-relativ).
app.post('/api/browse', async (req, reply) => {
  const body = req.body || {};
  const source = body.source === 'local' ? 'local' : 'nas';

  if (source === 'local') {
    try {
      const res = await browseLocal(body.path, body.showHidden === true);
      return { source: 'local', ...res };
    } catch (err) {
      return reply.code(400).send({ error: 'Pfad nicht lesbar', detail: err?.message });
    }
  }

  // NAS: Zugangsdaten aus dem Formular, fehlende aus der gespeicherten Config.
  const base = getConfig();
  const cfg = {
    host: body.host || base.host,
    share: base.share,
    user: body.user || base.user,
    pass: body.pass || base.pass,
    domain: body.domain || base.domain,
    port: Number(body.port || base.port || 445),
  };
  if (!cfg.host || !cfg.share || !cfg.user || !cfg.pass) {
    return reply
      .code(400)
      .send({ error: 'Für den NAS-Picker sind Host, Share, Benutzer und Passwort erforderlich' });
  }
  try {
    const res = await browseNas(cfg, body.path ?? '', body.showHidden === true);
    return { source: 'nas', ...res };
  } catch (err) {
    app.log.error({ err }, 'Fehler beim Pfad-Browsen (NAS)');
    const detail =
      err?.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err?.message;
    return reply.code(502).send({ error: 'NAS nicht erreichbar', detail });
  }
});

// Datei-Liste (Filter + Suche + Sortierung)
// Beim Auflisten werden alle gefundenen Dateien idempotent in die DB
// geschrieben, damit jede Datei einen aktuellen Eintrag mit allen Metadaten hat.
function indexFoundFiles(files = []) {
  for (const f of files) {
    if (f.isDirectory) continue;
    const ext = String(f.name).split('.').pop().toLowerCase() || 'no-ext';
    upsertFile({
      name: f.name,
      extension: ext,
      type: f.type || 'other',
      size: f.size || 0,
      path: f.path || '',
      last_modified: f.modified ? Math.floor(new Date(f.modified).getTime() / 1000) : Math.floor(Date.now() / 1000),
    });
  }
}

// Hängt den Druck-Name an jedes Ergebnis an – immer gesetzt, mit dem
// Dateinamen als Platzhalter (falls in der DB leer). Live-Scan und DB haben
// denselben Dateinamen als Schlüssel, nach dem indexFoundFiles gerade alle
// gefundenen Dateien indexiert hat.
function withPrintNames(files) {
  const map = getPrintNameMap();
  return files.map((f) => ({ ...f, print_name: map.get(f.name) || f.name }));
}

app.get('/api/files', async (req, reply) => {
  const cfg = getConfig();

  // Lokale Quelle: kein NAS nötig, nur ein lokaler (absoluter) Pfad.
  if (cfg.source === 'local') {
    if (!cfg.path) {
      return reply.code(400).send({ error: 'Lokaler Pfad nicht konfiguriert' });
    }
    try {
      const files = await listFilesLocal(cfg);
      indexFoundFiles(files);
      const out = withPrintNames(filterSearchSort(files, {
        type: req.query.type || 'all',
        q: req.query.q || '',
        sort: req.query.sort || 'name',
        order: req.query.order || 'asc',
      }));
      return { count: out.length, total: files.length, files: out, source: 'local' };
    } catch (err) {
      app.log.error({ err }, 'Fehler beim lokalen Auflisten');
      const code = err?.code === 'ENOENT' ? 400 : 502;
      const detail = err?.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err?.message;
      return reply
        .code(code)
        .send({ error: code === 400 ? 'Pfad existiert nicht' : 'Pfad nicht lesbar', detail });
    }
  }

  if (!cfg.host || !cfg.share) {
    return reply.code(400).send({ error: 'NAS nicht konfiguriert (Host oder Share fehlt)' });
  }
  try {
    const files = await listFiles(cfg);
    indexFoundFiles(files);
    const out = withPrintNames(filterSearchSort(files, {
      type: req.query.type || 'all',
      q: req.query.q || '',
      sort: req.query.sort || 'name',
      order: req.query.order || 'asc',
    }));
    return { count: out.length, total: files.length, files: out };
  } catch (err) {
    app.log.error({ err }, 'Fehler beim Auflisten');
    const detail = err?.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err?.message;
    return reply.code(502).send({ error: 'NAS nicht erreichbar', detail });
  }
});

// --- Datei-Index API ---

// Alle indexierten Dateien (optional gefiltert via ?type=&q=&tags=)
app.get('/api/db/files', async (req, reply) => {
  const filters = {
    type: req.query.type,
    q: req.query.q,
    tags: req.query.tags,
  };
  const files = getFiles(filters);
  return { files };
});

// Verzeichnis scannen und Dateien indexieren
app.post('/api/db/scan', async (req, reply) => {
  const { source, path } = req.body || {};
  if (!source || !path) {
    return reply.code(400).send({ error: 'source und path sind erforderlich' });
  }
  let fileList;
  if (source === 'local') {
    const { listFilesLocal } = await import('./local.js');
    fileList = await listFilesLocal({ path, maxDepth: 1 });
  } else {
    // Bei NAS Quellen: Scan kann nur erfolgen wenn NAS konfiguriert ist
    // Der Eintrag wird trotzdem protokolliert, das Indexing erfolgt bei Bedarf
    return reply.code(400).send({ error: 'NAS-Scan erfordert konfigurierte Zugangsdaten. Verwende "local" als source.' });
  }
  // Dateien in Datenbank indexieren (idempotent: vorhandene Einträge aktualisieren,
  // keine Duplikate). Einheitlich in SEKUNDEN gespeichert (wie indexFoundFiles).
  for (const file of fileList) {
    // Nur Dateien (keine Ordner) indexieren
    if (!file.isDirectory) {
      upsertFile({
        name: file.name,
        extension: file.name.split('.').pop().toLowerCase() || 'no-ext',
        type: file.type || 'other',
        size: file.size || 0,
        path: file.path || '',
        last_modified: file.modified
          ? Math.floor(Date.parse(file.modified) / 1000)
          : Math.floor(Date.now() / 1000),
      });
    }
  }
  // Scan protokollieren - Step-Dateien zählen
  const stepCount = fileList.filter(f => f.type === 'STEP').length;
  recordScan({ source, path, fileCount: fileList.length, stepCount });
  return { ok: true, indexed: fileList.length, stepCount };
});

// Einzelne Datei aus der DB nach Name (für das Detailfenster: alle Metadaten + Tags).
app.get('/api/db/file', async (req, reply) => {
  const name = req.query.name;
  if (!name) {
    return reply.code(400).send({ error: 'name ist erforderlich' });
  }
  const file = getFileByName(name);
  if (!file) {
    return reply.code(404).send({ error: 'Datei nicht in der DB gefunden' });
  }
  // Referenzpreis für die automatische Kostenschätzung im Druck-Tab mitliefern.
  const pricePerKg = Number(getSetting('filament_price_per_kg', '20')) || 0;
  return { file, pricePerKg };
});

// Datei-Tags aktualisieren
app.post('/api/db/file/tags', async (req, reply) => {
  const { name, tags } = req.body || {};
  if (!name) {
    return reply.code(400).send({ error: 'Name der Datei ist erforderlich' });
  }
  updateFileTagsByName(name, tags);
  return { ok: true, name, tags };
});

// Druck-Informationen einer Datei aktualisieren (Upsert nach Name).
app.post('/api/db/file/print', async (req, reply) => {
  const { name, ...fields } = req.body || {};
  if (!name) {
    return reply.code(400).send({ error: 'Name der Datei ist erforderlich' });
  }
  updateFilePrint(name, fields);
  return { ok: true, name };
});

// --- Datei im nativen Dateimanager öffnen -------------------------------------
// Öffnet den Ordner der Datei in Finder/Explorer/Filen und hebt die Datei dort
// hervor (statt nur den Ordner zu öffnen). Plattformübergreifend, nach dem
// Muster von launcher.mjs (open/xdg-open/start), hier aber mit "-R"/"select".
//   macOS   : open -R <abs>          -> Finder zeigt den Ordner, Datei markiert
//   Windows : explorer /select,<abs> -> Ordner öffnet, Datei wird markiert
//   Linux   : xdg-open <dirname>     -> Ordner öffnen (Hervorhebung ist nicht
//                                       plattformübergreifend verlässlich)
function revealInFileManager(abs) {
  return new Promise((resolve, reject) => {
    let cmd;
    let args;
    if (process.platform === 'darwin') {
      cmd = 'open';
      args = ['-R', abs];
    } else if (process.platform === 'win32') {
      cmd = 'explorer';
      args = ['/select,' + abs];
    } else {
      cmd = 'xdg-open';
      args = [dirname(abs)];
    }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', reject);
    child.unref();
    resolve(true);
  });
}

// Datei im Dateimanager hervorheben. Der gespeicherte Pfad ist relativ zum
// Scan-Root; der absolute Root kommt aus der Config (lokal: cfg.path). Bei
// NAS-Quellen ist keine lokale Anzeige möglich – dann wird ein Hinweis statt
// eines Fehlers zurückgegeben, damit die UI den Share-Pfad zeigen kann.
app.post('/api/db/file/reveal', async (req, reply) => {
  const { name, path: relPath } = req.body || {};
  if (!name) {
    return reply.code(400).send({ error: 'name ist erforderlich' });
  }

  const cfg = getConfig();
  if (cfg.source !== 'local') {
    // NAS: lokales Öffnen nicht möglich. Share-Pfad als Hinweis mitliefern.
    const share =
      cfg.host && cfg.share
        ? `//${cfg.host}/${cfg.share}${cfg.path && cfg.path !== '/' ? '/' + cfg.path : ''}`
        : cfg.path || '/';
    return {
      ok: false,
      local: false,
      source: cfg.source,
      path: share,
      message:
        'Im Ordner öffnen ist nur bei lokaler Quelle möglich. ' +
        `Konfigurierter Share: ${share}`,
    };
  }

  if (!cfg.path) {
    return reply.code(400).send({ error: 'Lokaler Pfad nicht konfiguriert' });
  }

  // Relativen Pfad bestimmen: aus der DB (Wahrheit), sonst aus dem Request.
  let rel = relPath;
  if (!rel) {
    const rec = getFileByName(name);
    rel = rec ? rec.path : undefined;
  }
  if (!rel) {
    return reply.code(404).send({ error: 'Pfad der Datei nicht bekannt' });
  }

  const abs = join(cfg.path, rel);
  try {
    await revealInFileManager(abs);
    return { ok: true, revealed: true, local: true, source: 'local', path: abs };
  } catch (err) {
    app.log.error({ err }, 'Fehler beim Öffnen im Dateimanager');
    const detail =
      err?.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err?.message;
    return reply.code(500).send({ error: 'Dateimanager konnte nicht geöffnet werden', detail });
  }
});

// --- Datei im Slicer öffnen ---------------------------------------------------
// Öffnet eine Datei im konfigurierten Slicer (Cura, PrusaSlicer, BambuStudio,
// OrcaSlicer, SuperSlicer). Der gespeicherte Pfad ist relativ zum Scan-Root;
// der absolute Root kommt aus der Config (cfg.path).
//
// NAS-Quelle: lokales Öffnen nicht möglich → Share-Pfad als Hinweis.
// Es ist keine Slicer-Konfiguration hinterlegt → Hinweis im UI.
// Lokale Quelle: absoluter Pfad wird gebildet und der Slicer-App übergeben.
//
app.post('/api/db/file/openInSlicer', async (req, reply) => {
  const { name, path: relPath } = req.body || {};
  if (!name) {
    return reply.code(400).send({ error: 'name ist erforderlich' });
  }

  const cfg = getConfig();
  if (cfg.source !== 'local') {
    // NAS: lokales Öffnen nicht möglich. Share-Pfad als Hinweis mitliefern.
    const share =
      cfg.host && cfg.share
        ? `//${cfg.host}/${cfg.share}${cfg.path && cfg.path !== '/' ? '/' + cfg.path : ''}`
        : cfg.path || '/';
    return {
      ok: false,
      local: false,
      source: cfg.source,
      path: share,
      message:
        'Im Slicer öffnen ist nur bei lokaler Quelle möglich. ' +
        `Konfigurierter Share: ${share}`,
    };
  }

  if (!cfg.path) {
    return reply.code(400).send({ error: 'Lokaler Pfad nicht konfiguriert' });
  }

  // Relativen Pfad bestimmen: aus der DB (Wahrheit), sonst aus dem Request.
  let rel = relPath;
  if (!rel) {
    const rec = getFileByName(name);
    rel = rec ? rec.path : undefined;
  }
  if (!rel) {
    return reply.code(404).send({ error: 'Pfad der Datei nicht bekannt' });
  }

  const abs = join(cfg.path, rel);

  // Slicer-App auflösen (Presets oder Freitext).
  // Priority: konfigurierter Wert (aus config.json/env) > Standard-Presets.
  const resolveSlicerApp = (slicerCfg) => {
    if (!slicerCfg) return null;
    const s = String(slicerCfg).trim().toLowerCase();
    // Preset-Map (plattformabhängige App-Namen)
    const presets = {
      cura: 'Cura',
      prusaslicer: 'PrusaSlicer',
      bambustudio: 'BambuStudio',
      orcaslicer: 'OrcaSlicer',
      superslicer: 'SuperSlicer',
    };
    if (s in presets) return presets[s];
    // Falls Freitext/anderer Name: direkt zurückgeben (wird von spawn verarbeitet)
    return s;
  };

  const slicerApp = resolveSlicerApp(cfg.slicer) || cfg.slicer || '';

  // Slicer starten (plattformabhängig).
  const startSlicer = (appName, fileAbs) => {
    return new Promise((resolve, reject) => {
      let cmd;
      let args;
      if (process.platform === 'darwin') {
        // macOS: open -a "<App>" "<Datei>"
        cmd = 'open';
        args = ['-a', appName, fileAbs];
      } else if (process.platform === 'win32') {
        // Windows: cmd /c start "" "<App>" "<Datei>"
        cmd = 'cmd';
        args = ['/c', 'start', '', `"${appName}"`, `"${fileAbs}"`];
      } else {
        // Linux: direct spawn (Best-Effort)
        cmd = appName;
        args = [fileAbs];
      }
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.on('error', reject);
      child.unref();
      resolve(true);
    });
  };

  try {
    await startSlicer(slicerApp, abs);
    return {
      ok: true,
      local: true,
      source: 'local',
      path: abs,
      message: `Slicer "${slicerApp || 'Anwendung'}" geöffnet`,
    };
  } catch (err) {
    app.log.error({ err }, 'Fehler beim Öffnen im Slicer');
    const detail =
      err?.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err?.message;
    return reply.code(500).send({ error: 'Slicer konnte nicht geöffnet werden', detail });
  }
});

// Übersicht für die rechte Spalte: Verteilung nach Endung + jüngste Dateien.
// Liefert in einer Runde alles, was das Donut-Diagramm und die
// „zuletzt hinzugefügt"-Liste braucht.
app.get('/api/db/overview', async () => {
  const byType = getTypeCounts();
  const total = byType.reduce((sum, r) => sum + r.count, 0);
  const recent = getRecentFiles(5);
  return { total, byType, recent };
});

// Einstellungen lesen/schreiben
app.get('/api/db/settings', async (req, reply) => {
  const key = req.query.key;
  if (key) {
    const value = getSetting(key);
    return { key, value };
  }
  // Alle Einstellungen zurückgeben
  // Use db directly for raw SQL since we need prepare/all
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return { settings: rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {}) };
});

app.post('/api/db/settings', async (req, reply) => {
  const { key, value } = req.body || {};
  if (!key) {
    return reply.code(400).send({ error: 'key ist erforderlich' });
  }
  setSetting(key, value);
  return { ok: true };
});

// --- Version-Signal ----------------------------------------------------------
// Server-Version aus package.json (Einzige Quelle der Wahrheit für den
// Backend-Build). Der Footer im Frontend vergleicht sie mit der eingebauten
// UI-Version (web/src/version.js) und warnt bei Skew („bitte neu entpacken").
// ESM-Kontext: require() gibt es nicht, daher Datei lesen + parsen.
let APP_VERSION = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  APP_VERSION = pkg.version || APP_VERSION;
} catch (err) {
  app.log.warn({ err }, 'package.json-Version konnte nicht gelesen werden');
}
app.get('/api/version', async () => ({ version: APP_VERSION }));

// --- Remote-Update-Check (P2b, v0.6.0) ---------------------------------------
// GET /api/update/check -> JSON (siehe server/updatecheck.js). Läuft
// SERVERSEITIG (kein Browser-CORS gegen GitHub), liest die Konfiguration
// (MC_UPDATE_REPO/-GH_TOKEN/-GITHUB_API/-TIMEOUT_MS/-CACHE_MS) aus process.env.
// Scheitert nie hart: jeder Fehler (Netz/Timeout/Rate-Limit/404/unbekannt)
// liefert { available:false, error:<Text> } -> die UI zeigt dann den
// manuellen Update-Pfad. Der Footer rührt diesen Endpunkt beim Laden auf.
app.get('/api/update/check', async () => checkForUpdate({ current: APP_VERSION }));

// Statisches Frontend (nur im Produktivbetrieb, wenn gebaut)
const distDir = join(__dirname, '..', 'web', 'dist');
if (existsSync(distDir)) {
  try {
    const mod = await import('@fastify/static');
    const fastifyStatic = mod.default ?? mod;
    await app.register(fastifyStatic, { root: distDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      reply.type('text/html').send(
        `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>MakerCottage</title></head>` +
          `<body style="font-family:system-ui;margin:2rem"><h1>MakerCottage</h1>` +
          `<p>Frontend nicht gebaut. In <code>web/</code> <code>npm run build</code> ausführen, ` +
          `oder die Entwicklungsversion mit <code>npm run dev</code> starten.</p></body></html>`,
      );
    });
  } catch (err) {
    app.log.warn({ err }, '@fastify/static nicht verfügbar – statisches Serven übersprungen');
  }
}

const PORT = Number(process.env.PORT || 4000);
await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`Backend läuft auf http://localhost:${PORT}`);
