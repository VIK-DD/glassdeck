// Contract between the Electron host and the PC config window (exposed to the page by electron/preload.ts).
import type { DeckButton, DeckTint } from './deck';

export interface DeckState {
  buttons: DeckButton[];
  /** One-time PIN a phone enters to pair. */
  pin: string;
  /** Addresses the phone can open, one per network adapter. */
  phoneUrls: string[];
  connectedPhones: number;
}

export interface ButtonEdit {
  title?: string;
  tint?: DeckTint;
}

export interface DeckApi {
  getState(): Promise<DeckState>;
  /** Opens a file picker on the PC and adds the chosen apps. */
  addApps(): Promise<void>;
  updateButton(id: string, edit: ButtonEdit): Promise<void>;
  removeButton(id: string): Promise<void>;
  /** Moves a button by `offset` positions (negative = earlier). */
  moveButton(id: string, offset: number): Promise<void>;
  /** Forgets every paired phone and shows a new PIN. */
  resetPairing(): Promise<void>;
  onState(listener: (state: DeckState) => void): () => void;
}
