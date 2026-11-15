// MakerCottage – Launcher-Kern (plattformübergreifend, Electron-fähig)
//
// Startet den Server als KINDPROZESS (bin/node) und öffnet danach die UI.
// Der EINZIGE Unterschied zwischen dem portablen Launcher (Option A) und
// Electron (Option C) ist die injizierte `openUI`-Strategie:
//   Option A (jetzt):  OS-Browser öffnen  (open / xdg-open / start)
//   Option C (später): new BrowserWindow().loadURL(url)
// → Sprung A → C ist ein Einzeiler (openUI austauschen);
//   Server, Prebuilds und Frontend bleiben unverändert.
//
// Wichtige Design-Entscheidungen:
//  - Der Server wird mit der EXPLIZITEN Binär bin/node gestartet (nicht
//    process.execPath). In Electron wäre process.execPath der Electron-Binary;
//    der Child bleibt bin/node, damit die better-sqlite3-Prebuild-ABI stimmt.
//  - Port-Warten per echtem TCP-Connect (keine curl-/Bash-Abhängigkeit).
//  - Signal-Weiterleitung: Ctrl-C / Fenster-Ende → Kindprozess sauber beenden.
//  - NO_OPEN=1 überspringt das UI-Öffnen (Smoke-Tests / CI / Headless).
//  - Nutzer-Daten (DB + config) liegen in ~/.makercottage/ (server/paths.js),
//    NICHT im Bundle-Ordner. Die Umgebungsvariable MC_HOME überschreibt diesen
//    Standard-Ort; der Launcher erbt sie per env:{...process.env} an den
//    Kindprozess weiter (siehe startServer).

import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// --- Pfade (relativ zu diesem File -> funktioniert im Bundle UND im Electron) ---
const launcherFile = fileURLToPath(import.meta.url);
const launcherDir = dirname(launcherFile); // <root>/launcher
const root = join(launcherDir, '..'); // Bundle-Wurzel
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const nodeBin = join(root, 'bin', isWin ? 'node.exe' : 'node');
const serverEntry = join(root, 'app', 'index.js');

const port = Number(process.env.PORT || 4000);
const host = process.env.MC_HOST || '127.0.0.1';
const url = `http://${host}:${port}`;

// --- 1) Server als Kindprozess starten -----------------------------------------
function startServer() {
  if (!existsSync(nodeBin)) {
    throw new Error(`Node-Binär nicht gefunden: ${nodeBin}\n(Bundle unvollständig – bitte neu entpacken/bauen.)`);
  }
  const child = spawn(nodeBin, [serverEntry], {
    cwd: join(root, 'app'),
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });
  return child;
}

