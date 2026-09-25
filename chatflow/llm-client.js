// ============================================================
// LLM Client — 自动选择后端
//   优先使用 ai-provider-kit (本地开发), 不存在时用 standalone-llm
// ============================================================

const path = require('path');
const fs = require('fs');

let _llm = null;
let _backend = 'unknown';

async function loadLlm() {
  if (_llm) return _llm;

  // 尝试 ai-provider-kit
  // 判定条件必须是「能否真实初始化」：ai-provider-kit 是延迟 import，
  // require 阶段不会抛错，若只判断 require 则降级分支永远不会进入。
  try {
    const provider = require('./ai-provider');
    if (!provider.isAvailable()) {
      throw new Error(`未安装于 ${provider.PROVIDER_KIT_PATH}`);
    }
    await provider.warmup();
    _llm = provider.llm;
    _backend = 'ai-provider-kit';
    console.log('[LLM] 使用 ai-provider-kit');
    return _llm;
  } catch (e) {
    console.warn('[LLM] ai-provider-kit 不可用, 降级 standalone:', e.message);
  }

  // 回退到 standalone
  try {
    const { standaloneLlm } = require('./standalone-llm');
    _llm = standaloneLlm;
    _backend = 'standalone';
    console.log('[LLM] 使用 standalone (直接 OpenAI API)');
    return _llm;
  } catch (e) {
    throw new Error('无法加载任何 LLM 后端: ' + e.message);
  }
}

/** 统一 LLM 接口, 与 ai-provider.js 签名兼容 */
async function llm(systemPrompt, userContent, opts = {}) {
  const fn = await loadLlm();
  return fn(systemPrompt, userContent, opts);
}

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

async function* llmStream(systemPrompt, userContent, opts = {}) {
  // 复用与 llm() 相同的后端判定，避免在 kit 不可用时误用其流式实现
  await loadLlm();
  if (_backend !== 'ai-provider-kit') {
    throw new Error(`流式接口仅由 ai-provider-kit 提供，当前后端为 ${_backend}`);
  }
  const provider = require('./ai-provider');
  yield* provider.llmStream(systemPrompt, userContent, opts);
}

module.exports = { llm, fillTemplate, llmStream };
