import type { ReactNode } from 'react';

interface Item {
  answer: string;
  youtubeId: string;
  credit?: string;
  mark: string;
  detail: ReactNode;
}

/** Songs that were played, each linking to its video to listen again. */
export function SongList({ items }: { items: Item[] }) {
  return (
    <ol className="song-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="mark">{item.mark}</span>
          <span className="song">
            <a href={`https://www.youtube.com/watch?v=${item.youtubeId}`} target="_blank" rel="noreferrer">
              {item.answer} ↗
            </a>
            {item.credit && <small className="muted">{item.credit}</small>}
          </span>
          <span className="detail muted">{item.detail}</span>
        </li>
      ))}
    </ol>
  );
}
