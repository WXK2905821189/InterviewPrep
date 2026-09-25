// ============================================================
// InterviewPrep MVP — Electron Preload
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // 获取真实版本号（从 package.json 读取）
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  // 一键更新：校验 → 下载 → 完整性校验 → 用户确认 → 解压
  installUpdate: (payload) => ipcRenderer.invoke('install-update', payload),
  restartApp: () => ipcRenderer.send('restart-app')
});

// 同时注入全局变量给前端 JS（向后兼容，优先使用 electronAPI.getVersion()）
window.addEventListener('DOMContentLoaded', async () => {
  window.__IS_ELECTRON__ = true;
  try {
    window.__ELECTRON_VERSION__ = await ipcRenderer.invoke('get-app-version');
  } catch {
    window.__ELECTRON_VERSION__ = '1.0.0';
  }
});