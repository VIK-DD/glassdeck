import { useCallback, useEffect, useState } from 'react';
import { formatClock } from '../ui/format';

const CLOCK_TICK_MS = 1000;

export function useClock(): string {
  const [time, setTime] = useState(() => formatClock(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setTime(formatClock(Date.now())), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return time;
}

/** Current time, re-rendering every `intervalMs` while `enabled` (e.g. only while music plays). */
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

/** Tracks an element's content size. Returns a callback ref, the size and the element itself. */
export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size, element] as const;
}

/** Browser fullscreen hides Chrome's address bar, which otherwise takes a big slice of a landscape phone. */
export function useFullscreen() {
  const [active, setActive] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggle = useCallback(() => {
    const request = active ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    request.catch(() => {
      // Refused by the browser (e.g. not triggered by a tap); nothing to do.
    });
  }, [active]);
  return { supported: document.fullscreenEnabled, active, toggle };
}
