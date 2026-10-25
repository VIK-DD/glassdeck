// Electron host: owns the deck config, runs the PC integrations (Windows helper, system monitor, OBS),
// serves the phone over the LAN and shows the config window.
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeckTint, isRecord, toPublicButton } from '../src/core/deck';
import type { DeckState, HelperStatus } from '../src/core/deckApi';
import { mediaPosition, type AudioInfo, type MediaInfo, type SystemInfo } from '../src/core/pc';
import { APP_EXTENSIONS, describeApp, openTarget, readIcon } from './appInfo';
import { createDeckServer, DECK_PORT, type LaunchResult, type PcState } from './deckServer';
import { createDeckStore } from './deckStore';
import { createObsClient, readObsSettings } from './pc/obsClient';
import { createSystemMonitor } from './pc/systemMonitor';
import { createWinHelper, type HelperAudio, type HelperMedia } from './pc/winHelper';
import { createPinGuard } from './pinGuard';

const isDev = process.argv.includes('--dev');
const DEV_SERVER_URL = 'http://localhost:5173';
const DEV_SERVER_PORT = 5173;
const ROOT = join(__dirname, '..', '..');
const WEB_DIST = join(ROOT, 'dist');
const HELPER_EXE = join(ROOT, 'dist-helper', 'glassdeck-helper.exe');
const START_MENU = join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
/** Name the app had before it became Glassdeck; its saved buttons and pairing are carried over once. */
const LEGACY_APP_NAME = 'carplay-windows';

let configWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (configWindow?.isMinimized()) configWindow.restore();
    configWindow?.focus();
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

