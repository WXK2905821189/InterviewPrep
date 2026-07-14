// ============================================================
// InterviewPrep MVP — Electron Main Process
// ============================================================
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let loadingWindow = null;

// ── 创建主窗口 ──
function createMainWindow(PORT) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'InterviewPrep MVP — AI面试押题与模拟面试官',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a'
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (loadingWindow) { loadingWindow.close(); loadingWindow = null; }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 启动加载窗口 ──
function showLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 500, height: 360, frame: false, transparent: false,
    resizable: false, alwaysOnTop: true, backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Microsoft YaHei',sans-serif;background:#0f172a;color:#e2e8f0;
display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;overflow:hidden;}
.logo{font-size:2.5rem;margin-bottom:0.3rem}
.title{font-size:1.3rem;font-weight:700;color:#818cf8;margin-bottom:0.2rem}
.sub{font-size:0.78rem;color:#64748b;margin-bottom:1.5rem}
.loader{width:200px;height:3px;background:#1e293b;border-radius:2px;overflow:hidden}
.loader-fill{width:30%;height:100%;background:linear-gradient(90deg,#818cf8,#10b981);border-radius:2px;animation:load 1.2s ease-in-out infinite}
@keyframes load{0%{width:10%;margin-left:0}50%{width:50%;margin-left:25%}100%{width:10%;margin-left:90%}}
.tip{font-size:0.72rem;color:#475569;margin-top:1.2rem}
</style></head><body>
<div class="logo">🎯</div>
<div class="title">InterviewPrep MVP</div>
<div class="sub">AI 面试押题 · 模拟面试官</div>
<div class="loader"><div class="loader-fill"></div></div>
<div class="tip">正在启动服务...</div>
</body></html>
`)}`);
}

// ── 菜单栏 ──
function buildMenu() {
  const template = [
    {
      label: '应用',
      submenu: [
        { label: '关于 InterviewPrep', click: () => dialog.showMessageBox(mainWindow, { title: '关于', message: 'InterviewPrep MVP v1.1.0\n\nAI 面试押题与模拟面试官\n\n基于 OpenCLI + LLM 驱动', type: 'info' }) },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: 'OpenCLI 文档', click: () => shell.openExternal('https://github.com/jackwener/OpenCLI') },
        { label: 'GitHub 项目', click: () => shell.openExternal('https://github.com/WXK2905821189/InterviewPrep') }
      ]
    }
  ];
  if (process.platform === 'darwin') {
    template.unshift({ label: app.getName(), submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App 生命周期 ──
app.whenReady().then(async () => {
  buildMenu();
  showLoadingWindow();

  try {
    // Electron 模式下，数据目录必须指向真实文件系统（asar 只读）
    const userDataPath = app.getPath('userData');
    process.env.DATA_DIR = userDataPath;
    process.env.ELECTRON_MODE = '1';
    // 不让 AI_PROVIDER_KIT_PATH 覆盖代码路径 —— 代码在 asar 内，通过 __dirname/../ai-provider-kit 自动找到
    // 配置文件路径由 ai-provider.js 内部的 DATA_DIR 判断重定向

    // 确保数据目录存在
    try { fs.mkdirSync(path.join(userDataPath, '.data'), { recursive: true }); } catch {}
    try { fs.mkdirSync(path.join(userDataPath, 'logs'), { recursive: true }); } catch {}
    try { fs.mkdirSync(path.join(userDataPath, '.local'), { recursive: true }); } catch {}

    // 直接 require server.js —— Electron 主进程本身就是 Node，无需 spawn 子进程
    const serverModule = require('../server.js');
    await serverModule.startServer();
    createMainWindow(serverModule.PORT || 3456);
  } catch (err) {
    if (loadingWindow) loadingWindow.close();
    dialog.showErrorBox('启动失败',
      `无法启动后端服务。\n\n错误: ${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    const serverModule = require('../server.js');
    createMainWindow(serverModule.PORT || 3456);
  }
});
