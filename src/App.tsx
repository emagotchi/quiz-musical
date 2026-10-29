import { useCallback, useState } from 'react';
import type { Pack, Track } from './types';
import { PACKS, playableTracks } from './data/packs';
import { ATTEMPTS, ROUNDS_PER_GAME, pickTracks } from './lib/scoring';
import { Game, type RoundResult } from './components/Game';
import { Multiplayer } from './components/Multiplayer';
import { ThemeToggle } from './components/ThemeToggle';

type Screen =
  | { name: 'home' }
  | { name: 'multiplayer'; room: string | null }
  | { name: 'game'; pack: Pack; chaos: boolean; tracks: Track[]; key: number }
  | { name: 'summary'; pack: Pack; chaos: boolean; results: RoundResult[] };

function shareText(pack: Pack, chaos: boolean, results: RoundResult[]) {
  const total = results.reduce((s, r) => s + r.points, 0);
  const rows = results.map((r) =>
    ATTEMPTS.map((_, i) => (r.solvedAt === null || i < r.solvedAt ? '🟥' : i === r.solvedAt ? '🟩' : '⬛')).join(''),
  );
  return `Quiz ${pack.name}${chaos ? ' 🎲 modo caos' : ''} — ${total} pts\n${rows.join('\n')}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const room = new URLSearchParams(window.location.search).get('sala');
    return room ? { name: 'multiplayer', room: room.toUpperCase() } : { name: 'home' };
  });

  const start = (pack: Pack, chaos: boolean) =>
    setScreen({ name: 'game', pack, chaos, tracks: pickTracks(playableTracks(pack), ROUNDS_PER_GAME), key: Date.now() });

  const finish = useCallback(
    (results: RoundResult[]) => setScreen((s) => (s.name === 'game' ? { name: 'summary', pack: s.pack, chaos: s.chaos, results } : s)),
    [],
  );

  return (
    <main>
      <header className="app-header">
        <h1 onClick={() => screen.name !== 'multiplayer' && setScreen({ name: 'home' })}>Quiz Musical</h1>
        <ThemeToggle />
      </header>

      {screen.name === 'home' && (
        <div className="packs">
          <div className="pack">
            <h2>Multijugador</h2>
            <p className="muted">Crea una sala y juega con amigos en tiempo real.</p>
            <button onClick={() => setScreen({ name: 'multiplayer', room: null })}>Jugar con amigos</button>
          </div>
          {PACKS.map((pack) => {
            const count = playableTracks(pack).length;
            return (
              <div key={pack.id} className="pack">
                <h2>{pack.name}</h2>
                <p className="muted">{pack.description}</p>
                <p className="muted">{count} canciones</p>
                <div className="pack-actions">
                  <button disabled={count === 0} onClick={() => start(pack, false)}>
                    Jugar solo
                  </button>
                  <button
                    className="secondary"
                    disabled={count === 0}
                    title="Cada pista suena en un momento distinto de la canción, al azar"
                    onClick={() => start(pack, true)}
                  >
                    🎲 Modo caos
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {screen.name === 'multiplayer' && (
        <Multiplayer initialRoom={screen.room} onExit={() => setScreen({ name: 'home' })} />
      )}

      {screen.name === 'game' && (
        <Game key={screen.key} pack={screen.pack} chaos={screen.chaos} tracks={screen.tracks} onFinish={finish} />
      )}

      {screen.name === 'summary' && (
        <div className="summary">
          <h2>{screen.results.reduce((s, r) => s + r.points, 0)} pts</h2>
          <pre>{shareText(screen.pack, screen.chaos, screen.results)}</pre>
          <ul>
            {screen.results.map((r) => (
              <li key={r.track.id}>
                {r.solvedAt === null ? '✗' : '✓'} {r.track.answer} — {r.points} pts
              </li>
            ))}
          </ul>
          <button onClick={() => navigator.clipboard.writeText(shareText(screen.pack, screen.chaos, screen.results))}>Copiar resultado</button>
          <button onClick={() => start(screen.pack, screen.chaos)}>Jugar de nuevo</button>
        </div>
      )}
    </main>
  );
}
