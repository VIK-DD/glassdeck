// The Electron host API, exposed by electron/preload.ts.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DeckApi, DeckState } from '../core';

declare global {
  interface Window {
    deck: DeckApi;
  }
}

export const deck: DeckApi = window.deck;

/** Live host state; null until the first snapshot arrives. */
export function useDeckHostState(): DeckState | null {
  const [state, setState] = useState<DeckState | null>(null);
  useEffect(() => {
    let active = true;
    deck.getState().then((initial) => active && setState(initial));
    const unsubscribe = deck.onState(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** The config window follows the Windows light/dark setting. */
export function useSystemAppearance(): 'day' | 'night' {
  return useSyncExternalStore(
    (onChange) => {
      darkQuery.addEventListener('change', onChange);
      return () => darkQuery.removeEventListener('change', onChange);
    },
    () => (darkQuery.matches ? 'night' : 'day'),
  );
}
