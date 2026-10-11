// ============================================================
// 连接工具 — 独立于 ai-provider-kit 的实现
// 云端部署时提供供应商预设列表、连接测试与模型拉取。
// 注意：连接与密钥由访客浏览器本地持有，本模块不读写任何连接配置。
// ============================================================

const fs = require('fs');
const path = require('path');

// openai SDK 延迟加载：它经 formdata-node 间接依赖 web-streams-polyfill，
// 顶层 require 会让「服务启动」依赖「AI SDK 及其全部传递依赖完好」。
// 云端构建缓存缺失文件时会导致进程直接退出，因此改为按需加载 + 可降级。
let _OpenAI = null;
let _openaiError = '';

function getOpenAI() {
  if (_OpenAI) return _OpenAI;
  if (_openaiError) return null;
  try {
    _OpenAI = require('openai').OpenAI;
    return _OpenAI;
  } catch (e) {
    _openaiError = e.message;
    console.error('[ConnStore] openai SDK 不可用，AI 连接测试与调用将不可用:', e.message);
    return null;
  }
}

const PROVIDERS_FILE = path.resolve(__dirname, '..', '.local', 'ai-providers.json');

function readJSON(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {}
  return fallback;
}

// ─── 内置供应商预设 ───
const DEFAULT_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', protocol: 'openai-compatible' },
  { id: 'deepseek', name: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', protocol: 'openai-compatible' },
  { id: 'custom', name: '自定义', defaultBaseUrl: '', defaultModel: 'gpt-4o-mini', protocol: 'openai-compatible' },
];

function listProviders() {
  const saved = readJSON(PROVIDERS_FILE, { providers: [] });
  const merged = [...DEFAULT_PROVIDERS];
  for (const p of (saved.providers || [])) {
    if (!merged.find(m => m.id === p.id)) merged.push(p);
  }
  return { providers: merged };
}

async function testConnection(input) {
  const conn = input.connection || input;
  const OpenAI = getOpenAI();
  if (!OpenAI) return { ok: false, message: 'AI SDK 不可用：' + _openaiError };
  try {
    const client = new OpenAI({
      baseURL: conn.apiBaseUrl || 'https://api.openai.com/v1',
      apiKey: conn.apiKey || '',
      timeout: 15000
    });
    const resp = await client.models.list();
    const models = (resp.data || []).map(m => m.id).filter(id => id && !id.includes('dall-e') && !id.includes('whisper') && !id.includes('tts') && !id.includes('embedding')).slice(0, 20);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function fetchModels(input) {
  return testConnection(input);
}

module.exports = { listProviders, testConnection, fetchModels };