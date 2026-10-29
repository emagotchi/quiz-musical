import { setVolume, useVolume } from '../lib/volume';

export function VolumeControl() {
  const volume = useVolume();
  return (
    <label className="volume" title={`Volumen ${volume}%`}>
      <span aria-hidden>{volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        aria-label="Volumen"
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </label>
  );
}
