// Builds the pack JSON files in src/data/ from the .txt lists in the project root.
//
// Songs format ("ases falsos.txt"): one "Title https://youtube.com/watch?v=ID" per line;
// blank lines separate albums; an optional "#Album (year)" line names the block that follows.
// A note after the link sets where the clip starts: "Casualidad https://... #(empieza seg 0:32)".
//
// Anime format ("anime latino.txt"): "Anime name https://youtube.com/watch?v=ID #Opening 2".
// Text in parentheses is an accepted alternative name: "Saint Seiya (Los Caballeros del Zodiaco)".
//
// Hand-edited fields already in the JSON (start, aliases) are kept on re-import, matched by id or video.
import { readFile, writeFile } from 'node:fs/promises';

const PACKS = [
  {
    out: 'briceno.json',
    meta: {
      id: 'briceno',
      name: 'Cristóbal Briceño',
      description: 'Fother Muckers, Ases Falsos y solista',
      answerLabel: 'canción',
      guessPlaceholder: 'Escribe el nombre de la canción…',
    },
    defaultStart: 30,
    sources: [
      { file: 'ases falsos.txt', kind: 'songs', band: 'Ases Falsos' },
      { file: 'fother muckers.txt', kind: 'songs', band: 'Fother Muckers' },
    ],
  },
  {
    out: 'anime-latino.json',
    meta: {
      id: 'anime-latino',
      name: 'Anime en latino',
      description: 'Openings y endings clásicos en español latino',
      answerLabel: 'anime',
      guessPlaceholder: 'Escribe el nombre del anime…',
    },
    defaultStart: 0,
    sources: [{ file: 'anime latino.txt', kind: 'anime' }],
  },
  {
    out: 'miranda.json',
    meta: {
      id: 'miranda',
      name: 'Miranda!',
      description: 'Del Es Mentira al Bailar o Morir',
      answerLabel: 'canción',
      guessPlaceholder: 'Escribe el nombre de la canción…',
    },
    defaultStart: 30,
    // A single-band pack: a "Proyecto: Miranda!" hint would give nothing away.
    sources: [{ file: 'miranda.txt', kind: 'songs', band: 'Miranda!', bandHint: false }],
  },
];

const root = new URL('../', import.meta.url);

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function videoId(url) {
  const u = new URL(url);
  return u.searchParams.get('v') ?? u.pathname.split('/').pop();
}

/** "Dragon Ball Z" -> "D_____ B___ Z": first letter of each word, the rest blanked. */
function shapeHint(name) {
  return name
    .split(/\s+/)
    .map((word) => [...word].map((c, i) => (i === 0 || !/[\p{L}\p{N}]/u.test(c) ? c : '_')).join(''))
    .join('   ');
}

async function readLines(file) {
  return (await readFile(new URL(file, root), 'utf8')).split(/\r?\n/);
}

