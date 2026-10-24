import { describe, expect, it } from 'vitest';
import {
  deckClientReducer,
  initialDeckClientState,
  MAX_RECENT_BUTTONS,
  recentButtons,
  type DeckClientAction,
  type PublicDeckButton,
} from '../../src/core';

const run = (...actions: DeckClientAction[]) => actions.reduce(deckClientReducer, initialDeckClientState);
const button = (id: string): PublicDeckButton => ({ id, title: id, icon: null, tint: 'blue' });
const start = (id: string): DeckClientAction => ({ type: 'launch/started', id });

describe('launch feedback', () => {
  it('goes launching → done/failed → cleared', () => {
    expect(run(start('a')).launches).toEqual({ a: 'launching' });
    expect(run(start('a'), { type: 'launch/finished', id: 'a', ok: true }).launches).toEqual({ a: 'done' });
    expect(run(start('a'), { type: 'launch/finished', id: 'a', ok: false }).launches).toEqual({ a: 'failed' });
    expect(run(start('a'), { type: 'launch/cleared', id: 'a' }).launches).toEqual({});
  });
});

describe('recent buttons', () => {
  it('puts new buttons on top, keeps existing slots and caps the list', () => {
    expect(run(start('a'), start('b'), start('a')).recentIds).toEqual(['b', 'a']);
    expect(run(start('a'), start('b'), start('c'), start('d')).recentIds).toEqual(['d', 'c', 'b']);
    expect(run(start('a'), start('b'), start('c'), start('d')).recentIds).toHaveLength(MAX_RECENT_BUTTONS);
  });

  it('hides recents that were removed on the PC', () => {
    const state = run(start('a'), start('gone'), { type: 'buttons/received', buttons: [button('a')] });
    expect(recentButtons(state)).toEqual([button('a')]);
  });
});

describe('pairing', () => {
  it('tracks submit, rejection and acceptance', () => {
    expect(run({ type: 'pairing/submitted' }).pairing).toBe(true);
    const rejected = run({ type: 'pairing/submitted' }, { type: 'pairing/rejected', feedback: 'wrong-pin' });
    expect(rejected).toMatchObject({ pairing: false, pairingFeedback: 'wrong-pin' });
    const accepted = run({ type: 'connection/changed', status: 'unpaired' }, { type: 'pairing/accepted' });
    expect(accepted).toMatchObject({ pairing: false, pairingFeedback: null, status: 'connecting' });
  });
});
