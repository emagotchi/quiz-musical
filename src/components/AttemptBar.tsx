import type { Hint } from '../types';
import { ATTEMPTS } from '../lib/scoring';

export function AttemptBar({ attempt }: { attempt: number }) {
  return (
    <div className="attempts">
      {ATTEMPTS.map((a, i) => (
        <div key={i} className={`attempt ${i < attempt ? 'used' : i === attempt ? 'current' : ''}`}>
          <strong>{a.seconds}s</strong>
          <small>{a.points} pts</small>
        </div>
      ))}
    </div>
  );
}

export function Hints({ hints, attempt }: { hints: Hint[]; attempt: number }) {
  const count = ATTEMPTS[attempt]?.hints ?? 0;
  if (count === 0) return null;
  return (
    <ul className="hints">
      {hints.slice(0, count).map((h) => (
        <li key={h.label}>
          <strong>{h.label}:</strong> {h.value}
        </li>
      ))}
    </ul>
  );
}
