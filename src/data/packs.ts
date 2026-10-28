import type { Pack } from '../types';
import briceno from './briceno.json';

// New packs (e.g. Latin American Spanish openings/endings) are added here.
export const PACKS: Pack[] = [briceno];

/** Tracks without a video are skipped so the catalog can be filled gradually. */
export function playableTracks(pack: Pack) {
  return pack.tracks.filter((t) => t.youtubeId.trim() !== '');
}
