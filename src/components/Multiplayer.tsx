import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pack } from '../types';
import type { JoinResult, PublicPlayer, RoomState } from '../shared/protocol';
import { PACKS, playableTracks } from '../data/packs';
import { ATTEMPTS, ROUNDS_PER_GAME, chaosStart } from '../lib/scoring';
import { playerKey, saveName, savedName, socket } from '../lib/socket';
import { useClipPlayer } from '../lib/useClipPlayer';
import { AttemptBar, Hints } from './AttemptBar';
import { GuessInput } from './GuessInput';

interface Props {
  initialRoom: string | null;
  onExit: () => void;
}

/** Entry screen: pick a name, then create or join a room. */
export function Multiplayer({ initialRoom, onExit }: Props) {
  const [name, setName] = useState(savedName);
  const [roomCode, setRoomCode] = useState(initialRoom ?? '');
  const [packId, setPackId] = useState(PACKS[0].id);
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ roomId: string; playerId: string } | null>(null);
  const [state, setState] = useState<RoomState | null>(null);

  useEffect(() => {
    socket.on('room:state', setState);
    socket.connect();
    return () => {
      socket.off('room:state', setState);
      socket.emit('room:leave');
      socket.disconnect();
    };
  }, []);

  // Rejoin automatically if the connection drops and comes back.
  useEffect(() => {
    if (!session) return;
    const rejoin = () =>
      socket.emit('room:join', { roomId: session.roomId, name, key: playerKey }, (r) => {
        if (!r.ok) setError(r.error);
      });
    socket.io.on('reconnect', rejoin);
    return () => {
      socket.io.off('reconnect', rejoin);
    };
  }, [session, name]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (session) url.searchParams.set('sala', session.roomId);
    else url.searchParams.delete('sala');
    window.history.replaceState(null, '', url);
  }, [session]);

  function enter(kind: 'create' | 'join') {
    if (!name.trim()) return setError('Escribe tu nombre.');
    saveName(name.trim());
    setError('');
    const done = (err: Error | null, r: JoinResult) => {
      if (err) setError('No se pudo conectar con el servidor de salas. ¿Está corriendo?');
      else if (r.ok) setSession({ roomId: r.roomId, playerId: r.playerId });
      else setError(r.error);
    };
    const s = socket.timeout(5000);
    if (kind === 'create') s.emit('room:create', { name, key: playerKey, packId, rounds: ROUNDS_PER_GAME }, done);
    else s.emit('room:join', { roomId: roomCode.trim(), name, key: playerKey }, done);
  }

  if (session && state) {
    const pack = PACKS.find((p) => p.id === state.packId) ?? PACKS[0];
    return (
      <Room
        state={state}
        pack={pack}
        me={session.playerId}
        onLeave={() => {
          socket.emit('room:leave');
          setSession(null);
          setState(null);
          onExit();
        }}
      />
    );
  }

  return (
    <div className="panel stack">
      <h2>Multijugador</h2>
      <label className="field">
        Tu nombre
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="split">
        <div className="stack">
          <h3>Unirse a una sala</h3>
          <input
            placeholder="Código (ej. KQXM)"
            value={roomCode}
            maxLength={4}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          />
          <button disabled={roomCode.trim().length !== 4} onClick={() => enter('join')}>
            Unirse
          </button>
        </div>
        <div className="stack">
          <h3>Crear sala</h3>
          <select value={packId} onChange={(e) => setPackId(e.target.value)}>
            {PACKS.map((p) => (
              <option key={p.id} value={p.id} disabled={playableTracks(p).length === 0}>
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={() => enter('create')}>Crear sala</button>
        </div>
      </div>

      {error && <p className="fail">{error}</p>}
      <button className="secondary" onClick={onExit}>
        Volver
      </button>
    </div>
  );
}

function Room({ state, pack, me, onLeave }: { state: RoomState; pack: Pack; me: string; onLeave: () => void }) {
  const isHost = state.hostId === me;
  const [rounds, setRounds] = useState(state.rounds);
  const [chaos, setChaos] = useState(state.chaos);
  const maxRounds = Math.min(30, playableTracks(pack).length);

  return (
    <div className="room">
      <header className="game-header">
        <span>
          Sala <strong className="code">{state.id}</strong> · {pack.name}
        </span>
        <button className="secondary small" onClick={onLeave}>
          Salir
        </button>
      </header>

      <div className="room-layout">
        <div className="room-main">
          {state.phase === 'lobby' && (
            <div className="panel stack">
              <p>Comparte este link para que entren tus amigos:</p>
              <CopyLink roomId={state.id} />
              {isHost ? (
                <>
                  <label className="field">
                    Rondas
                    <input
                      type="number"
                      min={1}
                      max={maxRounds}
                      value={rounds}
                      onChange={(e) => setRounds(Number(e.target.value))}
                    />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={chaos} onChange={(e) => setChaos(e.target.checked)} />
                    🎲 Modo caos: cada pista suena en un momento distinto de la canción
                  </label>
                  <button onClick={() => socket.emit('game:start', { rounds, chaos })}>Empezar partida</button>
                </>
              ) : (
                <p className="muted">Esperando a que el anfitrión empiece…</p>
              )}
            </div>
          )}

          {(state.phase === 'loading' || state.phase === 'playing' || state.phase === 'reveal') && state.round && (
            <RoundView state={state} pack={pack} me={me} />
          )}

          {state.phase === 'finished' && (
            <div className="panel stack">
              <h2>🏆 {ranking(state.players)[0]?.name} gana</h2>
              {isHost ? (
                <button onClick={() => socket.emit('game:start', { rounds, chaos })}>Jugar de nuevo</button>
              ) : (
                <p className="muted">El anfitrión puede empezar otra partida.</p>
              )}
            </div>
          )}
        </div>

        <Scoreboard state={state} me={me} />
      </div>
    </div>
  );
}

function RoundView({ state, pack, me }: { state: RoomState; pack: Pack; me: string }) {
  const round = state.round!;
  const self = state.players.find((p) => p.id === me);
  const attempt = self?.attempt ?? 0;
  const myStatus = self?.status ?? 'failed';
  const [misses, setMisses] = useState<string[]>([]);
  const remaining = useCountdown(round.remainingMs);

  const player = useClipPlayer({
    onCued: () => socket.emit('round:ready'),
    // An unplayable video shouldn't block the room; the server's load timeout covers the rest.
    onError: () => socket.emit('round:ready'),
  });

  const options = useMemo(
    () => [...new Set(pack.tracks.map((t) => t.answer))].sort((a, b) => a.localeCompare(b, 'es')),
    [pack],
  );
  const clipAt = (i: number) =>
    round.spots ? chaosStart(round.spots[i], ATTEMPTS[i].seconds, player.duration()) : round.start;

  // New round: cue the video and reset local guesses.
  useEffect(() => {
    if (!player.ready) return;
    setMisses([]);
    player.load(round.youtubeId, round.start);
  }, [player.ready, round.index]);

  // Play a clip when the round starts and every time this player's attempt grows.
  useEffect(() => {
    if (state.phase === 'playing' && myStatus === 'guessing') player.playClip(clipAt(attempt), ATTEMPTS[attempt].seconds);
  }, [state.phase, attempt, round.index]);

  useEffect(() => {
    if (state.phase === 'reveal') player.playFrom(round.start);
  }, [state.phase, round.index]);

  const playing = state.phase === 'playing';
  const revealed = state.phase === 'reveal';

  return (
    <div className="game">
      <div className="game-header">
        <span>
          Ronda {round.index + 1}/{round.total}
          {round.spots && ' · 🎲 Caos'}
        </span>
        {playing && <span className={remaining <= 10 ? 'fail' : ''}>⏱ {remaining}s</span>}
      </div>

      <div className={`video-box ${revealed ? 'visible' : 'hidden'}`} ref={player.hostRef} />

      {state.phase === 'loading' && <p className="muted">Cargando canción…</p>}

      {playing && myStatus === 'guessing' && (
        <>
          <AttemptBar attempt={attempt} />
          <button
            className="play"
            disabled={!player.ready || player.playing}
            onClick={() => player.playClip(clipAt(attempt), ATTEMPTS[attempt].seconds)}
          >
            {player.playing ? 'Sonando…' : `▶ Escuchar ${ATTEMPTS[attempt].seconds}s`}
          </button>
          <Hints hints={round.hints} attempt={attempt} />
          <GuessInput
            options={options}
            placeholder={pack.guessPlaceholder}
            onSubmit={(text) =>
              socket.emit('round:guess', text, (r) => {
                if (!r.correct) setMisses((m) => [...m, `✗ ${text}`]);
              })
            }
          />
          <button
            className="secondary"
            onClick={() => {
              setMisses((m) => [...m, '⏭ Saltado']);
              socket.emit('round:skip');
            }}
          >
            Saltar (+{ATTEMPTS[attempt + 1]?.seconds ?? 0}s)
          </button>
        </>
      )}

      {playing && myStatus !== 'guessing' && (
        <p className={myStatus === 'solved' ? 'ok' : 'fail'}>
          {myStatus === 'solved' ? `¡Correcto! +${self?.roundPoints} pts` : 'Sin intentos'} — esperando al resto…
        </p>
      )}

      {misses.length > 0 && !revealed && (
        <ul className="misses">
          {misses.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {revealed && state.reveal && (
        <div className="reveal panel">
          <p className={myStatus === 'solved' ? 'ok' : 'fail'}>
            {myStatus === 'solved' ? `¡Correcto! +${self?.roundPoints} pts` : 'No era…'}
          </p>
          <h2>{state.reveal.answer}</h2>
          {state.reveal.credit && <p className="muted">{state.reveal.credit}</p>}
        </div>
      )}
    </div>
  );
}

function Scoreboard({ state, me }: { state: RoomState; me: string }) {
  const inRound = state.phase === 'playing' || state.phase === 'reveal';
  return (
    <aside className="panel scoreboard">
      <h3>Jugadores</h3>
      <ol>
        {ranking(state.players).map((p) => (
          <li key={p.id} className={`${p.id === me ? 'me' : ''} ${p.connected ? '' : 'offline'}`}>
            <span className="name">
              {p.id === state.hostId && '👑 '}
              {p.name}
            </span>
            {inRound && (
              <span className="progress" title="Progreso en la ronda">
                {p.status === 'solved' ? `✓ +${p.roundPoints}` : p.status === 'failed' ? '✗' : '·'.repeat(p.attempt + 1)}
              </span>
            )}
            <span className="score">{p.score}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function CopyLink({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?sala=${roomId}`;
  return (
    <div className="copy-link">
      <input readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        onClick={() =>
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}

function ranking(players: PublicPlayer[]) {
  return [...players].sort((a, b) => b.score - a.score);
}

/** Seconds left, counted locally from the server's remainingMs so clock skew doesn't matter. */
function useCountdown(remainingMs: number | null) {
  const endsAt = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    endsAt.current = remainingMs === null ? null : Date.now() + remainingMs;
  }, [remainingMs]);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  return endsAt.current === null ? 0 : Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
}
