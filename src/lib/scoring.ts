import type { Track } from '../types';

/** Each failed attempt unlocks a longer clip (and later, hints) for fewer points. */
export const ATTEMPTS = [
  { seconds: 1, points: 100, hints: 0 },
  { seconds: 3, points: 80, hints: 0 },
  { seconds: 6, points: 60, hints: 0 },
  { seconds: 10, points: 40, hints: 1 },
  { seconds: 15, points: 20, hints: 2 },
];

export const ROUNDS_PER_GAME = 10;

export function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrect(guess: string, track: Track) {
  const g = normalize(guess);
  return [track.answer, ...(track.aliases ?? [])].some((a) => normalize(a) === g);
}

/** Random tracks for a game, preferring different answers so one anime with many openings isn't repeated. */
export function pickTracks(tracks: Track[], count: number) {
  const seen = new Set<string>();
  const unique: Track[] = [];
  const repeats: Track[] = [];
  for (const t of shuffle(tracks)) {
    const key = normalize(t.answer);
    (seen.has(key) ? repeats : unique).push(t);
    seen.add(key);
  }
  return [...unique, ...repeats].slice(0, count);
}

/** Chaos mode: one random spot per attempt, as a 0–1 fraction of the song (the length isn't known until it loads). */
export function chaosSpots() {
  return ATTEMPTS.map(() => Math.random());
}

/** Second where a chaos clip starts. Skips the first seconds and the last 10% (intros/outros are often silent). */
export function chaosStart(spot: number, seconds: number, duration: number) {
  // Before the video reports its length, assume a TV-size opening (~1:30) so we never seek past the end.
  const length = duration > 0 ? duration : 85;
  const from = Math.min(3, length / 10);
  const to = Math.max(from, length * 0.9 - seconds);
  return Math.floor(from + spot * (to - from));
}

export function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
