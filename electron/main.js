// ============================================================
// InterviewPrep MVP — Electron Main Process
// ============================================================
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let loadingWindow = null;
let _serverModule = null;

// ── 读取版本号 ──
function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch { return '1.0.0'; }
}

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
  const appVersion = getAppVersion();
  const template = [
    {
      label: '应用',
      submenu: [
        { label: '关于 InterviewPrep', click: () => dialog.showMessageBox(mainWindow, { title: '关于', message: 'InterviewPrep MVP v' + appVersion + '\n\nAI 面试押题与模拟面试官\n\n基于 OpenCLI + LLM 驱动', type: 'info' }) },
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

// ── IPC: 获取版本号 ──
ipcMain.handle('get-app-version', () => {
  return getAppVersion();
});

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
    _serverModule = require('../server.js');
    await _serverModule.startServer();
    createMainWindow(_serverModule.PORT || 3456);
  } catch (err) {
    if (loadingWindow) loadingWindow.close();
    dialog.showErrorBox('启动失败',
      `无法启动后端服务。\n\n错误: ${err.message}`);
    app.quit();
  }
});

// ── 一键更新：IPC 处理 ──
const UPDATE_TEMP_DIR = path.join(require('os').tmpdir(), 'interviewprep-update');
const UPDATE_ZIP_PATH = path.join(require('os').tmpdir(), 'InterviewPrep-update.zip');
const UPDATE_MARKER_NAME = '.update-verified.json';
const MAX_UPDATE_BYTES = 500 * 1024 * 1024;
const MAX_UPDATE_REDIRECTS = 5;

// 允许的更新来源主机（GitHub Releases 及其 CDN）
const ALLOWED_UPDATE_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'codeload.github.com'
]);

function validateUpdateUrl(rawUrl, { requireZip = false } = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new Error('更新地址为空');
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('更新地址格式非法'); }
  if (parsed.protocol !== 'https:') throw new Error('更新地址必须使用 HTTPS');
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_UPDATE_HOSTS.has(host)) throw new Error(`更新来源不在白名单内：${host}`);
  if (requireZip && !/\.zip$/i.test(parsed.pathname)) throw new Error('更新包必须为 .zip 文件');
  return parsed;
}

// 逐跳校验重定向目标，避免被跳转到任意主机
function downloadToFile(urlStr, destPath, redirectsLeft = MAX_UPDATE_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = validateUpdateUrl(urlStr); } catch (e) { return reject(e); }

    const https = require('https');
    const req = https.get(parsed, {
      headers: { 'User-Agent': 'InterviewPrep-Updater', 'Accept': 'application/octet-stream' },
      timeout: 30000
    }, (resp) => {
      const status = resp.statusCode || 0;

      if (status >= 300 && status < 400 && resp.headers.location) {
        resp.resume();
        if (redirectsLeft <= 0) return reject(new Error('更新重定向次数过多'));
        let next;
        try { next = new URL(resp.headers.location, parsed).toString(); } catch { return reject(new Error('重定向地址非法')); }
        return downloadToFile(next, destPath, redirectsLeft - 1).then(resolve, reject);
      }

      if (status !== 200) { resp.resume(); return reject(new Error(`下载失败：HTTP ${status}`)); }
      const total = parseInt(resp.headers['content-length'] || '0', 10);
      if (total > MAX_UPDATE_BYTES) { resp.resume(); return reject(new Error('更新包体积超过上限')); }

      const file = fs.createWriteStream(destPath);
      let received = 0;
      let aborted = false;
      const fail = (err) => {
        if (aborted) return;
        aborted = true;
        req.destroy();
        file.destroy();
        reject(err);
      };
      resp.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_UPDATE_BYTES) fail(new Error('更新包体积超过上限'));
      });
      resp.on('error', fail);
      file.on('error', fail);
      file.on('finish', () => { if (!aborted) file.close(() => resolve()); });
      resp.pipe(file);
    });

    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', reject);
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = require('crypto').createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function normalizeSha256(value) {
  if (!value || typeof value !== 'string') return '';
  const hex = value.trim().toLowerCase().replace(/^sha256[:=]/, '');
  return /^[a-f0-9]{64}$/.test(hex) ? hex : '';
}

// 每次启动时检查是否有待安装的更新（仅安装通过校验的包）
app.whenReady().then(() => {
  try {
    if (!fs.existsSync(UPDATE_TEMP_DIR)) return;

    let sha = '';
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(UPDATE_TEMP_DIR, UPDATE_MARKER_NAME), 'utf8'));
      sha = normalizeSha256(marker && marker.sha256);
    } catch { sha = ''; }
    if (!sha) {
      fs.rmSync(UPDATE_TEMP_DIR, { recursive: true, force: true });
      console.warn('[Update] 更新包缺少有效的完整性校验标记，已丢弃');
      return;
    }

    const appRoot = path.dirname(path.dirname(__dirname)); // electron/ → mvp root
    copyDirSync(UPDATE_TEMP_DIR, appRoot, new Set([UPDATE_MARKER_NAME]));
    fs.rmSync(UPDATE_TEMP_DIR, { recursive: true, force: true });
    console.log('[Update] 已安装待处理更新 sha256=' + sha.slice(0, 12));
  } catch (e) { console.warn('[Update] 安装待处理更新失败:', e.message); }
});

