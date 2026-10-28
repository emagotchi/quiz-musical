import { useMemo, useState } from 'react';
import { normalize } from '../lib/scoring';

interface Props {
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onSubmit: (guess: string) => void;
}

/** Text input with autocomplete over the pack's answers. */
export function GuessInput({ options, placeholder, disabled, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const q = normalize(text);
    if (!q) return [];
    return options.filter((o) => normalize(o).includes(q)).slice(0, 8);
  }, [text, options]);

  function submit(value: string) {
    if (!value.trim()) return;
    onSubmit(value);
    setText('');
    setHighlight(0);
  }

  return (
    <div className="guess-input">
      <input
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            submit(matches[highlight] ?? text);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="suggestions">
          {matches.map((m, i) => (
            <li
              key={m}
              className={i === highlight ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(m);
              }}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
