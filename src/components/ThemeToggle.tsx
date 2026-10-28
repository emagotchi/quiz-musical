import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('mq-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // fall through to the OS preference
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('mq-theme', theme);
    } catch {
      // preference just won't persist
    }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="theme-toggle secondary small"
      aria-label={`Cambiar a modo ${next === 'light' ? 'día' : 'noche'}`}
      title={`Modo ${next === 'light' ? 'día' : 'noche'}`}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
