import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize as normalizePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { PACKS, playableTracks } from '../src/data/packs';
import { ATTEMPTS, chaosSpots, isCorrect, pickTracks } from '../src/lib/scoring';
import type { Pack, Track } from '../src/types';
import {
  LOAD_TIMEOUT_SECONDS,
  REVEAL_SECONDS,
  ROUND_SECONDS,
  type ClientToServer,
  type Phase,
  type PlayerStatus,
  type RoomState,
  type ServerToClient,
} from '../src/shared/protocol';

interface Player {
  id: string;
  /** Secret kept by the client so a page reload reclaims the same seat. Never broadcast. */
  key: string;
  name: string;
  socketId: string | null;
  score: number;
  attempt: number;
  status: PlayerStatus;
  roundPoints: number;
  ready: boolean;
}

interface Room {
  id: string;
  hostId: string;
  pack: Pack;
  rounds: number;
  chaos: boolean;
  /** Chaos-mode clip positions for the current round. */
  spots: number[] | null;
  phase: Phase;
  players: Map<string, Player>;
  queue: Track[];
  roundIndex: number;
  endsAt: number | null;
  timer: NodeJS.Timeout | null;
  cleanup: NodeJS.Timeout | null;
}

type GameSocket = Socket<ClientToServer, ServerToClient, object, { roomId?: string; playerId?: string }>;

const rooms = new Map<string, Room>();
const MAX_ROUNDS = 30;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

const randomId = (len: number, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ') =>
  Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

const cleanName = (name: unknown) => String(name ?? '').trim().slice(0, 20) || 'Anónimo';
const clampRounds = (n: unknown, pack: Pack) =>
  Math.max(1, Math.min(Number(n) || 10, MAX_ROUNDS, playableTracks(pack).length));

function connectedPlayers(room: Room) {
  return [...room.players.values()].filter((p) => p.socketId);
}

function snapshot(room: Room): RoomState {
  const track = room.queue[room.roundIndex];
  const inRound = room.phase === 'loading' || room.phase === 'playing' || room.phase === 'reveal';
  return {
    id: room.id,
    hostId: room.hostId,
    packId: room.pack.id,
    phase: room.phase,
    rounds: room.rounds,
    chaos: room.chaos,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      attempt: p.attempt,
      status: p.status,
      roundPoints: p.roundPoints,
      connected: p.socketId !== null,
    })),
    round:
      inRound && track
        ? {
            index: room.roundIndex,
            total: room.queue.length,
            youtubeId: track.youtubeId,
            start: track.start,
            hints: track.hints,
            spots: room.spots,
            remainingMs: room.endsAt === null ? null : Math.max(0, room.endsAt - Date.now()),
          }
        : null,
    reveal: room.phase === 'reveal' && track ? { answer: track.answer, credit: track.credit } : null,
  };
}

function broadcast(room: Room) {
  io.to(room.id).emit('room:state', snapshot(room));
}

function schedule(room: Room, seconds: number, fn: () => void) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(fn, seconds * 1000);
}

function startGame(room: Room, rounds: number, chaos: boolean) {
  room.rounds = clampRounds(rounds, room.pack);
  room.chaos = chaos;
  room.queue = pickTracks(playableTracks(room.pack), room.rounds);
  room.roundIndex = 0;
  for (const p of room.players.values()) p.score = 0;
  startRound(room);
}

function startRound(room: Room) {
  room.phase = 'loading';
  room.endsAt = null;
  room.spots = room.chaos ? chaosSpots() : null;
  for (const p of room.players.values()) Object.assign(p, { attempt: 0, status: 'guessing', roundPoints: 0, ready: false });
  schedule(room, LOAD_TIMEOUT_SECONDS, () => beginPlaying(room));
  broadcast(room);
}

function beginPlaying(room: Room) {
  if (room.phase !== 'loading') return;
  room.phase = 'playing';
  room.endsAt = Date.now() + ROUND_SECONDS * 1000;
  schedule(room, ROUND_SECONDS, () => endRound(room));
  broadcast(room);
}

function endRound(room: Room) {
  if (room.phase !== 'playing') return;
  room.phase = 'reveal';
  room.endsAt = null;
  for (const p of room.players.values()) if (p.status === 'guessing') p.status = 'failed';
  schedule(room, REVEAL_SECONDS, () => {
    room.roundIndex++;
    if (room.roundIndex < room.queue.length) startRound(room);
    else {
      room.phase = 'finished';
      broadcast(room);
    }
  });
  broadcast(room);
}

function checkRoundOver(room: Room) {
  if (room.phase === 'playing' && connectedPlayers(room).every((p) => p.status !== 'guessing')) endRound(room);
}

function checkAllReady(room: Room) {
  if (room.phase === 'loading' && connectedPlayers(room).every((p) => p.ready)) beginPlaying(room);
}