async function start() {
  const configPath = join(app.getPath('userData'), 'deck.json');
  migrateLegacyConfig(configPath);
  const store = createDeckStore(configPath);
  const pins = createPinGuard(() => pushState());

  let helperStatus: HelperStatus = 'starting';
  let media: HelperMedia | null = null;
  let audio: AudioInfo | null = null;
  let system: SystemInfo | null = null;

  const helper = createWinHelper({
    exePath: HELPER_EXE,
    onStatus(status) {
      if (status === helperStatus) return;
      helperStatus = status;
      if (status === 'unavailable') {
        media = null;
        audio = null;
        server.broadcast('media', null);
        server.broadcast('audio', null);
      }
      pushState();
    },
    onEvent(event) {
      if (event.type === 'media') {
        media = event.data;
        server.broadcast('media', currentMedia());
      } else {
        void applyAudio(event.data);
      }
    },
  });

  const monitor = createSystemMonitor((info) => {
    const gpuChanged = (system?.gpu?.name ?? null) !== (info.gpu?.name ?? null);
    system = info;
    server.broadcast('system', info);
    if (gpuChanged) pushState();
  });

  const obs = createObsClient({
    getSettings: () => readObsSettings(app.getPath('appData')),
    onChange(info) {
      server.broadcast('obs', info);
      pushState();
    },
  });

  // Mixer icons come from each app's executable; resolved once per path. Late results for an older
  // snapshot are dropped so the phone never goes back in time.
  const icons = new Map<string, Promise<string | null>>();
  let audioSequence = 0;
  async function applyAudio(raw: HelperAudio) {
    const sequence = ++audioSequence;
    const apps = await Promise.all(
      raw.apps.map(async ({ path, ...app }) => {
        if (path && !icons.has(path)) icons.set(path, readIcon(path));
        return { ...app, icon: path ? await icons.get(path)! : null };
      }),
    );
    if (sequence !== audioSequence) return;
    audio = { ...raw, apps };
    server.broadcast('audio', audio);
  }

  /** Media with the playback position advanced to now. */
  function currentMedia(): MediaInfo | null {
    if (!media) return null;
    return { ...media.media, positionSec: mediaPosition(media.media, media.timestampMs, Date.now()) };
  }

  function pcState(): PcState {
    return { media: currentMedia(), audio, system, obs: obs.info };
  }

  async function launch(id: string): Promise<LaunchResult> {
    const button = store.findButton(id);
    if (!button) return 'not-found';
    return (await openTarget(button.target)) ? 'ok' : 'failed';
  }

  const server = createDeckServer({
    staticDir: WEB_DIST,
    getButtons: () => store.config.buttons.map(toPublicButton),
    getPcState: pcState,
    getToken: () => store.config.token,
    isValidToken: (token) => store.isValidToken(token),
    checkPin: (pin) => pins.check(pin),
    launch,
    control: {
      media: (action) => helper.send({ cmd: 'media', action }),
      setVolume: (target, volume) => helper.send({ cmd: 'setVolume', target, volume }),
      setMute: (target, muted) => helper.send({ cmd: 'setMute', target, muted }),
      setOutput: (deviceId) =>
        audio?.outputs.some((output) => output.id === deviceId) === true && helper.send({ cmd: 'setOutput', deviceId }),
      saveClip: () => obs.saveClip(),
    },
    onClientsChanged: () => pushState(),
  });

  function state(): DeckState {
    return {
      buttons: store.config.buttons,
      pin: pins.pin,
      phoneUrls: phoneUrls(),
      connectedPhones: server.clientCount,
      integrations: { helper: helperStatus, obs: obs.info.status, gpu: system?.gpu?.name ?? null },
    };
  }

  function pushState() {
    configWindow?.webContents.send('deck:state', state());
  }

  store.subscribe(() => {
    server.broadcast('buttons', store.config.buttons.map(toPublicButton));
    pushState();
  });

  try {
    await server.start(DECK_PORT);
  } catch (error) {
    dialog.showErrorBox(
      'Glassdeck could not start',
      `Port ${DECK_PORT} is already in use or blocked (${(error as Error).message}). Close the other program and try again.`,
    );
    app.quit();
    return;
  }
  helper.start();
  monitor.start();
  obs.start();
  app.on('before-quit', () => {
    helper.stop();
    monitor.stop();
    obs.stop();
  });

  // Only the config window may call these; every argument is validated because it crosses a process boundary.
  const fromConfigWindow = (event: IpcMainInvokeEvent) => event.sender === configWindow?.webContents;

  ipcMain.handle('deck:getState', (event) => (fromConfigWindow(event) ? state() : null));
  ipcMain.handle('deck:addApps', async (event) => {
    if (!fromConfigWindow(event) || !configWindow) return;
    const result = await dialog.showOpenDialog(configWindow, {
      title: 'Add apps',
      defaultPath: START_MENU,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Apps and shortcuts', extensions: APP_EXTENSIONS }],
    });
    if (!result.canceled) store.addButtons(await Promise.all(result.filePaths.map(describeApp)));
  });
  ipcMain.handle('deck:updateButton', (event, id: unknown, edit: unknown) => {
    if (!fromConfigWindow(event) || typeof id !== 'string' || !isRecord(edit)) return;
    store.updateButton(id, {
      title: typeof edit.title === 'string' ? edit.title : undefined,
      tint: isDeckTint(edit.tint) ? edit.tint : undefined,
    });
  });
  ipcMain.handle('deck:removeButton', (event, id: unknown) => {
    if (fromConfigWindow(event) && typeof id === 'string') store.removeButton(id);
  });
  ipcMain.handle('deck:moveButton', (event, id: unknown, offset: unknown) => {
    if (fromConfigWindow(event) && typeof id === 'string' && Number.isInteger(offset)) store.moveButton(id, offset as number);
  });
  ipcMain.handle('deck:resetPairing', (event) => {
    if (!fromConfigWindow(event)) return;
    store.resetToken();
    server.disconnectAll();
    pins.rotate();
  });

  createConfigWindow();
}

function migrateLegacyConfig(configPath: string) {
  const legacyPath = join(app.getPath('appData'), LEGACY_APP_NAME, 'deck.json');
  if (existsSync(configPath) || !existsSync(legacyPath)) return;
  mkdirSync(dirname(configPath), { recursive: true });
  copyFileSync(legacyPath, configPath);
}

function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 880,
    minHeight: 580,
    title: 'Glassdeck',
    backgroundColor: '#05060a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  configWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  configWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  configWindow.on('closed', () => {
    configWindow = null;
  });

  if (isDev) configWindow.loadURL(`${DEV_SERVER_URL}/config.html`);
  else configWindow.loadFile(join(WEB_DIST, 'config.html'));
}

/** Addresses of this PC on the local network, in the form the phone should open. */
function phoneUrls(): string[] {
  // 169.254.x.x is Windows' self-assigned fallback on unconnected adapters; a phone can't reach it.
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.'))
    .map((info) => info!.address);
  return addresses.map((address) =>
    isDev ? `http://${address}:${DEV_SERVER_PORT}/phone.html` : `http://${address}:${DECK_PORT}`,
  );
}
