import { useCallback, useState } from 'react';
import type { Pack, Track } from './types';
import { PACKS, buildPack, type Selection } from './data/packs';
import { rememberSelection, savedSelection } from './lib/selection';
import { ATTEMPTS, ROUNDS_PER_GAME, pickTracks } from './lib/scoring';
import { dayNumber, loadStats } from './lib/daily';
import { Game, type RoundResult } from './components/Game';
import { Multiplayer } from './components/Multiplayer';
import { DailyGame, DailyHome } from './components/Daily';
import { PackPicker } from './components/PackPicker';
import { SongList } from './components/SongList';
import { ThemeToggle } from './components/ThemeToggle';
import { VolumeControl } from './components/VolumeControl';

type Screen =
  | { name: 'home' }
  | { name: 'daily' }
  | { name: 'daily-game'; pack: Pack }
  | { name: 'solo' }
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
  const [selection, setSelection] = useState<Selection>(savedSelection);
  const [chaos, setChaos] = useState(false);

  function changeSelection(next: Selection) {
    setSelection(next);
    rememberSelection(next);
  }

  const start = (pack: Pack, chaos: boolean) =>
    setScreen({ name: 'game', pack, chaos, tracks: pickTracks(pack.tracks, ROUNDS_PER_GAME), key: Date.now() });

  const finish = useCallback(
    (results: RoundResult[]) =>
      setScreen((s) => (s.name === 'game' ? { name: 'summary', pack: s.pack, chaos: s.chaos, results } : s)),
    [],
  );

  function goHome() {
    const inRoom = new URLSearchParams(window.location.search).has('sala');
    if (inRoom && !window.confirm('¿Salir de la sala?')) return;
    setScreen({ name: 'home' });
  }

  const soloPack = buildPack(selection);
  const bestStreak = Math.max(0, ...PACKS.map((p) => loadStats(p.id).streak));

  return (
    <main>
      <header className="app-header">
        <h1 onClick={goHome}>Quiz Musical</h1>
        <div className="header-tools">
          <VolumeControl />
          <ThemeToggle />
        </div>
      </header>

      {screen.name === 'home' && (
        <div className="modes">
          <button className="mode" onClick={() => setScreen({ name: 'daily' })}>
            <span className="mode-icon">📅</span>
            <strong>Desafío diario #{dayNumber()}</strong>
            <span className="muted">Una canción al día{bestStreak > 0 ? ` · 🔥 racha ${bestStreak}` : ''}</span>
          </button>
          <button className="mode" onClick={() => setScreen({ name: 'solo' })}>
            <span className="mode-icon">🎧</span>
            <strong>Solitario</strong>
            <span className="muted">{ROUNDS_PER_GAME} rondas a tu ritmo</span>
          </button>
          <button className="mode" onClick={() => setScreen({ name: 'multiplayer', room: null })}>
            <span className="mode-icon">👥</span>
            <strong>Multijugador</strong>
            <span className="muted">Crea una sala y juega con amigos</span>
          </button>
        </div>
      )}

      {screen.name === 'daily' && <DailyHome onPlay={(pack) => setScreen({ name: 'daily-game', pack })} />}

      {screen.name === 'daily-game' && (
        <DailyGame key={screen.pack.id} pack={screen.pack} onBack={() => setScreen({ name: 'daily' })} />
      )}

      {screen.name === 'solo' && (
        <div className="panel stack">
          <h2>Solitario</h2>
          <PackPicker value={selection} onChange={changeSelection} />
          <label className="check">
            <input type="checkbox" checked={chaos} onChange={(e) => setChaos(e.target.checked)} />
            🎲 Modo caos: cada pista suena en un momento distinto de la canción
          </label>
          <button disabled={soloPack.tracks.length === 0} onClick={() => start(soloPack, chaos)}>
            Jugar
          </button>
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
          <SongList
            items={screen.results.map((r) => ({
              ...r.track,
              mark: r.solvedAt === null ? '✗' : '✓',
              detail: `${r.points} pts`,
            }))}
          />
          <button onClick={() => navigator.clipboard.writeText(shareText(screen.pack, screen.chaos, screen.results))}>
            Copiar resultado
          </button>
          <button onClick={() => start(screen.pack, screen.chaos)}>Jugar de nuevo</button>
          <button className="secondary" onClick={() => setScreen({ name: 'solo' })}>
            Cambiar canciones
          </button>
        </div>
      )}
    </main>
  );
}
