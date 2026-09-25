/* ============================================================
   InterviewPrep — 宝洁八大问（独立子模块前端）
   三段式：8 题卡片墙 → 单题工作台（计时作答 + 五维评分）→ 我的回答稿（版本化 + AI 打磨）

   复用：/api/evaluate-single（五维评分 + 逐句点评）
        /api/generate-model-answer（AI 标准答案）
   新增：/api/pg-questions、/api/pg-scripts、/api/pg-script、/api/pg-practice、
        /api/pg-progress、/api/pg-script/polish
   ============================================================ */
(function () {
  'use strict';

  var questions = [];
  var progress = {};
  var scripts = {};
  var currentId = null;
  var lastEval = null;

  var timerHandle = null;
  var timerPhase = '';      // 'prepare' | 'answer'
  var timerLeft = 0;

  var PREPARE_SECONDS = 30;
  var ANSWER_SECONDS = 120;

  var LEVEL_LABEL = {
    untouched: '未开始',
    practicing: '练习中',
    drafted: '已成稿',
    mastered: '已定稿'
  };

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function esc(s) { return (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s)); }

  async function getJson(url, opts) {
    var resp = await fetch(url, opts);
    if (!resp.ok) {
      var msg = 'HTTP ' + resp.status;
      try { var e = await resp.json(); msg = e.error || msg; } catch (e2) { /* keep */ }
      throw new Error(msg);
    }
    return resp.json();
  }

  function toast(msg, ms) {
    if (typeof window.toast === 'function') window.toast(msg, ms);
  }

  // ============================================================
  // 数据加载
  // ============================================================
  async function loadQuestions() {
    var data = await getJson('/api/pg-questions');
    questions = data.questions || [];
  }

  async function loadProgress() {
    var data = await getJson('/api/pg-progress');
    progress = {};
    (data.items || []).forEach(function (it) { progress[it.questionId] = it; });
    renderOverview(data);
  }

  async function loadScripts() {
    var data = await getJson('/api/pg-scripts');
    scripts = data.scripts || {};
  }

  function renderOverview(data) {
    var overallEl = qs('#pg8-overall');
    var metaEl = qs('#pg8-overview-meta');
    if (overallEl) overallEl.textContent = (data.overall || 0) + '%';
    if (metaEl) {
      var m = data.meta || {};
      metaEl.innerHTML =
        '<div>已练习 <b style="color:var(--accent);">' + (m.practiced || 0) + '</b> / ' + (m.total || 8) + ' 题</div>' +
        '<div style="margin-top:0.25rem;">已成稿 <b style="color:var(--accent2);">' + (m.finalized || 0) + '</b> 题' +
        (data.averageScore != null ? ' · 平均分 <b>' + data.averageScore + '</b>' : '') + '</div>' +
        '<div style="margin-top:0.25rem;font-size:0.78rem;">熟练度 = 练习次数(45%) + 已成稿(25%) + 最近评分(30%)</div>';
    }
  }

  // ============================================================
  // 8 题卡片墙
  // ============================================================
  function levelBadge(level) {
    var cls = 'pg8-badge pg8-badge-' + level;
    return '<span class="' + cls + '">' + (LEVEL_LABEL[level] || level) + '</span>';
  }

  function renderGrid() {
    var grid = qs('#pg8-grid');
    if (!grid) return;
    grid.innerHTML = questions.map(function (q) {
      var p = progress[q.id] || {};
      var pct = p.proficiency || 0;
      return '' +
        '<div class="pg8-card' + (currentId === q.id ? ' active' : '') + '" data-id="' + q.id + '">' +
          '<div class="pg8-card-top">' +
            '<span class="pg8-num">Q' + q.order + '</span>' +
            levelBadge(p.level || 'untouched') +
          '</div>' +
          '<div class="pg8-card-q">' + esc(q.question) + '</div>' +
          '<div class="pg8-card-comp">' + esc(q.competency) + '</div>' +
          '<div class="pg8-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pg8-card-meta">' +
            '<span>熟练度 ' + pct + '%</span>' +
            '<span>练习 ' + (p.practiceCount || 0) + ' 次</span>' +
            (p.lastScore != null ? '<span>最近 ' + p.lastScore + ' 分</span>' : '') +
          '</div>' +
        '</div>';
    }).join('');

    qsa('#pg8-grid .pg8-card').forEach(function (card) {
      card.addEventListener('click', function () { selectQuestion(card.getAttribute('data-id')); });
    });
  }

  // ============================================================
  // 单题工作台
  // ============================================================
  function selectQuestion(id) {
    currentId = id;
    lastEval = null;
    stopTimer();
    renderGrid();

    var q = questions.filter(function (x) { return x.id === id; })[0];
    if (!q) return;

    var wb = qs('#pg8-workbench');
    if (!wb) return;
    wb.classList.remove('hidden');
    var script = scripts[id] || {};

    wb.innerHTML = '' +
      '<div class="card pg8-wb-head">' +
        '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">' +
          '<span class="pg8-num">Q' + q.order + '</span>' +
          '<span class="pg8-comp-tag">' + esc(q.competency) + '</span>' +
        '</div>' +
        '<h2 style="margin:0.5rem 0 0;font-size:1.15rem;">' + esc(q.question) + '</h2>' +
      '</div>' +

      '<div class="pg8-layout">' +
        '<div class="pg8-col">' +
          '<div class="card">' +
            '<h3 style="margin-bottom:0.5rem;">🎯 面试官在看什么</h3>' +
            '<p style="font-size:0.85rem;color:var(--muted);line-height:1.7;margin:0;">' + esc(q.why_asked) + '</p>' +
          '</div>' +
          '<div class="card">' +
            '<h3 style="margin-bottom:0.5rem;">🧩 STAR 提示</h3>' +
            '<div class="pg8-star">' +
              starRow('S', '情境', q.star_hints && q.star_hints.situation) +
              starRow('T', '任务', q.star_hints && q.star_hints.task) +
              starRow('A', '行动', q.star_hints && q.star_hints.action) +
              starRow('R', '结果', q.star_hints && q.star_hints.result) +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<h3 style="margin-bottom:0.5rem;">🚫 危险区</h3>' +
            '<ul class="pg8-danger">' + (q.danger_zones || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
          '</div>' +
          '<div class="card">' +
            '<h3 style="margin-bottom:0.5rem;">💡 关键要点</h3>' +
            '<ul class="pg8-key">' + (q.key_points || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
          '</div>' +
        '</div>' +

        '<div class="pg8-col">' +
          '<div class="card">' +
            '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.6rem;">' +
              '<h3 style="margin:0;">⏱ 计时作答</h3>' +
              '<span id="pg8-timer" class="pg8-timer">准备 30s</span>' +
              '<button id="pg8-btn-timer" class="btn-outline" style="font-size:0.78rem;">开始计时</button>' +
              '<button id="pg8-btn-timer-reset" class="btn-outline" style="font-size:0.78rem;">重置</button>' +
            '</div>' +
            '<div style="display:flex;gap:0.5rem;align-items:flex-start;">' +
              '<textarea id="pg8-answer" rows="9" placeholder="30 秒准备 → 120 秒作答。建议按 STAR 结构组织：情境一句话带过，重点讲你的行动和量化结果。" style="width:100%;min-height:200px;resize:vertical;line-height:1.7;"></textarea>' +
              '<button class="btn-mic" data-voice-target="pg8-answer" title="语音输入" style="flex-shrink:0;">🎤</button>' +
            '</div>' +
            '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">' +
              '<button id="pg8-btn-evaluate" class="btn-primary" style="font-size:0.9rem;">提交评估</button>' +
              '<button id="pg8-btn-model" class="btn-ai-action btn-ai-model" style="font-size:0.82rem;"><span class="ai-action-icon">✨</span>AI 标准答案</button>' +
            '</div>' +
          '</div>' +
          '<div id="pg8-eval"></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" id="pg8-script-card">' +
        '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.6rem;">' +
          '<h3 style="margin:0;">📝 我的回答稿</h3>' +
          '<span id="pg8-script-status" style="font-size:0.78rem;color:var(--muted);"></span>' +
          '<div style="margin-left:auto;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
            '<button id="pg8-btn-polish" class="btn-ai-action btn-ai-followup" style="font-size:0.78rem;">✨ AI 打磨</button>' +
            '<button id="pg8-btn-apply-eval" class="btn-outline" style="font-size:0.78rem;">采用改进版</button>' +
            '<button id="pg8-btn-save-script" class="btn-primary" style="font-size:0.78rem;">💾 保存定稿</button>' +
            '<button id="pg8-btn-export-md" class="btn-outline" style="font-size:0.78rem;">📥 MD</button>' +
            '<button id="pg8-btn-export-docx" class="btn-outline" style="font-size:0.78rem;">📄 DOCX</button>' +
          '</div>' +
        '</div>' +
        '<textarea id="pg8-script" rows="8" placeholder="把打磨好的回答稿写在这里，保存后会生成一个新版本。" style="width:100%;min-height:170px;resize:vertical;line-height:1.7;">' + esc(script.current || '') + '</textarea>' +
        '<div id="pg8-polish-result" style="margin-top:0.6rem;"></div>' +
        '<details id="pg8-versions-panel" style="margin-top:0.6rem;">' +
          '<summary style="cursor:pointer;font-size:0.85rem;font-weight:600;">🕘 版本历史 (<span id="pg8-version-count">0</span>)</summary>' +
          '<div id="pg8-versions" style="margin-top:0.5rem;"></div>' +
        '</details>' +
      '</div>';

    bindWorkbench(q);
    renderVersions(script);
    updateScriptStatus(script);
    wb.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function starRow(letter, label, text) {
    if (!text) return '';
    return '<div class="pg8-star-row"><span class="pg8-star-key">' + letter + '</span>' +
      '<div><b style="font-size:0.82rem;">' + label + '</b><div style="font-size:0.82rem;color:var(--muted);line-height:1.6;">' + esc(text) + '</div></div></div>';
  }

  function bindWorkbench(q) {
    var btnTimer = qs('#pg8-btn-timer');
    var btnReset = qs('#pg8-btn-timer-reset');
    var btnEval = qs('#pg8-btn-evaluate');
    var btnModel = qs('#pg8-btn-model');
    var btnSave = qs('#pg8-btn-save-script');
    var btnPolish = qs('#pg8-btn-polish');
    var btnApply = qs('#pg8-btn-apply-eval');
    var btnMd = qs('#pg8-btn-export-md');
    var btnDocx = qs('#pg8-btn-export-docx');

    if (btnTimer) btnTimer.addEventListener('click', function () {
      if (timerHandle) { stopTimer(); return; }
      startTimer(PREPARE_SECONDS, 'prepare');
    });
    if (btnReset) btnReset.addEventListener('click', function () { stopTimer(); });
    if (btnEval) btnEval.addEventListener('click', function () { submitAnswer(q); });
    if (btnModel) btnModel.addEventListener('click', function () { generateModelAnswer(q, btnModel); });
    if (btnSave) btnSave.addEventListener('click', function () { saveScript(q); });
    if (btnPolish) btnPolish.addEventListener('click', function () { polishScript(q, btnPolish); });
    if (btnApply) btnApply.addEventListener('click', function () { applyEvalImprovement(); });
    if (btnMd) btnMd.addEventListener('click', function () { exportScript(q, 'md'); });
    if (btnDocx) btnDocx.addEventListener('click', function () { exportScript(q, 'docx'); });
  }

  // ============================================================
  // 计时器（30s 准备 + 120s 作答）
  // ============================================================
  function startTimer(seconds, phase) {
    timerPhase = phase;
    timerLeft = seconds;
    paintTimer();
    timerHandle = setInterval(function () {
      timerLeft--;
      if (timerLeft <= 0) {
        if (phase === 'prepare') {
          startTimer(ANSWER_SECONDS, 'answer');
          toast('⏱ 准备结束，开始作答（120s）');
          return;
        }
        stopTimer();
        toast('⏱ 作答时间到，请提交评估');
        return;
      }
      paintTimer();
    }, 1000);
  }

  function paintTimer() {
    var el = qs('#pg8-timer');
    if (!el) return;
    var label = timerPhase === 'prepare' ? '准备' : '作答';
    el.textContent = label + ' ' + timerLeft + 's';
    el.classList.toggle('warn', timerLeft <= 10);
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    timerPhase = '';
    timerLeft = 0;
    var el = qs('#pg8-timer');
    if (el) { el.textContent = '准备 30s'; el.classList.remove('warn'); }
  }

  // ============================================================
  // 评估 / 标准答案
  // ============================================================
  // app.js 里的 state 是顶层 let（全局词法绑定，不在 window 上），需按标识符直接取
  function appState() {
    try { return (typeof state !== 'undefined') ? state : null; } catch (e) { return null; }
  }

  function jdSummary() {
    var st = appState();
    var jd = (st && st.analysis && st.analysis.jd) || {};
    return jd.position ? ((jd.company || '') + ' ' + jd.position).trim().slice(0, 400) : '';
  }
  function resumeText() {
    var st = appState();
    return (st && st.resumeText) ? st.resumeText.slice(0, 3000) : '';
  }

  async function submitAnswer(q) {
    var answer = (qs('#pg8-answer') || {}).value || '';
    answer = answer.trim();
    if (!answer) return toast('请先作答');

    var btn = qs('#pg8-btn-evaluate');
    if (btn) { btn.disabled = true; btn.textContent = '评估中...'; }
    var box = qs('#pg8-eval');
    if (box) box.innerHTML = '<div class="card" style="color:var(--muted);font-size:0.85rem;">⏳ AI 正在按五个维度评估你的回答…</div>';

    try {
      var result = await getJson('/api/evaluate-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          answer: answer,
          jdSummary: jdSummary(),
          resumeText: resumeText()
        })
      });
      if (result.error) throw new Error(result.error);
      lastEval = result;
      renderEval(result);
      try {
        await getJson('/api/pg-practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: q.id, score: result.overall_score })
        });
        await loadProgress();
        renderGrid();
        refreshScriptStatus(q);
      } catch (e) { /* 统计失败不影响主流程 */ }
    } catch (e) {
      if (box) box.innerHTML = '<div class="card" style="color:var(--red);font-size:0.85rem;">评估失败：' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '提交评估'; }
    }
  }

  var DIM_LABEL = {
    star_completeness: 'STAR 完整度',
    quantification: '量化程度',
    position_match: '岗位匹配度',
    structure: '结构清晰度',
    highlight: '亮点突出度'
  };

  function scoreColor(v) {
    return v >= 80 ? 'var(--green)' : (v >= 60 ? 'var(--accent)' : 'var(--red)');
  }

  function renderEval(result) {
    var box = qs('#pg8-eval');
    if (!box) return;
    var scores = result.scores || {};
    var overall = result.overall_score || 0;

    var dims = Object.keys(DIM_LABEL).map(function (k) {
      var v = scores[k] || 0;
      return '<div style="margin-bottom:0.35rem;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.78rem;"><span>' + DIM_LABEL[k] + '</span><b style="color:' + scoreColor(v) + ';">' + v + '</b></div>' +
        '<div class="pg8-bar"><i style="width:' + v + '%;background:' + scoreColor(v) + ';"></i></div>' +
      '</div>';
    }).join('');

    var lines = (result.line_by_line || []).map(function (l) {
      return '<div class="pg8-line ' + (l.is_good ? 'good' : 'bad') + '">' +
        '<div class="pg8-line-quote">' + (l.is_good ? '✅' : '⚠️') + ' ' + esc(l.quote) + '</div>' +
        '<div class="pg8-line-comment">' + esc(l.comment) + '</div>' +
      '</div>';
    }).join('');

    var takeaways = (result.key_takeaways || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

    box.innerHTML = '' +
      '<div class="card">' +
        '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.8rem;">' +
          '<div style="text-align:center;min-width:70px;">' +
            '<div style="font-size:2.2rem;font-weight:700;color:' + scoreColor(overall) + ';">' + overall + '</div>' +
            '<div style="font-size:0.72rem;color:var(--muted);">总分</div>' +
          '</div>' +
          '<div style="flex:1;min-width:160px;">' + dims + '</div>' +
        '</div>' +
        (lines ? '<h3 style="font-size:0.92rem;margin-bottom:0.5rem;">🔍 逐句点评</h3>' + lines : '') +
        (takeaways ? '<h3 style="font-size:0.92rem;margin:0.8rem 0 0.4rem;">🔧 关键改进点</h3><ul class="pg8-key">' + takeaways + '</ul>' : '') +
        (result.improved_version ? '<details style="margin-top:0.7rem;"><summary style="cursor:pointer;font-size:0.85rem;font-weight:600;">查看改进版回答</summary><div class="pg8-improved">' + esc(result.improved_version) + '</div></details>' : '') +
      '</div>';
  }

  async function generateModelAnswer(q, btn) {
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '生成中...';
    try {
      var result = await getJson('/api/generate-model-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.question, jdSummary: jdSummary(), resumeText: resumeText() })
      });
      if (result.error) throw new Error(result.error);
      var text = result.model_answer || result.answer || result.raw || '';
      var ta = qs('#pg8-answer');
      if (ta) ta.value = text;
      toast('✨ 已生成标准答案，可继续修改后提交评估');
    } catch (e) {
      toast('生成失败：' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  function applyEvalImprovement() {
    if (!lastEval || !lastEval.improved_version) return toast('请先提交评估');
    var ta = qs('#pg8-script');
    if (!ta) return;
    ta.value = lastEval.improved_version;
    toast('已填入「我的回答稿」，记得点保存定稿');
  }

  // ============================================================
  // 回答稿：保存 / 版本 / 打磨 / 导出
  // ============================================================
  function updateScriptStatus(script) {
    var el = qs('#pg8-script-status');
    if (!el) return;
    if (!script || !script.current) { el.textContent = '尚未保存定稿'; return; }
    var when = script.updatedAt ? new Date(script.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = '已保存 · ' + when + (script.lastScore != null ? ' · 最近评分 ' + script.lastScore : '');
  }

  function refreshScriptStatus(q) {
    var s = scripts[q.id] || {};
    updateScriptStatus(s);
    renderVersions(s);
  }

  function renderVersions(script) {
    var box = qs('#pg8-versions');
    var countEl = qs('#pg8-version-count');
    if (!box) return;
    var versions = (script && script.versions) || [];
    if (countEl) countEl.textContent = versions.length;
    if (!versions.length) {
      box.innerHTML = '<p style="font-size:0.82rem;color:var(--muted);">还没有版本记录。保存一次定稿即生成 v1。</p>';
      return;
    }
    box.innerHTML = versions.slice().reverse().map(function (v) {
      return '<div class="pg8-version">' +
        '<div class="pg8-version-head">' +
          '<b>v' + v.v + '</b>' +
          '<span style="color:var(--muted);font-size:0.75rem;">' + (v.createdAt ? new Date(v.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</span>' +
          (v.score != null ? '<span style="color:' + scoreColor(v.score) + ';font-size:0.75rem;font-weight:600;">' + v.score + ' 分</span>' : '') +
          '<button class="btn-outline pg8-version-load" data-v="' + v.v + '" style="margin-left:auto;font-size:0.72rem;padding:0.1rem 0.4rem;">载入</button>' +
        '</div>' +
        '<div class="pg8-version-body">' + esc(v.content) + '</div>' +
      '</div>';
    }).join('');

    qsa('#pg8-versions .pg8-version-load').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = parseInt(btn.getAttribute('data-v'), 10);
        var found = versions.filter(function (x) { return x.v === v; })[0];
        if (!found) return;
        var ta = qs('#pg8-script');
        if (ta) ta.value = found.content;
        toast('已载入 v' + v + '，保存后将作为新版本');
      });
    });
  }

  async function saveScript(q) {
    var content = ((qs('#pg8-script') || {}).value || '').trim();
    if (!content) return toast('回答稿不能为空');
    var btn = qs('#pg8-btn-save-script');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
    try {
      var score = lastEval ? lastEval.overall_score : (progress[q.id] && progress[q.id].lastScore);
      var res = await getJson('/api/pg-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, content: content, score: score })
      });
      await loadScripts();
      await loadProgress();
      renderGrid();
      renderVersions(res.script);
      updateScriptStatus(res.script);
      toast(res.versionAdded ? '✅ 已保存，生成新版本' : '✅ 已保存（内容无变化，未生成新版本）');
    } catch (e) {
      toast('保存失败：' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 保存定稿'; }
    }
  }

  async function polishScript(q, btn) {
    var content = ((qs('#pg8-script') || {}).value || '').trim();
    if (!content) return toast('请先写一份回答稿，再进行打磨');
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '打磨中...';
    var box = qs('#pg8-polish-result');
    if (box) box.innerHTML = '<div style="font-size:0.82rem;color:var(--muted);">⏳ AI 正在逐句打磨…</div>';

    try {
      var res = await getJson('/api/pg-script/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, content: content, jdSummary: jdSummary(), resumeText: resumeText() })
      });
      if (res.error) throw new Error(res.error);
      renderPolish(res);
    } catch (e) {
      if (box) box.innerHTML = '<div style="font-size:0.82rem;color:var(--red);">打磨失败：' + esc(e.message) + '</div>';
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  function renderPolish(res) {
    var box = qs('#pg8-polish-result');
    if (!box) return;
    var changes = (res.changes || []).map(function (c) {
      return '<div class="pg8-change">' +
        '<div class="pg8-change-old">原：' + esc(c.original) + '</div>' +
        '<div class="pg8-change-new">改：' + esc(c.revised) + '</div>' +
        '<div class="pg8-change-reason">💡 ' + esc(c.reason) + '</div>' +
      '</div>';
    }).join('');
    var missing = (res.missing_facts || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
    var structure = res.structure || {};
    var structHtml = Object.keys(structure).map(function (k) {
      var label = { situation: '情境 S', task: '任务 T', action: '行动 A', result: '结果 R' }[k] || k;
      return '<div style="font-size:0.8rem;"><b>' + label + '</b>：' + esc(structure[k]) + '</div>';
    }).join('');

    box.innerHTML = '' +
      '<div class="pg8-polish-box">' +
        '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.5rem;">' +
          '<b style="font-size:0.9rem;">✨ 打磨结果</b>' +
          (res.score != null ? '<span style="color:' + scoreColor(res.score) + ';font-weight:700;font-size:0.85rem;">' + res.score + ' 分</span>' : '') +
          '<button id="pg8-btn-adopt-polish" class="btn-primary" style="margin-left:auto;font-size:0.76rem;">采用打磨稿</button>' +
        '</div>' +
        (res.one_line_tip ? '<div class="pg8-tip">🎯 ' + esc(res.one_line_tip) + '</div>' : '') +
        (structHtml ? '<div style="margin:0.5rem 0;display:flex;flex-direction:column;gap:0.2rem;">' + structHtml + '</div>' : '') +
        (changes ? '<div style="margin-top:0.5rem;">' + changes + '</div>' : '') +
        (missing ? '<div style="margin-top:0.5rem;"><b style="font-size:0.82rem;">需要补充的事实/数字</b><ul class="pg8-key">' + missing + '</ul></div>' : '') +
        (res.polished ? '<details style="margin-top:0.6rem;"><summary style="cursor:pointer;font-size:0.82rem;font-weight:600;">查看打磨后完整定稿</summary><div class="pg8-improved">' + esc(res.polished) + '</div></details>' : '') +
      '</div>';

    var adopt = qs('#pg8-btn-adopt-polish');
    if (adopt) adopt.addEventListener('click', function () {
      if (!res.polished) return toast('本次打磨没有返回完整定稿');
      var ta = qs('#pg8-script');
      if (ta) ta.value = res.polished;
      toast('已采用打磨稿，记得点保存定稿');
    });
  }

  function exportScript(q, kind) {
    var content = ((qs('#pg8-script') || {}).value || '').trim();
    if (!content) return toast('回答稿为空，无法导出');
    var title = '宝洁八大问 Q' + q.order + ' - ' + q.competency;
    var sections = {};
    sections['题目'] = q.question;
    sections['考察维度'] = q.competency;
    sections['我的回答稿'] = content;
    if (kind === 'docx') {
      if (typeof window.exportDocx === 'function') window.exportDocx(title, '', sections);
    } else if (typeof window.exportMarkdown === 'function') {
      window.exportMarkdown(title, '', sections);
    }
  }

  // ============================================================
  // 仪表盘：八大问熟练度条（唯一主动引流入口）
  // ============================================================
  async function renderDashboard() {
    var box = qs('#dash-pg8-bars');
    if (!box) return;
    try {
      var data = await getJson('/api/pg-progress');
      var items = data.items || [];
      if (!items.length) { box.innerHTML = '<p style="font-size:0.82rem;color:var(--muted);">暂无数据</p>'; return; }
      box.innerHTML = items.map(function (it) {
        var color = it.level === 'mastered' ? 'var(--green)' : (it.level === 'drafted' ? 'var(--accent)' : 'var(--muted)');
        return '<div style="display:flex;align-items:center;gap:0.6rem;font-size:0.78rem;">' +
          '<span style="flex:0 0 150px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(it.question) + '">Q' + it.order + ' ' + esc(it.competency) + '</span>' +
          '<div class="pg8-bar" style="flex:1;margin:0;"><i style="width:' + (it.proficiency || 0) + '%;background:' + color + ';"></i></div>' +
          '<span style="flex:0 0 42px;text-align:right;color:' + color + ';font-weight:600;">' + (it.proficiency || 0) + '%</span>' +
          '<span style="flex:0 0 62px;text-align:right;color:var(--muted);font-size:0.72rem;">' + (LEVEL_LABEL[it.level] || '') + '</span>' +
        '</div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '<p style="font-size:0.82rem;color:var(--muted);">熟练度加载失败</p>';
    }
  }

  // ============================================================
  // 入口
  // ============================================================
  var initialized = false;

  async function init() {
    var root = qs('#tab-pg8');
    if (!root) return;
    try {
      await Promise.all([loadQuestions(), loadScripts()]);
      await loadProgress();
      renderGrid();
    } catch (e) {
      var grid = qs('#pg8-grid');
      if (grid) grid.innerHTML = '<div class="card" style="color:var(--red);font-size:0.85rem;">加载宝洁八大问失败：' + esc(e.message) + '</div>';
    }
  }

  window.Pg8 = {
    renderDashboard: renderDashboard,
    init: function () {
      if (initialized) { loadProgress().then(renderGrid).catch(function () {}); return; }
      initialized = true;
      init();
    }
  };
})();