// ============================================================
// 宝洁八大问 — 独立子模块后端
// 题目读取 / 回答稿版本管理 / 熟练度统计 / AI 打磨
// 评分与标准答案复用已有的 /api/evaluate-single、/api/generate-model-answer
// ============================================================

const path = require('path');
const fs = require('fs');

const QUESTIONS_FILE = path.join(__dirname, '..', 'knowledge', 'pg-8-questions.json');

function registerPg8Routes(app, DATA_DIR) {
  const baseDir = DATA_DIR || path.join(__dirname, '..');
  const SCRIPTS_FILE = path.join(baseDir, '.data', 'pg-scripts.json');

  function loadScripts() {
    try {
      if (fs.existsSync(SCRIPTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
        if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      }
    } catch (e) { /* 损坏则视为空 */ }
    return {};
  }

  function saveScripts(scripts) {
    const dir = path.dirname(SCRIPTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2), 'utf8');
  }

  function loadQuestions() {
    const data = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
    return data.questions || [];
  }

  // 读取 8 道题
  app.get('/api/pg-questions', (req, res) => {
    try {
      res.json(JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8')));
    } catch (e) {
      res.status(500).json({ error: '加载宝洁八大问失败: ' + e.message });
    }
  });

  // 读取全部稿件与版本历史
  app.get('/api/pg-scripts', (req, res) => {
    try {
      res.json({ scripts: loadScripts() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 保存 / 更新某题作答稿（版本化：内容有变化才产生新版本）
  app.post('/api/pg-script', (req, res) => {
    try {
      const { questionId, content, score } = req.body || {};
      if (!questionId) return res.status(400).json({ error: '缺少 questionId' });
      const text = (content || '').trim();
      if (!text) return res.status(400).json({ error: '稿件内容不能为空' });

      const valid = loadQuestions().some(q => q.id === questionId);
      if (!valid) return res.status(400).json({ error: '未知的题目 ID: ' + questionId });

      const scripts = loadScripts();
      const now = new Date().toISOString();
      const entry = scripts[questionId] || { current: '', versions: [], practiceCount: 0, lastScore: null, updatedAt: now };

      const prev = (entry.versions || [])[entry.versions.length - 1];
      const changed = !prev || prev.content !== text;
      if (changed) {
        entry.versions = (entry.versions || []).concat([{
          v: (entry.versions || []).length + 1,
          content: text,
          score: typeof score === 'number' ? score : null,
          createdAt: now
        }]);
      }
      entry.current = text;
      if (typeof score === 'number') entry.lastScore = score;
      entry.updatedAt = now;
      scripts[questionId] = entry;
      saveScripts(scripts);

      res.json({ ok: true, script: entry, versionAdded: changed });
    } catch (e) {
      res.status(500).json({ error: '保存失败: ' + e.message });
    }
  });

  // 删除某题稿件（含全部版本）
  app.delete('/api/pg-script/:questionId', (req, res) => {
    try {
      const scripts = loadScripts();
      if (!scripts[req.params.questionId]) return res.json({ ok: true, removed: false });
      delete scripts[req.params.questionId];
      saveScripts(scripts);
      res.json({ ok: true, removed: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 记录一次练习（用于熟练度统计）
  app.post('/api/pg-practice', (req, res) => {
    try {
      const { questionId, score } = req.body || {};
      if (!questionId) return res.status(400).json({ error: '缺少 questionId' });
      const scripts = loadScripts();
      const now = new Date().toISOString();
      const entry = scripts[questionId] || { current: '', versions: [], practiceCount: 0, lastScore: null, updatedAt: now };
      entry.practiceCount = (entry.practiceCount || 0) + 1;
      if (typeof score === 'number') entry.lastScore = score;
      entry.updatedAt = now;
      scripts[questionId] = entry;
      saveScripts(scripts);
      res.json({ ok: true, practiceCount: entry.practiceCount, lastScore: entry.lastScore });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 熟练度：8 题 ×（练习次数 / 最近评分 / 稿件版本数）
  app.get('/api/pg-progress', (req, res) => {
    try {
      const scripts = loadScripts();
      const questions = loadQuestions();
      let practiced = 0, finalized = 0, scoreSum = 0, scoreCount = 0;
      const items = questions.map(q => {
        const s = scripts[q.id] || {};
        const practiceCount = s.practiceCount || 0;
        const versionCount = (s.versions || []).length;
        const lastScore = typeof s.lastScore === 'number' ? s.lastScore : null;
        if (practiceCount > 0) practiced++;
        if (s.current) finalized++;
        if (lastScore !== null) { scoreSum += lastScore; scoreCount++; }
        // 熟练度：练习次数（上限 5 次）+ 已定稿 + 最近评分
        const practicePart = Math.min(practiceCount, 5) / 5 * 45;
        const scriptPart = s.current ? 25 : 0;
        const scorePart = lastScore !== null ? Math.max(0, Math.min(30, (lastScore - 60) / 40 * 30)) : 0;
        const level = !s.current && practiceCount === 0 ? 'untouched'
          : (s.current && lastScore !== null && lastScore >= 80) ? 'mastered'
          : (s.current ? 'drafted' : 'practicing');
        return {
          questionId: q.id,
          order: q.order,
          question: q.question,
          competency: q.competency,
          practiceCount,
          versionCount,
          lastScore,
          hasScript: !!s.current,
          proficiency: Math.round(practicePart + scriptPart + scorePart),
          level,
          updatedAt: s.updatedAt || null
        };
      });
      res.json({
        meta: { total: questions.length, practiced, finalized },
        averageScore: scoreCount ? Math.round(scoreSum / scoreCount) : null,
        overall: Math.round(items.reduce((a, b) => a + b.proficiency, 0) / (items.length || 1)),
        items
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // AI 打磨当前稿件
  app.post('/api/pg-script/polish', async (req, res) => {
    try {
      const { questionId, content, jdSummary, resumeText } = req.body || {};
      if (!questionId) return res.status(400).json({ error: '缺少 questionId' });
      const draft = (content || '').trim();
      if (!draft) return res.status(400).json({ error: '稿件内容不能为空' });

      const question = loadQuestions().find(q => q.id === questionId);
      if (!question) return res.status(400).json({ error: '未知的题目 ID: ' + questionId });

      const { llm } = require('../chatflow/llm-client');
      const prompts = require('../chatflow/prompts');

      const userPrompt = `题目：${question.question}
考察维度：${question.competency}
${question.key_points?.length ? '关键要点：' + question.key_points.join('；') : ''}
${question.danger_zones?.length ? '危险区（必须避免）：' + question.danger_zones.join('；') : ''}
${jdSummary ? '岗位背景：' + jdSummary : ''}
${resumeText ? '候选人简历：\n' + resumeText.slice(0, 3000) : '（未提供简历）'}

候选人当前回答稿：
${draft}

请打磨这份回答稿。`;

      const result = await llm(prompts.PG_SCRIPT_POLISH, userPrompt, { temperature: 0.6 });
      res.json(result);
    } catch (e) {
      console.error('[API] 八大问稿件打磨失败:', e);
      res.status(500).json({ error: '打磨失败: ' + e.message });
    }
  });
}

module.exports = { registerPg8Routes };
