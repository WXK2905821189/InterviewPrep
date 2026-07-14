// ============================================================
// LLM Client - 通过 ai-provider-kit 统一调用（重构后）
// 原直连 OpenAI 的方式已被 ai-provider-kit 替代
// 向下兼容：保持 `llm()` 和 `fillTemplate()` 接口不变
// ============================================================

const { llm, fillTemplate } = require('./ai-provider');

module.exports = { llm, fillTemplate };
