// ============================================================
// 回归测试：Electron 更新链安全校验（P0-3）
//
// 覆盖：HTTPS 强制、主机白名单、重定向逐跳复核、体积上限、
//       SHA256 完整性校验、用户确认闸门、失败清理、启动安装闸门
//
// 运行：npm test
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

// ── 待测模块内的固定路径（与 electron/main.js 保持一致）──
const UPDATE_TEMP_DIR = path.join(os.tmpdir(), 'interviewprep-update');
const UPDATE_ZIP_PATH = path.join(os.tmpdir(), 'InterviewPrep-update.zip');
const UPDATE_MARKER_NAME = '.update-verified.json';
const MAX_UPDATE_BYTES = 500 * 1024 * 1024;

const DEFAULT_BODY = Buffer.from('fake-update-payload');
const RELEASE_URL = 'https://github.com/WXK2905821189/InterviewPrep/releases/download/v9/app.zip';

// ────────────────────────────────────────────────────────────
// Electron 桩
// ────────────────────────────────────────────────────────────
const ipcHandlers = new Map();
const dialogCalls = [];
const whenReadyCallbacks = [];
let dialogResponse = 0;

const electronStub = {
  app: {
    whenReady: () => {
      const chain = {
        then: (fn) => { whenReadyCallbacks.push(fn); return chain; },
        catch: () => chain
      };
      return chain;
    },
    getPath: () => path.join(os.tmpdir(), 'interviewprep-test-userdata'),
    getName: () => 'InterviewPrep',
    on: () => {}, quit: () => {}, relaunch: () => {}, exit: () => {}
  },
  BrowserWindow: function BrowserWindow() {
    this.webContents = { setWindowOpenHandler: () => {}, on: () => {} };
    this.loadURL = () => Promise.resolve();
    this.setWindowOpenHandler = () => {};
    this.once = () => {};
    this.on = () => {};
    this.show = () => {};
    this.close = () => {};
  },
  shell: { openExternal: () => {} },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  dialog: {
    showMessageBox: async (_win, options) => {
      dialogCalls.push(options);
      return { response: dialogResponse };
    },
    showErrorBox: () => {}
  },
  ipcMain: {
    handle: (channel, fn) => { ipcHandlers.set(channel, fn); },
    on: () => {}
  }
};

// ────────────────────────────────────────────────────────────
// https 桩：可编排响应序列，避免真实网络请求
// ────────────────────────────────────────────────────────────
let httpQueue = [];
const requestedUrls = [];

function setHttp(...responses) { httpQueue = responses.slice(); }

function nextHttp() {
  if (httpQueue.length === 0) return { statusCode: 200, headers: {}, body: DEFAULT_BODY };
  return httpQueue.length === 1 ? httpQueue[0] : httpQueue.shift();
}

const httpsStub = {
  get(url, _options, callback) {
    requestedUrls.push(String(url));
    const spec = nextHttp();
    const req = new EventEmitter();
    req.destroy = () => {};
    setImmediate(() => {
      const body = spec.body || Buffer.alloc(0);
      const resp = new EventEmitter();
      resp.statusCode = spec.statusCode;
      resp.headers = Object.assign({ 'content-length': String(body.length) }, spec.headers || {});
      resp.resume = () => {};
      resp.pipe = (dest) => { setImmediate(() => { dest.write(body); dest.end(); }); return dest; };
      callback(resp);
      setImmediate(() => resp.emit('data', body));
    });
    return req;
  }
};

// ────────────────────────────────────────────────────────────
// 加载待测模块（必须在 patch 之后 require）
// ────────────────────────────────────────────────────────────
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  if (request === 'https') return httpsStub;
  // 阻断真实后端启动，使 app.whenReady 回调可在测试中安全执行
  if (typeof request === 'string' && request.endsWith('server.js')) {
    return { startServer: async () => {}, stopServer: () => {}, PORT: 0 };
  }
  return originalLoad.apply(this, arguments);
};

require(path.resolve(__dirname, '..', 'electron', 'main.js'));

const installUpdate = ipcHandlers.get('install-update');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

