// Electron host: owns the deck config, runs the LAN server for the phone and the config window on the PC.
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { isDeckTint, isRecord, toPublicButton } from '../src/core/deck';
import type { DeckState } from '../src/core/deckApi';
import { APP_EXTENSIONS, describeApp, openTarget } from './appInfo';
import { createDeckServer, DECK_PORT, type LaunchResult } from './deckServer';
import { createDeckStore } from './deckStore';
import { createPinGuard } from './pinGuard';

const isDev = process.argv.includes('--dev');
const DEV_SERVER_URL = 'http://localhost:5173';
const DEV_SERVER_PORT = 5173;
const WEB_DIST = join(__dirname, '..', '..', 'dist');
const START_MENU = join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');

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
  const store = createDeckStore(join(app.getPath('userData'), 'deck.json'));
  const pins = createPinGuard(() => pushState());

  async function launch(id: string): Promise<LaunchResult> {
    const button = store.findButton(id);
    if (!button) return 'not-found';
    return (await openTarget(button.target)) ? 'ok' : 'failed';
  }

  const server = createDeckServer({
    staticDir: WEB_DIST,
    getButtons: () => store.config.buttons.map(toPublicButton),
    getToken: () => store.config.token,
    isValidToken: (token) => store.isValidToken(token),
    checkPin: (pin) => pins.check(pin),
    launch,
    onClientsChanged: () => pushState(),
  });

  function state(): DeckState {
    return {
      buttons: store.config.buttons,
      pin: pins.pin,
      phoneUrls: phoneUrls(),
      connectedPhones: server.clientCount,
    };
  }

  function pushState() {
    configWindow?.webContents.send('deck:state', state());
  }

  store.subscribe(() => {
    server.broadcastButtons();
    pushState();
  });

  try {
    await server.start(DECK_PORT);
  } catch (error) {
    dialog.showErrorBox(
      'Deck could not start',
      `Port ${DECK_PORT} is already in use or blocked (${(error as Error).message}). Close the other program and try again.`,
    );
    app.quit();
    return;
  }

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

function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    title: 'Deck',
    backgroundColor: '#000000',
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
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal)
    .map((info) => info!.address);
  return addresses.map((address) =>
    isDev ? `http://${address}:${DEV_SERVER_PORT}/phone.html` : `http://${address}:${DECK_PORT}`,
  );
}
