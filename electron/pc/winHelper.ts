// Runs the Windows helper (helper/, built to dist-helper/) and turns its JSON-lines output into events.
// The helper is restarted if it exits; after repeated quick failures it is reported as unavailable.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isRecord } from '../../src/core/deck';
import type { HelperStatus } from '../../src/core/deckApi';
import { parseMediaInfo, parseVolumeInfo, type AudioInfo, type MediaInfo } from '../../src/core/pc';

/** Audio as the helper reports it: apps carry their executable path instead of an icon. */
export interface HelperAudio extends Omit<AudioInfo, 'apps'> {
  apps: Array<Omit<AudioInfo['apps'][number], 'icon'> & { path: string | null }>;
}

/** Media plus the PC clock time (ms) its position was sampled at. */
export interface HelperMedia {
  media: MediaInfo;
  timestampMs: number;
}

export type HelperCommand =
  | { cmd: 'media'; action: 'toggle' | 'next' | 'previous' }
  | { cmd: 'setVolume'; target: string; volume: number }
  | { cmd: 'setMute'; target: string; muted: boolean }
  | { cmd: 'setOutput'; deviceId: string };

export type HelperEvent = { type: 'audio'; data: HelperAudio } | { type: 'media'; data: HelperMedia | null };

const RESTART_DELAY_MS = 3000;
const MAX_QUICK_FAILURES = 3;
const QUICK_FAILURE_MS = 10_000;

export function parseHelperEvent(line: string): HelperEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw.type === 'media') {
    if (raw.data === null) return { type: 'media', data: null };
    const media = parseMediaInfo(raw.data);
    const timestampMs = isRecord(raw.data) ? raw.data.timestampMs : undefined;
    return media && typeof timestampMs === 'number' ? { type: 'media', data: { media, timestampMs } } : null;
  }
  if (raw.type === 'audio' && isRecord(raw.data) && Array.isArray(raw.data.outputs) && Array.isArray(raw.data.apps)) {
    const data = raw.data;
    return {
      type: 'audio',
      data: {
        outputs: (data.outputs as unknown[]).flatMap((item) =>
          isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string'
            ? [{ id: item.id, name: item.name, isDefault: item.isDefault === true }]
            : [],
        ),
        master: parseVolumeInfo(data.master),
        mic: parseVolumeInfo(data.mic),
        apps: (data.apps as unknown[]).flatMap((item) => {
          const volume = parseVolumeInfo(item);
          if (!volume || !isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
          return [{ ...volume, id: item.id, name: item.name, active: item.active === true, path: typeof item.path === 'string' ? item.path : null }];
        }),
      },
    };
  }
  return null;
}

interface WinHelperOptions {
  exePath: string;
  onEvent(event: HelperEvent): void;
  onStatus(status: HelperStatus): void;
}

export function createWinHelper({ exePath, onEvent, onStatus }: WinHelperOptions) {
  let child: ChildProcessWithoutNullStreams | null = null;
  let stopped = false;
  let quickFailures = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  function start() {
    if (process.platform !== 'win32' || !existsSync(exePath)) {
      onStatus('unavailable');
      return;
    }
    onStatus('starting');
    const startedAt = Date.now();
    const proc = spawn(exePath, [], { windowsHide: true });
    child = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => {
      const event = parseHelperEvent(line);
      if (!event) return;
      quickFailures = 0;
      onStatus('running');
      onEvent(event);
    });
    proc.stderr.on('data', (chunk) => console.warn(`[helper] ${String(chunk).trim()}`));
    proc.on('error', () => {
      // Exit handling below decides whether to retry.
    });
    proc.on('exit', () => {
      child = null;
      if (stopped) return;
      quickFailures = Date.now() - startedAt < QUICK_FAILURE_MS ? quickFailures + 1 : 0;
      if (quickFailures >= MAX_QUICK_FAILURES) {
        onStatus('unavailable');
        return;
      }
      onStatus('starting');
      restartTimer = setTimeout(start, RESTART_DELAY_MS);
    });
  }

  return {
    start,
    stop() {
      stopped = true;
      clearTimeout(restartTimer);
      child?.stdin.end();
      child = null;
    },
    /** Returns false when the helper isn't running. */
    send(command: HelperCommand): boolean {
      if (!child) return false;
      child.stdin.write(`${JSON.stringify(command)}\n`);
      return true;
    },
  };
}
