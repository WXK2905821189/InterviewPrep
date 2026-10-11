// ============================================================
// 请求级 AI 配置上下文
//   访客的密钥只存在浏览器本地，随每个请求通过 x-ai-config 头带入。
//   服务端不落盘、不共享，仅在单次请求生命周期内通过 AsyncLocalStorage 传递。
// ============================================================

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/** 在指定 AI 配置下执行本次请求的后续处理 */
function runWithAiConfig(config, fn) {
  return storage.run(config, fn);
}

/** 取当前请求携带的 AI 配置，非请求上下文（如定时任务）返回 null */
function getAiConfig() {
  return storage.getStore() || null;
}

module.exports = { runWithAiConfig, getAiConfig };