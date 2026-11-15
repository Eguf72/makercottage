// NAS-Einbindung über SMB (SMB2/3).
//
// Verwendet die moderne, gepflegte Bibliothek `@winlinux/smb2` (SMB 2.0.2–3.1.1,
// Signing/Encryption, AbortSignal) mit NTLM-Authentifizierung aus `@winlinux/auth`
// (reine JS, keine native Abhängigkeit – ideal für typische NAS-Zugänge).
//
// Wichtig: Pfade sind share-relativ und nutzen den Schrägstrich '/'; die
// Bibliothek konvertiert intern in das SMB-Rückwärtsschrägstrich-Format.

import { connect } from '@winlinux/smb2';
import { createAuthProvider } from '@winlinux/auth';
import { typeOf } from './scan.js';

// Zeitlimits (ms), damit keine Operation endlos hängen kann.
const DEFAULTS = {
  connectMs: 10_000, // Verbindungsaufbau + NTLM-Handshake
  requestMs: 30_000, // Einzelner List-Aufruf
};

/** Verbindet eine SMB-Session, ruft `fn(session)` aus und schließt sie wieder. */
async function withSmb(cfg, fn) {
  const authProvider = createAuthProvider('ntlm');
  const credentials = {
    username: cfg.user ?? '',
    password: cfg.pass ?? '',
    // Domain ist für die meisten NAS leer; nur für Windows/AD-Shares relevant.
    ...(cfg.domain ? { domain: cfg.domain } : {}),
  };

  const session = await connect({
    host: cfg.host,
    port: Number(cfg.port) || 445,
    authProvider,
    credentials,
    signing: 'auto',
    connectTimeoutMs: Number(cfg.connectMs) || DEFAULTS.connectMs,
    requestTimeoutMs: Number(cfg.requestMs) || DEFAULTS.requestMs,
  });

  try {
    return await fn(session);
  } finally {
    // Session immer schließen, auch bei Fehler.
    await session.close().catch(() => {});
  }
}

/** Normalisiert einen Pfad zu einem share-relativen Pfad mit '/'. */
function normPath(p) {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '') // führende Schrägstriche entfernen -> share-root
    .replace(/\/+$/, '');
}

function joinSmb(base, name) {
  const b = base ? base.replace(/\/+$/, '') : '';
  return b ? `${b}/${name}` : name;
}

/**
 * Erkennt macOS-Artefakte, die auf NAS-Shares landeten (AppleDouble-
 * Begleitdateien `.DS_Store` und `._<name>`). Das sind keine echten
 * Dateien – `._foo.3mf` wäre sonst fälschlich als 3MF klassifiziert und
 * verschandelt die Liste mit 4 KB-Schein-Einträgen.
 */
function isAppleDouble(name) {
  const n = String(name);
  return n === '.DS_Store' || n.startsWith('._');
}

/**
 * Erkennt versteckte Einträge: Namenszug mit führendem Punkt (`.cache`,
 * `.Trash`, …). Das deckt auf NAS auch die AppleDouble-Einträge ab.
 */
function isHidden(name) {
  return String(name).startsWith('.');
}

/** Wandelt einen `DirEntry` der Bibliothek in ein App-Objekt um. */
function toEntry(entry, currentDir, root) {
  const full = joinSmb(currentDir, entry.name);
  let rel = full;
  if (root && full.startsWith(`${root}/`)) rel = full.slice(root.length + 1);

  return {
    name: entry.name,
    type: typeOf(entry.name),
    size: Number(entry.sizeBytes ?? 0),
    modified: entry.mtime instanceof Date ? entry.mtime.toISOString() : null,
    path: rel || entry.name,
    isDirectory: entry.isDirectory,
  };
}

