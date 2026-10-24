import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeckStore } from '../../electron/deckStore';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deck-store-'));
  file = join(dir, 'deck.json');
});

const app = (title: string) => ({ title, target: `C:\\${title}.exe`, icon: null });

describe('deck store', () => {
  it('creates and persists a token on first run', () => {
    const store = createDeckStore(file);
    expect(existsSync(file)).toBe(true);
    expect(createDeckStore(file).config.token).toBe(store.config.token);
  });

  it('persists button edits across restarts and notifies listeners', () => {
    const store = createDeckStore(file);
    const listener = vi.fn();
    store.subscribe(listener);
    store.addButtons([app('One'), app('Two'), app('Three')]);
    const [one, two, three] = store.config.buttons;
    store.updateButton(two.id, { title: 'Second', tint: 'purple' });
    store.moveButton(three.id, -2);
    store.removeButton(one.id);

    const reloaded = createDeckStore(file).config.buttons;
    expect(reloaded.map((b) => b.title)).toEqual(['Three', 'Second']);
    expect(reloaded[1].tint).toBe('purple');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('invalidates the old token on reset', () => {
    const store = createDeckStore(file);
    const old = store.config.token;
    store.resetToken();
    expect(store.isValidToken(old)).toBe(false);
    expect(store.isValidToken(store.config.token)).toBe(true);
  });

  it('backs up an unreadable config instead of overwriting it', () => {
    writeFileSync(file, '{ not json');
    const store = createDeckStore(file);
    expect(store.config.buttons).toEqual([]);
    const backup = readdirSync(dir).find((name) => name.startsWith('deck.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(readFileSync(join(dir, backup!), 'utf8')).toBe('{ not json');
  });
});
