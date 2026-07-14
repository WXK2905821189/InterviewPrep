// ============================================================
// AI Provider Kit 桥接层
// 将 ESM 的 ai-provider-kit 封装为 MVP 的 CommonJS 兼容接口
// 原库路径: C:\Users\wxk29\Documents\Codex\...\ai-provider-kit
// ============================================================

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ---- Token 用量追踪 ----
let _tokenUsage = { prompt: 0, completion: 0, total: 0, calls: 0 };
let _appConfigFile = null; // initialized after PROVIDER_KIT_PATH

function _appCfgPath() {
  if (_appConfigFile) return _appConfigFile;
  // 使用 CONFIG_DIR（Electron 模式下指向用户 AppData）
  const p = CONFIG_DIR;
  _appConfigFile = path.join(p, '.local', 'app-config.json');
  return _appConfigFile;
}

function _loadAppConfig() {
  try {
    const f = _appCfgPath();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {}
  return { connections: {} };
}
function _saveAppConfig(cfg) {
  try { fs.writeFileSync(_appCfgPath(), JSON.stringify(cfg, null, 2)); } catch {}
}

// 为连接保存 temperature
function setConnectionTemperature(connectionId, temperature) {
  const cfg = _loadAppConfig();
  cfg.connections[connectionId] = { ...(cfg.connections[connectionId] || {}), temperature };
  _saveAppConfig(cfg);
}
// 读取连接 temperature，无则返回 0.7
function getConnectionTemperature(connectionId) {
  const cfg = _loadAppConfig();
  return cfg.connections[connectionId]?.temperature ?? 0.7;
}

function getTokenUsage() { return { ..._tokenUsage }; }
function resetTokenUsage() { _tokenUsage = { prompt: 0, completion: 0, total: 0, calls: 0 }; }

// ai-provider-kit 路径查找（优先级）:
//   1) 环境变量 AI_PROVIDER_KIT_PATH
//   2) 项目根目录下的 ai-provider-kit/ 子目录（build 版本）
//   3) 硬编码的开发机路径
function resolveProviderKitPath() {
  // 1) 环境变量
  if (process.env.AI_PROVIDER_KIT_PATH) return process.env.AI_PROVIDER_KIT_PATH;

  // 2) 项目根目录下自带
  const local = path.resolve(__dirname, '..', 'ai-provider-kit');
  if (fs.existsSync(local)) return local;

  // 3) 硬编码后备
  return 'C:\\Users\\wxk29\\Documents\\Codex\\2026-07-09\\c-users-wxk29-codex-skills-ai\\outputs\\ai-provider-kit';
}

const PROVIDER_KIT_PATH = resolveProviderKitPath();
// Electron 模式下，配置写入 DATA_DIR（真实文件系统）而非 asar
const CONFIG_DIR = process.env.ELECTRON_MODE === '1'
  ? (process.env.DATA_DIR || PROVIDER_KIT_PATH)
  : PROVIDER_KIT_PATH;

// ESM 模块需要在 CJS 中通过 file:// URL 加载
const PROVIDER_KIT_URL = pathToFileURL(path.join(PROVIDER_KIT_PATH, 'src', 'index.js')).href;

/** @type {object|null} 延迟加载的 ai-provider-kit 实例 */
let _kit = null;
let _client = null;

// ---- 延迟加载 ai-provider-kit（ESM → CJS 桥接） ----
async function loadKit() {
  if (_kit) return _kit;

  // Node.js CJS 中通过动态 import() + file:// URL 加载 ESM 模块
  const mod = await import(PROVIDER_KIT_URL);
  _kit = mod;
  return _kit;
}

// ---- 获取或创建共享 client ----
async function getClient() {
  if (_client) return _client;

  const kit = await loadKit();
  const store = kit.createFileConnectionStore({
    filePath: path.join(CONFIG_DIR, '.local', 'ai-connections.json')
  });

  _client = kit.createAiClient({
    store,
    cache: kit.createExactCache({ ttlMs: 5 * 60_000 })  // 5分钟缓存
  });

  // 注册默认上下文包
  _client.registerContextPack('interview.rules', [
    {
      role: 'system',
      content: [
        '你是一个有帮助的AI助手，专门服务于面试准备场景。',
        '请始终使用中文回答。',
        '在分析JD和简历时，保持客观、具体、有建设性。',
        '在扮演面试官时，保持专业但不过于生硬。'
      ].join(' ')
    }
  ]);

  return _client;
}

// ---- 封装的 LLM 调用（完全兼容原 llm-client.js 接口） ----
async function llm(systemPrompt, userContent, { jsonMode = true, temperature = 0.7 } = {}) {
  const client = await getClient();

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent, null, 2) }
  ];

  try {
    const result = await client.chat({
      modelAlias: 'chat.cheap',           // 默认用 DeepSeek（便宜）
      contextPackIds: ['interview.rules'], // 注入面试场景规范
      messages,
      temperature,
      cache: true,                        // 确定性请求缓存
      fallbackAliases: ['chat.fast']      // DeepSeek 挂了切 OpenAI
    });

    const text = result.content || '';

    // 追踪 token 用量
    if (result.usage) {
      _tokenUsage.prompt += result.usage.prompt_tokens || 0;
      _tokenUsage.completion += result.usage.completion_tokens || 0;
      _tokenUsage.total += result.usage.total_tokens || 0;
      _tokenUsage.calls++;
    }

    if (jsonMode) {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        return JSON.parse(match ? match[0] : text);
      } catch {
        return { raw: text, parse_error: true };
      }
    }
    return text;
  } catch (e) {
    console.error('[AI Provider Kit] LLM 调用失败:', e.message);
    throw e;
  }
}

