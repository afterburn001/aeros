// The only bridge between the UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['graphics:changed', 'window:shown', 'app:refresh', 'updates:status'];

contextBridge.exposeInMainWorld('weatherApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getConfig: () => ipcRenderer.invoke('config:get'),
  detectLocation: () => ipcRenderer.invoke('location:detect'),
  searchCities: (query) => ipcRenderer.invoke('cities:search', query),
  getWeather: (loc) => ipcRenderer.invoke('weather:get', loc),
  listGraphics: () => ipcRenderer.invoke('graphics:list'),
  trimGraphic: (slot) => ipcRenderer.invoke('graphics:trim', slot),
  updateTray: (payload) => ipcRenderer.send('tray:update', payload),
  openFooterLink: () => ipcRenderer.send('app:open-footer-link'),
  hideWindow: () => ipcRenderer.send('window:hide'),
  checkForUpdates: () => ipcRenderer.send('updates:check'),
  rendered: () => ipcRenderer.send('app:rendered'),
  on: (channel, fn) => {
    if (EVENTS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
