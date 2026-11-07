// ============================================================
// 运行日志模块 — 环形缓冲 + 文件落盘 + 导出
// 目的：LLM/接口出问题时，导出 log 文件即可交给 AI 快速定位
// ============================================================

const fs = require('fs');
const path = require('path');

const MAX_BUFFER = 2000;      // 内存环形缓冲条数
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 单文件滚动阈值 2MB
const buffer = [];
let logDir = null;
let logFile = null;

// 启动时由 server.js 注入数据目录（Electron 下为 userData）
function init(dataDir) {
  logDir = path.join(dataDir, 'logs');
  logFile = path.join(logDir, 'app.log');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    rollIfNeeded();
  } catch {}
}

function rollIfNeeded() {
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_FILE_BYTES) {
      fs.renameSync(logFile, logFile.replace(/\.log$/, '.1.log'));
    }
  } catch {}
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// 主入口：level INFO/WARN/ERROR/DEBUG，msg 文本，extra 可选对象（会 JSON 序列化）
function log(level, msg, extra) {
  let line = `[${ts()}] [${level}] ${msg}`;
  if (extra != null) {
    try {
      const s = typeof extra === 'string' ? extra : JSON.stringify(extra);
      // 单条过长截断，避免撑爆文件
      line += ' | ' + (s.length > 2000 ? s.slice(0, 2000) + '…(truncated)' : s);
    } catch {}
  }
  buffer.push(line);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  console.log(line);
  if (logFile) {
    try { rollIfNeeded(); fs.appendFileSync(logFile, line + '\n'); } catch {}
  }
  return line;
}

const info  = (msg, extra) => log('INFO', msg, extra);
const warn  = (msg, extra) => log('WARN', msg, extra);
const error = (msg, extra) => log('ERROR', msg, extra);
const debug = (msg, extra) => log('DEBUG', msg, extra);

// 最近日志（供前端预览）
function tail(n = 200) {
  return buffer.slice(-n);
}

// 导出用：环境元数据 + 全量缓冲
function exportText() {
  const meta = [
    '========== InterviewPrep 运行日志导出 ==========',
    `导出时间: ${new Date().toISOString()}`,
    `Node: ${process.version} | 平台: ${process.platform} ${process.arch}`,
    `数据目录: ${logDir || '(未初始化)'}`,
    `进程运行时长: ${Math.round(process.uptime())}s`,
    `缓冲条数: ${buffer.length}`,
    '================================================',
    ''
  ];
  return meta.concat(buffer).join('\n');
}

function clear() {
  buffer.length = 0;
}

module.exports = { init, log, info, warn, error, debug, tail, exportText, clear };
