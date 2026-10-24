// React adapter over the deck client: the only place phone views meet the store.
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { DeckClientState } from '../core';
import type { DeckClient, DeckIntents } from './deckClient';

const DeckClientContext = createContext<DeckClient | null>(null);

export function DeckClientProvider({ client, children }: { client: DeckClient; children: ReactNode }) {
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  return <DeckClientContext.Provider value={client}>{children}</DeckClientContext.Provider>;
}

function useDeckClient(): DeckClient {
  const client = useContext(DeckClientContext);
  if (!client) throw new Error('useDeckClient must be used inside <DeckClientProvider>');
  return client;
}

/** Selectors must return existing state references or primitives, never freshly built objects. */
export function useDeckState<T>(selector: (state: DeckClientState) => T): T {
  const { store } = useDeckClient();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function useDeckIntents(): DeckIntents {
  return useDeckClient().intents;
}
