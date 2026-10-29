import type { Hint } from '../types';
import type { Selection } from '../data/packs';

export type Phase = 'lobby' | 'loading' | 'playing' | 'reveal' | 'finished';
export type PlayerStatus = 'guessing' | 'solved' | 'failed';

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  attempt: number;
  status: PlayerStatus;
  /** Points won this round, bonus included. */
  roundPoints: number;
  /** First to guess this round (got FIRST_BONUS). */
  first: boolean;
  connected: boolean;
}

export interface RoundInfo {
  index: number;
  total: number;
  youtubeId: string;
  start: number;
  hints: Hint[];
  /** Chaos mode: random spot (0–1 of the song) for each attempt, the same for every player. */
  spots: number[] | null;
  /** Milliseconds left in the round when this state was sent (null while loading). */
  remainingMs: number | null;
}

/** One played round, for the end-of-game summary. */
export interface RoundRecap {
  answer: string;
  credit?: string;
  youtubeId: string;
  results: { playerId: string; name: string; points: number; first: boolean; solved: boolean }[];
}

export interface RoomState {
  id: string;
  hostId: string;
  selection: Selection;
  phase: Phase;
  rounds: number;
  chaos: boolean;
  players: PublicPlayer[];
  round: RoundInfo | null;
  reveal: { answer: string; credit?: string } | null;
  /** Rounds played so far in this game. */
  history: RoundRecap[];
}

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  /** Empty for other players while `spoiler` is set; the text arrives with chat:reveal when the round ends. */
  text: string;
  spoiler: boolean;
}

export const CHAT_MAX_LENGTH = 200;

export type JoinResult = { ok: true; roomId: string; playerId: string } | { ok: false; error: string };
export type GuessResult = { correct: boolean };

export interface ClientToServer {
  'room:create': (p: { name: string; key: string }, ack: (r: JoinResult) => void) => void;
  'room:join': (p: { roomId: string; name: string; key: string }, ack: (r: JoinResult) => void) => void;
  'room:leave': () => void;
  'game:start': (p: { rounds: number; chaos: boolean; selection: Selection }) => void;
  /** Host only: remove a player (they can't rejoin this room). */
  'host:kick': (playerId: string) => void;
  /** Host only: end the current round now (e.g. a video that won't load). */
  'host:skip': () => void;
  'round:ready': () => void;
  'round:guess': (text: string, ack: (r: GuessResult) => void) => void;
  'round:skip': () => void;
  'chat:send': (text: string) => void;
}

export interface ServerToClient {
  'room:state': (state: RoomState) => void;
  'room:kicked': () => void;
  'chat:message': (message: ChatMessage) => void;
  /** Spoiler messages of the round that just ended, now safe to show. */
  'chat:reveal': (messages: { id: number; text: string }[]) => void;
}

export const ROUND_SECONDS = 90;
/** Extra points for the first player who guesses each round. */
export const FIRST_BONUS = 20;
export const REVEAL_SECONDS = 10;
export const LOAD_TIMEOUT_SECONDS = 8;
