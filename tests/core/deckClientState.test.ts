import { describe, expect, it } from 'vitest';
import {
  deckClientReducer,
  HISTORY_LENGTH,
  initialDeckClientState,
  type DeckClientAction,
  type SystemInfo,
} from '../../src/core';

const run = (...actions: DeckClientAction[]) => actions.reduce(deckClientReducer, initialDeckClientState);
const start = (id: string): DeckClientAction => ({ type: 'launch/started', id });
const sample = (cpuLoad: number, gpuLoad?: number): DeckClientAction => ({
  type: 'system/received',
  system: {
    cpuLoad,
    memoryUsedMb: 8000,
    memoryTotalMb: 16000,
    gpu: gpuLoad === undefined ? null : { name: 'GPU', load: gpuLoad, temperatureC: 50, memoryUsedMb: 1, memoryTotalMb: 2 },
  } satisfies SystemInfo,
});

describe('launch feedback', () => {
  it('goes launching → done/failed → cleared', () => {
    expect(run(start('a')).launches).toEqual({ a: 'launching' });
    expect(run(start('a'), { type: 'launch/finished', id: 'a', ok: true }).launches).toEqual({ a: 'done' });
    expect(run(start('a'), { type: 'launch/finished', id: 'a', ok: false }).launches).toEqual({ a: 'failed' });
    expect(run(start('a'), { type: 'launch/cleared', id: 'a' }).launches).toEqual({});
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

describe('PC state', () => {
  it('keeps the latest system sample and a capped history for the charts', () => {
    const many = Array.from({ length: HISTORY_LENGTH + 5 }, (_, i) => sample(i, i * 2));
    const state = run(...many);
    expect(state.system?.cpuLoad).toBe(HISTORY_LENGTH + 4);
    expect(state.systemHistory.cpu).toHaveLength(HISTORY_LENGTH);
    expect(state.systemHistory.cpu[0]).toBe(5);
    expect(state.systemHistory.gpu.at(-1)).toBe((HISTORY_LENGTH + 4) * 2);
  });

  it('does not add GPU samples when there is no GPU', () => {
    expect(run(sample(10), sample(20)).systemHistory).toEqual({ cpu: [10, 20], gpu: [], gpuTemp: [] });
  });

  it('stores when media arrived, for extrapolating the position', () => {
    const media = { title: 'Song', artist: 'A', album: '', app: 'Spotify', isPlaying: true, positionSec: 10, durationSec: 100, artwork: null };
    expect(run({ type: 'media/received', media, receivedAt: 1234 })).toMatchObject({ media, mediaReceivedAt: 1234 });
  });
});
