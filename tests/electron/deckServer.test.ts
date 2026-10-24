import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeckServer, type LaunchResult } from '../../electron/deckServer';
import type { PinCheck } from '../../electron/pinGuard';

const TOKEN = 'a'.repeat(64);
const AUTH = { Cookie: `deck_token=${TOKEN}` };

let base: string;
let server: ReturnType<typeof createDeckServer>;
let launch: ReturnType<typeof vi.fn<(id: string) => Promise<LaunchResult>>>;

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'phone.html'), 'phone page');
  writeFileSync(join(dir, 'config.html'), 'config page');
  writeFileSync(join(dir, 'assets', 'app.js'), 'code');
  writeFileSync(join(tmpdir(), 'deck-secret.txt'), 'secret');

  launch = vi.fn(async (id: string): Promise<LaunchResult> => (id === 'known' ? 'ok' : 'not-found'));
  server = createDeckServer({
    staticDir: dir,
    getButtons: () => [{ id: 'known', title: 'App', icon: null, tint: 'blue' }],
    getToken: () => TOKEN,
    isValidToken: (token) => token === TOKEN,
    checkPin: (pin): PinCheck => (pin === '123456' ? 'accepted' : 'rejected'),
    launch,
  });
  base = `http://127.0.0.1:${await server.start(0, '127.0.0.1')}`;
});

afterEach(() => server.stop());

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Deck-Client': '1', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('static files', () => {
  it('serves the phone app with a CSP, and nothing outside it', async () => {
    const page = await fetch(`${base}/`);
    expect(await page.text()).toBe('phone page');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect((await fetch(`${base}/assets/app.js`)).status).toBe(200);
    expect((await fetch(`${base}/config.html`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fdeck-secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/%2e%2e/deck-secret.txt`)).status).toBe(404);
  });
});

describe('pairing', () => {
  it('rejects a wrong PIN without setting a cookie', async () => {
    const response = await post('/api/pair', { pin: '000000' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'wrong-pin' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('sets an HttpOnly, SameSite=Strict cookie for the right PIN', async () => {
    const response = await post('/api/pair', { pin: '123456' });
    expect(response.status).toBe(204);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`deck_token=${TOKEN}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('rejects oversized bodies', async () => {
    expect((await post('/api/pair', { pin: 'x'.repeat(5000) })).status).toBe(413);
  });
});

describe('authorisation', () => {
  it('requires the pairing cookie', async () => {
    expect((await fetch(`${base}/api/session`)).status).toBe(401);
    expect((await fetch(`${base}/api/session`, { headers: { Cookie: `deck_token=${'b'.repeat(64)}` } })).status).toBe(401);
    expect((await fetch(`${base}/api/session`, { headers: AUTH })).status).toBe(204);
    expect((await post('/api/launch/known')).status).toBe(401);
    expect(launch).not.toHaveBeenCalled();
  });

  it('blocks cross-site POSTs', async () => {
    const noHeader = await fetch(`${base}/api/launch/known`, { method: 'POST', headers: AUTH });
    expect(noHeader.status).toBe(403);
    expect((await post('/api/launch/known', undefined, { ...AUTH, Origin: 'http://evil.example' })).status).toBe(403);
    expect(launch).not.toHaveBeenCalled();
  });
});

describe('launching', () => {
  it('launches known buttons by id only', async () => {
    expect((await post('/api/launch/known', undefined, AUTH)).status).toBe(204);
    expect(launch).toHaveBeenCalledWith('known');
    expect((await post('/api/launch/missing', undefined, AUTH)).status).toBe(404);
  });
});

describe('events', () => {
  it('streams the button list to paired phones', async () => {
    const response = await fetch(`${base}/api/events`, { headers: AUTH });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: buttons');
    expect(text).toContain('"id":"known"');
    expect(server.clientCount).toBe(1);
    await reader.cancel();
  });
});
