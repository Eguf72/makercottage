// Datenbank-Modul für MakerCottage (SQLite, file-basiert).
// Nutzt better-sqlite3 – keine externe Datenbank-Server-Instanz nötig.
// Pfad: siehe paths.js (DATA_DIR, Standard ~/.makercottage, via MC_HOME überschreibbar).
//        Die DB liegt außerhalb des Code-Ordners -> überlebt ein Update.

import Database from 'better-sqlite3';
import { DB_PATH } from './paths.js';

const db = new Database(DB_PATH);

// Tabellen bei Eröffnung erstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS file_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER,
    path TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    tags TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    path TEXT NOT NULL,
    file_count INTEGER DEFAULT 0,
    step_count INTEGER DEFAULT 0,
    found_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// --- Migration: Druck-Informationen an die bestehende Tabelle anhängen -------
// Jede Spalte wird nur hinzugefügt, wenn sie noch fehlt (idempotent, sicher bei
// bereits vorhandenen Datenbanken). Die veralteten Einzel-Filament-Felder
// (filament_g, filament_type, printer, print_status) bleiben in der DB, werden
// aber nicht mehr verwendet – die Migration ist nicht destruktiv.
const printColumns = [
  ['print_time_min', 'INTEGER'], // Druckdauer in Minuten
  ['print_cost', 'REAL'], // Druckkosten in Euro
  ['print_notes', "TEXT DEFAULT ''"], // Freitext-Bemerkungen
  ['print_name', "TEXT DEFAULT ''"], // Druckname (kann vom Dateinamen abweichen)
  ['filaments', "TEXT DEFAULT '[]'"], // JSON: benutzte Filamente (Material + Menge je Filament)
  ['nozzle_size', "TEXT DEFAULT ''"], // Nozendurchmesser, z. B. „0,4"
  ['print_plates', 'INTEGER'], // Anzahl der verwendeten Druckplatten
  // veraltet, aber beibehalten (nicht destruktiv):
  ['filament_g', 'REAL'],
  ['filament_type', "TEXT DEFAULT ''"],
  ['printer', "TEXT DEFAULT ''"],
  ['print_status', "TEXT DEFAULT ''"],
];
(function migratePrintColumns() {
  const cols = db.prepare("PRAGMA table_info(file_index)").all();
  const have = new Set(cols.map((c) => c.name));
  for (const [name, def] of printColumns) {
    if (!have.has(name)) {
      db.exec(`ALTER TABLE file_index ADD COLUMN ${name} ${def}`);
    }
  }
})();

// Platzhalter-Backfill: leere Drucknamen (z. B. ältere, vor dieser Logik
// gescannte Einträge) bekommen den Dateinamen als Platzhalter, damit die
// Übersicht durchgehend einen Druck-Name zeigt. Idempotent: nach dem ersten
// Durchlauf gibt es keine leeren Werte mehr; ein bewusst leergelassener
// Druckname wird beim nächsten Start wieder zum Dateinamen – „leer = Dateiname".
(function backfillPrintName() {
  db.exec("UPDATE file_index SET print_name = name WHERE print_name IS NULL OR print_name = ''");
})();

