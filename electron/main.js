// ============================================================
// InterviewPrep MVP — Electron Main Process
// ============================================================
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3456;
const ROOT = path.resolve(__dirname, '..');

let mainWindow = null;
let serverProcess = null;
let loadingWindow = null;

// ── 启动 Express 后端 ──
function startBackend() {
  return new Promise((resolve, reject) => {
    const serverJs = path.join(ROOT, 'server.js');
    serverProcess = spawn('node', [serverJs], {
      cwd: ROOT,
      env: { ...process.env, ELECTRON_MODE: '1', PORT: String(PORT) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) reject(new Error('后端启动超时 (30s)'));
    }, 30000);

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[backend]', msg.trim());
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[backend:err]', data.toString().trim());
    });

    serverProcess.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`后端进程退出，code=${code}`));
      }
    });

    // 轮询等待健康检查就绪
    const poll = (retry = 0) => {
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          started = true;
          clearTimeout(timeout);
          resolve();
        } else if (retry < 40) {
          setTimeout(() => poll(retry + 1), 500);
        } else {
          clearTimeout(timeout);
          reject(new Error('后端健康检查失败'));
        }
      });
      req.on('error', () => {
        if (retry < 40) setTimeout(() => poll(retry + 1), 500);
        else { clearTimeout(timeout); reject(new Error('后端无响应')); }
      });
      req.setTimeout(2000, () => { req.destroy(); if (retry < 40) poll(retry + 1); });
    };
    poll();
  });
}

// ── 创建主窗口 ──
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'InterviewPrep MVP — AI面试押题与模拟面试官',
    icon: path.join(ROOT, 'electron', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a'
  });

  // 加载应用
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (loadingWindow) { loadingWindow.close(); loadingWindow = null; }
  });

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 启动加载窗口 ──
function showLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 500,
    height: 360,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0f172a',
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
        { label: '关于 InterviewPrep', click: () => dialog.showMessageBox(mainWindow, { title: '关于', message: 'InterviewPrep MVP v1.0.0\n\nAI 面试押题与模拟面试官\n\n基于 OpenCLI + LLM 驱动', type: 'info' }) },
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

  // macOS 特殊处理
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App 生命周期 ──
app.whenReady().then(async () => {
  buildMenu();
  showLoadingWindow();

  try {
    await startBackend();
    createMainWindow();
  } catch (err) {
    if (loadingWindow) loadingWindow.close();
    dialog.showErrorBox('启动失败',
      `无法启动后端服务。\n\n错误: ${err.message}\n\n请确认:\n1. Node.js 已安装\n2. npm 依赖已安装 (npm install)`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
