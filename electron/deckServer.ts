// LAN server the phone talks to: serves the phone web app, pairs phones with the PIN,
// streams the button list (Server-Sent Events) and launches buttons by id.
// The phone can only refer to buttons by id, so it can never make the PC open anything else.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { isRecord, type PublicDeckButton } from '../src/core/deck';
import type { PinCheck } from './pinGuard';

export const DECK_PORT = 4455;

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

export interface DeckServerDeps {
  /** Folder with the built web app (phone.html + assets/). */
  staticDir: string;
  getButtons(): PublicDeckButton[];
  getToken(): string;
  isValidToken(token: string): boolean;
  checkPin(pin: string): PinCheck;
  launch(id: string): Promise<LaunchResult>;
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

    const launchMatch = /^\/api\/launch\/([^/]+)$/.exec(path);
    if (req.method === 'POST' && launchMatch) {
      const result = await deps.launch(decodeURIComponent(launchMatch[1]));
      return send(res, result === 'ok' ? 204 : result === 'not-found' ? 404 : 500);
    }
    return send(res, 404);
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
    res.write(buttonsEvent());
    clients.add(res);
    deps.onClientsChanged?.(clients.size);
    req.on('close', () => {
      clients.delete(res);
      deps.onClientsChanged?.(clients.size);
    });
  }

  function buttonsEvent(): string {
    return `event: buttons\ndata: ${JSON.stringify(deps.getButtons())}\n\n`;
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
    broadcastButtons() {
      const event = buttonsEvent();
      clients.forEach((client) => client.write(event));
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

function send(res: ServerResponse, status: number) {
  res.writeHead(status);
  res.end();
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
