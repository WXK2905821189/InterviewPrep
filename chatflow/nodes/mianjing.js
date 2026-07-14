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
      timeout: 25000, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    console.warn(`[面经] 命令失败: ${e.message?.slice(0, 60)}`);
    return null;
  }
}

/**
 * 主入口：多轮搜索 → 逐篇读取 → LLM 结构化
 */
async function queryMianjing(company, position, keywords = []) {
  // ---- 第一轮：多关键词搜索 ----
  const searchQueries = [
    `${company} ${position} 面经`,
    `${company} ${position} 面试`,
    `${company} 面经 ${position}`,
    ...keywords.slice(0, 3).map(k => `${company} ${k} 面试 面经`),
    `${company} 面试题`,
    `${company} 面试经验分享`
  ];
  // 去重
  const uniqueQueries = [...new Set(searchQueries)].slice(0, 8);

  const allNotes = [];

  for (const q of uniqueQueries) {
    const raw = openCli(`opencli xiaohongshu search "${q}" -f json --limit 10`);
    if (!raw) continue;

    // 解析 JSON 搜索结果
    try {
      const results = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const items = Array.isArray(results) ? results : (results?.notes || results?.data || []);
      for (const item of items) {
        const url = item.url || '';  // 完整的签名 URL（带 xsec_token）
        const title = item.title || item.display_title || '';
        if (url && title) {
          allNotes.push({
            noteId: url,  // 用完整 URL 作为唯一标识，后续 note 命令也用它
            title,
            url,
            author: item.author || item.nickname || '',
            likes: item.likes || 0,
            source: '小红书'
          });
        }
      }
      console.log(`[面经] 搜索 "${q.slice(0, 20)}" → ${items.length} 篇`);
    } catch {
      console.warn(`[面经] 搜索 "${q.slice(0, 20)}" 返回非JSON，跳过`);
    }
  }

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

  // ---- 第二轮：逐篇读取笔记正文 ----
  // 注意：xiaohongshu note 需要完整签名 URL（从搜索结果 url 字段获取），不能只用 note_id
  const notesWithContent = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < Math.min(uniqueNotes.length, 12); i++) {
    const n = uniqueNotes[i];
    // noteId 已经是完整的签名 URL
    const signedUrl = n.noteId || n.url || '';
    if (!signedUrl) { failCount++; continue; }
    const content = openCli(`opencli xiaohongshu note "${signedUrl}" -f md`);
    if (content && content.length > 30) {
      // 解析 table 格式输出：| field | value |
      let title = n.title || '';
      let body = '';
      const lines = content.split('\n');
      for (const line of lines) {
        const m = line.match(/^\|\s*(title|content|author)\s*\|\s*(.+?)\s*\|/i);
        if (m) {
          const key = m[1].toLowerCase();
          const val = m[2].trim();
          if (key === 'title') title = val || title;
          if (key === 'content') body = val;
          if (key === 'author' && !n.author) n.author = val;
        }
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

module.exports = { queryMianjing };
