import { useCallback, useEffect, useRef, useState } from 'react';
import { useVolume } from './volume';

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.YT?.Player) return resolve();
      const w = window as Window & { onYouTubeIframeAPIReady?: () => void };
      w.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

/**
 * Wraps the official YouTube IFrame player to play exact-length clips.
 * The iframe lives inside `hostRef`; the caller decides whether that box is collapsed or visible.
 */
export function useClipPlayer(callbacks: { onError: (code: number) => void; onCued?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const pollRef = useRef<number>();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const volume = useVolume();

  // Phones may ignore this (iOS only obeys the hardware buttons).
  useEffect(() => {
    if (ready) playerRef.current?.setVolume(volume);
  }, [ready, volume]);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const el = document.createElement('div');
      hostRef.current.appendChild(el);
      playerRef.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.CUED) callbacksRef.current.onCued?.();
          },
          onError: (e) => callbacksRef.current.onError(e.data),
        },
      });
    });
    return () => {
      cancelled = true;
      window.clearInterval(pollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    window.clearInterval(pollRef.current);
    stopAtRef.current = null;
    playerRef.current?.pauseVideo();
  }, []);

  const load = useCallback(
    (videoId: string, start: number) => {
      stop();
      playerRef.current?.cueVideoById({ videoId, startSeconds: start });
    },
    [stop],
  );

  /** Plays `seconds` of audio from `start`. Measured with the video clock so buffering doesn't eat the clip. */
  const playClip = useCallback(
    (start: number, seconds: number) => {
      const p = playerRef.current;
      if (!p) return;
      stop();
      p.seekTo(start, true);
      p.playVideo();
      stopAtRef.current = start + seconds;
      pollRef.current = window.setInterval(() => {
        if (stopAtRef.current !== null && p.getCurrentTime() >= stopAtRef.current) {
          stop();
          p.seekTo(start, true);
        }
      }, 50);
    },
    [stop],
  );

  const playFrom = useCallback(
    (start: number) => {
      stop();
      playerRef.current?.seekTo(start, true);
      playerRef.current?.playVideo();
    },
    [stop],
  );

  /** Length of the loaded video in seconds, or 0 while YouTube doesn't know it yet. */
  const duration = useCallback(() => playerRef.current?.getDuration() ?? 0, []);

  return { hostRef, ready, playing, load, playClip, playFrom, stop, duration };
}
