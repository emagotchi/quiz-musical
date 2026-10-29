import { useEffect, useState } from 'react';
import type { Pack } from '../types';
import { PACKS } from '../data/packs';
import { ATTEMPTS } from '../lib/scoring';
import {
  dailyTrack,
  dayNumber,
  loadStats,
  saveAttempt,
  saveResult,
  secondsToNextDay,
  type DailyStats,
} from '../lib/daily';
import { Game } from './Game';

/** List of today's challenges, one per pack, with each streak. */
export function DailyHome({ onPlay }: { onPlay: (pack: Pack) => void }) {
  return (
    <div className="stack">
      <h2>Desafío diario #{dayNumber()}</h2>
      <p className="muted">
        Una canción al día, la misma para todos. Tu racha se guarda en este navegador, sin crear cuenta.
      </p>
      <div className="list">
        {PACKS.map((pack) => {
          const stats = loadStats(pack.id);
          const done = stats.today?.done;
          return (
            <button key={pack.id} className="row" onClick={() => onPlay(pack)} disabled={!dailyTrack(pack)}>
              <span className="row-title">{pack.name}</span>
              <span className="muted">
                {done ? (stats.today!.solvedAt !== null ? '✓ Resuelto' : '✗ Fallado') : 'Pendiente'}
                {stats.streak > 0 && ` · 🔥 ${stats.streak}`}
              </span>
            </button>
          );
        })}
      </div>
      <Countdown />
    </div>
  );
}

/** Plays today's track of a pack, or shows the result if it was already played. */
export function DailyGame({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const track = dailyTrack(pack)!;
  const [stats, setStats] = useState(() => loadStats(pack.id));
  const today = stats.today?.trackId === track.id ? stats.today : null;

  if (today?.done) return <DailyResult pack={pack} stats={stats} onBack={onBack} />;

  return (
    <Game
      pack={pack}
      tracks={[track]}
      chaos={false}
      heading={`Diario #${dayNumber()} · ${pack.name}`}
      initialAttempt={today?.attempt ?? 0}
      onAttempt={(attempt) => saveAttempt(pack.id, track.id, attempt)}
      // Saved the moment the round is decided, so reloading during the reveal can't give a second try.
      onRoundEnd={(result) => saveResult(pack.id, track.id, result.solvedAt)}
      onFinish={() => setStats(loadStats(pack.id))}
    />
  );
}

function DailyResult({ pack, stats, onBack }: { pack: Pack; stats: DailyStats; onBack: () => void }) {
  const track = dailyTrack(pack)!;
  const solvedAt = stats.today!.solvedAt;
  const [copied, setCopied] = useState(false);
  const squares = ATTEMPTS.map((_, i) => (solvedAt === null || i < solvedAt ? '🟥' : i === solvedAt ? '🟩' : '⬛')).join('');
  const share = [
    `Desafío diario #${dayNumber()} · ${pack.name}`,
    squares,
    stats.streak > 0 ? `🔥 Racha: ${stats.streak}` : '',
    window.location.origin,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="summary stack">
      <p className={solvedAt !== null ? 'ok' : 'fail'}>
        {solvedAt !== null ? `¡Lo sacaste con ${ATTEMPTS[solvedAt].seconds}s!` : 'Hoy no salió…'}
      </p>
      <h2>{track.answer}</h2>
      {track.credit && <p className="muted">{track.credit}</p>}
      <a href={`https://www.youtube.com/watch?v=${track.youtubeId}`} target="_blank" rel="noreferrer">
        Escuchar en YouTube ↗
      </a>
      <pre>{squares}</pre>
      <div className="stats">
        <Stat label="Racha" value={`🔥 ${stats.streak}`} />
        <Stat label="Mejor racha" value={stats.best} />
        <Stat label="Jugados" value={stats.played} />
        <Stat label="Aciertos" value={`${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%`} />
      </div>
      <Countdown />
      <div className="pack-actions">
        <button
          onClick={() =>
            navigator.clipboard.writeText(share).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? '¡Copiado!' : 'Copiar resultado'}
        </button>
        <button className="secondary" onClick={onBack}>
          Otros desafíos
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <small className="muted">{label}</small>
    </div>
  );
}

function Countdown() {
  const [left, setLeft] = useState(secondsToNextDay);
  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsToNextDay()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return (
    <p className="muted">
      Próximo desafío en {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </p>
  );
}