function copyDirSync(src, dest, skip = new Set()) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) { copyDirSync(s, d, skip); }
    else { try { fs.copyFileSync(s, d); } catch {} }
  }
}

ipcMain.handle('install-update', async (_event, payload) => {
  const downloadUrl = typeof payload === 'string' ? payload : (payload && payload.url);
  const expectedSha = normalizeSha256(payload && typeof payload === 'object' ? payload.sha256 : '');
  let extractionStarted = false;

  try {
    // 1. 前置校验：HTTPS + 主机白名单 + .zip 后缀（快速失败，避免无谓下载）
    const source = validateUpdateUrl(downloadUrl, { requireZip: true });
    try { fs.rmSync(UPDATE_ZIP_PATH, { force: true }); } catch {}

    // 2. 下载（重定向逐跳复核）
    await downloadToFile(downloadUrl, UPDATE_ZIP_PATH);

    // 3. 完整性校验
    const actualSha = await sha256File(UPDATE_ZIP_PATH);
    if (expectedSha && actualSha !== expectedSha) {
      throw new Error(`完整性校验失败（期望 ${expectedSha.slice(0, 12)}…，实际 ${actualSha.slice(0, 12)}…）`);
    }

    // 4. 安装前必须由用户确认
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['取消', '确认安装'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: '确认安装更新',
      message: '即将安装已下载的更新包',
      detail: `来源：${source.hostname}\nSHA256：${actualSha}\n\n${expectedSha ? '完整性校验已通过。' : '⚠️ 发布方未提供校验值，无法验证完整性。'}\n安装完成后需要重启应用才能生效。`
    });
    if (response !== 1) {
      try { fs.rmSync(UPDATE_ZIP_PATH, { force: true }); } catch {}
      return { success: false, canceled: true, message: '已取消安装。' };
    }

    // 5. 解压到临时目录
    if (fs.existsSync(UPDATE_TEMP_DIR)) fs.rmSync(UPDATE_TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPDATE_TEMP_DIR, { recursive: true });
    extractionStarted = true;
    const { spawnSync } = require('child_process');
    const unzip = spawnSync('7z', ['x', UPDATE_ZIP_PATH, `-o${UPDATE_TEMP_DIR}`, '-y'], { stdio: 'pipe' });
    if (unzip.error || unzip.status !== 0) {
      throw new Error('解压失败：未找到可用的 7z 解压程序或压缩包已损坏');
    }

    // 6. 写入校验标记，供下次启动安装时复核
    fs.writeFileSync(path.join(UPDATE_TEMP_DIR, UPDATE_MARKER_NAME), JSON.stringify({
      sha256: actualSha,
      source: source.hostname,
      url: downloadUrl,
      verifiedAt: new Date().toISOString()
    }, null, 2));

    // 7. 查找解压后的实际内容目录 (可能是 win-unpacked 子目录)
    const extractedDirs = fs.readdirSync(UPDATE_TEMP_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    let contentDir = UPDATE_TEMP_DIR;
    if (extractedDirs.length === 1 && extractedDirs[0].name === 'win-unpacked') {
      contentDir = path.join(UPDATE_TEMP_DIR, 'win-unpacked');
    }

    try { fs.rmSync(UPDATE_ZIP_PATH, { force: true }); } catch {}
    return { success: true, message: '更新已校验并准备就绪，重启后生效。是否立即重启？', contentDir, sha256: actualSha };
  } catch (e) {
    try { fs.rmSync(UPDATE_ZIP_PATH, { force: true }); } catch {}
    if (extractionStarted) {
      try { fs.rmSync(UPDATE_TEMP_DIR, { recursive: true, force: true }); } catch {}
    }
    return { success: false, message: '更新失败: ' + (e.message || '未知错误') };
  }
});

ipcMain.on('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 确保退出时彻底清理所有进程
let _quitCleanupDone = false;
app.on('will-quit', (event) => {
  if (_quitCleanupDone) return;
  event.preventDefault();
  const finish = () => {
    if (_quitCleanupDone) return;
    _quitCleanupDone = true;
    // 强制退出进程，确保不会有残留（Windows 上尤为重要）
    app.exit(0);
  };
  // 先等待 HTTP 服务器关闭（释放端口、写完在途请求），再退出
  if (_serverModule && typeof _serverModule.stopServer === 'function') {
    Promise.resolve(_serverModule.stopServer()).then(finish, finish);
    // 兜底：清理超时也不能让进程挂住
    setTimeout(finish, 3000);
  } else {
    finish();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow((_serverModule && _serverModule.PORT) || 3456);
  }
});