// Standard-Einstellungen setzen (falls noch nicht vorhanden)
const defaultSettings = [
  ['version', '0.7.0'],
  ['db_version', '5'],
  // Referenzpreis für die automatische Kostenschätzung (€/kg) im Druck-Tab.
  ['filament_price_per_kg', '20'],
];
for (const [key, value] of defaultSettings) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (!exists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

// --- file_index ---

export function indexFile({ name, extension, type, size, path, last_modified, tags = '' }) {
  const stmt = db.prepare(
    `INSERT INTO file_index (name, extension, type, size, path, last_modified, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(name, extension, type, size, path, last_modified, tags);
}

// Idempotent: aktualisiert den Eintrag (name+path), falls vorhanden; sonst anlegt.
// So bekommt jede gefundene Datei genau einen, aktuell gehaltenen Eintrag.
export function upsertFile({ name, extension, type, size, path, last_modified }) {
  const existing = db
    .prepare('SELECT id FROM file_index WHERE name = ? AND path = ?')
    .get(name, path);
  if (existing) {
    const upd = db.prepare(
      `UPDATE file_index
         SET extension = ?, type = ?, size = ?, last_modified = ?
       WHERE id = ?`
    );
    upd.run(extension, type, size, last_modified, existing.id);
    return { id: existing.id, created: false };
  }
  // Neuanlage: der Druck-Name wird mit dem Dateinamen als Platzhalter
  // befüllt – beim Scannen ist der Dateiname der Startwert, den der Nutzer
  // im Detailfenster beliebig überschreiben kann. Bestehende Einträge
  // (UPDATE) behalten ihren Druck-Name; der Platzhalter überschreibt nichts.
  const ins = db.prepare(
    `INSERT INTO file_index (name, extension, type, size, path, last_modified, tags, print_name)
     VALUES (?, ?, ?, ?, ?, ?, '', ?)`
  );
  const r = ins.run(name, extension, type, size, path, last_modified, name);
  return { id: Number(r.lastInsertRowid), created: true };
}

// Alle Einträge (optionale Filter). Liefert die DB-Felder (last_modified in Sekunden).
export function getFiles(filters = {}) {
  let sql = 'SELECT * FROM file_index WHERE 1=1';
  const params = [];

  if (filters.type && filters.type !== 'all') {
    sql += ' AND type = ?';
    params.push(filters.type);
  }

  if (filters.q) {
    sql += ' AND name LIKE ?';
    params.push(`%${filters.q}%`);
  }

  if (filters.tags) {
    sql += ' AND tags LIKE ?';
    params.push(`%${filters.tags}%`);
  }

  sql += ' ORDER BY name COLLATE NOCASE';
  return db.prepare(sql).all(params);
}

export function removeFile(path) {
  const stmt = db.prepare('DELETE FROM file_index WHERE path = ?');
  stmt.run(path);
}

export function updateFileTags(path, tags) {
  const stmt = db.prepare('UPDATE file_index SET tags = ? WHERE path = ?');
  stmt.run(tags, path);
}

// Datei-Tags aktualisieren (Upsert: bei fehlendem Eintrag einen anlegen).
export function updateFileTagsByName(name, tags) {
  const existing = db.prepare('SELECT id FROM file_index WHERE name = ? LIMIT 1').get(name);
  if (existing) {
    db.prepare('UPDATE file_index SET tags = ? WHERE id = ?').run(tags, existing.id);
    return { updated: true, id: existing.id };
  }
  const ext = String(name).split('.').pop().toLowerCase() || 'no-ext';
  const type = { step: 'STEP', stp: 'STEP', stl: 'STL', '3mf': '3MF', gcode: 'Gcode', gco: 'Gcode', obj: 'OBJ', amf: 'AMF', ply: 'PLY' }[ext] || 'other';
  const r = db
    .prepare(
      `INSERT INTO file_index (name, extension, type, size, path, last_modified, tags)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    )
    .run(name, ext, type, name, Math.floor(Date.now() / 1000), tags);
  return { created: true, id: Number(r.lastInsertRowid) };
}

// Einzelnen Eintrag nach exaktem Namen (erste Treffer, falls Duplikate existieren).
export function getFileByName(name) {
  const row = db.prepare('SELECT * FROM file_index WHERE name = ? ORDER BY id DESC LIMIT 1').get(name);
  return row || null;
}

// Map aller Drucknamen (name -> print_name), damit die Datei-Übersicht den
// Druck-Name mitliefern kann, ohne pro Datei abzufragen. Eine Abfrage reicht;
// die Zeilen kommen in id-Reihenfolge, also überschreibt der jüngste Eintrag
// (größte id) den älteren – konsistent mit getFileByName.
export function getPrintNameMap() {
  const rows = db.prepare('SELECT name, print_name FROM file_index').all();
  const map = new Map();
  for (const r of rows) {
    // Fallback auf den Dateinamen, falls der Druckname leer ist (Platzhalter).
    map.set(r.name, r.print_name || r.name);
  }
  return map;
}

// Druck-Informationen einer Datei aktualisieren (Upsert nach Name).
// Unbekannter Name: Eintrag anlegen wie bei den Tags, damit keine Datei verloren geht.
// Benutzte Filamente werden als JSON-Array gespeichert (Material + Menge je Eintrag);
// leere Zeilen (kein Material und keine Menge) werden verworfen.
export function updateFilePrint(name, fields = {}) {
  const existing = db.prepare('SELECT id FROM file_index WHERE name = ? LIMIT 1').get(name);
  const clean = (v) => (v === undefined || v === null ? null : v);
  const rawFilaments = Array.isArray(fields.filaments) ? fields.filaments : [];
  const filaments = rawFilaments
    .map((f) => ({
      material: String(f?.material ?? '').trim(),
      grams:
        f?.grams === '' || f?.grams == null
          ? null
          : Number(String(f.grams).replace(',', '.')),
    }))
    .filter((f) => f.material !== '' || f.grams != null);
  const f = {
    print_name: String(fields.print_name ?? ''),
    print_time_min: clean(fields.print_time_min),
    print_cost: clean(fields.print_cost),
    filaments: JSON.stringify(filaments),
    nozzle_size: String(fields.nozzle_size ?? ''),
    print_plates: clean(fields.print_plates),
    print_notes: String(fields.print_notes ?? ''),
  };
  if (existing) {
    db.prepare(
      `UPDATE file_index
         SET print_name = ?, print_time_min = ?, print_cost = ?,
             filaments = ?, nozzle_size = ?, print_plates = ?, print_notes = ?
       WHERE id = ?`
    ).run(
      f.print_name, f.print_time_min, f.print_cost, f.filaments,
      f.nozzle_size, f.print_plates, f.print_notes, existing.id,
    );
    return { updated: true, id: existing.id };
  }
  const ext = String(name).split('.').pop().toLowerCase() || 'no-ext';
  const type = { step: 'STEP', stp: 'STEP', stl: 'STL', '3mf': '3MF', gcode: 'Gcode', gco: 'Gcode', obj: 'OBJ', amf: 'AMF', ply: 'PLY' }[ext] || 'other';
  const r = db
    .prepare(
      `INSERT INTO file_index (name, extension, type, size, path, last_modified, tags,
            print_name, print_time_min, print_cost, filaments, nozzle_size, print_plates, print_notes)
       VALUES (?, ?, ?, 0, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, ext, type, name, Math.floor(Date.now() / 1000),
      f.print_name, f.print_time_min, f.print_cost, f.filaments,
      f.nozzle_size, f.print_plates, f.print_notes);
  return { created: true, id: Number(r.lastInsertRowid) };
}

// --- Übersicht: Verteilung + jüngste Dateien --------------------------------
// Für die rechte Spalte („Übersicht"): ein Donut nach Endung und eine Liste
// der zuletzt hinzugefügten Dateien.

// Anzahl indexierter Dateien pro Endung (GROUP BY extension), absteigend.
// Die Extension ist die echte Datei-Endung (z. B. „step", „3mf"); die
// kategorisierte Type (STEP, Gcode …) bleibt im Detailfenster erhalten.
export function getTypeCounts() {
  return db
    .prepare(
      'SELECT extension, COUNT(*) AS count FROM file_index GROUP BY extension ORDER BY count DESC, extension ASC',
    )
    .all();
}

// Jüngst indexierte Dateien (nach created_at absteigend). „Hinzugefügt" ist der
// Zeitpunkt, zu dem der Eintrag in die DB geschrieben wurde; bei Gleichstand
// die größere id (jüngste Zeile).
export function getRecentFiles(limit = 5) {
  return db
    .prepare(
      'SELECT name, extension, type, size, created_at FROM file_index ORDER BY created_at DESC, id DESC LIMIT ?',
    )
    .all(limit);
}

// --- scan_history ---

export function recordScan({ source, path, fileCount, stepCount }) {
  const stmt = db.prepare(
    `INSERT INTO scan_history (source, path, file_count, step_count) VALUES (?, ?, ?, ?)`
  );
  stmt.run(source, path, fileCount || 0, stepCount || 0);
}

export function getRecentScans(limit = 10) {
  const stmt = db.prepare(
    'SELECT * FROM scan_history ORDER BY found_at DESC LIMIT ?'
  );
  return stmt.all(limit);
}

// --- settings ---

export function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  stmt.run(key, value);
}

export function close() {
  db.close();
}

export default db;