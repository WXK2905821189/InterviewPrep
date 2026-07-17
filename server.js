// ============================================================
// InterviewPrep MVP - Express 服务器
// 将 Chatflow 引擎暴露为 REST API，前端通过 API 调用
// ============================================================

try { require('dotenv').config(); } catch {}
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

// ============================================================
// async exec 辅助 — 避免长时间子进程阻塞 event loop
// ============================================================
function execAsync(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: options.timeout || 30000, maxBuffer: options.maxBuffer || 5 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) {
        if (stdout && stdout.length > 20) resolve(stdout);
        else reject(error);
      } else resolve(stdout);
    });
  });
}
async function closeOpencliWindow() {
  try { await execAsync('opencli close', { timeout: 5000 }); } catch {}
}

// ---- 数据目录 (Electron模式用app.getPath('userData')，普通模式用__dirname) ----
const DATA_DIR = process.env.DATA_DIR || __dirname;
// ---- 日志系统（同时输出控制台 + 文件） ----
const LOG_DIR = path.join(DATA_DIR, 'logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const LOG_FILE = path.join(LOG_DIR, 'error.log');

function log(level, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}
function logInfo(msg)  { log('INFO', msg); }
function logWarn(msg)  { log('WARN', msg); }
function logError(msg) { log('ERROR', msg); }

process.on('uncaughtException', (err) => {
  logError('未捕获异常: ' + (err.stack || err.message));
});
process.on('unhandledRejection', (reason) => {
  logError('未处理的Promise拒绝: ' + (reason?.stack || reason?.message || reason));
});

logInfo('========== InterviewPrep MVP 启动 ==========');

const {
  runAnalysisPipeline,
  createInterviewSession,
  interviewStart,
  interviewRespond,
  evaluateFullSession,
  optimizeResume
} = require('./chatflow/engine');

// ---- ai-provider-kit 集成 ----
const {
  listConnections,
  saveConnection,
  setActiveConnection,
  deleteConnection,
  testConnection,
  listProviders,
  fetchModels,
  startGateway,
  PROVIDER_KIT_PATH,
  setConnectionTemperature,
  getConnectionTemperature,
  getTokenUsage
} = require('./chatflow/ai-provider');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传
const upload = multer({
  dest: path.join(DATA_DIR, '.data', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.txt').toLowerCase();
    if (['.txt','.md','.docx','.doc','.pdf'].includes(ext)) cb(null, true);
    else cb(new Error('仅支持 TXT / MD / DOCX / PDF 文件'));
  }
});

// ---- 会话存储 ----
const SESSIONS_FILE = path.join(DATA_DIR, '.data', 'sessions.json');
const PHRASES_FILE = path.join(DATA_DIR, '.data', 'phrase-library.json');
const MIANJING_BANK_FILE = path.join(DATA_DIR, '.data', 'mianjing-bank.json');

// 确保数据目录存在
try { fs.mkdirSync(path.join(DATA_DIR, '.data'), { recursive: true }); } catch {}

const sessions = new Map();
let activeSessionId = null;

// 会话持久化
function loadSessions() {
  try { if (fs.existsSync(SESSIONS_FILE)) { const d = JSON.parse(fs.readFileSync(SESSIONS_FILE,'utf-8')); for (const [k,v] of Object.entries(d)) sessions.set(k,v); const keys = Object.keys(d); if (keys.length) activeSessionId = keys[0]; } }
  catch(e) { console.warn('会话加载失败:', e.message); }
}
function saveSessions() {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2)); } catch {}
}
loadSessions();

// 真题库持久化
function loadMianjingBank() {
  try { if (fs.existsSync(MIANJING_BANK_FILE)) return JSON.parse(fs.readFileSync(MIANJING_BANK_FILE,'utf-8')); }
  catch(e) { return []; }
  return [];
}
function saveMianjingBank(bank) {
  try { fs.writeFileSync(MIANJING_BANK_FILE, JSON.stringify(bank, null, 2)); } catch {}
}

// 话术库持久化
function loadPhrases() {
  try { if (fs.existsSync(PHRASES_FILE)) return JSON.parse(fs.readFileSync(PHRASES_FILE,'utf-8')); }
  catch(e) { return []; }
  return [];
}
function savePhrases(phrases) {
  try { fs.writeFileSync(PHRASES_FILE, JSON.stringify(phrases, null, 2)); } catch {}
}

// ============================================================
// SSE + 进程安全
// ============================================================
function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
}
function sseSend(res, data) {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
}
function sseDone(res, data) {
  try { res.write(`data: ${JSON.stringify({ ...data, _done: true })}\n\n`); } catch {}
  try { res.end(); } catch {}
}
function sseError(res, msg) {
  try { sseSend(res, { error: String(msg) }); } catch {}
  try { sseDone(res, { error: String(msg) }); } catch {}
}

// 防止未捕获异常导致进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] 未捕获异常 - 进程继续运行:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] 未处理的Promise拒绝:', reason?.message || reason);
});

