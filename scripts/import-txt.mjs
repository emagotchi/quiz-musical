// Builds src/data/briceno.json from the "<band>.txt" lists in the project root.
// Format: one "Title https://youtube.com/watch?v=ID" per line; blank lines separate albums;
// an optional "# Album (year)" line names the block that follows.
// Hand-edited fields already in the JSON (start, aliases, hints, credit) are kept on re-import.
import { readFile, writeFile } from 'node:fs/promises';

const SOURCES = [
  { file: 'ases falsos.txt', band: 'Ases Falsos' },
  { file: 'fother muckers.txt', band: 'Fother Muckers' },
];
const DEFAULT_START = 30;
const root = new URL('../', import.meta.url);
const outFile = new URL('src/data/briceno.json', root);

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function videoId(url) {
  const u = new URL(url);
  return u.searchParams.get('v') ?? u.pathname.split('/').pop();
}

const previous = JSON.parse(await readFile(outFile, 'utf8'));
const prevById = new Map(previous.tracks.map((t) => [t.id, t]));
const tracks = [];

for (const { file, band } of SOURCES) {
  const lines = (await readFile(new URL(file, root), 'utf8')).split(/\r?\n/);
  let album = null;
  let blockStarted = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (blockStarted) album = null;
      blockStarted = false;
      continue;
    }
    if (line.startsWith('#')) {
      album = line.slice(1).trim();
      continue;
    }
    const m = line.match(/^(.*?)\s+(https?:\/\/\S+)$/);
    if (!m) {
      console.warn(`Línea ignorada en ${file}: ${line}`);
      continue;
    }
    blockStarted = true;
    const answer = m[1].trim();
    const id = slug(`${band}-${answer}`);
    const prev = prevById.get(id);
    const hints = [{ label: 'Proyecto', value: band }];
    if (album) hints.push({ label: 'Disco', value: album });

    tracks.push({
      id,
      answer,
      aliases: prev?.aliases ?? [],
      youtubeId: videoId(m[2]),
      start: prev?.start ?? DEFAULT_START,
      hints,
      credit: album ? `${band} — ${album}` : band,
    });
  }
}

await writeFile(outFile, JSON.stringify({ ...previous, tracks }, null, 2) + '\n');
console.log(`${tracks.length} canciones escritas en src/data/briceno.json`);
