// LAN server the phone talks to: serves the phone web app, pairs phones with the PIN, streams live
// state (Server-Sent Events) and accepts a fixed set of validated commands.
// The phone refers to buttons, apps and devices by id only, so it can never make the PC run anything else.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { isRecord, type PublicDeckButton } from '../src/core/deck';
import {
  isAudioTarget,
  isDeviceId,
  isMediaAction,
  isVolume,
  type AudioInfo,
  type AudioTarget,
  type MediaAction,
  type MediaInfo,
  type ObsInfo,
  type SystemInfo,
} from '../src/core/pc';
import type { ClipResult } from './pc/obsClient';
import type { PinCheck } from './pinGuard';

/** Not 4455: that is OBS WebSocket's default port. */
export const DECK_PORT = 4460;

const COOKIE_NAME = 'deck_token';
const COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
const MAX_BODY_BYTES = 1024;
const HEARTBEAT_MS = 25_000;
const CLIENT_HEADER = 'x-deck-client';

const PHONE_PAGE_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export type LaunchResult = 'ok' | 'not-found' | 'failed';

/** Live PC state, as sent to phones. */
export interface PcState {
  media: MediaInfo | null;
  audio: AudioInfo | null;
  system: SystemInfo | null;
  obs: ObsInfo;
}

export type StreamEvent = 'buttons' | keyof PcState;

/** Commands from the phone, already validated. Each returns false when it can't be carried out right now. */
export interface PcControl {
  media(action: MediaAction): boolean;
  setVolume(target: AudioTarget, volume: number): boolean;
  setMute(target: AudioTarget, muted: boolean): boolean;
  setOutput(deviceId: string): boolean;
  saveClip(): Promise<ClipResult>;
}

export interface DeckServerDeps {
  /** Folder with the built web app (phone.html + assets/). */
  staticDir: string;
  getButtons(): PublicDeckButton[];
  getPcState(): PcState;
  getToken(): string;
  isValidToken(token: string): boolean;
  checkPin(pin: string): PinCheck;
  launch(id: string): Promise<LaunchResult>;
  control: PcControl;
  onClientsChanged?(count: number): void;
}

const TOO_LARGE = Symbol('too-large');