// 安全 LLM 调用 + 自动重试：捕获所有异常，返回 { value, error }
async function safeCall(fn, retries = 1) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const val = await fn();
      return { value: val };
    } catch (e) {
      lastError = e?.message || String(e);
      if (i < retries) {
        console.warn(`[LLM] 调用失败，1秒后重试 (${i+1}/${retries}): ${lastError}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return { error: lastError };
}

// ============================================================
// API 1: 一键分析（SSE 流式 + 进度 + 预估剩余时间）
// ============================================================
app.post('/api/analyze', async (req, res) => {
  const { jdText, resumeText, useMianjing, quickMode, manualUrls, resumeFileName, resumeSourceType } = req.body;
  if (!jdText || !resumeText) {
    return res.status(400).json({ error: '请同时提供JD文本和简历文本' });
  }

  // 快速模式：跳过面经，只用3类核心题型

  sseInit(res);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  // 步骤耗时追踪（用于预估剩余时间）
  const stepTimes = {};
  const totalSteps = 6; // jd_parse, resume_parse, gap, question_gen(视为1步), kb, done
  const t0 = Date.now();

  function eta(completedSteps) {
    const elapsed = (Date.now() - t0) / 1000;
    const avg = completedSteps > 0 ? elapsed / completedSteps : 5;
    const remaining = Math.ceil(avg * (totalSteps - completedSteps));
    return remaining > 0 ? ` ⏱ 预计剩余 ${remaining} 秒` : '';
  }
  let completedSteps = 0;

  function stepOk(res, step, label, detail) {
    completedSteps++;
    sseSend(res, { step, label, detail: detail + eta(completedSteps), status: 'ok' });
  }
  function stepWarn(res, step, label, detail) {
    completedSteps++;
    sseSend(res, { step, label, detail: detail + eta(completedSteps), status: 'warn' });
  }

  try {
    const prompts = require('./chatflow/prompts');
    const { llm, fillTemplate } = require('./chatflow/llm-client');
    const { searchKnowledgeBase } = require('./knowledge');

    // ---- 步骤1: JD解析 (快速拿到公司/岗位名) ----
    sseSend(res, { step: 'jd_parse', label: '解析JD', detail: '正在理解岗位要求...', status: 'running' });
    const jdResult = await safeCall(() => llm(prompts.JD_PARSE_SYSTEM, jdText, { temperature: 0.3 }));
    if (jdResult.error) { sseError(res, `JD解析失败: ${jdResult.error}`); return; }
    const jdParsed = jdResult.value;
    const company = jdParsed.company || '';
    const position = jdParsed.position || '';
    stepOk(res, 'jd_parse', '解析JD', `识别到: ${position || '未知'} · ${company || '未知'}`);
    if (aborted) return;

    // ---- 步骤2: 简历解析 ----
    sseSend(res, { step: 'resume_parse', label: '解析简历', detail: '正在提取经历/技能...', status: 'running' });
    const resumeResult = await safeCall(() => llm(prompts.RESUME_PARSE_SYSTEM, resumeText, { temperature: 0.3 }));
    if (resumeResult.error) { sseError(res, `简历解析失败: ${resumeResult.error}`); return; }
    const resumeParsed = resumeResult.value;
    stepOk(res, 'resume_parse', '解析简历', `${resumeParsed.internships?.length || 0} 段实习, ${resumeParsed.projects?.length || 0} 个项目`);
    if (aborted) return;

    // ---- 步骤3: 差距分析 ----
    sseSend(res, { step: 'gap_analysis', label: '差距分析', detail: '对比JD与简历...', status: 'running' });
    const gapPrompt = fillTemplate(prompts.GAP_ANALYSIS_SYSTEM, { jd_parsed: jdParsed, resume_parsed: resumeParsed });
    const gapResult = await safeCall(() => llm(gapPrompt, '', { temperature: 0.5 }));
    if (gapResult.error) { sseError(res, `差距分析失败: ${gapResult.error}`); return; }
    const gapAnalysis = gapResult.value;
    stepOk(res, 'gap_analysis', '差距分析', `匹配度 ${gapAnalysis.match_score || '--'} 分`);
    if (aborted) return;

    // ---- 步骤4: 押题生成（分题型并行） ----
    const questionTypes = quickMode
      ? ['行为面试', '专业能力', '项目深挖']  // 快速模式只用3类
      : ['行为面试', '专业能力', '项目深挖', '压力测试', 'HR面'];
    let allQuestions = [];
    let allInsights = {};
    const totalBatches = questionTypes.length;

    // ⚡ 5个题型互不依赖，全部并行
    sseSend(res, { step: 'question_gen', label: '生成押题', detail: `⚡ 并行生成 ${totalBatches} 类题目...`, status: 'running' });
    const qPromises = questionTypes.map(async (qType) => {
      const questionPrompt = fillTemplate(prompts.QUESTION_GEN_SYSTEM, {
        jd_parsed: jdParsed,
        resume_parsed: resumeParsed,
        gap_analysis: gapAnalysis,
        position: jdParsed.position || '',
        mianjing_data: '无面经数据',
        focus_type: qType
      });
      const qResult = await safeCall(() => llm(questionPrompt, '', { temperature: 0.7 }));
      return { type: qType, result: qResult };
    });

    const qResults = await Promise.all(qPromises);
    for (const { type, result } of qResults) {
      if (result.error) {
        console.warn(`[Analyze] 押题生成「${type}」失败:`, result.error);
        continue;
      }
      const batch = result.value;
      if (batch?.questions?.length) allQuestions.push(...batch.questions);
      if (batch?.insights) allInsights = { ...allInsights, ...batch.insights };
    }
    if (aborted) return;
    const questions = { questions: allQuestions, insights: allInsights };
    sseSend(res, { step: 'question_gen', label: '生成押题', detail: `✅ ${allQuestions.length} 题 · ${questionTypes.length}维度 (并行完成)`, status: 'ok' });

    // ---- 步骤6: 知识库增强 ----
    const kbQuestions = searchKnowledgeBase({
      company: jdParsed.company,
      position: jdParsed.position,
      industry: jdParsed.industry,
      keywords: jdParsed.keywords
    });

    // ---- 构建结果 ----
    const result = { jd: jdParsed, resume: resumeParsed, gap: gapAnalysis,
      questions: questions.questions || [], insights: questions.insights || {},
      mianjing: null, kb_supplement: kbQuestions.slice(0, 5) };

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const label = jdParsed.position || jdParsed.company || '未命名';
    sessions.set(sessionId, { analysis: result, interview: null,
      jdText, resumeText, resumeFileName: resumeFileName || '', resumeSourceType: resumeSourceType || '',
      label, createdAt: Date.now() });
    activeSessionId = sessionId;
    saveSessions();

    sseDone(res, { step: 'done', sessionId, jd: result.jd, resume: result.resume,
      gap: result.gap, questions: result.questions, insights: result.insights,
      mianjing: result.mianjing, kb_supplement: result.kb_supplement });

  } catch (e) {
    console.error('[API] 分析致命错误:', e?.message || e);
    sseError(res, '分析失败: ' + (e?.message || String(e)));
  }
});

// JD 文本智能排版（手动粘贴时用）
app.post('/api/jd-format', async (req, res) => {
  const { text } = req.body;
  if (!text || text.length < 20) return res.status(400).json({ error: 'JD文本太短' });

  const formatPrompt = `你是一个JD排版助手。请将以下岗位JD文本重新排版，使其清晰易读。

## 排版规范
- **每条职责/要求独占一行**，以 "• " 或 "1. " 开头
- **小节标题**（如「岗位职责」「任职要求」「加分项」「工作内容」等）**独占一行**，不加任何前缀
- 保留所有原文信息，不删减、不改写、不润色
- 标题前后保留空行
- 仅输出排版后的纯文本，不要加任何解释

## 原始文本
${text.slice(0, 6000)}`;

  try {
    const { llm } = require('./chatflow/llm-client');
    const formatted = await llm(formatPrompt, '', { temperature: 0.1, jsonMode: false });
    // normalize: llm may return object or string
    let raw = typeof formatted === 'string' ? formatted : (formatted.text || formatted.content || formatted.raw || JSON.stringify(formatted));
    // fix double-escaped newlines from JSON round-trip
    raw = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const clean = raw.replace(/^```[a-z]*\n?/im, '').replace(/\n?```$/m, '').trim();
    res.json({ text: clean || text, changed: clean !== text });
  } catch (e) {
    res.status(500).json({ error: '排版失败: ' + (e.message || '').slice(0, 60) });
  }
});

// ============================================================
// API 2: 开始模拟面试
// ============================================================
app.post('/api/interview/start', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.analysis) {
      return res.status(400).json({ error: '请先完成分析（调用 /api/analyze）' });
    }

    const interview = createInterviewSession(session.analysis);
    session.interview = interview;

    const company = session.analysis.jd?.company || '目标公司';
    const position = session.analysis.jd?.position || '目标岗位';
    const msg = await interviewStart(interview, company, position);

    res.json({
      type: 'start',
      message: msg,
      stage: interview.stage,
      questionInfo: null
    });
  } catch (e) {
    console.error('[API] 面试启动失败:', e);
    res.status(500).json({ error: '面试启动失败: ' + e.message });
  }
});

// ============================================================
// API 3: 回答当前问题
// ============================================================
app.post('/api/interview/answer', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.interview) {
      return res.status(400).json({ error: '请先开始模拟面试' });
    }
    if (!answer || answer.trim().length < 3) {
      return res.status(400).json({ error: '回答内容太短' });
    }

    const result = await interviewRespond(session.interview, answer);
    res.json(result);
  } catch (e) {
    console.error('[API] 回答处理失败:', e);
    res.status(500).json({ error: '处理失败: ' + e.message });
  }
});

// ============================================================
// API 4: 跳过当前题（直接下一题）
// ============================================================
app.post('/api/interview/skip', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.interview) {
      return res.status(400).json({ error: '请先开始模拟面试' });
    }

    const result = await interviewRespond(session.interview, '（跳过）');
    res.json(result);
  } catch (e) {
    console.error('[API] 跳过失败:', e);
    res.status(500).json({ error: '跳过失败: ' + e.message });
  }
});

// ============================================================
// API 5: 结束面试并获取评估报告
// ============================================================
app.post('/api/interview/evaluate', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.interview) {
      return res.status(400).json({ error: '请先开始模拟面试' });
    }

    session.interview.stage = 'done';
    const report = await evaluateFullSession(session.interview, session.resumeText || '');

    res.json({
      stage: 'done',
      message: '面试已结束，以下是你的评估报告',
      report
    });
  } catch (e) {
    console.error('[API] 评估失败:', e);
    res.status(500).json({ error: '评估失败: ' + e.message });
  }
});

// ============================================================
// API 6: 简历优化
// ============================================================
app.post('/api/optimize-resume', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.analysis) {
      return res.status(400).json({ error: '请先完成分析' });
    }

    const result = await optimizeResume(
      session.analysis.jd,
      req.body.resumeText || ''
    );
    res.json(result);
  } catch (e) {
    console.error('[API] 简历优化失败:', e);
    res.status(500).json({ error: '简历优化失败: ' + e.message });
  }
});

// 简历优化 — 生成完整优化版 DOCX 供下载（内联生成，不依赖已删除的 export-resume 模块）
app.post('/api/optimize-resume-docx', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session?.analysis) {
      return res.status(400).json({ error: '请先完成分析' });
    }

    const prompts = require('./chatflow/prompts');
    const { llm, fillTemplate } = require('./chatflow/llm-client');
    const jdParsed = session.analysis.jd;
    const resumeText = session.resumeText || '';

    // 1. LLM 生成全文优化版
    const optPrompt = fillTemplate(prompts.RESUME_FULL_OPTIMIZE_SYSTEM, {
      jd_parsed: JSON.stringify(jdParsed, null, 2),
      resume_text: resumeText
    });
    const optimized = await llm(optPrompt, '', { temperature: 0.5 });

    if (!optimized?.optimized_full_text && !optimized?.optimized_sections) {
      return res.status(500).json({ error: 'AI 未能生成优化版简历，请重试' });
    }

    const fullText = optimized.optimized_full_text || 
      Object.values(optimized.optimized_sections || {}).filter(Boolean).join('\n\n');
    
    // 2. 内联生成 DOCX (不依赖已删除的 export-resume 模块)
    const { Document, Packer, Paragraph, TextRun, Header, AlignmentType } = require('docx');
    const CJK_FONT = 'Microsoft YaHei';
    const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: CJK_FONT };
    
    const children = [];
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: 'AI 优化版简历', bold: true, size: 36, color: '4F46E5', font: FONT })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 400 },
      children: [new TextRun({ text: '由 InterviewPrep 根据目标岗位 JD 自动优化', size: 18, color: '999999', font: FONT })]
    }));

    const sections = fullText.split(/\n{2,}/);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      const lines = trimmed.split('\n');
      if (lines[0] && lines[0].length < 50 && !lines[0].startsWith('•') && !lines[0].startsWith('-')) {
        children.push(new Paragraph({
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: lines[0], bold: true, size: 24, color: '4F46E5', font: FONT })]
        }));
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            children.push(new Paragraph({
              spacing: { after: 80 },
              children: [new TextRun({ text: lines[i].trim(), size: 22, font: FONT })]
            }));
          }
        }
      } else {
        for (const line of lines) {
          if (line.trim()) {
            children.push(new Paragraph({
              spacing: { after: 80 },
              children: [new TextRun({ text: line.trim(), size: 22, font: FONT })]
            }));
          }
        }
      }
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: FONT, size: 22 } } }
      },
      sections: [{
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } }
        },
        headers: {
          default: new Header({ children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'InterviewPrep AI 优化生成', font: FONT, size: 18, color: '999999' })]
          })] })
        },
        children
      }]
    });
    const buf = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const filename = encodeURIComponent(jdParsed.position || 'resume');
    res.setHeader('Content-Disposition', `attachment; filename="resume-${filename}.docx"`);
    res.send(buf);
  } catch (e) {
    console.error('[API] 优化版简历DOCX生成失败:', e);
    res.status(500).json({ error: '生成失败: ' + e.message });
  }
});

// ============================================================
// API 6b: 简历评分
// ============================================================
app.post('/api/score-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: '请提供至少50字的简历内容' });
    }
    const prompts = require('./chatflow/prompts');
    const { llm } = require('./chatflow/llm-client');
    const result = await llm(prompts.RESUME_SCORE_SYSTEM, resumeText, { temperature: 0.3 });
    // Normalize: ensure overall_score is average of scores
    if (result.scores) {
      const scores = result.scores;
      const vals = [scores.format, scores.completeness, scores.quantification, scores.star_structure, scores.position_alignment];
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      result.overall_score = result.overall_score || avg;
    }
    // Validate suggestion length
    if (result.suggestion && result.suggestion.length > 300) {
      result.suggestion = result.suggestion.slice(0, 300);
    }
    res.json(result);
  } catch (e) {
    console.error('[API] 简历评分失败:', e);
    res.status(500).json({ error: '评分失败: ' + e.message });
  }
});

// ============================================================
// API 7: 单题评估（不依赖面试会话）
// ============================================================
app.post('/api/evaluate-single', async (req, res) => {
  try {
    const { question, answer, jdSummary, resumeText } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: '请提供题目和回答' });
    }

    const { evaluateAnswer } = require('./chatflow/engine');
    const result = await evaluateAnswer(question, answer, jdSummary || '', resumeText || '');
    res.json(result);
  } catch (e) {
    console.error('[API] 单题评估失败:', e);
    res.status(500).json({ error: '评估失败: ' + e.message });
  }
});

// ============================================================
// API 8: AI Provider 管理 — 供应商/连接/测试/模型
// ============================================================

// 列出所有供应商预设（OpenAI / DeepSeek / Qwen / Doubao / Ollama / Custom）
app.get('/api/providers/list', async (req, res) => {
  try {
    const result = await listProviders();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 列出所有已保存的连接
app.get('/api/providers/connections', async (req, res) => {
  try {
    const result = await listConnections();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 保存/更新连接
app.post('/api/providers/connections', async (req, res) => {
  try {
    const result = await saveConnection(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 切换激活的连接
app.post('/api/providers/connections/active', async (req, res) => {
  try {
    const result = await setActiveConnection(req.body.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除连接
app.delete('/api/providers/connections/:id', async (req, res) => {
  try {
    const result = await deleteConnection(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 测试连接（传入原始字段 → 构造成 connection 对象）
app.post('/api/providers/test', async (req, res) => {
  try {
    const { apiBaseUrl, apiKey, model, protocol, providerId } = req.body;
    const result = await testConnection({
      connection: {
        apiBaseUrl: apiBaseUrl || '',
        apiKey: apiKey || '',
        model: model || '',
        protocol: protocol || 'openai-compatible',
        providerId: providerId || 'custom'
      }
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 拉取模型列表（支持通过连接ID或直接传 connection）
app.post('/api/providers/models', async (req, res) => {
  try {
    const { connectionId, apiBaseUrl, apiKey, model, protocol, providerId } = req.body;
    if (connectionId) {
      // 通过已保存的连接ID拉取
      const conns = await listConnections();
      const conn = conns.connections?.find(c => c.id === connectionId);
      if (!conn) return res.status(404).json({ error: '连接未找到' });
      const result = await fetchModels({ modelAlias: conn.name || conn.providerId });
      res.json(result);
    } else {
      // 用临时连接对象拉取
      const result = await fetchModels({
        connection: {
          apiBaseUrl: apiBaseUrl || '', apiKey: apiKey || '',
          model: model || '', protocol: protocol || 'openai-compatible',
          providerId: providerId || 'custom'
        }
      });
      res.json(result);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新连接 temperature
app.post('/api/providers/temperature', async (req, res) => {
  try {
    const { connectionId, temperature } = req.body;
    if (!connectionId || temperature == null) return res.status(400).json({ error: '需要 connectionId 和 temperature' });
    const t = Math.max(0, Math.min(2, Number(temperature)));
    setConnectionTemperature(connectionId, t);
    res.json({ ok: true, temperature: t });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 读取所有连接的 temperature
app.get('/api/providers/temperatures', async (req, res) => {
  try {
    const conns = await listConnections();
    const temps = {};
    (conns.connections || []).forEach(c => {
      temps[c.id] = getConnectionTemperature(c.id);
    });
    res.json({ temperatures: temps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Token 用量
app.get('/api/usage', (req, res) => {
  res.json({ ...getTokenUsage() });
});

// ============================================================
// API 9: 话术库 — 保存/获取/删除优质回答
// ============================================================

// 保存话术
app.post('/api/phrases', (req, res) => {
  try {
    const { question, answer, improvedVersion, keyTakeaways, score, scores, tags, type } = req.body;
    if (!question || !answer) return res.status(400).json({ error: '需要 question 和 answer' });
    const phrases = loadPhrases();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      question, answer, improvedVersion: improvedVersion || '', keyTakeaways: keyTakeaways || '',
      score: score || 0, scores: scores || {}, tags: tags || [], type: type || '',
      createdAt: new Date().toISOString()
    };
    phrases.unshift(entry);
    savePhrases(phrases);
    res.json({ ok: true, entry, total: phrases.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 获取话术列表
app.get('/api/phrases', (req, res) => {
  try {
    const phrases = loadPhrases();
    const tag = req.query.tag;
    const list = tag ? phrases.filter(p => (p.tags||[]).includes(tag)) : phrases;
    res.json({ phrases: list, total: list.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 删除话术
app.delete('/api/phrases/:id', (req, res) => {
  try {
    let phrases = loadPhrases();
    phrases = phrases.filter(p => p.id !== req.params.id);
    savePhrases(phrases);
    res.json({ ok: true, total: phrases.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API 10: 会话管理 — 列表 + 切换
// ============================================================

app.get('/api/sessions', (req, res) => {
  const list = [];
  for (const [id, s] of sessions) {
    const a = s.analysis;
    list.push({
      id,
      label: s.label || (a?.jd?.position || a?.jd?.company || '未命名'),
      company: a?.jd?.company || '',
      position: a?.jd?.position || '',
      matchScore: a?.gap?.match_score || '-',
      questionCount: (a?.questions || []).length,
      isActive: id === activeSessionId,
      createdAt: s.createdAt
    });
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ sessions: list, activeSessionId });
});

// ---- Dashboard stats endpoint ----
app.get('/api/dashboard/stats', (req, res) => {
  try {
    // Read phrase library
    const phrasesPath = path.join(DATA_DIR, '.data', 'phrase-library.json');
    let phrases = [];
    try { phrases = JSON.parse(fs.readFileSync(phrasesPath, 'utf8')); } catch {}
    if (!Array.isArray(phrases)) phrases = [];

    // Read sessions
    const sessionsPath = path.join(DATA_DIR, '.data', 'sessions.json');
    let sessionsData = [];
    try { sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf8')); } catch {}
    if (!Array.isArray(sessionsData)) sessionsData = [];

    // --- Practice stats from phrase library ---
    const totalPractices = phrases.length;

    // Average score
    const scores = phrases.map(p => p.score || 0).filter(s => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Type coverage
    const typeCoverage = { behavioral: 0, technical: 0, project: 0, stress: 0, hr: 0, total: 0 };
    phrases.forEach(p => {
      const t = p.type;
      if (t && typeCoverage.hasOwnProperty(t)) typeCoverage[t]++;
      typeCoverage.total++;
    });

    // Radar scores - average dimension scores from phrases that have evaluations
    const dimKeys = ['star_completeness', 'quantification', 'position_match', 'structure', 'highlight'];
    const radarScores = { star_completeness: 0, quantification: 0, position_match: 0, structure: 0, highlight: 0 };
    const dimCounts = { star_completeness: 0, quantification: 0, position_match: 0, structure: 0, highlight: 0 };
    phrases.forEach(p => {
      // 兼容两种数据来源：旧的 p.evaluation 和新的 p.scores
      const evalData = p.scores || p.evaluation;
      if (evalData && typeof evalData === 'object') {
        dimKeys.forEach(k => {
          if (typeof evalData[k] === 'number' && evalData[k] > 0) {
            radarScores[k] += evalData[k];
            dimCounts[k]++;
          }
        });
      }
    });
    dimKeys.forEach(k => {
      if (dimCounts[k] > 0) radarScores[k] = Math.round(radarScores[k] / dimCounts[k]);
    });

    // Recent practices (last 10)
    const recentPractices = [...phrases]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 10)
      .map(p => ({
        date: p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '',
        question: p.question || '',
        score: p.score || 0,
        type: p.type || ''
      }));

    // Calendar: date -> count for last 60 days
    const calendar = {};
    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    phrases.forEach(p => {
      if (p.createdAt) {
        const d = new Date(p.createdAt);
        if (d >= sixtyDaysAgo && d <= now) {
          const key = d.toISOString().slice(0, 10);
          calendar[key] = (calendar[key] || 0) + 1;
        }
      }
    });

    // --- Interview reports from sessions ---
    const interviewReports = [];
    let totalInterviews = 0;
    sessionsData.forEach(s => {
      const interview = s.interview;
      if (interview && interview.stage === 'done') {
        totalInterviews++;
        let reportScore = '-';
        if (interview.askedQuestions && interview.askedQuestions.length > 0) {
          const qScores = interview.askedQuestions
            .map(q => q.score || q.evaluation?.score)
            .filter(v => typeof v === 'number');
          if (qScores.length > 0) {
            reportScore = Math.round(qScores.reduce((a, b) => a + b, 0) / qScores.length);
          }
        }
        interviewReports.push({
          label: s.label || s.position || s.company || '面试',
          company: s.company || '',
          position: s.position || '',
          date: s.createdAt ? new Date(s.createdAt).toISOString() : '',
          score: reportScore
        });
      }
    });
    interviewReports.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      totalPractices,
      totalInterviews,
      avgScore,
      radarScores,
      typeCoverage,
      recentPractices,
      interviewReports: interviewReports.slice(0, 10),
      calendar
    });
  } catch (e) {
    console.error('Dashboard stats error:', e);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

app.post('/api/sessions/switch', (req, res) => {
  const { sessionId } = req.body;
  if (!sessions.has(sessionId)) return res.status(404).json({ error: '会话不存在' });
  activeSessionId = sessionId;
  const s = sessions.get(sessionId);
  const a = s.analysis;
  res.json({
    ok: true,
    sessionId,
    label: s.label,
    jdText: s.jdText || '',
    resumeText: s.resumeText || '',
    resumeFileName: s.resumeFileName || '',
    resumeSourceType: s.resumeSourceType || '',
    jd: a.jd,
    resume: a.resume,
    gap: a.gap,
    questions: a.questions,
    insights: a.insights,
    mianjing: a.mianjing,
    kb_supplement: a.kb_supplement
  });
});

app.delete('/api/sessions/:id', (req, res) => {
  const id = req.params.id;
  if (!sessions.has(id)) return res.status(404).json({ error: '会话不存在' });
  sessions.delete(id);
  if (activeSessionId === id) {
    activeSessionId = [...sessions.keys()][0] || null;
  }
  saveSessions();
  res.json({ ok: true, activeSessionId });
});

// ============================================================
// API 11: 真题库
// ============================================================

app.get('/api/mianjing-bank', (req, res) => {
  const bank = loadMianjingBank();
  const company = req.query.company || '';
  const position = req.query.position || '';
  const type = req.query.type || '';

  let filtered = bank;
  if (company) filtered = filtered.filter(b => b.company.includes(company));
  if (position) filtered = filtered.filter(b => b.position.includes(position));
  if (type) filtered = filtered.filter(b => (b.type || '').includes(type));

  const companies = [...new Set(bank.map(b => b.company).filter(Boolean))];
  const positions = [...new Set(bank.map(b => b.position).filter(Boolean))];
  const types = [...new Set(bank.map(b => b.type).filter(Boolean))];
  const sources = ['小红书面经', '用户收藏'];

  res.json({
    total: bank.length,
    filtered: filtered.length,
    companies, positions, types, sources,
    questions: filtered.slice(0, 200)
  });
});

// 用户收藏押题到真题库
app.post('/api/bank/bookmark', (req, res) => {
  try {
    const { question, type, company, position, sessionId } = req.body;
    if (!question) return res.status(400).json({ error: '缺少题目内容' });

    const bank = loadMianjingBank();
    // 防止重复
    const exists = bank.find(b => b.question === question && b.company === company);
    if (exists) return res.status(409).json({ error: '该题已在真题库中' });

    bank.unshift({
      question,
      type: type || '未知',
      frequency: 1,
      round: '未知',
      company: company || '',
      position: position || '',
      sourceLabel: '用户收藏',
      source: '用户收藏',
      sourceUrls: [],
      source_platforms: ['用户收藏'],
      sessionId,
      collectedAt: new Date().toISOString()
    });
    saveMianjingBank(bank.slice(0, 500));
    res.json({ ok: true, total: bank.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除真题库中的某道题
app.delete('/api/bank/question', (req, res) => {
  try {
    const { question, company } = req.body;
    if (!question) return res.status(400).json({ error: '缺少题目内容' });
    const bank = loadMianjingBank();
    const before = bank.length;
    const filtered = bank.filter(b => !(b.question === question && b.company === company));
    if (filtered.length === before) return res.status(404).json({ error: '未找到该题目' });
    saveMianjingBank(filtered);
    res.json({ ok: true, deleted: before - filtered.length, total: filtered.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// Company Research API — 公司调研（SSE流式）
// ============================================================
app.post('/api/company-research', async (req, res) => {
  const { company, position } = req.body;
  if (!company) return res.status(400).json({ error: '请提供公司名' });

  sseInit(res);

  try {
    const { researchCompany } = require('./chatflow/nodes/company-research');

    sseSend(res, { step: 'research', label: '公司调研', detail: `🔍 正在搜索「${company}」相关信息...`, status: 'running' });

    const result = await researchCompany(company, position || '', (msg) => {
      sseSend(res, { step: msg.step, label: msg.label, detail: msg.detail, status: msg.status || 'running' });
    });

    if (result.error) {
      sseError(res, result.error);
      return;
    }

    sseSend(res, { step: 'research', label: '公司调研', detail: '✅ 知识图谱生成完成', status: 'ok' });
    sseDone(res, { step: 'done', ...result });

  } catch (e) {
    sseError(res, '公司调研失败: ' + (e.message || String(e)));
  }
});

// ============================================================
// API 12: 简历文件上传解析
// ============================================================
app.post('/api/resume-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const { parseResumeFile } = require('./chatflow/resume-parser');
    try {
      const result = await parseResumeFile(req.file.path, req.file.originalname);
      res.json(result);
    } finally {
      // 删临时文件
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// API 13: 导出 DOCX — 话术库 / 真题库
// ============================================================
app.get('/api/export/phrases', async (req, res) => {
  try {
    const { generatePhraseDocx } = require('./chatflow/export-docx');
    const phrases = loadPhrases();
    const buffer = await generatePhraseDocx(phrases);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('话术库_面试准备.docx')}`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/mianjing', async (req, res) => {
  try {
    const { generateMianjingDocx } = require('./chatflow/export-docx');
    const bank = loadMianjingBank();
    const company = req.query.company || '';
    const position = req.query.position || '';
    let filtered = bank;
    if (company) filtered = filtered.filter(b => b.company.includes(company));
    if (position) filtered = filtered.filter(b => b.position.includes(position));
    const buffer = await generateMianjingDocx(filtered);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('真题库_面试准备.docx')}`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// API 14: JD URL 扒取（opencli browser bridge → 可过登录墙）
// ============================================================
app.post('/api/jd-fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '请提供岗位链接URL' });
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: '请输入完整URL' });

  const ocErr = requireOpencli('JD链接扒取');
  if (ocErr) return res.status(503).json({ error: ocErr });

  try {
    let text = '';

    // 策略1: 专属 adapter — Boss直聘有 detail 命令
    const bossMatch = url.match(/boss\.com.*?(?:job_detail|jobDetail).*?[?&]jid=([\w-]+)/i)
                   || url.match(/boss\.com.*?(?:job_detail|jobDetail)\/([\w-]+)/i)
                   || url.match(/boss\.com.*?securityId=([\w-]+)/i);
    if (bossMatch) {
      const securityId = bossMatch[1];
      console.log('[JD扒取] Boss直聘详情:', securityId);
      try {
        const result = await execAsync(
          `opencli boss detail "${securityId}" -f md --stdout true`,
          { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
        );
        text = result || '';
      } catch (e) {
        console.warn('[JD扒取] Boss直聘失败:', e.message?.slice(0, 80));
      }
    }

    // 策略2: 51job 等 — 通用 web read
    if (!text || text.length < 100) {
      console.log('[JD扒取] 通用web read:', url);
      try {
        const result = await execAsync(
          `opencli web read --url "${url}" -f md --stdout true --wait 2`,
          { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
        );
        text = result || '';
      } catch (e) {
        console.warn('[JD扒取] opencli web read 失败:', e.message?.slice(0, 80));
      }
    }

    // 清理
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < 100) {
      return res.status(502).json({ error: '未能提取到足够内容。请手动复制粘贴JD文本，或在浏览器中打开该链接后重试。' });
    }

    // ---- LLM 清洗：从整页 Markdown 中提取纯 JD ----
    const cleaningPrompt = `你是一个信息提取与排版助手。以下是网页扒取的原始内容，包含大量无关信息（头像、导航、HR介绍、其他职位、footer等）。

请仅提取该岗位的核心JD信息，输出以下 JSON：
{
  "company": "公司名称",
  "position": "岗位名称",
  "salary": "薪资范围",
  "location": "工作城市",
  "detail": "职位描述与要求的全文"
}

## detail 排版规范（非常重要）
- **每条职责/要求独占一行**，行首用 "• " 或 "1. " 开头
- **小节标题**（如「岗位职责」「任职要求」「加分项」等）**单独一行**，前后加空行
- **不要输出连续长段落**，每句话原则上不超过60字即换行
- 保留原文中的所有关键信息（技能名、年限、学历等），**不删减**
- 只输出提取的JD内容，不添加"以下是根据..."等无关说明

如果某项信息在原文中找不到，填 ""。

## 原始内容
${text.slice(0, 8000)}`;

    try {
      const { llm } = require('./chatflow/llm-client');
      const cleaned = await llm(cleaningPrompt, '', { temperature: 0.1 });
      // 构建干净的文本
      const parts = [];
      if (cleaned.company) parts.push(`公司：${cleaned.company}`);
      if (cleaned.position) parts.push(`岗位：${cleaned.position}`);
      if (cleaned.salary) parts.push(`薪资：${cleaned.salary}`);
      if (cleaned.location) parts.push(`地点：${cleaned.location}`);
      if (parts.length) parts.push('');
      if (cleaned.detail) parts.push(cleaned.detail);
      text = parts.join('\n').trim() || text;
      console.log('[JD扒取] LLM清洗完成:', text.length, '字');
    } catch (e) {
      console.warn('[JD扒取] LLM清洗失败，使用原始内容:', e.message?.slice(0, 60));
      // 降级：返回原始内容
    }

    const maxLen = 15000;
    // 扒取完成后自动关闭 opencli 浏览器窗口
    closeOpencliWindow().catch(()=>{});
    res.json({ url, text: text.slice(0, maxLen), charCount: Math.min(text.length, maxLen), truncated: text.length > maxLen });
  } catch (e) {
    // 失败时也尝试关闭浏览器
    closeOpencliWindow().catch(()=>{});
    res.status(502).json({ error: '扒取失败: ' + (e.message || String(e)).slice(0, 100) });
  }
});

// ============================================================
// 面经相关性过滤器：LLM 判断每道题是否和当前岗位相关
// ============================================================
async function filterRelevantQuestions(questions, jdParsed) {
  if (!questions.length) return [];
  const { llm } = require('./chatflow/llm-client');

  const jdSummary = [
    jdParsed.company ? `公司: ${jdParsed.company}` : '',
    jdParsed.position ? `岗位: ${jdParsed.position}` : '',
    jdParsed.responsibilities?.length ? `职责: ${jdParsed.responsibilities.join('; ')}` : '',
    jdParsed.requirements?.length ? `要求: ${jdParsed.requirements.join('; ')}` : '',
    jdParsed.keywords?.length ? `关键词: ${jdParsed.keywords.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  const questionsText = questions.map((q, i) =>
    `${i + 1}. [${q.type || ''}] ${q.question}`
  ).join('\n');

  const prompt = `你是一位严格的面试题筛选器。以下是从小红书面经中提取的面试题，请逐一判断是否与当前岗位相关。

## 当前岗位信息
${jdSummary}

## 待过滤的面试题
${questionsText}

## 过滤规则
- 题目内容和岗位职责/技能/行业直接相关 → 保留
- 题目是通用行为问题（自我介绍、优缺点等）→ 保留
- 题目明确是其他公司/完全不相关岗位的 → 丢弃
- 题目涉及的技术栈和JD要求的完全无关 → 丢弃
- 公司入职体验、福利待遇等非面试题 → 丢弃

输出严格 JSON：
{
  "relevant_indices": [1, 3, 5],
  "reasons": {"1": "和岗位AI方向直接相关", "5": "通用行为面试题保留"}
}`;

  try {
    const result = await llm(prompt, '', { temperature: 0.1 });
    const indices = result.relevant_indices || [];
    const filtered = indices.map(i => questions[i - 1]).filter(Boolean);
    if (filtered.length === 0) return questions; // 过滤掉全部时回退
    console.log(`[过滤] 面经题目 ${questions.length} → ${filtered.length} (丢弃 ${questions.length - filtered.length} 条无关)`);
    return filtered;
  } catch (e) {
    console.warn('[过滤] LLM过滤失败，保留全部:', e.message?.slice(0, 60));
    return questions;
  }
}

// ============================================================
// 面经采集 — 独立触发
// ============================================================
app.post('/api/mianjing-collect', async (req, res) => {
  const { sessionId, jdText, resumeText, company: reqCompany, position: reqPosition, manualUrls } = req.body;
  const session = sessions.get(sessionId);
  
  const jdParsed = session?.analysis?.jd || {};
  const company = reqCompany || jdParsed.company || '';
  const position = reqPosition || jdParsed.position || '';
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  function sse(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  try {
    // 优先手动URL模式
    if (manualUrls?.length) {
      sse({ step: 'mianjing', detail: `🔍 读取 ${manualUrls.length} 条链接...`, status: 'running' });
      const { fetchNotesFromUrls } = require('./chatflow/nodes/mianjing');
      const mResult = await fetchNotesFromUrls(manualUrls, (ev) => sse(ev));
      
      if (mResult?.success && mResult.data?.questions?.length) {
        const relevant = await filterRelevantQuestions(mResult.data.questions, jdParsed);
        mResult.data.questions = relevant;
        
        sse({ step: 'done', detail: `✅ 采集完成: ${mResult.data.source_count || 0} 篇 · ${relevant.length} 题`, status: 'ok', result: { mianjing: mResult.data } });
        res.end();
        return;
      }
      sse({ step: 'done', detail: '❌ 手动链接未提取到题目', status: 'warn' });
      res.end();
      return;
    }

    if (!company && !position) {
      sse({ step: 'error', detail: '无法识别公司/岗位，请确保JD已解析或手动输入' });
      res.end();
      return;
    }

    sse({ step: 'mianjing', detail: '🔍 搜索小红书面经...', status: 'running' });
    
    const { queryMianjing } = require('./chatflow/nodes/mianjing');
    const mResult = await queryMianjing(company, position, (ev) => {
      sse(ev);
    });
    
    if (mResult?.success && mResult.data?.questions?.length) {
      // 相关性过滤
      const qCount = mResult.data.questions.length;
      sse({ step: 'mianjing', detail: `📝 采集到 ${qCount} 道题，正在过滤...`, status: 'running' });
      
      const relevant = await filterRelevantQuestions(mResult.data.questions, jdParsed);
      mResult.data.questions = relevant;
      
      // 更新session中的面经数据
      session.analysis.mianjing = mResult.data;
      saveSessions();
      
      // 真题库写入
      const label = session.label || (jdParsed.position || jdParsed.company || '未命名');
      if (mResult.data.questions?.length) {
        const bank = loadMianjingBank();
        for (const q of mResult.data.questions) {
          bank.unshift({
            ...q,
            company: jdParsed.company || '',
            position: jdParsed.position || '',
            sourceLabel: label,
            source: '小红书面经',
            sourceUrls: (mResult.data.sources || []).slice(0, 5).map(s => ({ title: s.title, url: s.url, platform: s.platform || '小红书' })),
            sessionId,
            collectedAt: new Date().toISOString()
          });
        }
        const seen = new Set();
        const deduped = bank.filter(b => { const k = (b.company||'') + '|' + (b.position||'') + '|' + (b.question||''); if (seen.has(k)) return false; seen.add(k); return true; });
        saveMianjingBank(deduped.slice(0, 500));
        console.log(`[Mianjing] 真题库归档: ${mResult.data.questions.length} 条面经题, 题库总量 ${deduped.length}`);
      }
      
      sse({
        step: 'done',
        detail: `✅ 采集完成：${mResult.data.source_count || 0} 篇笔记 · ${relevant.length} 道真题`,
        status: 'ok',
        result: { mianjing: mResult.data }
      });
    } else {
      sse({ step: 'done', detail: '❌ 未采集到面经题目', status: 'warn' });
    }
    res.end();
  } catch (e) {
    sse({ step: 'error', detail: '采集异常: ' + (e.message || '未知'), status: 'error' });
    res.end();
  }
});

// ============================================================
// 健康检查（含 opencli 环境检测）
// ============================================================
app.get('/api/health', async (req, res) => {
  let providerStatus = '未连接';
  try {
    const conns = await listConnections();
    providerStatus = conns.activeConnection
      ? `${conns.activeConnection.providerId} (${conns.activeConnection.name})`
      : '未配置激活连接';
  } catch { /* ignore */ }

  // opencli 自检
  const opencliInfo = detectOpencli();

  res.json({
    status: 'ok',
    provider: providerStatus,
    providerKitPath: PROVIDER_KIT_PATH,
    uptime: process.uptime(),
    sessions: sessions.size,
    opencli: opencliInfo,
    usage: getTokenUsage()
  });
});

/**
 * 检测 opencli 安装状态和可用站点适配器
 */
function detectOpencli() {
  const info = {
    installed: false, version: '', path: '',
    daemon_running: false, ext_installed: false,
    browser_ready: false,
    has_xiaohongshu: false, has_web: false, has_boss: false,
    node_version: process.version
  };

  function findOpencliBin() {
    const candidates = [];
    try {
      const out = execSync('where opencli 2>nul', { shell: true, timeout: 3000, encoding: 'utf-8' }).trim();
      if (out) candidates.push(...out.split('\n').map(s => s.trim()).filter(Boolean));
    } catch {}
    try {
      const root = execSync('npm root -g', { shell: true, timeout: 5000, encoding: 'utf-8' }).trim();
      if (root) candidates.push(path.join(root, '.bin', 'opencli.cmd'), path.join(root, '..', 'opencli'));
    } catch {}
    const appData = process.env.APPDATA || '';
    if (appData) {
      candidates.push(path.join(appData, 'npm', 'opencli.cmd'));
      candidates.push(path.join(appData, 'npm', 'node_modules', 'opencli', 'bin', 'opencli.js'));
    }
    return [...new Set(candidates)];
  }

  function runViaBin(binPath, args) {
    if (!binPath || !fs.existsSync(binPath)) return null;
    try {
      return execSync(`"${binPath}" ${args}`, { shell: true, timeout: 8000, encoding: 'utf-8' }).trim();
    } catch { return null; }
  }

  // 优先 shell 模式 → 解析 PATH
  try {
    const ver = execSync('opencli --version', { shell: true, timeout: 5000, encoding: 'utf-8' }).trim();
    if (ver) { info.installed = true; info.version = ver; }
  } catch {
    const bins = findOpencliBin();
    for (const b of bins) {
      const v = runViaBin(b, '--version');
      if (v && /^\d+\.\d+/.test(v)) { info.installed = true; info.version = v; info.path = b; break; }
    }
  }

  if (info.installed) {
    if (!info.path) {
      try {
        const out = execSync('where opencli 2>nul', { shell: true, timeout: 3000, encoding: 'utf-8' }).trim();
        info.path = out.split('\n')[0]?.trim() || '';
      } catch {}
    }
    try {
      const list = execSync('opencli list 2>&1', { shell: true, timeout: 8000, encoding: 'utf-8' });
      info.has_xiaohongshu = list.includes('xiaohongshu');
      info.has_web = list.includes('web');
      info.has_boss = list.includes('boss');
    } catch {}
    try {
      const d = execSync('opencli doctor 2>&1', { shell: true, timeout: 8000, encoding: 'utf-8' });
      info.daemon_running = d.includes('Daemon: running');
      info.ext_installed = d.includes('Extension: connected');
      info.browser_ready = info.daemon_running && info.ext_installed;
    } catch {}
  }
  return info;
}

// 独立 opencli 检测端点
app.get('/api/opencli-check', (req, res) => {
  res.json(detectOpencli());
});

// ── opencli 一键安装（SSE 流式进度） ──
app.post('/api/opencli-setup', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  function sse(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  try {
    const { setupOpencliExtension } = require('./chatflow/nodes/opencli-setup');
    const result = await setupOpencliExtension((ev) => sse(ev));
    sse({ step: 'done', detail: result.message, status: result.success ? 'ok' : 'warn', result });
    res.end();
  } catch (e) {
    sse({ step: 'error', detail: '安装异常: ' + (e.message || '未知'), status: 'error' });
    res.end();
  }
});

// 小红书扫码登录 — 使用 opencli 打开小红书搜索页，触发扫码登录
app.post('/api/open-xhs-login', async (req, res) => {
  const ocErr = requireOpencli('打开小红书登录');
  if (ocErr) return res.status(503).json({ error: ocErr });
  try {
    // 使用 opencli xiaohongshu search 命令，会自动打开浏览器（让用户扫码登录）
    await execAsync('opencli xiaohongshu search "面试经验" --foreground', { timeout: 20000 });
    res.json({ ok: true });
  } catch(e) {
    // opencli 可能返回非0（daemon已在运行等），只要命令执行了就认为成功
    const msg = e.stderr ? String(e.stderr) : String(e.message || '');
    if (msg.includes('daemon') || msg.includes('running') || msg.includes('connected')) {
      res.json({ ok: true, hint: 'daemon 已就绪' });
    } else {
      res.status(500).json({ error: '无法打开小红书: ' + msg.slice(0, 120) });
    }
  }
});

// 中间件：检查 opencli 是否就绪
function requireOpencli(what) {
  const oc = detectOpencli();
  if (!oc.installed) {
    return `❌ opencli 未安装。\n\n💡 快速安装：打开终端，执行\n   npm install -g @jackwener/opencli\n\n然后重启本应用。${what ? `（${what}功能需要 opencli）` : ''}`;
  }
  if (!oc.browser_ready) {
    return `❌ 浏览器未绑定。\n\n💡 在终端执行：\n   opencli daemon restart\n\n然后刷新页面重试。`;
  }
  return null;
}

// ============================================================
// 启动
// ============================================================
const PORT = process.env.PORT || 3456;
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8787;
const IS_ELECTRON = process.env.ELECTRON_MODE === '1';

function startServer() {
  return new Promise((resolve, reject) => {
    const listener = app.listen(PORT, async () => {
      logInfo(`服务器已启动 — http://localhost:${PORT}`);
      logInfo(`AI Provider Kit: ${PROVIDER_KIT_PATH}`);
      console.log(`\n🎯 InterviewPrep MVP 已启动`);
      console.log(`   应用地址: http://localhost:${PORT}`);
      console.log(`   AI Provider Kit: ${PROVIDER_KIT_PATH}`);

      try {
        const { url } = await startGateway(GATEWAY_PORT);
        logInfo(`网关已启动: ${url}`);
        console.log(`   网关地址: ${url} (OpenAI-compatible)`);
      } catch (e) {
        logWarn(`网关未启动: ${e.message?.slice(0, 80)}`);
        console.log(`   网关: 未启动 (${e.message?.slice(0, 80)})`);
      }
      console.log();

      // Electron 模式下不打开外部浏览器
      if (!IS_ELECTRON) {
        const appUrl = `http://localhost:${PORT}`;
        try {
          const platform = process.platform;
          if (platform === 'win32') {
            execSync(`start "" "${appUrl}"`, { shell: true, timeout: 3000 });
          } else if (platform === 'darwin') {
            execSync(`open "${appUrl}"`, { timeout: 3000 });
          } else {
            execSync(`xdg-open "${appUrl}"`, { timeout: 3000 });
          }
          logInfo('浏览器已自动打开: ' + appUrl);
        } catch { /* 打开浏览器失败不阻塞 */ }
      }

      resolve(listener);
    });
    listener.on('error', reject);
  });
}

// 直接运行时启动
if (!IS_ELECTRON || require.main === module) {
  startServer();
}

// Electron 主进程引用用
module.exports = { app, startServer, PORT };

// 优雅退出
process.on('SIGINT', () => { logInfo('收到 SIGINT，正在关闭...'); process.exit(0); });
process.on('SIGTERM', () => { logInfo('收到 SIGTERM，正在关闭...'); process.exit(0); });
