// ============================================================
// 独立 LLM 客户端 — 直接调用 OpenAI-compatible API
// 不依赖 ai-provider-kit，适用于云端部署
// 访客的密钥随请求头带入，服务端不落盘、不共享
// ============================================================

const { OpenAI } = require('openai');
const { getAiConfig } = require('./request-context');

function resolveConnection() {
  const cfg = getAiConfig();
  if (cfg && (cfg.apiBaseUrl || cfg.apiKey)) {
    return {
      apiBaseUrl: cfg.apiBaseUrl || 'https://api.openai.com/v1',
      apiKey: cfg.apiKey || '',
      model: cfg.model || 'gpt-4o-mini',
      temperature: cfg.temperature
    };
  }
  throw new Error('未配置 AI 供应商。请在设置面板中填写你自己的 API Key（仅保存在本机浏览器，不会上传）。');
}

let _client = null;
let _clientKey = '';

function getClient(conn) {
  const key = `${conn.apiBaseUrl}|${conn.apiKey || ''}`;
  if (_client && _clientKey === key) return _client;
  _client = new OpenAI({ baseURL: conn.apiBaseUrl, apiKey: conn.apiKey, timeout: 120000 });
  _clientKey = key;
  return _client;
}

async function standaloneLlm(systemPrompt, userContent, { jsonMode = true, temperature } = {}) {
  const conn = resolveConnection();
  const client = getClient(conn);
  const model = conn.model || 'gpt-4o-mini';
  // 调用方显式指定的 temperature 优先，其次用访客设置的创意度，最后 0.7
  const temp = temperature != null ? temperature : (conn.temperature != null ? conn.temperature : 0.7);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent, null, 2) }
  ];

  const resp = await client.chat.completions.create({ model, messages, temperature: temp, max_tokens: 4096 });
  const text = resp.choices?.[0]?.message?.content || '';

  if (jsonMode) {
    try {
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const candidate = codeBlock ? codeBlock[1] : text;
      const braceMatch = candidate.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(braceMatch ? braceMatch[0] : candidate);
      if (Object.keys(parsed).length === 0) throw new Error('empty object');
      return parsed;
    } catch (e) {
      console.warn('[Standalone LLM] JSON 解析失败:', e.message?.slice(0, 60));
      return { raw: text, parse_error: true, error_detail: e.message };
    }
  }
  return text;
}

module.exports = { standaloneLlm };