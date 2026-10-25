// PC state shown on the phone: now playing, audio mixer, system load and OBS.
// Shared by the Electron host (which produces it) and the phone (which validates what it receives).
import { isRecord } from './deck';
import { clamp } from './util/math';

export interface MediaInfo {
  title: string;
  artist: string;
  album: string;
  /** Player the media comes from, e.g. "Spotify" or "Chrome". */
  app: string;
  isPlaying: boolean;
  positionSec: number | null;
  durationSec: number | null;
  /** PNG or JPEG data URL. */
  artwork: string | null;
}

export interface OutputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface VolumeInfo {
  /** 0–1 */
  volume: number;
  muted: boolean;
}

export interface AppAudio extends VolumeInfo {
  /** "system" or "pid:<n>". */
  id: string;
  name: string;
  icon: string | null;
  active: boolean;
}

export interface AudioInfo {
  outputs: OutputDevice[];
  master: VolumeInfo | null;
  mic: VolumeInfo | null;
  apps: AppAudio[];
}

export interface GpuInfo {
  name: string;
  /** 0–100 */
  load: number;
  temperatureC: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
}

export interface SystemInfo {
  /** 0–100 */
  cpuLoad: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  gpu: GpuInfo | null;
}

/** disabled: OBS WebSocket server is off in OBS · offline: OBS isn't running · connected */
export type ObsStatus = 'disabled' | 'offline' | 'connected';

export interface ObsInfo {
  status: ObsStatus;
  replayBuffer: boolean;
  recording: boolean;
  streaming: boolean;
}

export type MediaAction = 'toggle' | 'next' | 'previous';
export const MEDIA_ACTIONS: readonly MediaAction[] = ['toggle', 'next', 'previous'];

/** Volume targets: the default output ("master"), the default mic, the system sounds session or an app. */
export type AudioTarget = string;

const AUDIO_TARGET_PATTERN = /^(master|mic|system|pid:\d{1,10})$/;
const APP_ID_PATTERN = /^(system|pid:\d{1,10})$/;
const ARTWORK_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const ICON_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_ARTWORK_LENGTH = 600 * 1024;
const MAX_ICON_LENGTH = 256 * 1024;
const MAX_DEVICE_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 120;

/** Temperatures from this point on are flagged on the phone. */
export const GPU_HOT_C = 80;

export const OBS_OFFLINE: ObsInfo = { status: 'offline', replayBuffer: false, recording: false, streaming: false };

export function isAudioTarget(value: unknown): value is AudioTarget {
  return typeof value === 'string' && AUDIO_TARGET_PATTERN.test(value);
}

export function isMediaAction(value: unknown): value is MediaAction {
  return typeof value === 'string' && (MEDIA_ACTIONS as readonly string[]).includes(value);
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_DEVICE_ID_LENGTH;
}

export function isVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Where the track is now, given when the snapshot was taken (same clock as `now`). */
export function mediaPosition(media: MediaInfo, snapshotAt: number, now: number): number | null {
  if (media.positionSec === null) return null;
  const elapsed = media.isPlaying ? Math.max(0, now - snapshotAt) / 1000 : 0;
  const position = media.positionSec + elapsed;
  return media.durationSec === null ? position : clamp(position, 0, media.durationSec);
}

// Parsers validate data that crosses a process or network boundary. Anything malformed becomes null / is dropped.

export function parseMediaInfo(raw: unknown): MediaInfo | null {
  if (!isRecord(raw) || typeof raw.title !== 'string' || raw.title.trim() === '') return null;
  return {
    title: text(raw.title, 'Unknown'),
    artist: text(raw.artist, ''),
    album: text(raw.album, ''),
    app: text(raw.app, ''),
    isPlaying: raw.isPlaying === true,
    positionSec: nonNegative(raw.positionSec),
    durationSec: nonNegative(raw.durationSec),
    artwork: typeof raw.artwork === 'string' && raw.artwork.length <= MAX_ARTWORK_LENGTH && ARTWORK_PATTERN.test(raw.artwork) ? raw.artwork : null,
  };
}

export function parseVolumeInfo(raw: unknown): VolumeInfo | null {
  if (!isRecord(raw) || typeof raw.volume !== 'number' || !Number.isFinite(raw.volume)) return null;
  return { volume: clamp(raw.volume, 0, 1), muted: raw.muted === true };
}

export function parseAudioInfo(raw: unknown): AudioInfo | null {
  if (!isRecord(raw) || !Array.isArray(raw.outputs) || !Array.isArray(raw.apps)) return null;
  return {
    outputs: raw.outputs.flatMap((item): OutputDevice[] =>
      isRecord(item) && isDeviceId(item.id) ? [{ id: item.id, name: text(item.name, 'Output'), isDefault: item.isDefault === true }] : [],
    ),
    master: parseVolumeInfo(raw.master),
    mic: parseVolumeInfo(raw.mic),
    apps: raw.apps.flatMap((item): AppAudio[] => {
      const volume = parseVolumeInfo(item);
      if (!volume || !isRecord(item) || typeof item.id !== 'string' || !APP_ID_PATTERN.test(item.id)) return [];
      const icon = typeof item.icon === 'string' && item.icon.length <= MAX_ICON_LENGTH && ICON_PATTERN.test(item.icon) ? item.icon : null;
      return [{ ...volume, id: item.id, name: text(item.name, 'App'), icon, active: item.active === true }];
    }),
  };
}

export function parseSystemInfo(raw: unknown): SystemInfo | null {
  if (!isRecord(raw)) return null;
  const cpuLoad = nonNegative(raw.cpuLoad);
  const memoryUsedMb = nonNegative(raw.memoryUsedMb);
  const memoryTotalMb = nonNegative(raw.memoryTotalMb);
  if (cpuLoad === null || memoryUsedMb === null || memoryTotalMb === null) return null;
  return { cpuLoad: clamp(cpuLoad, 0, 100), memoryUsedMb, memoryTotalMb, gpu: parseGpuInfo(raw.gpu) };
}

function parseGpuInfo(raw: unknown): GpuInfo | null {
  if (!isRecord(raw)) return null;
  const load = nonNegative(raw.load);
  const temperatureC = nonNegative(raw.temperatureC);
  const memoryUsedMb = nonNegative(raw.memoryUsedMb);
  const memoryTotalMb = nonNegative(raw.memoryTotalMb);
  if (load === null || temperatureC === null || memoryUsedMb === null || memoryTotalMb === null) return null;
  return { name: text(raw.name, 'GPU'), load: clamp(load, 0, 100), temperatureC, memoryUsedMb, memoryTotalMb };
}

export function parseObsInfo(raw: unknown): ObsInfo | null {
  if (!isRecord(raw) || (raw.status !== 'disabled' && raw.status !== 'offline' && raw.status !== 'connected')) return null;
  return { status: raw.status, replayBuffer: raw.replayBuffer === true, recording: raw.recording === true, streaming: raw.streaming === true };
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned === '' ? fallback : cleaned;
}

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