export function createDeckServer(deps: DeckServerDeps) {
  const clients = new Set<ServerResponse>();
  const root = resolve(deps.staticDir);
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (res.headersSent) res.end();
      else send(res, 500);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(req.url ?? '/', 'http://deck.local').pathname;
    if (path.startsWith('/api/')) return handleApi(req, res, path);
    if (req.method !== 'GET') return send(res, 405);
    return serveStatic(res, path);
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
    if (req.method === 'POST' && !isTrustedPost(req)) return send(res, 403);

    if (req.method === 'POST' && path === '/api/pair') {
      const body = await readJson(req);
      if (body === TOO_LARGE) return send(res, 413);
      const pin = isRecord(body) && typeof body.pin === 'string' ? body.pin : '';
      const result = deps.checkPin(pin);
      if (result !== 'accepted') return sendJson(res, 403, { error: result === 'reset' ? 'pin-reset' : 'wrong-pin' });
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${deps.getToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SEC}`,
      );
      return send(res, 204);
    }

    if (!isAuthorized(req)) return send(res, 401);
    if (req.method === 'GET' && path === '/api/session') return send(res, 204);
    if (req.method === 'GET' && path === '/api/events') return openEventStream(req, res);
    if (req.method !== 'POST') return send(res, 404);

    const launchMatch = /^\/api\/launch\/([^/]+)$/.exec(path);
    if (launchMatch) {
      const result = await deps.launch(decodeURIComponent(launchMatch[1]));
      return send(res, result === 'ok' ? 204 : result === 'not-found' ? 404 : 500);
    }

    const mediaMatch = /^\/api\/media\/([a-z]+)$/.exec(path);
    if (mediaMatch) {
      if (!isMediaAction(mediaMatch[1])) return send(res, 404);
      return sendDone(res, deps.control.media(mediaMatch[1]));
    }

    if (path === '/api/obs/clip') {
      const result = await deps.control.saveClip();
      return result === 'unavailable' ? send(res, 409) : sendJson(res, 200, { result });
    }

    const body = await readJson(req);
    if (body === TOO_LARGE) return send(res, 413);
    if (!isRecord(body)) return send(res, 400);
    switch (path) {
      case '/api/audio/volume':
        if (!isAudioTarget(body.target) || !isVolume(body.volume)) return send(res, 400);
        return sendDone(res, deps.control.setVolume(body.target, body.volume));
      case '/api/audio/mute':
        if (!isAudioTarget(body.target) || typeof body.muted !== 'boolean') return send(res, 400);
        return sendDone(res, deps.control.setMute(body.target, body.muted));
      case '/api/audio/output':
        if (!isDeviceId(body.deviceId)) return send(res, 400);
        return sendDone(res, deps.control.setOutput(body.deviceId));
      default:
        return send(res, 404);
    }
  }

  /** Blocks cross-site requests: browsers can't add the custom header cross-origin without a preflight we never allow. */
  function isTrustedPost(req: IncomingMessage): boolean {
    if (req.headers[CLIENT_HEADER] !== '1') return false;
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  function isAuthorized(req: IncomingMessage): boolean {
    const token = readCookie(req, COOKIE_NAME);
    return token !== undefined && deps.isValidToken(token);
  }

  function openEventStream(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(formatEvent('buttons', deps.getButtons()));
    const pc = deps.getPcState();
    (Object.keys(pc) as (keyof PcState)[]).forEach((key) => res.write(formatEvent(key, pc[key])));
    clients.add(res);
    deps.onClientsChanged?.(clients.size);
    req.on('close', () => {
      clients.delete(res);
      deps.onClientsChanged?.(clients.size);
    });
  }

  async function serveStatic(res: ServerResponse, path: string) {
    const relative = path === '/' ? 'phone.html' : path.slice(1);
    // The config page only makes sense inside the Electron window.
    if (relative === 'config.html') return send(res, 404);
    const file = resolve(root, relative);
    const type = CONTENT_TYPES[extname(file)];
    if (!file.startsWith(root + sep) || !type) return send(res, 404);
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      return send(res, 404);
    }
    const headers: Record<string, string> = { 'Content-Type': type };
    if (type.startsWith('text/html')) {
      headers['Content-Security-Policy'] = PHONE_PAGE_CSP;
      headers['Cache-Control'] = 'no-cache';
    } else if (relative.startsWith('assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(data);
  }

  return {
    /** Resolves with the bound port (pass 0 for a random one, e.g. in tests). */
    start(port = DECK_PORT, host = '0.0.0.0'): Promise<number> {
      return new Promise((resolveStart, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          heartbeat = setInterval(() => clients.forEach((client) => client.write(': ping\n\n')), HEARTBEAT_MS);
          const address = server.address();
          resolveStart(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    stop(): Promise<void> {
      clearInterval(heartbeat);
      clients.forEach((client) => client.end());
      clients.clear();
      server.closeAllConnections();
      return new Promise((resolveStop) => server.close(() => resolveStop()));
    },
    broadcast(event: StreamEvent, data: unknown) {
      const message = formatEvent(event, data);
      clients.forEach((client) => client.write(message));
    },
    /** Drops every live phone connection, e.g. after the pairing token changed. */
    disconnectAll() {
      clients.forEach((client) => client.end());
    },
    get clientCount() {
      return clients.size;
    },
  };
}

function formatEvent(event: StreamEvent, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function send(res: ServerResponse, status: number) {
  res.writeHead(status);
  res.end();
}

/** 204 when the command was handed to Windows, 409 when it can't run right now (e.g. helper unavailable). */
function sendDone(res: ServerResponse, done: boolean) {
  send(res, done ? 204 : 409);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return TOO_LARGE;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const prefix = `${name}=`;
  return req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}
