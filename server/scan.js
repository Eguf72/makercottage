// Dateitypen und Filter-/Such-/Sortierlogik.

export const SUPPORTED_TYPES = ['stl', '3mf', 'gcode', 'obj', 'amf', 'ply', 'step'];

const EXT_TYPE = {
  stl: 'STL',
  '3mf': '3MF',
  gcode: 'Gcode',
  gco: 'Gcode',
  obj: 'OBJ',
  amf: 'AMF',
  ply: 'PLY',
  step: 'STEP',
  stp: 'STEP',
};

/** Klassifiziert eine Datei nach Endung in einen (oberen) Typ. */
export function typeOf(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  return EXT_TYPE[ext] || 'other';
}

/**
 * Filtert (nach Typ + Textsuche) und sortiert eine Liste von Einträgen.
 * @param {Array} files
 * @param {{ type?: string, q?: string, sort?: string, order?: string }} opts
 */
export function filterSearchSort(files, { type = 'all', q = '', sort = 'name', order = 'asc' } = {}) {
  let result = [...files];

  if (type && type !== 'all') {
    const t = String(type).toLowerCase();
    result = result.filter((f) => String(f.type || '').toLowerCase() === t);
  }

  const needle = String(q || '').trim().toLowerCase();
  if (needle) {
    result = result.filter((f) => String(f.name || '').toLowerCase().includes(needle));
  }

  const dir = order === 'desc' ? -1 : 1;
  result.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'modified': {
        // `modified` ist ein ISO-String -> als Zeitstempel vergleichen
        // (direktes Subtractieren von Strings ergäbe NaN).
        const at = a.modified ? Date.parse(a.modified) || 0 : 0;
        const bt = b.modified ? Date.parse(b.modified) || 0 : 0;
        cmp = at - bt;
        break;
      }
      case 'size':
        cmp = (a.size || 0) - (b.size || 0);
        break;
      case 'type':
        cmp = String(a.type).localeCompare(String(b.type));
        break;
      case 'name':
      default:
        cmp = String(a.name).localeCompare(String(b.name));
    }
    return cmp * dir;
  });

  return result;
}
