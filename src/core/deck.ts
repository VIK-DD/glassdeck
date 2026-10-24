// Shared deck model: what a button is, how stored and received data is validated, how buttons are laid out.
// Used by the Electron host (Node), the phone UI and the PC config UI, so it stays free of platform APIs.
import { clamp } from './util/math';

export const DECK_TINTS = ['blue', 'green', 'red', 'orange', 'purple', 'gray', 'graphite'] as const;
export type DeckTint = (typeof DECK_TINTS)[number];

export interface DeckButton {
  id: string;
  title: string;
  /** What the PC opens: an .exe, a shortcut (.lnk) or an internet shortcut (.url). Never sent to the phone. */
  target: string;
  /** PNG data URL of the app's own icon, when one could be read. */
  icon: string | null;
  tint: DeckTint;
}

/** The part of a button the phone sees. */
export type PublicDeckButton = Omit<DeckButton, 'target'>;

export interface DeckConfig {
  version: 1;
  /** Secret shared with paired phones (kept in their cookie). */
  token: string;
  buttons: DeckButton[];
}

export const MAX_TITLE_LENGTH = 32;
const MAX_ICON_LENGTH = 256 * 1024;
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const ICON_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDeckTint(value: unknown): value is DeckTint {
  return typeof value === 'string' && (DECK_TINTS as readonly string[]).includes(value);
}

export function isIconDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ICON_LENGTH && ICON_PATTERN.test(value);
}

export function isDeckToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) || 'App';
}

/** "C:\…\Spotify.lnk" → "Spotify". Handles both path separators so it works on any platform. */
export function titleFromPath(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? '';
  return cleanTitle(file.replace(/\.[^.]*$/, ''));
}

/** New buttons get colours in palette order so neighbours differ. */
export function tintForIndex(index: number): DeckTint {
  return DECK_TINTS[index % DECK_TINTS.length];
}

export function toPublicButton(button: DeckButton): PublicDeckButton {
  return { id: button.id, title: button.title, icon: button.icon, tint: button.tint };
}

export function parsePublicButton(raw: unknown): PublicDeckButton | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || typeof raw.title !== 'string') {
    return null;
  }
  return {
    id: raw.id,
    title: cleanTitle(raw.title),
    icon: isIconDataUrl(raw.icon) ? raw.icon : null,
    tint: isDeckTint(raw.tint) ? raw.tint : 'gray',
  };
}

export function parsePublicButtons(raw: unknown): PublicDeckButton[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePublicButton).filter((button): button is PublicDeckButton => button !== null);
}

/** Validates a stored config. Invalid buttons are dropped; an invalid envelope returns null. */
export function parseDeckConfig(raw: unknown): DeckConfig | null {
  if (!isRecord(raw) || !isDeckToken(raw.token) || !Array.isArray(raw.buttons)) return null;
  const buttons = raw.buttons.flatMap((item): DeckButton[] => {
    const button = parsePublicButton(item);
    if (!button || !isRecord(item) || typeof item.target !== 'string' || item.target === '') return [];
    return [{ ...button, target: item.target }];
  });
  return { version: 1, token: raw.token, buttons };
}

/** Splits items into pages of `perPage` (at least one page, even when empty). */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length > 0 ? pages : [[]];
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= items.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(clamp(to, 0, next.length), 0, item);
  return next;
}
