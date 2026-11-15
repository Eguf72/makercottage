// Funktionstest: Detail-Fenster-Flow auf API-Ebene
const base = 'http://localhost:4000';

function log(label, obj) {
  console.log(label, JSON.stringify(obj));
}

async function main() {
  console.log('=== 1) GET /api/files (Live-Scan + Auto-Index in DB) ===');
  let res = await fetch(`${base}/api/files`);
  let data = await res.json();
  console.log('Status', res.status, '| count:', data.count, '| total:', data.total, '| source:', data.source);
  data.files.forEach((f) => console.log('   -', f.name, '| type:', f.type, '| size:', f.size, '| modified:', f.modified));

  console.log('\n=== 2) GET /api/db/files (DB-Eintrag pro gefundene Datei) ===');
  res = await fetch(`${base}/api/db/files`);
  data = await res.json();
  console.log('DB-Einträge:', data.files.length);
  data.files
    .filter((f) => ['.testprintfiles', 'bracket.step', 'housing.stl'].some((s) => f.name.includes(s) || f.path.includes('testprint')))
    .forEach((f) => console.log('   -', f.name, '| type:', f.type, '| tags:', JSON.stringify(f.tags), '| id:', f.id));

  console.log('\n=== 3) GET /api/db/file?name=bracket.step (Detailfenster-Quell) ===');
  res = await fetch(`${base}/api/db/file?name=bracket.step`);
  data = await res.json();
  console.log('Status', res.status, '| file:', JSON.stringify(data.file));
  const isStep = data.file && (data.file.type === 'STEP' || data.file.extension === 'step');
  console.log('  -> STEP erkannt:', isStep);

  console.log('\n=== 4) POST /api/db/file/tags (Tags speichern) ===');
  res = await fetch(`${base}/api/db/file/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'bracket.step', tags: 'prototyping, hältung, ender-3' }),
  });
  data = await res.json();
  console.log('Status', res.status, '| result:', JSON.stringify(data));

  console.log('\n=== 5) GET /api/db/file?name=bracket.step (Tags persistieren?) ===');
  res = await fetch(`${base}/api/db/file?name=bracket.step`);
  data = await res.json();
  console.log('Tags in DB nach Speichern:', JSON.stringify(data.file.tags));
  console.log('  -> persistiert:', data.file.tags === 'prototyping, hältung, ender-3');

  console.log('\n=== 6) Idempotenz: zweiter Scan erstellt KEINE Duplikate ===');
  const before = (await (await fetch(`${base}/api/db/files`)).json()).files.length;
  await fetch(`${base}/api/files`); // erneut auflisten -> upsert
  const after = (await (await fetch(`${base}/api/db/files`)).json()).files.length;
  console.log('DB-Einträge vor:', before, 'nach:', after, '| kein Duplikat:', before === after);

  console.log('\n=== 7) Upsert: Tag für noch nicht indexierte Datei anlegen ===');
  res = await fetch(`${base}/api/db/file/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'brandneu.step', tags: 'neu' }),
  });
  data = await res.json();
  console.log('Status', res.status, '| result:', JSON.stringify(data));
  res = await fetch(`${base}/api/db/file?name=brandneu.step`);
  data = await res.json();
  console.log('  -> angelegt mit type:', data.file && data.file.type, '| tags:', JSON.stringify(data.file && data.file.tags));

  console.log('\n=== 8) Fehlerbehandlung: unbekannter Name ===');
  res = await fetch(`${base}/api/db/file?name=keine-datei.die-nicht-existiert.xyz`);
  console.log('Status', res.status, '(erwartet 404)');

  console.log('\n=== 9) /api/db/scan (local) ===');
  res = await fetch(`${base}/api/db/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'local', path: '/Users/oliverfuge/Documents/Default Project/Software/MakerCottage/.testprintfiles' }),
  });
  data = await res.json();
  console.log('Status', res.status, '| result:', JSON.stringify(data));

  console.log('\n=== Alle API-Tests abgeschlossen ===');
}

main().catch((e) => {
  console.error('Fehler im Test:', e);
  process.exit(1);
});
