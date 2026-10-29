import type { Pack } from '../types';
import { playableTracks } from '../data/packs';

/** Everyone gets the same song per day; the day changes at midnight in Chile. */
const TIME_ZONE = 'America/Santiago';
/** Day #1 of the daily challenge. */
const FIRST_DAY = '2026-10-29';
const KEY = 'mq-daily';

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

function shiftDay(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayNumber(key = todayKey()) {
  return Math.round((Date.parse(`${key}T12:00:00Z`) - Date.parse(`${FIRST_DAY}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Seconds until the next challenge (midnight in Chile). */
export function secondsToNextDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return 86_400 - (get('hour') * 3600 + get('minute') * 60 + get('second'));
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The day's track: the one with the highest hash(day + track id). Adding songs to a pack
 * only changes today's pick if a new song happens to win, so the daily stays stable across deploys.
 */
export function dailyTrack(pack: Pack, key = todayKey()) {
  let best = null;
  let bestScore = -1;
  for (const t of playableTracks(pack)) {
    const score = hash(`${pack.id}|${key}|${t.id}`);
    if (score > bestScore) [best, bestScore] = [t, score];
  }
  return best;
}

export interface DailyToday {
  date: string;
  trackId: string;
  attempt: number;
  done: boolean;
  /** Attempt index that guessed right, or null if missed. */
  solvedAt: number | null;
}

export interface DailyStats {
  streak: number;
  best: number;
  played: number;
  wins: number;
  lastSolved: string | null;
  today: DailyToday | null;
}

const EMPTY: DailyStats = { streak: 0, best: 0, played: 0, wins: 0, lastSolved: null, today: null };

// Saved in this browser only (no account), like most daily word games.
function readAll(): Record<string, DailyStats> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, DailyStats>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // progress just won't persist
  }
}

export function loadStats(packId: string): DailyStats {
  const stats = { ...EMPTY, ...readAll()[packId] };
  // A day without solving breaks the streak.
  const key = todayKey();
  if (stats.lastSolved !== key && stats.lastSolved !== shiftDay(key, -1)) stats.streak = 0;
  if (stats.today?.date !== key) stats.today = null;
  return stats;
}

function save(packId: string, stats: DailyStats) {
  const all = readAll();
  all[packId] = stats;
  writeAll(all);
}

/** Remembers the current attempt so reloading the page doesn't give a fresh try. */
export function saveAttempt(packId: string, trackId: string, attempt: number) {
  const stats = loadStats(packId);
  if (stats.today?.done) return;
  stats.today = { date: todayKey(), trackId, attempt, done: false, solvedAt: null };
  save(packId, stats);
}

export function saveResult(packId: string, trackId: string, solvedAt: number | null) {
  const stats = loadStats(packId);
  if (stats.today?.done) return stats;
  const key = todayKey();
  stats.played++;
  if (solvedAt !== null) {
    stats.wins++;
    stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
    stats.lastSolved = key;
  } else stats.streak = 0;
  stats.today = { date: key, trackId, attempt: solvedAt ?? 0, done: true, solvedAt };
  save(packId, stats);
  return stats;
}