/** "#(empieza seg 0:32)" or "#empieza seg 45" after a link -> 32 / 45; null when there is no such note. */
function startFromNote(note) {
  if (!note) return null;
  const clock = note.match(/(\d+):(\d{1,2})/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const secs = note.match(/(\d+)/);
  return secs ? Number(secs[1]) : null;
}

async function parseSongs({ file, band, bandHint = true }) {
  const entries = [];
  let album = null;
  let blockStarted = false;

  for (const raw of await readLines(file)) {
    const line = raw.trim();
    if (!line) {
      if (blockStarted) album = null;
      blockStarted = false;
      continue;
    }
    if (line.startsWith('#')) {
      // "Es Mentira - 2002" -> "Es Mentira (2002)": filters drop a trailing number ("Opening 2"), not a bracketed one.
      album = line.slice(1).trim().replace(/\s+-\s+(\d{4})$/, ' ($1)');
      continue;
    }
    const m = line.match(/^(.*?)\s+(https?:\/\/\S+)\s*(?:#\s*(.*))?$/);
    if (!m) {
      console.warn(`Línea ignorada en ${file}: ${line}`);
      continue;
    }
    blockStarted = true;
    const answer = m[1].trim();
    const hints = bandHint ? [{ label: 'Proyecto', value: band }] : [];
    if (album) hints.push({ label: 'Disco', value: album });
    entries.push({
      id: slug(`${band}-${answer}`),
      answer,
      aliases: [],
      youtubeId: videoId(m[2]),
      start: startFromNote(m[3]),
      hints,
      credit: album ? `${band} - ${album}` : band,
    });
  }
  return entries;
}

async function parseAnime({ file }) {
  const entries = [];
  for (const raw of await readLines(file)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s+(https?:\/\/\S+)\s*(?:#\s*(.*))?$/);
    if (!m) {
      console.warn(`Línea ignorada en ${file}: ${line}`);
      continue;
    }
    const [, title, url, tag] = m;
    // Parenthesised text with letters is an alternative name; anything else ("(3)") is dropped.
    const alternatives = [...title.matchAll(/\(([^)]*)\)/g)].map((p) => p[1].trim()).filter((p) => /\p{L}/u.test(p));
    const main = title.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const answer = alternatives.length ? `${main} (${alternatives.join(' / ')})` : main;
    const kind = tag?.trim() || null;

    entries.push({
      id: slug(`${main}-${kind ?? videoId(url)}`),
      answer,
      aliases: alternatives.length ? [main, ...alternatives] : [],
      youtubeId: videoId(url),
      // Filled in by animeHints() once spellings are unified.
      kind,
      hints: [],
      credit: '',
    });
  }
  return entries;
}

/** The same anime typed with different capitalisation ("Shaman king"/"Shaman King") gets one spelling. */
function unifySpellings(entries) {
  const best = new Map();
  const uppercase = (s) => [...s].filter((c) => c !== c.toLowerCase()).length;
  for (const e of entries) {
    const key = fold(e.answer);
    if (!best.has(key) || uppercase(e.answer) > uppercase(best.get(key))) best.set(key, e.answer);
  }
  for (const e of entries) e.answer = best.get(fold(e.answer));
}

function animeHints(e) {
  const main = e.answer.replace(/\s*\(.*\)$/, '');
  e.hints = e.kind ? [{ label: 'Tipo', value: e.kind }] : [];
  e.hints.push({ label: 'Nombre', value: shapeHint(main) });
  e.credit = e.kind ? `${main} - ${e.kind}` : main;
}

/** A "Nombre" hint edited by hand in the JSON (e.g. "D_____ B___ _" to hide the Z) survives while the answer is the same. */
function keepEditedName(hints, prev, answer) {
  const edited = prev?.answer === answer && prev.hints?.find((h) => h.label === 'Nombre');
  return edited ? hints.map((h) => (h.label === 'Nombre' ? edited : h)) : hints;
}

for (const pack of PACKS) {
  const outFile = new URL(`src/data/${pack.out}`, root);
  let previous = { tracks: [] };
  try {
    previous = JSON.parse(await readFile(outFile, 'utf8'));
  } catch {
    // first import of this pack
  }
  const prevById = new Map(previous.tracks.map((t) => [t.id, t]));
  // Fallback when the id changed (e.g. "#Opening 2" -> "#Opening"): same video, same hand-edited start.
  const prevByVideo = new Map(previous.tracks.map((t) => [t.youtubeId, t]));

  const entries = [];
  for (const source of pack.sources) {
    entries.push(...(source.kind === 'anime' ? await parseAnime(source) : await parseSongs(source)));
  }
  unifySpellings(entries);
  for (const e of entries) if ('kind' in e) animeHints(e);

  const seen = new Set();
  const tracks = entries.map((e) => {
    let id = e.id;
    for (let n = 2; seen.has(id); n++) id = `${e.id}-${n}`;
    seen.add(id);
    const prev = prevById.get(id) ?? prevByVideo.get(e.youtubeId);
    return {
      id,
      answer: e.answer,
      aliases: prev?.aliases?.length ? prev.aliases : e.aliases,
      youtubeId: e.youtubeId,
      // A second written in the .txt wins; otherwise keep the one edited in the JSON.
      start: e.start ?? prev?.start ?? pack.defaultStart,
      hints: keepEditedName(e.hints, prev, e.answer),
      credit: e.credit,
    };
  });

  await writeFile(outFile, JSON.stringify({ ...pack.meta, tracks }, null, 2) + '\n');
  console.log(`${tracks.length} canciones escritas en src/data/${pack.out}`);
}