function seat(socket: GameSocket, room: Room, name: string, key: string) {
  if (room.cleanup) clearTimeout(room.cleanup);
  room.cleanup = null;

  let player = [...room.players.values()].find((p) => p.key === key);
  if (player) {
    player.socketId = socket.id;
    player.name = name;
  } else {
    player = {
      id: randomId(8, 'abcdefghijklmnopqrstuvwxyz0123456789'),
      key,
      name,
      socketId: socket.id,
      score: 0,
      attempt: 0,
      // Late joiners sit out the current round.
      status: room.phase === 'lobby' || room.phase === 'finished' ? 'guessing' : 'failed',
      roundPoints: 0,
      ready: true,
    };
    room.players.set(player.id, player);
  }
  if (!room.players.get(room.hostId)?.socketId) room.hostId = player.id;

  socket.data.roomId = room.id;
  socket.data.playerId = player.id;
  socket.join(room.id);
  broadcast(room);
  return player;
}

function leave(socket: GameSocket) {
  const room = rooms.get(socket.data.roomId ?? '');
  const player = room?.players.get(socket.data.playerId ?? '');
  socket.data.roomId = socket.data.playerId = undefined;
  if (!room || !player || player.socketId !== socket.id) return;
  socket.leave(room.id);

  // In the lobby a leaving player just disappears; mid-game they keep their score in case they come back.
  if (room.phase === 'lobby' || room.phase === 'finished') room.players.delete(player.id);
  else player.socketId = null;

  const online = connectedPlayers(room);
  if (online.length === 0) {
    room.cleanup = setTimeout(() => {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.id);
    }, EMPTY_ROOM_TTL_MS);
    return;
  }
  if (room.hostId === player.id) room.hostId = online[0].id;
  checkAllReady(room);
  checkRoundOver(room);
  broadcast(room);
}

// --- HTTP: serves the built client (dist/) in production; socket.io rides on the same port. ---
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const http = createServer(async (req, res) => {
  const path = normalizePath(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([\\/]\.\.)+/, '');
  for (const file of [join(distDir, path), join(distDir, 'index.html')]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {
      // try the SPA fallback next
    }
  }
  res.writeHead(404).end('Ejecuta "npm run build" para servir el cliente.');
});

const io = new Server<ClientToServer, ServerToClient>(http, {
  cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? false },
});

io.on('connection', (socket: GameSocket) => {
  socket.on('room:create', ({ name, key, packId, rounds }, ack) => {
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack || playableTracks(pack).length === 0) return ack({ ok: false, error: 'Pack no disponible.' });
    leave(socket);
    let id = randomId(4);
    while (rooms.has(id)) id = randomId(4);
    const room: Room = {
      id,
      hostId: '',
      pack,
      rounds: clampRounds(rounds, pack),
      chaos: false,
      spots: null,
      phase: 'lobby',
      players: new Map(),
      queue: [],
      roundIndex: 0,
      endsAt: null,
      timer: null,
      cleanup: null,
    };
    rooms.set(id, room);
    const player = seat(socket, room, cleanName(name), String(key));
    ack({ ok: true, roomId: id, playerId: player.id });
  });

  socket.on('room:join', ({ roomId, name, key }, ack) => {
    const room = rooms.get(String(roomId).toUpperCase());
    if (!room) return ack({ ok: false, error: 'La sala no existe.' });
    leave(socket);
    const player = seat(socket, room, cleanName(name), String(key));
    ack({ ok: true, roomId: room.id, playerId: player.id });
  });

  socket.on('room:leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));

  const current = () => {
    const room = rooms.get(socket.data.roomId ?? '');
    const player = room?.players.get(socket.data.playerId ?? '');
    return room && player ? { room, player } : null;
  };

  socket.on('game:start', ({ rounds, chaos }) => {
    const c = current();
    if (!c || c.room.hostId !== c.player.id) return;
    if (c.room.phase === 'lobby' || c.room.phase === 'finished') startGame(c.room, rounds, Boolean(chaos));
  });

  socket.on('round:ready', () => {
    const c = current();
    if (!c || c.room.phase !== 'loading') return;
    c.player.ready = true;
    checkAllReady(c.room);
  });

  socket.on('round:guess', (text, ack) => {
    const c = current();
    if (!c || c.room.phase !== 'playing' || c.player.status !== 'guessing') return ack({ correct: false });
    const { room, player } = c;
    const track = room.queue[room.roundIndex];
    const correct = isCorrect(String(text).slice(0, 100), track);
    if (correct) {
      player.status = 'solved';
      player.roundPoints = ATTEMPTS[player.attempt].points;
      player.score += player.roundPoints;
    } else if (player.attempt + 1 >= ATTEMPTS.length) player.status = 'failed';
    else player.attempt++;
    ack({ correct });
    checkRoundOver(room);
    broadcast(room);
  });

  socket.on('round:skip', () => {
    const c = current();
    if (!c || c.room.phase !== 'playing' || c.player.status !== 'guessing') return;
    if (c.player.attempt + 1 >= ATTEMPTS.length) c.player.status = 'failed';
    else c.player.attempt++;
    checkRoundOver(c.room);
    broadcast(c.room);
  });
});

const port = Number(process.env.PORT) || 3001;
http.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
