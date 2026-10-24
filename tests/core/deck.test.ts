import { describe, expect, it } from 'vitest';
import { moveItem, paginate, parseDeckConfig, parsePublicButtons, titleFromPath, toPublicButton } from '../../src/core';

const TOKEN = 'ab'.repeat(32);
const ICON = 'data:image/png;base64,iVBORw0KGgo=';

describe('parseDeckConfig', () => {
  it('keeps valid buttons and drops invalid ones', () => {
    const config = parseDeckConfig({
      version: 1,
      token: TOKEN,
      buttons: [
        { id: 'a', title: ' Spotify ', target: 'C:\\Spotify.exe', icon: ICON, tint: 'green' },
        { id: 'b', title: 'No target', target: '', icon: null, tint: 'blue' },
        { id: 'bad id!', title: 'X', target: 'C:\\x.exe' },
        { id: 'c', title: 'Odd', target: 'C:\\odd.exe', icon: 'javascript:alert(1)', tint: 'neon' },
      ],
    });
    expect(config?.buttons).toEqual([
      { id: 'a', title: 'Spotify', target: 'C:\\Spotify.exe', icon: ICON, tint: 'green' },
      { id: 'c', title: 'Odd', target: 'C:\\odd.exe', icon: null, tint: 'gray' },
    ]);
  });

  it('rejects a config without a valid token', () => {
    expect(parseDeckConfig({ token: 'short', buttons: [] })).toBeNull();
    expect(parseDeckConfig(null)).toBeNull();
  });
});

describe('public buttons', () => {
  it('never exposes the target path to the phone', () => {
    expect(toPublicButton({ id: 'a', title: 'A', target: 'C:\\secret.exe', icon: null, tint: 'red' })).not.toHaveProperty(
      'target',
    );
  });

  it('validates buttons received from the network', () => {
    expect(parsePublicButtons([{ id: 'a', title: 'A', icon: 'http://evil/x.png', tint: 'red' }, 'junk'])).toEqual([
      { id: 'a', title: 'A', icon: null, tint: 'red' },
    ]);
    expect(parsePublicButtons({ not: 'an array' })).toEqual([]);
  });
});

describe('helpers', () => {
  it('derives a title from a Windows path', () => {
    expect(titleFromPath('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Discord.lnk')).toBe('Discord');
    expect(titleFromPath('D:/Games/Counter-Strike 2.url')).toBe('Counter-Strike 2');
  });

  it('paginates into fixed-size pages, always returning at least one', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 8)).toEqual([[]]);
  });

  it('moves an item and clamps at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 10)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, -5)).toEqual(['b', 'a', 'c']);
  });
});
