const { contextBridge, ipcRenderer } = require('electron');

/**
 * Pharmacy POS Preload Script
 * Exposes a minimal, hardened IPC bridge to the renderer process.
 * Node integration is disabled and context isolation is enabled.
 */

// Whitelisted IPC invoke/send channels
const ALLOWED_INVOKE_CHANNELS = [
  'pos:get-version',
  'pos:get-system-info',
  'pos:print-receipt',
];

const ALLOWED_SEND_CHANNELS = [
  'pos:window-minimize',
  'pos:window-maximize',
  'pos:window-close',
];

const ALLOWED_RECEIVE_CHANNELS = [
  'pos:barcode-scanned',
  'pos:printer-status',
];

contextBridge.exposeInMainWorld('electronAPI', {
  // Application Information
  getVersion: () => ipcRenderer.invoke('pos:get-version'),
  getSystemInfo: () => ipcRenderer.invoke('pos:get-system-info'),

  // Hardware & POS Actions
  printReceipt: (options) => ipcRenderer.invoke('pos:print-receipt', options),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('pos:window-minimize'),
  maximizeWindow: () => ipcRenderer.send('pos:window-maximize'),
  closeWindow: () => ipcRenderer.send('pos:window-close'),

  // Generic Secure IPC Invoke
  invoke: (channel, data) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Unauthorized IPC invoke channel: ${channel}`));
  },

  // Generic Secure IPC Send
  send: (channel, data) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`Blocked unauthorized IPC send channel: ${channel}`);
    }
  },

  // Safe IPC Event Listener with subscription cleanup
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    console.warn(`Blocked unauthorized IPC listen channel: ${channel}`);
    return () => {};
  },
});
