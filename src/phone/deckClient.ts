// Browser transport for the phone: talks to the deck server and feeds the core reducer.
// Auth lives in an HttpOnly cookie set at pairing, so the page never handles the token.
import {
  createStore,
  deckClientReducer,
  initialDeckClientState,
  parsePublicButtons,
  type ConnectionStatus,
  type DeckClientAction,
  type DeckClientState,
  type Store,
} from '../core';

const RETRY_MS = 3000;
const FEEDBACK_MS = 1500;
/** The server rejects POSTs without it, which blocks cross-site requests. */
const POST_HEADERS = { 'Content-Type': 'application/json', 'X-Deck-Client': '1' };

export interface DeckIntents {
  pair(pin: string): void;
  launch(id: string): void;
}

export interface DeckClient {
  store: Store<DeckClientState, DeckClientAction>;
  intents: DeckIntents;
  start(): void;
  stop(): void;
}

export function createDeckClient(): DeckClient {
  const store = createStore(deckClientReducer, initialDeckClientState);
  let events: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const setStatus = (status: ConnectionStatus) => store.dispatch({ type: 'connection/changed', status });

  async function connect() {
    clearTimeout(retryTimer);
    let response: Response;
    try {
      response = await fetch('api/session', { credentials: 'same-origin' });
    } catch {
      return goOffline();
    }
    if (!running) return;
    if (response.status === 401) return setStatus('unpaired');
    if (!response.ok) return goOffline();
    openEvents();
  }

  function openEvents() {
    events?.close();
    events = new EventSource('api/events');
    events.addEventListener('open', () => setStatus('online'));
    events.addEventListener('buttons', (event) => {
      let raw: unknown = null;
      try {
        raw = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        // Ignore a malformed frame; the next update replaces it.
      }
      store.dispatch({ type: 'buttons/received', buttons: parsePublicButtons(raw) });
    });
    // EventSource can't report HTTP status, so on any error re-check the session (it may have been revoked).
    events.addEventListener('error', () => {
      events?.close();
      events = null;
      goOffline();
    });
  }

  function goOffline() {
    if (!running) return;
    setStatus('offline');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  }

  const intents: DeckIntents = {
    async pair(pin) {
      store.dispatch({ type: 'pairing/submitted' });
      try {
        const response = await fetch('api/pair', { method: 'POST', headers: POST_HEADERS, body: JSON.stringify({ pin }) });
        if (response.ok) {
          store.dispatch({ type: 'pairing/accepted' });
          connect();
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        const reset = typeof body === 'object' && body !== null && (body as { error?: unknown }).error === 'pin-reset';
        store.dispatch({ type: 'pairing/rejected', feedback: reset ? 'pin-reset' : 'wrong-pin' });
      } catch {
        store.dispatch({ type: 'pairing/rejected', feedback: 'unreachable' });
      }
    },
    async launch(id) {
      if (store.getState().launches[id] === 'launching') return;
      store.dispatch({ type: 'launch/started', id });
      let ok = false;
      try {
        const response = await fetch(`api/launch/${encodeURIComponent(id)}`, { method: 'POST', headers: POST_HEADERS });
        ok = response.ok;
        if (response.status === 401) setStatus('unpaired');
      } catch {
        // Network failure: reported as a failed launch below.
      }
      store.dispatch({ type: 'launch/finished', id, ok });
      setTimeout(() => store.dispatch({ type: 'launch/cleared', id }), FEEDBACK_MS);
    },
  };

  return {
    store,
    intents,
    start() {
      if (running) return;
      running = true;
      connect();
    },
    stop() {
      running = false;
      clearTimeout(retryTimer);
      events?.close();
      events = null;
    },
  };
}
