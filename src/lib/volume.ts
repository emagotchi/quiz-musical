import { useEffect, useState } from 'react';

const KEY = 'mq-volume';
const listeners = new Set<(v: number) => void>();

function read() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && v >= 0 && v <= 100) return v;
  } catch {
    // default below
  }
  return 80;
}

let current = read();

export function getVolume() {
  return current;
}

export function setVolume(v: number) {
  current = Math.max(0, Math.min(100, Math.round(v)));
  try {
    localStorage.setItem(KEY, String(current));
  } catch {
    // just won't be remembered
  }
  listeners.forEach((l) => l(current));
}

/** Volume 0–100 shared by the slider and every player, remembered per browser. */
export function useVolume() {
  const [volume, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return volume;
}
