import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createObsClient, obsAuthentication, type ObsSocket } from '../../electron/pc/obsClient';
import { cpuLoad, parseNvidiaSmiLine } from '../../electron/pc/systemMonitor';
import { parseHelperEvent } from '../../electron/pc/winHelper';

describe('system monitor', () => {
  it('computes CPU load from two snapshots', () => {
    const before = [{ user: 100, nice: 0, sys: 100, irq: 0, idle: 800 }];
    const after = [{ user: 200, nice: 0, sys: 150, irq: 0, idle: 850 }];
    expect(cpuLoad(before, after)).toBe(75);
  });

  it('parses nvidia-smi CSV, including names with commas', () => {
    expect(parseNvidiaSmiLine('NVIDIA GeForce RTX 4060, 31, 53.09, 1827, 8188')).toEqual({
      name: 'NVIDIA GeForce RTX 4060',
      load: 31,
      temperatureC: 53,
      memoryUsedMb: 1827,
      memoryTotalMb: 8188,
    });
    expect(parseNvidiaSmiLine('Odd, Name, 5, 40, 1, 2')?.name).toBe('Odd, Name');
    expect(parseNvidiaSmiLine('NVIDIA, [N/A], 40, 1, 2')).toBeNull();
  });
});

describe('Windows helper protocol', () => {
  it('parses audio events and keeps executable paths for icon lookup', () => {
    const event = parseHelperEvent(
      JSON.stringify({
        type: 'audio',
        data: {
          outputs: [{ id: 'dev', name: 'Speakers', isDefault: true }],
          master: { volume: 0.5, muted: false },
          mic: null,
          apps: [{ id: 'pid:1', name: 'Spotify', path: 'C:\\Spotify.exe', volume: 1, muted: false, active: true }],
        },
      }),
    );
    expect(event).toEqual({
      type: 'audio',
      data: {
        outputs: [{ id: 'dev', name: 'Speakers', isDefault: true }],
        master: { volume: 0.5, muted: false },
        mic: null,
        apps: [{ id: 'pid:1', name: 'Spotify', path: 'C:\\Spotify.exe', volume: 1, muted: false, active: true }],
      },
    });
  });

  it('parses media with its sample time, and "nothing playing"', () => {
    const media = { title: 'Song', artist: 'A', album: 'B', app: 'Spotify', isPlaying: true, positionSec: 5, durationSec: 10, timestampMs: 99, artwork: null };
    expect(parseHelperEvent(JSON.stringify({ type: 'media', data: media }))).toMatchObject({ type: 'media', data: { timestampMs: 99 } });
    expect(parseHelperEvent('{"type":"media","data":null}')).toEqual({ type: 'media', data: null });
    expect(parseHelperEvent('not json')).toBeNull();
    expect(parseHelperEvent('{"type":"other"}')).toBeNull();
  });
});

class FakeSocket implements ObsSocket {
  sent: Record<string, any>[] = [];
  private listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.emit('close');
  }
  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data?: unknown) {
    this.listeners.get(type)?.forEach((listener) => listener({ data: JSON.stringify(data) }));
  }
  /** Answers every pending request with success and the given data. */
  respond(requestType: string, responseData: Record<string, unknown> = {}) {
    const request = this.sent.find((message) => message.op === 6 && message.d.requestType === requestType);
    this.emit('message', { op: 7, d: { requestId: request!.d.requestId, requestType, requestStatus: { result: true }, responseData } });
  }
}

describe('OBS client', () => {
  let client: ReturnType<typeof createObsClient> | undefined;
  afterEach(() => client?.stop());

  it('computes the v5 authentication string', () => {
    const sha = (value: string) => createHash('sha256').update(value).digest('base64');
    expect(obsAuthentication('pw', 'salt', 'challenge')).toBe(sha(sha('pwsalt') + 'challenge'));
  });

  it('reports "disabled" when the WebSocket server is off in OBS', () => {
    const changes: string[] = [];
    client = createObsClient({ getSettings: () => ({ enabled: false, port: 4455, password: null }), onChange: (info) => changes.push(info.status) });
    client.start();
    expect(changes).toEqual(['disabled']);
  });

  it('authenticates, tracks the replay buffer and saves clips', async () => {
    const socket = new FakeSocket();
    client = createObsClient({
      getSettings: () => ({ enabled: true, port: 4455, password: 'pw' }),
      onChange: () => {},
      createSocket: () => socket,
    });
    client.start();

    socket.emit('message', { op: 0, d: { rpcVersion: 1, authentication: { salt: 's', challenge: 'c' } } });
    expect(socket.sent[0]).toEqual({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, authentication: obsAuthentication('pw', 's', 'c') } });

    socket.emit('message', { op: 2, d: { negotiatedRpcVersion: 1 } });
    expect(client.info.status).toBe('connected');
    socket.respond('GetReplayBufferStatus', { outputActive: false });
    socket.respond('GetRecordStatus', { outputActive: true });
    socket.respond('GetStreamStatus', { outputActive: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.info).toEqual({ status: 'connected', replayBuffer: false, recording: true, streaming: false });

    // No buffer yet: the first tap starts it.
    const started = client.saveClip();
    socket.respond('StartReplayBuffer');
    expect(await started).toBe('started');

    const saved = client.saveClip();
    socket.respond('SaveReplayBuffer');
    expect(await saved).toBe('saved');

    socket.emit('message', { op: 5, d: { eventType: 'ReplayBufferStateChanged', eventData: { outputActive: false } } });
    expect(client.info.replayBuffer).toBe(false);

    socket.close();
    expect(client.info.status).toBe('offline');
  });
});
