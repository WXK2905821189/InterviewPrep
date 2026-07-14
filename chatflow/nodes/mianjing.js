// ============================================================
// 面经采集节点 V2 — opencli 小红书多轮搜索 + 逐篇读取正文
// ============================================================

const { execSync } = require('child_process');
const { llm } = require('../llm-client');
const { MIANJING_CLEAN_SYSTEM } = require('../prompts');

/**
 * 执行 opencli 命令，超时 25s，返回 stdout 或 null
 */
function openCli(cmd) {
  try {
    console.log(`[面经] 执行: ${cmd.slice(0, 80)}...`);
    return execSync(cmd, {
      timeout: 12000, encoding: 'utf-8', maxBuffer: 3 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    console.warn(`[面经] 命令失败: ${e.message?.slice(0, 60)}`);
    return null;
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 主入口：一次关键词搜索 → 逐篇读取 → LLM 结构化
 */
async function queryMianjing(company, position, keywords = []) {
  // ---- 一次搜索：公司名 + 岗位 + 面经 ----
  const query = `${company} ${position} 面经`;

  const allNotes = [];
  const raw = openCli(`opencli xiaohongshu search "${query}" -f json --limit 10`);
  if (raw) {
    try {
      const results = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const items = Array.isArray(results) ? results : (results?.notes || results?.data || []);
      for (const item of items) {
        const url = item.url || '';
        const title = item.title || item.display_title || '';
        if (url && title) {
          allNotes.push({ noteId: url, title, url, author: item.author || item.nickname || '', likes: item.likes || 0, source: '小红书' });
        }
      }
      console.log(`[面经] 搜索 "${query}" → ${items.length} 篇`);
    } catch {
      console.warn(`[面经] 搜索 "${query}" 返回非JSON，跳过`);
    }
  }

  // 搜索后等待2秒，避免触发反爬
  await sleep(2000);

  // 去重（用完整 URL 作为唯一键）
  const seenIds = new Set();
  const uniqueNotes = allNotes.filter(n => {
    const key = n.noteId; // 完整签名 URL
    if (!key || seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  }).slice(0, 30);

  console.log(`[面经] 搜索完成: ${uniqueNotes.length} 篇候选笔记`);

  if (uniqueNotes.length < 3) {
    return null;
  }

  // ---- 第二轮：逐篇读取笔记正文（间隔2秒防反爬） ----
  const notesWithContent = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < Math.min(uniqueNotes.length, 5); i++) {
    const n = uniqueNotes[i];
    const signedUrl = n.noteId || n.url || '';
    if (!signedUrl) { failCount++; continue; }
    // 篇与篇之间间隔 2 秒，防小红书 "操作太频繁"
    if (i > 0) await sleep(2000);
    const content = openCli(`opencli xiaohongshu note "${signedUrl}" -f md`);
    if (content && content.length > 30) {
      let title = n.title || '';
      let body = '';

      // 策略1：解析 table 格式输出：| field | value |
      const lines = content.split('\n');
      for (const line of lines) {
        const m = line.match(/^\|\s*(title|content|author)\s*\|\s*(.+?)\s*\|/i);
        if (m) {
          const key = m[1].toLowerCase();
          const val = m[2].trim();
          if (key === 'title') title = val || title;
          if (key === 'content' && val.length > body.length) body = val;
          if (key === 'author' && !n.author) n.author = val;
        }
      }

      // 策略2：如果 table 解析没拿到正文，尝试从 markdown 段落提取
      if (body.length < 30) {
        const paragraphs = content.split('\n\n').filter(p => {
          const t = p.trim();
          return t.length > 40 && !t.startsWith('#') && !t.startsWith('|') && !t.startsWith('*');
        });
        body = paragraphs.slice(0, 3).join('\n\n');
      }
      // 策略3：全量兜底（去掉明显的表格和标题行）
      if (body.length < 20) {
        body = lines.filter(l => !l.match(/^\|/) && !l.match(/^#/) && l.trim().length > 20).join('\n');
      }
      if (body.length > 20) {
        notesWithContent.push({ ...n, title, content: body.slice(0, 3000) });
        successCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
    }
  }

  console.log(`[面经] 正文读取: ${successCount} 成功, ${failCount} 失败`);

  if (notesWithContent.length < 2) {
    console.log('[面经] 有效正文不足2篇，返回 null');
    return null;
  }

  // ---- 第三轮：LLM 结构化提取 ----
  // 构建包含原文的输入
  const rawText = notesWithContent.map((n, i) =>
    `### 笔记 ${i + 1}
标题: ${n.title}
作者: ${n.author || '未知'}
点赞: ${n.likes || 0}
URL: ${n.url || `https://www.xiaohongshu.com/explore/${n.noteId}`}

正文:
${n.content}
`
  ).join('\n---\n');

  const prompt = MIANJING_CLEAN_SYSTEM.replace('{{raw_mianjing}}', rawText.slice(0, 12000));

  let cleaned;
  try {
    cleaned = await llm(prompt, '', { temperature: 0.3 });
  } catch (e) {
    console.warn('[面经] LLM 清洗失败:', e.message?.slice(0, 60));
    return {
      source_count: notesWithContent.length,
      sources: notesWithContent.map(n => ({
        title: n.title, url: `https://www.xiaohongshu.com/explore/${n.noteId}`,
        platform: '小红书', author: n.author
      })),
      questions: [],
      meta: { raw_notes: notesWithContent.length }
    };
  }

  return {
    source_count: notesWithContent.length,
    sources: notesWithContent.map(n => ({
      title: n.title, url: n.url || (n.noteId ? `https://www.xiaohongshu.com/explore/${n.noteId}` : ''),
      platform: '小红书', author: n.author, likes: n.likes
    })),
    ...cleaned
  };
}

/**
 * 批量解析笔记正文（复用策略123）
 */
function parseNoteContent(content, fallbackTitle) {
  let title = fallbackTitle || '';
  let body = '';
  const lines = content.split('\n');
  // 策略1：解析 table 格式
  for (const line of lines) {
    const m = line.match(/^\|\s*(title|content|author)\s*\|\s*(.+?)\s*\|/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'title') title = val || title;
      if (key === 'content' && val.length > body.length) body = val;
      if (key === 'author' && !n?.author) {} // placeholder
    }
  }
  // 策略2：段落提取
  if (body.length < 30) {
    const paragraphs = content.split('\n\n').filter(p => {
      const t = p.trim();
      return t.length > 40 && !t.startsWith('#') && !t.startsWith('|') && !t.startsWith('*');
    });
    body = paragraphs.slice(0, 3).join('\n\n');
  }
  // 策略3：全量兜底
  if (body.length < 20) {
    body = lines.filter(l => !l.match(/^\|/) && !l.match(/^#/) && l.trim().length > 20).join('\n');
  }
  return { title, body: body.slice(0, 3000) };
}

/**
 * LLM 清洗所有笔记为结构化面经数据
 */
async function cleanNotesToQuestions(notesWithContent) {
  if (!notesWithContent.length) return { questions: [], sources: [], source_count: 0 };

  const rawText = notesWithContent.map((n, i) =>
    `### 笔记 ${i + 1}
标题: ${n.title}
作者: ${n.author || '未知'}
点赞: ${n.likes || 0}
URL: ${n.url || ''}

正文:
${n.content}
`
  ).join('\n---\n');

  const prompt = MIANJING_CLEAN_SYSTEM.replace('{{raw_mianjing}}', rawText.slice(0, 12000));

  let cleaned;
  try {
    cleaned = await llm(prompt, '', { temperature: 0.3 });
  } catch (e) {
    console.warn('[面经] LLM 清洗失败:', e.message?.slice(0, 60));
    return {
      source_count: notesWithContent.length,
      sources: notesWithContent.map(n => ({
        title: n.title, url: n.url, platform: '小红书', author: n.author
      })),
      questions: [],
      meta: { raw_notes: notesWithContent.length }
    };
  }

  return {
    source_count: notesWithContent.length,
    sources: notesWithContent.map(n => ({
      title: n.title, url: n.url,
      platform: '小红书', author: n.author, likes: n.likes
    })),
    ...cleaned
  };
}

/**
 * 手动URL批量抓取（关面经时用户粘贴链接）
 * @param {string[]} urls - 小红书帖子链接列表
 * @returns 结构化面经数据
 */
async function fetchNotesFromUrls(urls) {
  if (!urls || !urls.length) return null;

  const notesWithContent = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < Math.min(urls.length, 5); i++) {
    const url = urls[i].trim();
    if (!url) { failCount++; continue; }
    // 篇与篇之间间隔 2 秒，防反爬
    if (i > 0) await sleep(2000);

    const content = openCli(`opencli xiaohongshu note "${url}" -f md`);
    if (content && content.length > 30) {
      const { title, body } = parseNoteContent(content, url);
      if (body.length > 20) {
        notesWithContent.push({ title: title || url, url, content: body, author: '', likes: 0 });
        successCount++;
      } else { failCount++; }
    } else { failCount++; }
  }

  console.log(`[面经-手动URL] 正文读取: ${successCount} 成功, ${failCount} 失败`);
  if (notesWithContent.length < 1) return null;

  return await cleanNotesToQuestions(notesWithContent);
}

module.exports = { queryMianjing, fetchNotesFromUrls };
