import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pack } from '../types';
import { FIRST_BONUS, type ChatMessage, type JoinResult, type PublicPlayer, type RoomState } from '../shared/protocol';
import { answerOptions, buildPack, cleanSelection, type Selection } from '../data/packs';
import { ATTEMPTS, chaosStart } from '../lib/scoring';
import { playerKey, saveName, savedName, socket } from '../lib/socket';
import { useClipPlayer } from '../lib/useClipPlayer';
import { AttemptBar, Hints } from './AttemptBar';
import { Chat, useChatMessages } from './Chat';
import { GuessInput } from './GuessInput';
import { PackPicker } from './PackPicker';
import { SongList } from './SongList';
import { rememberSelection, savedSelection } from '../lib/selection';

interface Props {
  initialRoom: string | null;
  onExit: () => void;
}

/** Entry screen: pick a name, then create or join a room. */
export function Multiplayer({ initialRoom, onExit }: Props) {
  const [name, setName] = useState(savedName);
  const [roomCode, setRoomCode] = useState(initialRoom ?? '');
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ roomId: string; playerId: string } | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const chat = useChatMessages();

  useEffect(() => {
    const kicked = () => {
      setSession(null);
      setState(null);
      setError('El anfitrión te sacó de la sala.');
    };
    socket.on('room:state', setState);
    socket.on('room:kicked', kicked);
    socket.connect();
    return () => {
      socket.off('room:state', setState);
      socket.off('room:kicked', kicked);
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
    if (kind === 'create') s.emit('room:create', { name, key: playerKey }, done);
    else s.emit('room:join', { roomId: roomCode.trim(), name, key: playerKey }, done);
  }

  if (session && state) {
    return (
      <Room
        state={state}
        me={session.playerId}
        chat={chat.messages}
        onLeave={() => {
          socket.emit('room:leave');
          setSession(null);
          setState(null);
          chat.clear();
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
          <p className="muted">Las canciones se eligen dentro de la sala.</p>
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

interface RoomProps {
  state: RoomState;
  me: string;
  chat: ChatMessage[];
  onLeave: () => void;
}

function Room({ state, me, chat, onLeave }: RoomProps) {
  const isHost = state.hostId === me;
  const pack = useMemo(() => buildPack(cleanSelection(state.selection)), [state.selection]);

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
              <p className="muted">⚡ Quien adivine primero en cada ronda gana +{FIRST_BONUS} pts extra.</p>
              <CopyLink roomId={state.id} />
              {isHost ? (
                <HostSettings state={state} label="Empezar partida" />
              ) : (
                <p className="muted">Esperando a que el anfitrión empiece…</p>
              )}
            </div>
          )}

          {(state.phase === 'loading' || state.phase === 'playing' || state.phase === 'reveal') && state.round && (
            <RoundView state={state} pack={pack} me={me} isHost={isHost} />
          )}

          {state.phase === 'finished' && (
            <>
              <FinalSummary state={state} me={me} />
              <div className="panel stack">
                {isHost ? (
                  <HostSettings state={state} label="Jugar de nuevo" />
                ) : (
                  <p className="muted">El anfitrión puede empezar otra partida.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="room-side">
          <Scoreboard state={state} me={me} isHost={isHost} />
          <Chat messages={chat} me={me} />
        </div>
      </div>
    </div>
  );
}

/** Songs, rounds and chaos mode, chosen by the host before each game. */
function HostSettings({ state, label }: { state: RoomState; label: string }) {
  const [selection, setSelection] = useState<Selection>(() =>
    state.history.length ? cleanSelection(state.selection) : savedSelection(),
  );
  const [rounds, setRounds] = useState(state.rounds);
  const [chaos, setChaos] = useState(state.chaos);
  const available = buildPack(selection).tracks.length;
  const maxRounds = Math.min(30, available);

  return (
    <>
      <h3>Canciones</h3>
      <PackPicker
        value={selection}
        onChange={(next) => {
          setSelection(next);
          rememberSelection(next);
        }}
      />
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
      <button
        disabled={available === 0}
        onClick={() => socket.emit('game:start', { rounds: Math.min(rounds, maxRounds), chaos, selection })}
      >
        {label}
      </button>
    </>
  );
}

/** Podium plus every song of the game, with who got it. */
function FinalSummary({ state, me }: { state: RoomState; me: string }) {
  // Same score, same place: a tie is shown as a tie instead of whoever joined first winning.
  const placed = ranking(state.players).map((p) => ({
    ...p,
    place: 1 + state.players.filter((o) => o.score > p.score).length,
    firsts: state.history.filter((r) => r.results.some((x) => x.playerId === p.id && x.first)).length,
  }));
  const podium = placed.filter((p) => p.place <= 3);
  const winners = placed.filter((p) => p.place === 1);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="panel stack">
      <h2>
        {winners.length > 1
          ? `🤝 Empate: ${winners.map((p) => p.name).join(' y ')}`
          : `🏆 ${winners[0]?.name} gana`}
      </h2>
      <ol className="podium">
        {podium.map((p) => (
          <li key={p.id} className={`place-${p.place} ${p.id === me ? 'me' : ''}`}>
            <span className="medal">{medals[p.place - 1]}</span>
            <strong>{p.name}</strong>
            <span>{p.score} pts</span>
            <small className="muted">
              {p.firsts > 0
                ? `${p.score - p.firsts * FIRST_BONUS} + ⚡ ${p.firsts * FIRST_BONUS} por ser primero`
                : 'sin bonus ⚡'}
            </small>
          </li>
        ))}
      </ol>
      <h3>Canciones de la partida</h3>
      <SongList
        items={state.history.map((r) => {
          const mine = r.results.find((x) => x.playerId === me);
          const solvers = r.results.filter((x) => x.solved);
          const first = r.results.find((x) => x.first);
          return {
            ...r,
            mark: mine?.solved ? (mine.first ? '⚡' : '✓') : '✗',
            detail: solvers.length
              ? `${solvers.length}/${r.results.length} la sacaron${first ? ` · ⚡ ${first.name}` : ''}`
              : 'Nadie la sacó',
          };
        })}
      />
    </div>
  );
}

function RoundView({ state, pack, me, isHost }: { state: RoomState; pack: Pack; me: string; isHost: boolean }) {
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

  const options = useMemo(() => answerOptions(pack), [pack]);
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

      {isHost && (state.phase === 'loading' || state.phase === 'playing') && (
        <button
          className="secondary small host-skip"
          title="Termina la ronda para todos, por ejemplo si el video no carga"
          onClick={() => window.confirm('¿Terminar esta ronda para todos?') && socket.emit('host:skip')}
        >
          👑 Terminar ronda
        </button>
      )}

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
          {myStatus === 'solved' ? `¡Correcto! +${self?.roundPoints} pts${firstNote(self)}` : 'Sin intentos'} — esperando al resto…
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
            {myStatus === 'solved' ? `¡Correcto! +${self?.roundPoints} pts${firstNote(self)}` : 'No era…'}
          </p>
          <h2>{state.reveal.answer}</h2>
          {state.reveal.credit && <p className="muted">{state.reveal.credit}</p>}
        </div>
      )}
    </div>
  );
}

function Scoreboard({ state, me, isHost }: { state: RoomState; me: string; isHost: boolean }) {
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
                {p.status === 'solved' ? `${p.first ? '⚡' : '✓'} +${p.roundPoints}` : p.status === 'failed' ? '✗' : '·'.repeat(p.attempt + 1)}
              </span>
            )}
            <span className="score">{p.score}</span>
            {isHost && p.id !== me && (
              <button
                className="kick"
                title={`Sacar a ${p.name} de la sala`}
                aria-label={`Sacar a ${p.name}`}
                onClick={() => window.confirm(`¿Sacar a ${p.name} de la sala?`) && socket.emit('host:kick', p.id)}
              >
                ✕
              </button>
            )}
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

function firstNote(player: PublicPlayer | undefined) {
  return player?.first ? ` (⚡ incluye +${FIRST_BONUS} por ser primero)` : '';
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
