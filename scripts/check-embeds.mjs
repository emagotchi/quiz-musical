// Checks every youtubeId in src/data/*.json via YouTube oEmbed.
// 401 = embedding disabled, 404 = video removed/private.
import { readdir, readFile } from 'node:fs/promises';

const dir = new URL('../src/data/', import.meta.url);
let bad = 0;

for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
  const pack = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
  for (const t of pack.tracks) {
    if (!t.youtubeId) {
      console.log(`- ${file} ${t.id}: sin youtubeId`);
      continue;
    }
    const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${t.youtubeId}`;
    const res = await fetch(url);
    if (res.ok) {
      console.log(`✓ ${file} ${t.id}`);
    } else {
      bad++;
      const why = res.status === 401 ? 'no permite inserción' : res.status === 404 ? 'no existe o es privado' : `HTTP ${res.status}`;
      console.log(`✗ ${file} ${t.id} (${t.youtubeId}): ${why}`);
    }
  }
}

process.exit(bad ? 1 : 0);
