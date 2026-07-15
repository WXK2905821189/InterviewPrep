// ============================================================
// InterviewPrep MVP — Electron Preload
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appVersion: '1.2.0',
  isElectron: true,
  // 一键更新：下载 → 解压 → 安装
  installUpdate: (downloadUrl) => ipcRenderer.invoke('install-update', downloadUrl),
  restartApp: () => ipcRenderer.send('restart-app')
});

// 同时注入全局变量给前端 JS
process.once('loaded', () => {
  // 用 script 注入方式更可靠
});
window.addEventListener('DOMContentLoaded', () => {
  window.__ELECTRON_VERSION__ = '1.2.0';
  window.__IS_ELECTRON__ = true;
});
