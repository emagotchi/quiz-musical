import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../shared/protocol';

// Same origin by default: Vite proxies /socket.io in dev, and the game server serves the client in production.
export const socket: Socket<ServerToClient, ClientToServer> = io(import.meta.env.VITE_SERVER_URL ?? undefined, {
  autoConnect: false,
});

function stored(key: string, fallback: () => string) {
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = fallback();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return fallback();
  }
}

/** Identifies this browser to the server so a reload rejoins the same seat. */
export const playerKey = stored('mq-player-key', () => crypto.randomUUID());

export function savedName() {
  return stored('mq-name', () => '');
}

export function saveName(name: string) {
  try {
    localStorage.setItem('mq-name', name);
  } catch {
    // name just won't be remembered
  }
}
