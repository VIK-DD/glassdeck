// Minimal obs-websocket v5 client: tracks replay buffer / recording / streaming state and saves clips.
// Connection settings come from OBS's own config (Tools → WebSocket Server Settings), so there is nothing to type in.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../../src/core/deck';
import { OBS_OFFLINE, type ObsInfo } from '../../src/core/pc';

const RECONNECT_MS = 5000;
const REQUEST_TIMEOUT_MS = 3000;
const RPC_VERSION = 1;
/** EventSubscription.Outputs: replay buffer, record and stream state changes. */
const SUBSCRIBE_OUTPUTS = 1 << 6;

enum Op {
  Hello = 0,
  Identify = 1,
  Identified = 2,
  Event = 5,
  Request = 6,
  RequestResponse = 7,
}

export interface ObsSettings {
  enabled: boolean;
  port: number;
  password: string | null;
}

/** The subset of the WebSocket API the client uses, so tests can pass a fake. */
export interface ObsSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export type ClipResult = 'saved' | 'started' | 'unavailable';

/** obs-websocket v5 auth: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export function obsAuthentication(password: string, salt: string, challenge: string): string {
  const sha = (value: string) => createHash('sha256').update(value).digest('base64');
  return sha(sha(password + salt) + challenge);
}

/** Reads %APPDATA%/obs-studio/plugin_config/obs-websocket/config.json. Null when OBS isn't installed. */
export function readObsSettings(appDataDir: string): ObsSettings | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(appDataDir, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json'), 'utf8'));
    if (!isRecord(raw)) return null;
    return {
      enabled: raw.server_enabled === true,
      port: typeof raw.server_port === 'number' ? raw.server_port : 4455,
      password: raw.auth_required === true && typeof raw.server_password === 'string' ? raw.server_password : null,
    };
  } catch {
    return null;
  }
}

interface ObsClientOptions {
  getSettings(): ObsSettings | null;
  onChange(info: ObsInfo): void;
  createSocket?(url: string): ObsSocket;
}

export function createObsClient({ getSettings, onChange, createSocket = (url) => new WebSocket(url) as unknown as ObsSocket }: ObsClientOptions) {
  let info: ObsInfo = OBS_OFFLINE;
  let socket: ObsSocket | null = null;
  let identified = false;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, { resolve(data: Record<string, unknown> | null): void; timer: ReturnType<typeof setTimeout> }>();

  function update(patch: Partial<ObsInfo>) {
    const next = { ...info, ...patch };
    if (JSON.stringify(next) === JSON.stringify(info)) return;
    info = next;
    onChange(info);
  }

  function connect() {
    if (stopped) return;
    const settings = getSettings();
    if (!settings?.enabled) {
      update({ ...OBS_OFFLINE, status: 'disabled' });
      return scheduleReconnect();
    }
    let ws: ObsSocket;
    try {
      ws = createSocket(`ws://127.0.0.1:${settings.port}`);
    } catch {
      return scheduleReconnect();
    }
    socket = ws;
    ws.addEventListener('message', (event) => handleMessage(ws, settings, event.data));
    ws.addEventListener('close', () => {
      if (socket !== ws) return;
      socket = null;
      identified = false;
      pending.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        resolve(null);
      });
      pending.clear();
      update(OBS_OFFLINE);
      scheduleReconnect();
    });
    ws.addEventListener('error', () => ws.close());
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_MS);
  }

  function handleMessage(ws: ObsSocket, settings: ObsSettings, data: unknown) {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!isRecord(message) || !isRecord(message.d)) return;
    const d = message.d;
    switch (message.op) {
      case Op.Hello: {
        const auth = isRecord(d.authentication) ? d.authentication : null;
        const identify: Record<string, unknown> = { rpcVersion: RPC_VERSION, eventSubscriptions: SUBSCRIBE_OUTPUTS };
        if (auth && typeof auth.salt === 'string' && typeof auth.challenge === 'string') {
          if (settings.password === null) return ws.close();
          identify.authentication = obsAuthentication(settings.password, auth.salt, auth.challenge);
        }
        ws.send(JSON.stringify({ op: Op.Identify, d: identify }));
        return;
      }
      case Op.Identified:
        identified = true;
        update({ status: 'connected' });
        void refreshOutputs();
        return;
      case Op.Event:
        if (!isRecord(d.eventData)) return;
        if (d.eventType === 'ReplayBufferStateChanged') update({ replayBuffer: d.eventData.outputActive === true });
        if (d.eventType === 'RecordStateChanged') update({ recording: d.eventData.outputActive === true });
        if (d.eventType === 'StreamStateChanged') update({ streaming: d.eventData.outputActive === true });
        return;
      case Op.RequestResponse: {
        const entry = typeof d.requestId === 'string' ? pending.get(d.requestId) : undefined;
        if (!entry) return;
        pending.delete(d.requestId as string);
        clearTimeout(entry.timer);
        const ok = isRecord(d.requestStatus) && d.requestStatus.result === true;
        entry.resolve(ok ? (isRecord(d.responseData) ? d.responseData : {}) : null);
        return;
      }
    }
  }

  /** Resolves with the response data, or null on failure, timeout or disconnect. */
  function request(requestType: string): Promise<Record<string, unknown> | null> {
    const ws = socket;
    if (!ws || !identified) return Promise.resolve(null);
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve(null);
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { resolve, timer });
      ws.send(JSON.stringify({ op: Op.Request, d: { requestType, requestId } }));
    });
  }

  async function refreshOutputs() {
    const [replay, record, stream] = await Promise.all([
      request('GetReplayBufferStatus'),
      request('GetRecordStatus'),
      request('GetStreamStatus'),
    ]);
    update({
      replayBuffer: replay?.outputActive === true,
      recording: record?.outputActive === true,
      streaming: stream?.outputActive === true,
    });
  }

  return {
    get info(): ObsInfo {
      return info;
    },
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    },
    /** Saves the replay buffer, or starts it when it isn't running yet (there is nothing to save). */
    async saveClip(): Promise<ClipResult> {
      if (info.status !== 'connected') return 'unavailable';
      if (info.replayBuffer) return (await request('SaveReplayBuffer')) ? 'saved' : 'unavailable';
      const started = await request('StartReplayBuffer');
      if (started) update({ replayBuffer: true });
      return started ? 'started' : 'unavailable';
    },
  };
}
