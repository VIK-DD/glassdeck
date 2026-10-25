// Phone-side state: connection, pairing, buttons with launch feedback, and the live PC state.
// Pure reducer; the transport that feeds it lives with the platform (src/phone/deckClient.ts).
import type { PublicDeckButton } from './deck';
import type { AudioInfo, MediaInfo, ObsInfo, SystemInfo } from './pc';

export type ConnectionStatus = 'connecting' | 'unpaired' | 'online' | 'offline';
export type LaunchStatus = 'launching' | 'done' | 'failed';
export type PairingFeedback = 'wrong-pin' | 'pin-reset' | 'unreachable';

/** Samples kept for the System page charts (one per second). */
export const HISTORY_LENGTH = 60;

export interface SystemHistory {
  cpu: readonly number[];
  gpu: readonly number[];
  gpuTemp: readonly number[];
}

export interface DeckClientState {
  status: ConnectionStatus;
  buttons: readonly PublicDeckButton[];
  launches: Readonly<Record<string, LaunchStatus>>;
  pairing: boolean;
  pairingFeedback: PairingFeedback | null;
  media: MediaInfo | null;
  /** Phone clock time the media snapshot arrived, for extrapolating the playback position. */
  mediaReceivedAt: number;
  audio: AudioInfo | null;
  system: SystemInfo | null;
  systemHistory: SystemHistory;
  obs: ObsInfo | null;
}

export type DeckClientAction =
  | { type: 'connection/changed'; status: ConnectionStatus }
  | { type: 'buttons/received'; buttons: readonly PublicDeckButton[] }
  | { type: 'pairing/submitted' }
  | { type: 'pairing/rejected'; feedback: PairingFeedback }
  | { type: 'pairing/accepted' }
  | { type: 'launch/started'; id: string }
  | { type: 'launch/finished'; id: string; ok: boolean }
  | { type: 'launch/cleared'; id: string }
  | { type: 'media/received'; media: MediaInfo | null; receivedAt: number }
  | { type: 'audio/received'; audio: AudioInfo | null }
  | { type: 'system/received'; system: SystemInfo | null }
  | { type: 'obs/received'; obs: ObsInfo | null };

const EMPTY_HISTORY: SystemHistory = { cpu: [], gpu: [], gpuTemp: [] };

export const initialDeckClientState: DeckClientState = {
  status: 'connecting',
  buttons: [],
  launches: {},
  pairing: false,
  pairingFeedback: null,
  media: null,
  mediaReceivedAt: 0,
  audio: null,
  system: null,
  systemHistory: EMPTY_HISTORY,
  obs: null,
};

export function deckClientReducer(state: DeckClientState, action: DeckClientAction): DeckClientState {
  switch (action.type) {
    case 'connection/changed':
      return action.status === state.status ? state : { ...state, status: action.status };
    case 'buttons/received':
      return { ...state, buttons: action.buttons };
    case 'pairing/submitted':
      return { ...state, pairing: true, pairingFeedback: null };
    case 'pairing/rejected':
      return { ...state, pairing: false, pairingFeedback: action.feedback };
    case 'pairing/accepted':
      return { ...state, pairing: false, pairingFeedback: null, status: 'connecting' };
    case 'launch/started':
      return { ...state, launches: { ...state.launches, [action.id]: 'launching' } };
    case 'launch/finished':
      return { ...state, launches: { ...state.launches, [action.id]: action.ok ? 'done' : 'failed' } };
    case 'launch/cleared': {
      if (!(action.id in state.launches)) return state;
      const { [action.id]: _cleared, ...launches } = state.launches;
      return { ...state, launches };
    }
    case 'media/received':
      return { ...state, media: action.media, mediaReceivedAt: action.receivedAt };
    case 'audio/received':
      return { ...state, audio: action.audio };
    case 'system/received':
      return { ...state, system: action.system, systemHistory: appendHistory(state.systemHistory, action.system) };
    case 'obs/received':
      return { ...state, obs: action.obs };
    default:
      return state;
  }
}

function appendHistory(history: SystemHistory, system: SystemInfo | null): SystemHistory {
  if (!system) return history;
  const push = (values: readonly number[], value: number) => [...values, value].slice(-HISTORY_LENGTH);
  return {
    cpu: push(history.cpu, system.cpuLoad),
    gpu: system.gpu ? push(history.gpu, system.gpu.load) : history.gpu,
    gpuTemp: system.gpu ? push(history.gpuTemp, system.gpu.temperatureC) : history.gpuTemp,
  };
}