// --- 2) Auf den Port warten (echter TCP-Connect, kein curl) --------------------
function waitForPort(host, port, { timeoutMs = 20000, intervalMs = 200 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const socket = net.connect({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Port ${port} wurde in ${timeoutMs}ms nicht erreichbar`));
        }
        setTimeout(tick, intervalMs);
      });
    };
    tick();
  });
}

// --- 3) UI öffnen (die einzige OS-abhängige Stelle) ----------------------------
// Standard-Strategie: den Standard-Browser des Betriebssystems öffnen.
// In Electron (Option C) wird stattdessen `openUI: (u) => win.loadURL(u)` injiziert.
async function openBrowser(u) {
  if (process.env.NO_OPEN === '1') return false;
  try {
    if (isMac) {
      spawn('open', [u], { stdio: 'ignore', detached: true }).unref();
    } else if (isWin) {
      // `start "" <url>` – leeres Titel-Argument nötig, sonst gilt die URL als Titel.
      spawn('cmd', ['/c', 'start', '', u], { stdio: 'ignore', detached: true, shell: false }).unref();
    } else {
      spawn('xdg-open', [u], { stdio: 'ignore', detached: true }).unref();
    }
    return true;
  } catch (err) {
    console.error(`[launcher] UI konnte nicht automatisch geöffnet werden: ${err.message}`);
    return false;
  }
}

// --- 4) Orchestrierung ---------------------------------------------------------
// launch({ openUI }) -> startet Server, wartet auf den Port, öffnet die UI und
// wartet, bis der Server beendet wird. openUI(url) muss (true|false|Promise)
// zurückgeben; in Electron liefert es hier den BrowserWindow-Aufruf.
export async function launch({ openUI = openBrowser, log } = {}) {
  console.log(`[launcher] MakerCottage-Backend starte (Port ${port}) …`);
  const child = startServer();

  // Sauberes Beenden an den Kindprozess weiterleiten (Ctrl-C, Fenster-Schließen …).
  const shutdown = (signal) => {
    if (child.killed) return;
    child.kill(signal);
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* bereits beendet */
      }
    }, 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  child.on('exit', (code, signal) => {
    console.log(`[launcher] Backend gestoppt (code=${code}, signal=${signal}).`);
    process.exit(signal ? 0 : code ?? 0);
  });
  child.on('error', (err) => {
    console.error(`[launcher] Fehler beim Server-Start: ${err.message}`);
    process.exit(1);
  });

  // Warten, bis das Backend den Port bedient …
  await waitForPort(host, port);
  console.log(`[launcher] Backend erreichbar: ${url}`);

  // … dann die UI öffnen.
  const opened = await openUI(url);
  if (opened) {
    console.log(`[launcher] UI geöffnet: ${url}`);
  } else {
    console.log(`[launcher] UI per Hand öffnen: ${url}`);
  }

  // Hinweis für Electron (Option C): hier z. B.
  //   app.on('window-all-closed', () => shutdown('SIGTERM'))
  // einhängen. Der Child-Prozess läuft fort, bis er beendet wird.
  return child;
}

// --- 5) CLI-Flags (--version / --check / --help) -----------------------------
// Wird NUR bei Skript-Start (import.meta.main) ausgewertet; beim Import durch
// Electron (launch() direkt aufrufen) bleibt die Logik unberührt. Die Version
// kommt aus dem BUNDLEDEN app/package.json (Einzige Quelle = Backend-Build),
// nicht aus einer Hardcoded-Konstante -> zeigt immer die tatsächlich laufende.
function readAppVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'app', 'package.json'), 'utf8'));
    return pkg.version || 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}

// Mirrors server/paths.js: DATA_DIR = MC_HOME || ~/.makercottage
function dataDir() {
  return process.env.MC_HOME || join(homedir(), '.makercottage');
}

// --- 5b) Update-Check ausgeben (P2b, v0.6.0) ---------------------------------
// Zeigt das Ergebnis von checkForUpdate(): available -> Download-/Release-Links;
// sonst (nicht konfiguriert ODER Fehler) -> den manuellen Update-Pfad. Die
// Fehlerbehandlung liegt beim Aufrufer (import.meta.main-Block), damit --check
// NIE hart abstürzt – ein fehlgeschlagener Check führt immer zu manuell.
function printCheckResult(result) {
  const dir = dataDir();
  const cur = result.current || readAppVersion();
  const curLabel = cur === 'unbekannt' ? 'unbekannt' : `v${cur}`;
  console.log(`Laufende Version: ${curLabel}`);
  if (result.configured && result.available) {
    console.log(`✅ Update verfügbar: v${result.latest}${result.releaseTitle ? ` (${result.releaseTitle})` : ''}`);
    if (result.notes) console.log(`   ${result.notes}`);
    if (result.downloadUrl) console.log(`   Herunterladen: ${result.downloadUrl}`);
    if (result.releaseUrl) console.log(`   Release-Seite: ${result.releaseUrl}`);
  } else if (result.configured && !result.error) {
    console.log('✅ Du hast die neueste Version.');
  } else {
    if (result.error) console.log(`(Update-Check: ${result.error})`);
    console.log('Manuelles Update: Neuen Ordner DABEIN entpacken und dessen');
    console.log('MakerCottage.command / .sh / .bat starten – die Daten bleiben');
    console.log(`erhalten, weil sie in ${dir} (außerhalb des Code-Ordners) liegen.`);
    console.log('Remote-Check einschalten: MC_UPDATE_REPO=owner/repo (Default Eguf72/makercottage).');
  }
}

// --- 6) Autostart, wenn als Skript ausgeführt (nicht beim Import) --------------
// `import.meta.main` ist nur wahr, wenn dieses File der Einstiegspunkt ist.
// Electron (Option C) IMPORTIERT launch() und übergibt seine eigene openUI.
if (import.meta.main) {
  const args = process.argv.slice(2);
  // --check läuft asynchron (Remote-Check); "handled" verhindert, dass danach
  // launch() (Server-Start) ausgeführt wird. --version/--help beenden sich
  // synchron per process.exit(0) und erreichen launch() nie.
  let handled = false;
  if (args.includes('--version') || args.includes('-v')) {
    const dir = dataDir();
    console.log(`MakerCottage v${readAppVersion()}`);
    console.log(`Daten-Ordner: ${dir}`);
    if (process.env.MC_HOME) console.log(`MC_HOME=${process.env.MC_HOME} (überschreibt Default ~/.makercottage)`);
    else console.log('(Default ~/.makercottage, überschreibbar mit MC_HOME)');
    process.exit(0);
  }
  if (args.includes('--check')) {
    handled = true;
    // Echten Remote-Check (GitHub-Releases via server/updatecheck.js) – OHNE den
    // Server zu starten (kein launch()): checkForUpdate() ist rein modular. Der
    // Import-Path ist der Nachbar der Server-Eintragsdatei (app/updatecheck.js
    // im Bundle; in der Quelle server/updatecheck.js). Scheitert nie hart:
    // ein fehlgeschlagener Check -> printCheckResult zeigt den manuellen Pfad.
    const current = readAppVersion();
    (async () => {
      let result;
      try {
        const { checkForUpdate } = await import(
          pathToFileURL(join(dirname(serverEntry), 'updatecheck.js')).href
        );
        result = await checkForUpdate({ current });
      } catch (err) {
        result = {
          configured: false,
          available: false,
          current,
          error: `Update-Check nicht ausführbar (${err.message}).`,
        };
      }
      printCheckResult(result);
      process.exit(0);
    })();
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log('MakerCottage – 3D-Druck-Dateien vom NAS/lokal verwalten.');
    console.log('');
    console.log('Aufruf:  MakerCottage.command  (.sh / .bat auf Linux/Windows)');
    console.log('Flags:');
    console.log('  --version, -v   Version + Daten-Ordner anzeigen, dann beenden.');
    console.log('  --check         Update-Check gegen GitHub-Releases (MC_UPDATE_REPO);');
    console.log('              ohne Konfiguration -> manueller Update-Pfad.');
    console.log('  --help, -h      Diese Hilfe.');
    console.log('Ohne Flag startet das Backend und öffnet die UI im Browser.');
    console.log('Umschaltbare Env: PORT, MC_HOST, MC_HOME (Daten-Ort), NO_OPEN=1,');
    console.log('  MC_UPDATE_REPO, MC_UPDATE_GH_TOKEN, MC_UPDATE_TIMEOUT_MS, MC_UPDATE_CACHE_MS.');
    process.exit(0);
  }

  if (!handled) {
    launch().catch((err) => {
      console.error(`[launcher] ${err.message}`);
      process.exit(1);
    });
  }
}