// ---- 模板变量替换 ----
function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    );
  }
  return result;
}

// ---- 连接管理 API ----
async function listConnections() {
  const client = await getClient();
  return client.listConnections();
}

async function saveConnection(input) {
  const client = await getClient();
  return client.saveConnection(input);
}

async function setActiveConnection(id) {
  const client = await getClient();
  return client.setActiveConnection(id);
}

async function testConnection(input) {
  const client = await getClient();
  return client.testConnection(input);
}

// ---- 删除连接（直接操作JSON文件 + 清除内存缓存） ----
const CONNECTIONS_FILE = path.join(CONFIG_DIR, '.local', 'ai-connections.json');

async function deleteConnection(id) {
  try {
    if (!fs.existsSync(CONNECTIONS_FILE)) {
      return { ok: false, error: '连接文件不存在' };
    }
    const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf-8');
    const state = JSON.parse(raw);
    const before = (state.aiConnections || []).length;

    // 从连接列表中移除
    state.aiConnections = (state.aiConnections || []).filter(c => c.id !== id);

    // 如果删除的是当前激活的连接，自动切换到第一个剩余连接
    if (state.activeConnectionId === id) {
      state.activeConnectionId = state.aiConnections[0]?.id || '';
    }

    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(state, null, 2));

    // ⚠️ 关键：清除内存缓存，强制后续调用从文件重新加载
    _client = null;

    console.log(`[AI Provider] 已删除连接 ${id}, 剩余 ${state.aiConnections.length} 个`);
    return { ok: true, remaining: state.aiConnections.length };
  } catch (e) {
    console.error('[AI Provider] 删除连接失败:', e.message);
    return { ok: false, error: e.message };
  }
}

async function listProviders() {
  const client = await getClient();
  return client.listProviders();
}

async function fetchModels(input) {
  const client = await getClient();
  return client.fetchModels(input);
}

// ---- 启动本地网关（可选） ----
async function startGateway(port = 8787) {
  const kit = await loadKit();

  // 创建独立 gateway client（使用文件存储，与主 client 共享连接配置）
  const store = kit.createFileConnectionStore({
    filePath: path.join(CONFIG_DIR, '.local', 'ai-connections.json')
  });
  const gatewayClient = kit.createAiClient({
    store,
    cache: kit.createExactCache({ ttlMs: 5 * 60_000 })
  });
  gatewayClient.registerContextPack('default.zh', [
    { role: 'system', content: 'Always answer in Simplified Chinese.' }
  ]);

  const gateway = kit.createGatewayServer({ client: gatewayClient });
  const { url } = await gateway.listen(port, '0.0.0.0');

  console.log(`[AI Provider Kit] 网关已启动: ${url}`);
  console.log(`[AI Provider Kit] OpenAI-compatible Base URL: ${url}/v1`);

  return { gateway, url };
}

// ---- 导出 ----
module.exports = {
  // 兼容原 llm-client.js 接口
  llm,
  fillTemplate,

  // 连接管理
  listConnections,
  saveConnection,
  setActiveConnection,
  deleteConnection,
  testConnection,
  listProviders,
  fetchModels,

  // 温度 & 用法
  setConnectionTemperature,
  getConnectionTemperature,
  getTokenUsage,
  resetTokenUsage,

  // 网关
  startGateway,

  // 常量
  PROVIDER_KIT_PATH
};
