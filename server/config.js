import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
// config.json liegt im Daten-Ordner (siehe paths.js), nicht im Code-Ordner.
import { CONFIG_PATH } from './paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env als Default-Werte (server/.env oder Repo-Root/.env)
dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

function loadJsonConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Liefert die aktive Konfiguration.
 * config.json (vom Nutzer eingegeben) hat Vorrang vor .env.
 */
export function getConfig() {
  const json = loadJsonConfig();
  const env = process.env;
  // Quelle: 'nas' (SMB, Standard – rückwärtskompatibel) oder 'local' (lokales
  // Verzeichnis auf dem Server-Rechner). Für 'local' ist `path` ein absoluter
  // Pfad; host/share/user/pass werden dann ignoriert.
  return {
    source: String(json.SOURCE ?? env.SOURCE ?? 'nas'),
    host: json.NAS_HOST ?? env.NAS_HOST ?? '',
    share: json.NAS_SHARE ?? env.NAS_SHARE ?? '',
    user: json.NAS_USER ?? env.NAS_USER ?? '',
    pass: json.NAS_PASS ?? env.NAS_PASS ?? '',
    domain: json.NAS_DOMAIN ?? env.NAS_DOMAIN ?? '',
    path: json.NAS_PATH ?? env.NAS_PATH ?? '/',
    port: Number(json.NAS_PORT ?? env.NAS_PORT ?? 445),
    maxDepth: Number(json.MAX_DEPTH ?? env.MAX_DEPTH ?? 0),
    slicer: String(json.SLICER ?? env.SLICER ?? ''),
    configSource: json && Object.keys(json).length ? 'config.json' : 'env',
  };
}

/** Öffentliche Ansicht – niemals das Passwort mitgeben. */
export function publicConfig(cfg = getConfig()) {
  return {
    source: cfg.source,
    host: cfg.host,
    share: cfg.share,
    user: cfg.user,
    path: cfg.path,
    port: cfg.port,
    maxDepth: cfg.maxDepth,
    slicer: cfg.slicer,
    configSource: cfg.configSource,
    hasPassword: Boolean(cfg.pass),
  };
}

/** Speichert eine Teil-Konfiguration in config.json (lokal, 0o600). */
export function saveConfig(patch = {}) {
  const json = loadJsonConfig();
  const next = {
    SOURCE: String(patch.source ?? json.SOURCE ?? 'nas'),
    NAS_HOST: patch.host ?? json.NAS_HOST ?? '',
    NAS_SHARE: patch.share ?? json.NAS_SHARE ?? '',
    NAS_USER: patch.user ?? json.NAS_USER ?? '',
    NAS_DOMAIN: patch.domain ?? json.NAS_DOMAIN ?? '',
    NAS_PATH: patch.path ?? json.NAS_PATH ?? '/',
    NAS_PORT: Number(patch.port ?? json.NAS_PORT ?? 445),
    MAX_DEPTH: Number(patch.maxDepth ?? json.MAX_DEPTH ?? 0),
    SLICER: patch.slicer ?? json.SLICER ?? '',
  };
  // Passwort nur überschreiben, wenn ein neuer geliefert wurde; sonst behalten.
  if (patch.pass) next.NAS_PASS = patch.pass;
  else if (json.NAS_PASS) next.NAS_PASS = json.NAS_PASS;

  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return publicConfig(getConfig());
}

export const CONFIG_FILE = CONFIG_PATH;
