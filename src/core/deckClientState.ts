// Phone-side state: connection, buttons, pairing and per-button launch feedback.
// Pure reducer; the transport that feeds it lives with the platform (src/phone/deckClient.ts).
import type { PublicDeckButton } from './deck';

export type ConnectionStatus = 'connecting' | 'unpaired' | 'online' | 'offline';
export type LaunchStatus = 'launching' | 'done' | 'failed';
export type PairingFeedback = 'wrong-pin' | 'pin-reset' | 'unreachable';

/** Recently launched buttons shown in the sidebar, like CarPlay's recent apps. */
export const MAX_RECENT_BUTTONS = 3;

export interface DeckClientState {
  status: ConnectionStatus;
  buttons: readonly PublicDeckButton[];
  recentIds: readonly string[];
  launches: Readonly<Record<string, LaunchStatus>>;
  pairing: boolean;
  pairingFeedback: PairingFeedback | null;
}

export type DeckClientAction =
  | { type: 'connection/changed'; status: ConnectionStatus }
  | { type: 'buttons/received'; buttons: readonly PublicDeckButton[] }
  | { type: 'pairing/submitted' }
  | { type: 'pairing/rejected'; feedback: PairingFeedback }
  | { type: 'pairing/accepted' }
  | { type: 'launch/started'; id: string }
  | { type: 'launch/finished'; id: string; ok: boolean }
  | { type: 'launch/cleared'; id: string };

export const initialDeckClientState: DeckClientState = {
  status: 'connecting',
  buttons: [],
  recentIds: [],
  launches: {},
  pairing: false,
  pairingFeedback: null,
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
      return {
        ...state,
        launches: { ...state.launches, [action.id]: 'launching' },
        // Buttons already in the sidebar keep their slot so icons never move under the finger.
        recentIds: state.recentIds.includes(action.id)
          ? state.recentIds
          : [action.id, ...state.recentIds].slice(0, MAX_RECENT_BUTTONS),
      };
    case 'launch/finished':
      return { ...state, launches: { ...state.launches, [action.id]: action.ok ? 'done' : 'failed' } };
    case 'launch/cleared': {
      if (!(action.id in state.launches)) return state;
      const { [action.id]: _cleared, ...launches } = state.launches;
      return { ...state, launches };
    }
    default:
      return state;
  }
}

/** Recent buttons that still exist on the PC, in sidebar order. */
export function recentButtons(state: Pick<DeckClientState, 'recentIds' | 'buttons'>): PublicDeckButton[] {
  return state.recentIds
    .map((id) => state.buttons.find((button) => button.id === id))
    .filter((button): button is PublicDeckButton => button !== undefined);
}
