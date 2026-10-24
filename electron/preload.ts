// Exposes the deck API to the config window. Sandboxed preload: only `electron` may be required at runtime.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DeckApi, DeckState } from '../src/core/deckApi';

const api: DeckApi = {
  getState: () => ipcRenderer.invoke('deck:getState'),
  addApps: () => ipcRenderer.invoke('deck:addApps'),
  updateButton: (id, edit) => ipcRenderer.invoke('deck:updateButton', id, edit),
  removeButton: (id) => ipcRenderer.invoke('deck:removeButton', id),
  moveButton: (id, offset) => ipcRenderer.invoke('deck:moveButton', id, offset),
  resetPairing: () => ipcRenderer.invoke('deck:resetPairing'),
  onState(listener) {
    const handler = (_event: IpcRendererEvent, state: DeckState) => listener(state);
    ipcRenderer.on('deck:state', handler);
    return () => {
      ipcRenderer.removeListener('deck:state', handler);
    };
  },
};

contextBridge.exposeInMainWorld('deck', api);