beforeEach(() => {
  dialogResponse = 0;
  dialogCalls.length = 0;
  requestedUrls.length = 0;
  httpQueue = [];
  fs.rmSync(UPDATE_ZIP_PATH, { force: true });
  fs.rmSync(UPDATE_TEMP_DIR, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────
describe('更新链：URL 与来源校验', () => {
  const rejectCases = [
    ['空地址', null, '更新地址为空'],
    ['明文 HTTP', 'http://github.com/a/b.zip', '必须使用 HTTPS'],
    ['file 协议绕过', 'file:///C:/windows/system32/calc.zip', '必须使用 HTTPS'],
    ['非白名单主机', 'https://evil.example.com/a.zip', '不在白名单内'],
    ['localhost SSRF', 'https://localhost/a.zip', '不在白名单内'],
    ['子域欺骗', 'https://github.com.evil.tld/a.zip', '不在白名单内'],
    ['白名单主机但非 zip', 'https://github.com/owner/repo/releases/tag/v1', '.zip 文件'],
    ['对象载荷中的恶意 URL', { url: 'https://attacker.tld/x.zip', sha256: 'a'.repeat(64) }, '不在白名单内']
  ];

  for (const [name, input, expected] of rejectCases) {
    test(`拒绝：${name}`, async () => {
      const result = await installUpdate({}, input);
      assert.equal(result.success, false);
      assert.match(result.message, new RegExp(expected));
      // 前置校验必须快速失败：不发起请求、不弹确认框
      assert.equal(requestedUrls.length, 0);
      assert.equal(dialogCalls.length, 0);
    });
  }
});

// ────────────────────────────────────────────────────────────
describe('更新链：下载防护', () => {
  test('拒绝：HTTP 非 200 响应', async () => {
    setHttp({ statusCode: 500, headers: {}, body: Buffer.from('') });
    const result = await installUpdate({}, { url: RELEASE_URL });
    assert.equal(result.success, false);
    assert.match(result.message, /HTTP 500/);
  });

  test('拒绝：更新包超过体积上限', async () => {
    setHttp({ statusCode: 200, headers: { 'content-length': String(MAX_UPDATE_BYTES + 1) }, body: Buffer.from('') });
    const result = await installUpdate({}, { url: RELEASE_URL });
    assert.equal(result.success, false);
    assert.match(result.message, /超过上限/);
  });

  test('拒绝：重定向到非白名单主机（逐跳复核，不跟随）', async () => {
    const evilUrl = 'https://evil.example.com/payload.zip';
    setHttp({ statusCode: 302, headers: { location: evilUrl }, body: Buffer.from('') });
    const result = await installUpdate({}, { url: RELEASE_URL });
    assert.equal(result.success, false);
    assert.match(result.message, /不在白名单内/);
    assert.equal(requestedUrls.includes(evilUrl), false, '被拒的重定向目标不得被请求');
    assert.equal(requestedUrls.length, 1, '仅应发起初始请求');
  });

  test('放行：重定向到白名单 CDN 后继续校验', async () => {
    const cdnUrl = 'https://release-assets.githubusercontent.com/payload.zip?token=abc';
    setHttp(
      { statusCode: 302, headers: { location: cdnUrl }, body: Buffer.from('') },
      { statusCode: 200, headers: {}, body: DEFAULT_BODY }
    );
    const result = await installUpdate({}, { url: RELEASE_URL, sha256: 'c'.repeat(64) });
    assert.deepEqual(requestedUrls, [RELEASE_URL, cdnUrl], '应跟进白名单 CDN 重定向');
    assert.equal(result.success, false);
    assert.match(result.message, /完整性校验失败/);
  });

  test('清理：校验失败后不残留下载文件', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    const result = await installUpdate({}, { url: RELEASE_URL, sha256: 'd'.repeat(64) });
    assert.equal(result.success, false);
    assert.equal(fs.existsSync(UPDATE_ZIP_PATH), false);
    assert.equal(fs.existsSync(UPDATE_TEMP_DIR), false);
  });
});

// ────────────────────────────────────────────────────────────
describe('更新链：完整性校验与确认闸门', () => {
  test('拒绝：SHA256 与发布方摘要不一致', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    const result = await installUpdate({}, { url: RELEASE_URL, sha256: 'b'.repeat(64) });
    assert.equal(result.success, false);
    assert.match(result.message, /完整性校验失败/);
    assert.equal(dialogCalls.length, 0, '校验失败不得进入确认环节');
  });

  test('放行：摘要一致后进入确认环节', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    await installUpdate({}, { url: RELEASE_URL, sha256: sha256(DEFAULT_BODY) });
    assert.equal(dialogCalls.length, 1, '校验通过后必须弹出确认对话框');
    assert.match(dialogCalls[0].detail, /完整性校验已通过/);
    assert.match(dialogCalls[0].detail, /github\.com/);
  });

  test('拒绝：用户在确认框中选择取消', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    dialogResponse = 0;
    const result = await installUpdate({}, { url: RELEASE_URL, sha256: sha256(DEFAULT_BODY) });
    assert.equal(result.success, false);
    assert.equal(result.canceled, true);
    assert.equal(fs.existsSync(UPDATE_ZIP_PATH), false);
  });

  test('放行：用户确认后进入解压（测试载荷非真实 zip，解压必失败）', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    dialogResponse = 1;
    const result = await installUpdate({}, { url: RELEASE_URL, sha256: sha256(DEFAULT_BODY) });
    assert.equal(result.success, false);
    assert.match(result.message, /解压失败/);
    assert.equal(fs.existsSync(UPDATE_TEMP_DIR), false, '解压失败须清理临时目录');
  });

  test('提示：发布方未提供摘要时明确告知无法验证完整性', async () => {
    setHttp({ statusCode: 200, headers: {}, body: DEFAULT_BODY });
    await installUpdate({}, { url: RELEASE_URL });
    assert.equal(dialogCalls.length, 1);
    assert.match(dialogCalls[0].detail, /无法验证完整性/);
  });
});

// ────────────────────────────────────────────────────────────
describe('更新链：启动安装闸门', () => {
  async function runWhenReadyCallbacks() {
    for (const fn of whenReadyCallbacks) {
      try { await fn(); } catch { /* 启动副作用已在桩中隔离 */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  test('丢弃：无校验标记的更新残留', async () => {
    fs.mkdirSync(UPDATE_TEMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPDATE_TEMP_DIR, 'app.asar'), 'untrusted');
    await runWhenReadyCallbacks();
    assert.equal(fs.existsSync(UPDATE_TEMP_DIR), false, '无标记残留必须被清理，不得安装');
  });

  test('丢弃：校验标记中的 SHA256 非法', async () => {
    fs.mkdirSync(UPDATE_TEMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPDATE_TEMP_DIR, 'app.asar'), 'untrusted');
    fs.writeFileSync(
      path.join(UPDATE_TEMP_DIR, UPDATE_MARKER_NAME),
      JSON.stringify({ sha256: 'not-a-valid-hash' })
    );
    await runWhenReadyCallbacks();
    assert.equal(fs.existsSync(UPDATE_TEMP_DIR), false, '非法标记的残留必须被清理，不得安装');
  });
});