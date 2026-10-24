// Persistent deck config (buttons + pairing token) in a JSON file under the user's app data folder.
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  cleanTitle,
  isDeckTint,
  isIconDataUrl,
  moveItem,
  parseDeckConfig,
  tintForIndex,
  type DeckButton,
  type DeckConfig,
} from '../src/core/deck';
import type { ButtonEdit } from '../src/core/deckApi';
import { safeEqual } from './pinGuard';

export interface NewButton {
  title: string;
  target: string;
  icon: string | null;
}

export type DeckStore = ReturnType<typeof createDeckStore>;

export function createDeckStore(filePath: string) {
  const listeners = new Set<() => void>();
  let config = load();

  function load(): DeckConfig {
    let text: string;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return save(freshConfig());
    }
    let parsed: DeckConfig | null = null;
    try {
      parsed = parseDeckConfig(JSON.parse(text));
    } catch {
      // Falls through to the backup below.
    }
    if (parsed) return parsed;
    // Never silently overwrite a file we can't read: keep a copy next to it, then start fresh.
    copyFileSync(filePath, `${filePath}.corrupt-${Date.now()}`);
    return save(freshConfig());
  }

  function save(next: DeckConfig): DeckConfig {
    mkdirSync(dirname(filePath), { recursive: true });
    const temp = `${filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, filePath);
    return next;
  }

  function commit(buttons: DeckButton[], token = config.token) {
    config = save({ version: 1, token, buttons });
    listeners.forEach((listener) => listener());
  }

  function indexOf(id: string) {
    return config.buttons.findIndex((button) => button.id === id);
  }

  return {
    get config(): DeckConfig {
      return config;
    },
    findButton(id: string): DeckButton | undefined {
      return config.buttons.find((button) => button.id === id);
    },
    isValidToken(candidate: string): boolean {
      return safeEqual(candidate, config.token);
    },
    addButtons(items: readonly NewButton[]) {
      if (items.length === 0) return;
      const added = items.map((item, i) => ({
        id: randomUUID(),
        title: cleanTitle(item.title),
        target: item.target,
        icon: isIconDataUrl(item.icon) ? item.icon : null,
        tint: tintForIndex(config.buttons.length + i),
      }));
      commit([...config.buttons, ...added]);
    },
    updateButton(id: string, edit: ButtonEdit) {
      if (indexOf(id) === -1) return;
      commit(
        config.buttons.map((button) =>
          button.id === id
            ? {
                ...button,
                title: edit.title !== undefined ? cleanTitle(edit.title) : button.title,
                tint: isDeckTint(edit.tint) ? edit.tint : button.tint,
              }
            : button,
        ),
      );
    },
    removeButton(id: string) {
      if (indexOf(id) === -1) return;
      commit(config.buttons.filter((button) => button.id !== id));
    },
    moveButton(id: string, offset: number) {
      const from = indexOf(id);
      if (from === -1) return;
      commit(moveItem(config.buttons, from, from + offset));
    },
    /** Invalidates every paired phone. */
    resetToken() {
      commit(config.buttons, newToken());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

function freshConfig(): DeckConfig {
  return { version: 1, token: newToken(), buttons: [] };
}
