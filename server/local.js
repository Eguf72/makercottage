// Lokale Einbindung des Dateisystems (alternative Quelle zu SMB/NAS).
//
// Wenn die 3D-Druck-Dateien nicht auf einem NAS, sondern auf dem Rechner
// laufen, auf dem das Backend läuft, listet diese Module ein lokales
// Verzeichnis. `cfg.path` ist hier ein ABSOLUTER Pfad.
//
// Zwei Funktionen:
// - listFilesLocal(cfg)  -> Dateien im konfigurierten Pfad (mit maxDepth),
//                            gleiche Objektförme wie smb.js/listFiles.
// - browseLocal(inputPath) -> Unterverzeichnisse + Breadcrumb für den
//                            Pfad-Picker in den Einstellungen.

import { promises as fs } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import os from 'node:os';
import { typeOf } from './scan.js';

/**
 * Erkennt macOS-Artefakte (AppleDouble-Dateien `.DS_Store` / `._<name>`).
 * Wie bei SMB sollen diese Schein-Einträge die Liste nicht verschandeln.
 */
function isAppleDouble(name) {
  const n = String(name);
  return n === '.DS_Store' || n.startsWith('._');
}

/**
 * Erkennt versteckte Einträge: Namenszug mit führendem Punkt (`.cache`,
 * `.Trash`, `.npm`, …). Das deckt auch die macOS-AppleDouble-Einträge ab.
 */
function isHidden(name) {
  return String(name).startsWith('.');
}

/** Baut aus einem absoluten Pfad die Breadcrumb-Segmente (root + jede Ebene). */
function localBreadcrumbs(abs) {
  const parts = String(abs).split('/').filter(Boolean);
  const crumbs = [{ label: '/', value: '/' }];
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : `/${p}`;
    crumbs.push({ label: p, value: acc });
  }
  return crumbs;
}

/** Wandelt einen lokalen Verzeichniseintrag in ein App-Objekt um. */
function toEntryLocal(name, abs, root, isDir, st) {
  return {
    name,
    type: typeOf(name),
    size: st ? st.size : 0,
    modified: st ? st.mtime.toISOString() : null,
    // Relativ zum konfigurierten Root (wie bei SMB, relativ zum Share).
    path: relative(root, abs) || name,
    isDirectory: isDir,
  };
}

async function statSafe(abs) {
  try {
    return await fs.stat(abs);
  } catch {
    return null;
  }
}

/** Sammelt reguläre Dateien rekursiv bis `remainingDepth` (wie smb/collectFiles). */
async function collectLocal(dir, remainingDepth, root, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (isAppleDouble(e.name)) continue;
    // Auch versteckte Einträge (führender Punkt) ausblenden
    if (isHidden(e.name)) continue;
    const abs = join(dir, e.name);
    const isDir = e.isDirectory() && !e.isSymbolicLink();
    if (isDir) {
      if (remainingDepth > 0) out.push(...(await collectLocal(abs, remainingDepth - 1, root, out)));
    } else {
      out.push(toEntryLocal(e.name, abs, root, false, await statSafe(abs)));
    }
  }
  return out;
}

/**
 * Listet Dateien im konfigurierten lokalen Pfad.
 * - maxDepth 0 (Standard): nur Einträge direkt in `cfg.path` (Dateien + Ordner).
 * - maxDepth > 0: zusätzlich reguläre Dateien bis zu `maxDepth` Ebenen tiefer.
 * Wirft bei nicht-existierendem Pfad/kein-Verzeichnis (fehlt -> ENOENT).
 */
export async function listFilesLocal(cfg) {
  const root = String(cfg.path || '').trim();
  if (!root) throw new Error('Lokaler Pfad nicht gesetzt');

  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error('Pfad ist kein Verzeichnis');

  const depth = Number(cfg.maxDepth) || 0;
  const result = [];
  const top = await fs.readdir(root, { withFileTypes: true });

  for (const e of top) {
    if (isAppleDouble(e.name)) continue;
    // Auch versteckte Einträge (führender Punkt) ausblenden
    if (isHidden(e.name)) continue;
    const abs = join(root, e.name);
    const isDir = e.isDirectory() && !e.isSymbolicLink();
// Dateien und Ordner in der Auflistung einbinden – damit das UI in Unterverzeichnisse klicken kann
if (!isDir) {
  result.push(toEntryLocal(e.name, abs, root, isDir, await statSafe(abs)));
} else {
  result.push(toEntryLocal(e.name, abs, root, isDir, await statSafe(abs)));
}
if (isDir && depth > 0) {
  result.push(...(await collectLocal(abs, depth - 1, root)));
}
  }
  return result;
}

/**
 * Listet die Unterverzeichnisse unter `inputPath` für den Pfad-Picker.
 * Leer/ungültig -> Home-Verzeichnis des Server-Rechners.
 * `showHidden` (Standard false) blendet versteckte Einträge (führender Punkt)
 * aus; mit true werden auch sie aufgelistet.
 * Gibt { current, breadcrumb, entries } zurück (absolute Pfade).
 */
export async function browseLocal(inputPath = '', showHidden = false) {
  const start = inputPath && String(inputPath).trim() ? String(inputPath).trim() : os.homedir();

  // Ist der angegebene Pfad eine Datei, in den übergeordneten Ordner gehen.
  let dir = start;
  const st = await statSafe(start);
  if (st && !st.isDirectory()) dir = dirname(start);

  const raw = await fs.readdir(dir, { withFileTypes: true });
  const entries = [];
  for (const e of raw) {
    // Versteckte Einträge (führender Punkt) ausblenden, es sei denn, der
    // Nutzer hat „Versteckte anzeigen" aktiviert.
    if (!showHidden && isHidden(e.name)) continue;
    if (e.isDirectory() && !e.isSymbolicLink()) {
      entries.push({ name: e.name, path: join(dir, e.name), isDirectory: true });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { current: dir, breadcrumb: localBreadcrumbs(dir), entries };
}
