// ============================================================
// InterviewPrep MVP — Electron Preload
// ============================================================
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appVersion: '1.0.0',
  isElectron: true
});
