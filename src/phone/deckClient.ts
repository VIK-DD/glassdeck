// Browser transport for the phone: talks to the Glassdeck server and feeds the core reducer.
// Auth lives in an HttpOnly cookie set at pairing, so the page never handles the token.
import {
  createStore,
  deckClientReducer,
  initialDeckClientState,
  parseAudioInfo,
  parseMediaInfo,
  parseObsInfo,
  parsePublicButtons,
  parseSystemInfo,
  type AudioTarget,
  type ConnectionStatus,
  type DeckClientAction,
  type DeckClientState,
  type MediaAction,
  type Store,
} from '../core';

const RETRY_MS = 3000;
const FEEDBACK_MS = 1500;
/** While a slider is dragged, send at most one volume change per target this often. */
const VOLUME_SEND_INTERVAL_MS = 80;
/** The server rejects POSTs without it, which blocks cross-site requests. */
const POST_HEADERS = { 'Content-Type': 'application/json', 'X-Deck-Client': '1' };

export type ClipOutcome = 'saved' | 'started' | 'failed';

export interface DeckIntents {
  pair(pin: string): void;
  launch(id: string): void;
  media(action: MediaAction): void;
  setVolume(target: AudioTarget, volume: number): void;
  setMute(target: AudioTarget, muted: boolean): void;
  setOutput(deviceId: string): void;
  saveClip(): Promise<ClipOutcome>;
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
  const volumeQueue = new Map<AudioTarget, { timer: ReturnType<typeof setTimeout>; latest: number | null }>();

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
    const source = new EventSource('api/events');
    events = source;
    source.addEventListener('open', () => setStatus('online'));
    // Every payload is validated before it reaches the UI.
    listen(source, 'buttons', (raw) => store.dispatch({ type: 'buttons/received', buttons: parsePublicButtons(raw) }));
    listen(source, 'media', (raw) => store.dispatch({ type: 'media/received', media: parseMediaInfo(raw), receivedAt: Date.now() }));
    listen(source, 'audio', (raw) => store.dispatch({ type: 'audio/received', audio: parseAudioInfo(raw) }));
    listen(source, 'system', (raw) => store.dispatch({ type: 'system/received', system: parseSystemInfo(raw) }));
    listen(source, 'obs', (raw) => store.dispatch({ type: 'obs/received', obs: parseObsInfo(raw) }));
    // EventSource can't report HTTP status, so on any error re-check the session (it may have been revoked).
    source.addEventListener('error', () => {
      source.close();
      if (events === source) events = null;
      goOffline();
    });
  }

  function goOffline() {
    if (!running) return;
    setStatus('offline');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  }

  /** POSTs a command; null when the PC can't be reached. Flags a revoked pairing. */
  async function post(path: string, body?: unknown): Promise<Response | null> {
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: POST_HEADERS,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401) setStatus('unpaired');
      return response;
    } catch {
      return null;
    }
  }

  function sendVolume(target: AudioTarget, volume: number) {
    void post('api/audio/volume', { target, volume });
    const timer = setTimeout(() => {
      const entry = volumeQueue.get(target);
      volumeQueue.delete(target);
      if (entry?.latest != null) sendVolume(target, entry.latest);
    }, VOLUME_SEND_INTERVAL_MS);
    volumeQueue.set(target, { timer, latest: null });
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
      const response = await post(`api/launch/${encodeURIComponent(id)}`);
      store.dispatch({ type: 'launch/finished', id, ok: response?.ok === true });
      setTimeout(() => store.dispatch({ type: 'launch/cleared', id }), FEEDBACK_MS);
    },
    media(action) {
      void post(`api/media/${action}`);
    },
    setVolume(target, volume) {
      const pending = volumeQueue.get(target);
      if (pending) pending.latest = volume;
      else sendVolume(target, volume);
    },
    setMute(target, muted) {
      void post('api/audio/mute', { target, muted });
    },
    setOutput(deviceId) {
      void post('api/audio/output', { deviceId });
    },
    async saveClip() {
      const response = await post('api/obs/clip');
      if (!response?.ok) return 'failed';
      const body: unknown = await response.json().catch(() => null);
      const result = typeof body === 'object' && body !== null ? (body as { result?: unknown }).result : null;
      return result === 'saved' || result === 'started' ? result : 'failed';
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
      volumeQueue.forEach(({ timer }) => clearTimeout(timer));
      volumeQueue.clear();
      events?.close();
      events = null;
    },
  };
}

function listen(source: EventSource, type: string, handle: (raw: unknown) => void) {
  source.addEventListener(type, (event) => {
    let raw: unknown = null;
    try {
      raw = JSON.parse((event as MessageEvent<string>).data);
    } catch {
      // Malformed frame: treated as "no data"; the next update replaces it.
    }
    handle(raw);
  });
}
