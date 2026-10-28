import type { Hint } from '../types';

export type Phase = 'lobby' | 'loading' | 'playing' | 'reveal' | 'finished';
export type PlayerStatus = 'guessing' | 'solved' | 'failed';

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  attempt: number;
  status: PlayerStatus;
  roundPoints: number;
  connected: boolean;
}

export interface RoundInfo {
  index: number;
  total: number;
  youtubeId: string;
  start: number;
  hints: Hint[];
  /** Milliseconds left in the round when this state was sent (null while loading). */
  remainingMs: number | null;
}

export interface RoomState {
  id: string;
  hostId: string;
  packId: string;
  phase: Phase;
  rounds: number;
  players: PublicPlayer[];
  round: RoundInfo | null;
  reveal: { answer: string; credit?: string } | null;
}

export type JoinResult = { ok: true; roomId: string; playerId: string } | { ok: false; error: string };
export type GuessResult = { correct: boolean };

export interface ClientToServer {
  'room:create': (p: { name: string; key: string; packId: string; rounds: number }, ack: (r: JoinResult) => void) => void;
  'room:join': (p: { roomId: string; name: string; key: string }, ack: (r: JoinResult) => void) => void;
  'room:leave': () => void;
  'game:start': (p: { rounds: number }) => void;
  'round:ready': () => void;
  'round:guess': (text: string, ack: (r: GuessResult) => void) => void;
  'round:skip': () => void;
}

export interface ServerToClient {
  'room:state': (state: RoomState) => void;
}

export const ROUND_SECONDS = 60;
export const REVEAL_SECONDS = 10;
export const LOAD_TIMEOUT_SECONDS = 8;