/** Sammelt reguläre Dateien rekursiv bis `remainingDepth`. */
async function collectFiles(smb, share, path, remainingDepth, root) {
  const entries = await smb.list(share, path);
  const out = [];
  for (const f of entries) {
    if (isAppleDouble(f.name)) continue; // macOS-Metadaten überspringen
    if (isHidden(f.name)) continue; // versteckte Einträge ausblenden
    if (f.isDirectory) {
      // In Reparse-Points (Symbol-Links) nicht rekursieren (Schleifen vermeiden).
      if (!f.isReparsePoint && remainingDepth > 0) {
        out.push(
          ...(await collectFiles(smb, share, joinSmb(path, f.name), remainingDepth - 1, root)),
        );
      }
    } else {
      out.push(toEntry(f, path, root));
    }
  }
  return out;
}

/**
 * Listet Dateien im konfigurierten Pfad.
 * - maxDepth 0 (Standard): nur Einträge direkt in `cfg.path` (Dateien + Ordner).
 * - maxDepth > 0: zusätzlich reguläre Dateien bis zu `maxDepth` Ebenen tiefer.
 */
export async function listFiles(cfg) {
  return withSmb(cfg, async (smb) => {
    const share = cfg.share;
    const root = normPath(cfg.path); // '' = Share-Root
    const depth = Number(cfg.maxDepth) || 0;

    const result = [];
    const top = await smb.list(share, root);

    for (const f of top) {
      if (isAppleDouble(f.name)) continue; // macOS-Metadaten überspringen
      // Nur Dateien einbinden, keine Ordner (damit die Datei-Liste aufräumen)
      // Auch versteckte Einträge (führender Punkt) ausblenden
      if (!f.isDirectory && !isHidden(f.name)) {
        result.push(toEntry(f, root, root));
      }
      if (f.isDirectory && !f.isReparsePoint && depth > 0) {
        result.push(
          ...(await collectFiles(smb, share, joinSmb(root, f.name), depth - 1, root)),
        );
      }
    }
    return result;
  });
}

/** Baut aus einem share-relativen Pfad die Breadcrumb-Segmente. */
function relBreadcrumbs(rel) {
  const crumbs = [{ label: 'Share-Root', value: '' }];
  if (!rel) return crumbs;
  const parts = rel.split('/').filter(Boolean);
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    crumbs.push({ label: p, value: acc });
  }
  return crumbs;
}

/**
 * Listet die Unterverzeichnisse unter `at` (share-relativ) für den
 * Pfad-Picker. `showHidden` (Standard false) blendet versteckte Einträge
 * (führender Punkt) aus; mit true werden auch sie aufgelistet.
 * Gibt { current, breadcrumb, entries } zurück (relative Pfade).
 */
export async function browseNas(cfg, at = '', showHidden = false) {
  const root = normPath(at); // '' = Share-Root
  const entries = await withSmb(cfg, async (smb) => {
    const raw = await smb.list(cfg.share, root);
    const out = [];
    for (const f of raw) {
      // Versteckte Einträge (führender Punkt) ausblenden, es sei denn, der
      // Nutzer hat „Versteckte anzeigen" aktiviert.
      if (!showHidden && isHidden(f.name)) continue;
      if (f.isDirectory && !f.isReparsePoint) {
        out.push({ name: f.name, path: joinSmb(root, f.name), isDirectory: true });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return out;
  });
  return { current: root, breadcrumb: relBreadcrumbs(root), entries };
}

/**
 * Listet die verfügbaren Shares des NAS (session.listShares()).
 * Gibt saubere { name, type, comment } zurück. Sonder-Shares, die keinen
 * Dateizugang bieten (IPC$, PRINT$, … enden auf '$'), werden herausgefiltert –
 * damit der Share-Picker nur nutzbare Disk-Shares anbietet.
 */
export async function listShares(cfg) {
  return withSmb(cfg, async (smb) => {
    let raw;
    try {
      raw = await smb.listShares();
    } catch {
      // Manche NAS/Sessions erlauben kein Share-Listing -> leer statt Fehler.
      return [];
    }
    return (raw || [])
      .filter((s) => s && s.name && !String(s.name).endsWith('$'))
      .map((s) => ({
        name: s.name,
        type: s.type || 'disk',
        comment: s.comment || '',
      }));
  });
}
