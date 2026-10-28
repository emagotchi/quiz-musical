import { useEffect, useMemo, useState } from 'react';
import type { Pack, Track } from '../types';
import { ATTEMPTS, isCorrect } from '../lib/scoring';
import { useClipPlayer } from '../lib/useClipPlayer';
import { GuessInput } from './GuessInput';
import { AttemptBar, Hints } from './AttemptBar';

export interface RoundResult {
  track: Track;
  /** Index of the attempt that guessed right, or null if missed. */
  solvedAt: number | null;
  points: number;
}

interface Props {
  pack: Pack;
  tracks: Track[];
  onFinish: (results: RoundResult[]) => void;
}

type Miss = { kind: 'wrong'; guess: string } | { kind: 'skip' };

export function Game({ pack, tracks, onFinish }: Props) {
  const [queue, setQueue] = useState(tracks);
  const [round, setRound] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<RoundResult[]>([]);

  const track = queue[round];
  const player = useClipPlayer({
    onError: (code) => {
      // 100: removed, 101/150: embedding disabled. Drop the track and move on.
      console.warn(`Video ${track?.youtubeId} no disponible (error ${code}), se omite.`);
      setQueue((q) => q.filter((_, i) => i !== round));
    },
  });

  const options = useMemo(
    () => [...new Set(pack.tracks.map((t) => t.answer))].sort((a, b) => a.localeCompare(b, 'es')),
    [pack],
  );

  useEffect(() => {
    if (player.ready && track) player.load(track.youtubeId, track.start);
  }, [player.ready, track]);

  useEffect(() => {
    if (round >= queue.length && results.length > 0) onFinish(results);
  }, [round, queue.length, results, onFinish]);

  if (!track) return <p className="muted">No quedan canciones disponibles.</p>;

  const total = results.reduce((s, r) => s + r.points, 0);
  const step = ATTEMPTS[attempt];

  function finishRound(solvedAt: number | null) {
    setResults((r) => [...r, { track, solvedAt, points: solvedAt === null ? 0 : ATTEMPTS[solvedAt].points }]);
    setRevealed(true);
    player.playFrom(track.start);
  }

  function miss(m: Miss) {
    setMisses((ms) => [...ms, m]);
    if (attempt + 1 >= ATTEMPTS.length) return finishRound(null);
    setAttempt(attempt + 1);
    player.playClip(track.start, ATTEMPTS[attempt + 1].seconds);
  }

  function guess(text: string) {
    if (isCorrect(text, track)) finishRound(attempt);
    else miss({ kind: 'wrong', guess: text });
  }

  function next() {
    player.stop();
    setRevealed(false);
    setAttempt(0);
    setMisses([]);
    setRound(round + 1);
  }

  const last = results[results.length - 1];

  return (
    <div className="game">
      <header className="game-header">
        <span>
          Ronda {round + 1}/{queue.length}
        </span>
        <span>{total} pts</span>
      </header>

      <div className={`video-box ${revealed ? 'visible' : 'hidden'}`} ref={player.hostRef} />

      {!revealed ? (
        <>
          <AttemptBar attempt={attempt} />

          <button
            className="play"
            disabled={!player.ready || player.playing}
            onClick={() => player.playClip(track.start, step.seconds)}
          >
            {player.playing ? 'Sonando…' : `▶ Escuchar ${step.seconds}s`}
          </button>

          <Hints hints={track.hints} attempt={attempt} />

          <GuessInput options={options} placeholder={`Escribe el nombre de la ${pack.answerLabel}…`} onSubmit={guess} />
          <button className="secondary" onClick={() => miss({ kind: 'skip' })}>
            Saltar (+{ATTEMPTS[attempt + 1]?.seconds ?? 0}s)
          </button>

          {misses.length > 0 && (
            <ul className="misses">
              {misses.map((m, i) => (
                <li key={i}>{m.kind === 'skip' ? '⏭ Saltado' : `✗ ${m.guess}`}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="reveal">
          <p className={last?.solvedAt !== null ? 'ok' : 'fail'}>
            {last?.solvedAt !== null ? `¡Correcto! +${last.points} pts` : 'No era…'}
          </p>
          <h2>{track.answer}</h2>
          {track.credit && <p className="muted">{track.credit}</p>}
          <button onClick={next}>{round + 1 < queue.length ? 'Siguiente' : 'Ver resultados'}</button>
        </div>
      )}
    </div>
  );
}
