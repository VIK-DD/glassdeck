import { describe, expect, it } from 'vitest';
import { isAudioTarget, isVolume, mediaPosition, parseAudioInfo, parseMediaInfo, parseObsInfo, parseSystemInfo } from '../../src/core';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';

describe('media', () => {
  it('accepts PNG and JPEG covers only', () => {
    const base = { title: 'Song', artist: 'Artist', album: 'Album', app: 'Spotify', isPlaying: true, positionSec: 1, durationSec: 2 };
    expect(parseMediaInfo({ ...base, artwork: PNG })?.artwork).toBe(PNG);
    expect(parseMediaInfo({ ...base, artwork: JPEG })?.artwork).toBe(JPEG);
    expect(parseMediaInfo({ ...base, artwork: 'data:image/svg+xml;base64,PHN2Zz4=' })?.artwork).toBeNull();
    expect(parseMediaInfo({ ...base, artwork: 'https://evil.example/x.png' })?.artwork).toBeNull();
  });

  it('treats a missing title as nothing playing', () => {
    expect(parseMediaInfo({ title: '  ', isPlaying: true })).toBeNull();
    expect(parseMediaInfo(null)).toBeNull();
  });

  it('extrapolates the position while playing and clamps it to the duration', () => {
    const media = { title: 'S', artist: '', album: '', app: '', isPlaying: true, positionSec: 10, durationSec: 12, artwork: null };
    expect(mediaPosition(media, 1000, 2000)).toBe(11);
    expect(mediaPosition(media, 1000, 60_000)).toBe(12);
    expect(mediaPosition({ ...media, isPlaying: false }, 1000, 60_000)).toBe(10);
    expect(mediaPosition({ ...media, positionSec: null }, 1000, 2000)).toBeNull();
  });
});

describe('audio', () => {
  it('drops apps with invalid ids or icons and clamps volumes', () => {
    const audio = parseAudioInfo({
      outputs: [{ id: '{0.0.0.00000000}.{abc}', name: 'Headset', isDefault: true }, { id: '', name: 'Bad' }],
      master: { volume: 1.7, muted: false },
      mic: null,
      apps: [
        { id: 'pid:42', name: 'Spotify', icon: PNG, volume: 0.5, muted: false, active: true },
        { id: 'pid:43', name: 'Odd icon', icon: JPEG, volume: 0.5, muted: true, active: false },
        { id: 'rm -rf /', name: 'Evil', icon: null, volume: 0.5, muted: false, active: false },
      ],
    });
    expect(audio?.outputs).toEqual([{ id: '{0.0.0.00000000}.{abc}', name: 'Headset', isDefault: true }]);
    expect(audio?.master).toEqual({ volume: 1, muted: false });
    expect(audio?.mic).toBeNull();
    expect(audio?.apps.map((app) => [app.id, app.icon])).toEqual([
      ['pid:42', PNG],
      ['pid:43', null],
    ]);
  });

  it('only accepts known volume targets and 0–1 volumes', () => {
    expect(['master', 'mic', 'system', 'pid:15796'].every(isAudioTarget)).toBe(true);
    expect(['pid:', 'pid:abc', 'Master', 'C:\\x.exe', 42].some(isAudioTarget)).toBe(false);
    expect([0, 0.5, 1].every(isVolume)).toBe(true);
    expect([-0.1, 1.1, Number.NaN, '0.5'].some(isVolume)).toBe(false);
  });
});

describe('system and OBS', () => {
  it('requires CPU and memory, and tolerates a missing GPU', () => {
    expect(parseSystemInfo({ cpuLoad: 150, memoryUsedMb: 1, memoryTotalMb: 2, gpu: null })).toEqual({
      cpuLoad: 100,
      memoryUsedMb: 1,
      memoryTotalMb: 2,
      gpu: null,
    });
    expect(parseSystemInfo({ cpuLoad: 'high' })).toBeNull();
  });

  it('validates the OBS status', () => {
    expect(parseObsInfo({ status: 'connected', replayBuffer: true })).toEqual({
      status: 'connected',
      replayBuffer: true,
      recording: false,
      streaming: false,
    });
    expect(parseObsInfo({ status: 'hacked' })).toBeNull();
  });
});
