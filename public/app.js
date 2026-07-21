// ============================================================
// InterviewPrep MVP - Frontend App (v2)
// ============================================================

const API = '/api';
// HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// 防抖工具函数
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// 暗色模式
(function() {
  const saved = localStorage.getItem('darkMode');
  if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
  const btn = document.getElementById('btn-dark-toggle');
  if (btn) {
    const update = () => {
      const dark = document.documentElement.classList.contains('dark');
      btn.textContent = dark ? '\u2600\uFE0F' : '\uD83C\uDF19';
      localStorage.setItem('darkMode', dark ? '1' : '0');
    };
    update();
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      update();
    });
  }
})();

// 全局 fetch 重试包装器（LLM API 错误时自动处理）
async function fetchRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || `请求失败 (${resp.status})`);
      }
      return resp;
    } catch (e) {
      if (i < retries && (e.message.includes('网络') || e.message.includes('Network') || e.message.includes('fetch'))) {
        toast(`⏳ 第 ${i+1} 次重试...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
}

let state = {
  sessionId: null,
  analysis: null,
  interviewActive: false,
  _practiceQuestion: null,
  _lastFeedback: null,
  jdText: '',
  resumeText: '',
  resumeFileName: '',
  resumeSourceType: '',
  _drillMode: 'type',
  _drillType: '',
  _drillQuestion: null,
  _drillFeedback: null,
  _drillTimer: null,
  _drillPhase: null
};

// ===== Helpers =====
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}
function setStatus(text) { $('#nav-status').textContent = text; }

// Resize event — 通知所有活跃ECharts实例重绘
window.addEventListener('resize', () => {
  // echarts 实例由各图表模块自行维护，resize时自动触发
  // 这里仅做占位，避免 ReferenceError
});

// Tab 小红点系统
async function loadDashboard() {
  try {
    const data = await fetchRetry('/api/dashboard/stats').then(r => r.json()).catch(() => null);
    if (!data || (data.totalPractices === 0 && data.totalInterviews === 0)) {
      // New user — show onboarding
      const dash = document.getElementById('tab-dashboard');
      const welcome = document.getElementById('welcome-hero');
      if (!welcome && dash) {
        const el = document.createElement('div');
        el.id = 'welcome-hero';
        el.className = 'card';
        el.style.cssText = 'text-align:center;padding:2.5rem;border:2px dashed var(--accent2);background:linear-gradient(135deg, rgba(79,70,229,0.06), rgba(6,182,212,0.06));';
        el.innerHTML = `
          <h2 style="margin-bottom:0.8rem;">👋 欢迎使用 InterviewPrep</h2>
          <p style="color:var(--muted);margin-bottom:1.2rem;">AI 驱动的面试准备工具，三步开始你的面试备战之旅</p>
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
            <div style="flex:1;min-width:140px;max-width:200px;padding:1rem;background:var(--bg1);border-radius:8px;">
              <div style="font-size:1.5rem;margin-bottom:0.3rem;">1️⃣</div>
              <div style="font-weight:600;font-size:0.85rem;">填写 JD + 简历</div>
              <div style="font-size:0.72rem;color:var(--muted);">在「分析 & 押题」页输入岗位描述和你的简历</div>
            </div>
            <div style="flex:1;min-width:140px;max-width:200px;padding:1rem;background:var(--bg1);border-radius:8px;">
              <div style="font-size:1.5rem;margin-bottom:0.3rem;">2️⃣</div>
              <div style="font-weight:600;font-size:0.85rem;">AI 自动押题</div>
              <div style="font-size:0.72rem;color:var(--muted);">点击分析，AI 生成 5 类面题 + 差距分析</div>
            </div>
            <div style="flex:1;min-width:140px;max-width:200px;padding:1rem;background:var(--bg1);border-radius:8px;">
              <div style="font-size:1.5rem;margin-bottom:0.3rem;">3️⃣</div>
              <div style="font-weight:600;font-size:0.85rem;">逐题练习 + 模拟</div>
              <div style="font-size:0.72rem;color:var(--muted);">在「单题练习」打磨每道题，或「全真模拟」1v1 面试</div>
            </div>
          </div>
          <button onclick="switchTab('analyze')" class="btn-primary" style="margin-top:1.2rem;">🚀 开始分析</button>
        `;
        dash.prepend(el);
      }
      return;
    }
    // Remove welcome hero if stats exist
    const welcome = document.getElementById('welcome-hero');
    if (welcome) welcome.remove();

    renderDashStats(data);
    // Defer heavy chart rendering
    setTimeout(() => renderRadarChart(data.radarScores || {}), 100);
    renderPieChart(data.typeCoverage || {});
    renderCalendar(data.calendar || {});
    renderRecentPractices(data.recentPractices || []);
    renderInterviewHistory(data.interviewReports || []);

    // Quick summary card
    const container = document.getElementById('tab-dashboard');
    if (data && container) {
      let card = document.getElementById('dashboard-summary-card');
      if (!card) {
        card = document.createElement('div');
        card.id = 'dashboard-summary-card';
        card.className = 'card';
        card.style.cssText = 'text-align:center;margin-top:1rem;';
        container.appendChild(card);
      }
      card.innerHTML = `
        <h3 style="margin-bottom:0.5rem;">📈 练习概览</h3>
        <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          <div><span style="font-size:1.5rem;font-weight:700;">${data.totalPractices || 0}</span><br><span style="font-size:0.78rem;color:var(--muted);">总练习</span></div>
          <div><span style="font-size:1.5rem;font-weight:700;">${data.totalInterviews || 0}</span><br><span style="font-size:0.78rem;color:var(--muted);">模拟面试</span></div>
          <div><span style="font-size:1.5rem;font-weight:700;color:var(--accent);">${data.avgScore || 0}</span><br><span style="font-size:0.78rem;color:var(--muted);">平均分</span></div>
        </div>
      `;
    }
  } catch (e) {
    console.warn('Dashboard load failed:', e);
    $('#dash-stats').innerHTML = '<p style="color:var(--muted);">暂无数据，完成一次练习或模拟面试后开始追踪</p>';
  }
}

function renderDashStats(data) {
  const stats = [
    { label: '练习次数', value: data.totalPractices || 0, icon: '📝' },
    { label: '模拟面试', value: data.totalInterviews || 0, icon: '🎤' },
    { label: '平均得分', value: (data.avgScore || 0) + '分', icon: '⭐' },
  ];
  $('#dash-stats').innerHTML = stats.map(s =>
    '<div class="card" style="flex:1;min-width:150px;text-align:center;padding:1rem;">' +
    '<div style="font-size:2rem;">' + s.icon + '</div>' +
    '<div style="font-size:1.5rem;font-weight:700;">' + s.value + '</div>' +
    '<div style="font-size:0.78rem;color:var(--muted);">' + s.label + '</div>' +
    '</div>'
  ).join('');
}

function renderRadarChart(scores) {
  const el = document.getElementById('dash-radar');
  if (!el) return;
  const keys = ['star_completeness','quantification','position_match','structure','highlight'];
  const labels = ['STAR完整度','量化程度','岗位匹配','结构逻辑','亮点突出'];
  const values = keys.map(k => scores[k] || 0);
  if (values.every(v => v === 0)) { el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">完成练习后显示</p>'; return; }

  const chart = echarts.init(el);
  chart.setOption({
    tooltip: {},
    radar: {
      indicator: labels.map((l,i) => ({ name: l, max: 100 })),
      center: ['50%','55%'],
      radius: '65%'
    },
    series: [{ type: 'radar', data: [{ value: values, name: '平均得分', areaStyle: { color: 'rgba(79,70,229,0.15)' },
      lineStyle: { color: '#4F46E5', width: 2 }, itemStyle: { color: '#4F46E5' } }] }]
  });
  window.addEventListener('resize', () => chart.resize());
}

function renderPieChart(data) {
  const el = document.getElementById('dash-pie');
  if (!el) return;
  const types = [
    { key: 'behavioral', name: '行为面试', color: '#4F46E5' },
    { key: 'technical', name: '专业能力', color: '#10B981' },
    { key: 'project', name: '项目深挖', color: '#F59E0B' },
    { key: 'stress', name: '压力测试', color: '#EF4444' },
    { key: 'hr', name: 'HR面', color: '#8B5CF6' }
  ];
  const hasData = types.some(t => (data[t.key] || 0) > 0);
  if (!hasData) { el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">完成练习后显示</p>'; return; }

  const chart = echarts.init(el);
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['45%','70%'], center: ['50%','50%'],
      data: types.filter(t => (data[t.key]||0) > 0).map(t => ({ value: data[t.key], name: t.name, itemStyle: { color: t.color } })),
      label: { show: false }
    }]
  });
  window.addEventListener('resize', () => chart.resize());
}

function renderCalendar(calData) {
  const el = $('#dash-calendar');
  if (!el) return;
  const now = new Date();
  let html = '';
  for (let i = 59; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const count = calData[key] || 0;
    let bg = '#1e293b';
    if (count >= 5) bg = '#10B981';
    else if (count >= 3) bg = '#34D399';
    else if (count >= 1) bg = '#6EE7B7';
    html += '<div title="' + key + ': ' + count + '次" style="width:14px;height:14px;border-radius:3px;background:' + bg + ';"></div>';
  }
  el.innerHTML = html;
}

// 练习详情弹窗
function showPracticeDetail(p) {
  const modal = document.getElementById('practice-detail-modal');
  const body = document.getElementById('practice-detail-body');
  if (!modal || !body) return;

  const dateStr = p.date ? new Date(p.date).toLocaleDateString('zh-CN') + ' ' + new Date(p.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const scoreCls = (p.score || 0) >= 80 ? 'color:var(--green);' : (p.score || 0) >= 60 ? 'color:#F59E0B;' : 'color:var(--red);';

  body.innerHTML = `
    <div style="margin-bottom:1rem;">
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.3rem;">${dateStr} · ${p.type || '练习'}</div>
      <div style="font-weight:600;font-size:1rem;margin-bottom:0.5rem;">${p.question || '无题目'}</div>
      ${p.score ? '<div style="font-size:1.2rem;font-weight:700;' + scoreCls + 'margin-bottom:0.8rem;">' + p.score + '分</div>' : ''}
    </div>
    ${p.answer ? '<div style="margin-bottom:0.8rem;"><b style="font-size:0.85rem;">你的回答：</b><div style="background:var(--bg2);padding:0.5rem;border-radius:6px;margin-top:0.2rem;font-size:0.82rem;line-height:1.6;max-height:200px;overflow-y:auto;">' + p.answer.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div></div>' : ''}
    ${p.improvedVersion ? '<div style="margin-bottom:0.8rem;"><b style="font-size:0.85rem;">💡 AI改进参考：</b><div style="background:rgba(79,70,229,0.05);padding:0.5rem;border-radius:6px;margin-top:0.2rem;font-size:0.82rem;line-height:1.6;max-height:200px;overflow-y:auto;">' + p.improvedVersion.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div></div>' : ''}
    ${p.keyTakeaways ? '<div style="margin-bottom:0.8rem;"><b style="font-size:0.85rem;">🎯 关键改进点：</b><div style="font-size:0.82rem;color:var(--accent);margin-top:0.2rem;">' + (Array.isArray(p.keyTakeaways) ? p.keyTakeaways.join('；') : p.keyTakeaways) + '</div></div>' : ''}
    ${p.scores ? '<div style="font-size:0.78rem;color:var(--muted);">STAR完整度:' + (p.scores.star_completeness || '-') + ' | 量化:' + (p.scores.quantification || '-') + ' | 匹配:' + (p.scores.position_match || '-') + ' | 结构:' + (p.scores.structure || '-') + ' | 亮点:' + (p.scores.highlight || '-') + '</div>' : ''}
    ${p.source === 'drill' ? '<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--accent2);">📋 来自专项训练</div>' : ''}
  `;

  modal.classList.remove('hidden');
}

function renderRecentPractices(items) {
  const el = $('#dash-recent');
  if (!items.length) { el.innerHTML = '<p style="color:var(--muted);">暂无练习记录</p>'; return; }
  // 存储最近练习数据供详情弹窗使用
  window._dashRecentPractices = items;
  el.innerHTML = items.slice(0, 10).map((p, idx) =>
    '<div class="dash-practice-item" data-idx="' + idx + '" style="display:flex;align-items:center;gap:0.8rem;padding:0.5rem 0;border-bottom:1px solid var(--rule);cursor:pointer;" title="点击查看详情">' +
    '<span style="font-size:0.78rem;color:var(--muted);white-space:nowrap;">' + (p.date || '').slice(5) + '</span>' +
    '<span style="flex:1;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (p.question || p.type || '练习') + '</span>' +
    '<span style="font-weight:600;color:' + (p.score >= 80 ? 'var(--green)' : p.score >= 60 ? '#F59E0B' : 'var(--red)') + ';">' + (p.score || 0) + '分</span>' +
    '</div>'
  ).join('');

  // 点击查看详情
  el.querySelectorAll('.dash-practice-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      const p = window._dashRecentPractices[idx];
      if (p) showPracticeDetail(p);
    });
  });
}

function renderInterviewHistory(reports) {
  const el = $('#dash-interviews');
  if (!reports.length) { el.innerHTML = '<p style="color:var(--muted);">暂无模拟面试记录</p>'; return; }
  el.innerHTML = reports.slice(0, 10).map(r =>
    '<div style="display:flex;align-items:center;gap:0.8rem;padding:0.5rem 0;border-bottom:1px solid var(--rule);">' +
    '<span>🎤</span>' +
    '<span style="flex:1;font-size:0.85rem;">' + (r.label || r.position || '面试') + '</span>' +
    '<span style="font-size:0.78rem;color:var(--muted);">' + (r.date || '').slice(0,10) + '</span>' +
    '<span style="font-weight:600;color:var(--accent);">' + (r.score || '-') + '分</span>' +
    '</div>'
  ).join('');
}

function renderInterviewTabHistory() {
  const el = $('#interview-history-list');
  if (!el) return;
  try {
    const history = JSON.parse(localStorage.getItem('interview_history') || '[]');
    if (!history.length) {
      el.innerHTML = '暂无面试记录。完成一次模拟面试后会显示。';
      return;
    }
    el.innerHTML = history.map((h, i) => `
      <div style="padding:0.5rem;margin:4px 0;background:var(--tag-bg);border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
        <span>${new Date(h.date).toLocaleDateString('zh-CN')} · ${h.position}</span>
        <span style="font-weight:600;">${h.score}分 · ${h.questions}题</span>
      </div>
    `).join('');
  } catch { el.innerHTML = '加载失败'; }
}

function renderPracticeHistory() {
  loadPracticeHistoryFromServer();
}

async function loadPracticeHistoryFromServer() {
  const el = $('#practice-history-list');
  if (!el) return;
  try {
    const data = await fetchRetry('/api/phrases?tag=练习');
    const phrases = (data.phrases || []).slice(0, 50);
    if (!phrases.length) {
      el.innerHTML = '暂无练习记录。提交一道题后会自动显示。';
      return;
    }
    el.innerHTML = phrases.map(p => {
      const cls = (p.score || 0) >= 85 ? 'color:var(--green);' : (p.score || 0) >= 60 ? 'color:#D97706;' : 'color:var(--red);';
      return `<details style="margin:4px 0;background:var(--tag-bg);border-radius:4px;padding:0.4rem 0.6rem;">
        <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.82rem;">${new Date(p.createdAt).toLocaleDateString('zh-CN')} · ${(p.question||'').slice(0, 50)}</span>
          <span style="font-weight:600;white-space:nowrap;font-size:0.82rem;${cls}">${p.score||0}分</span>
        </summary>
        <div style="margin-top:0.4rem;font-size:0.78rem;line-height:1.6;">
          <div style="color:var(--muted);margin-bottom:0.3rem;"><b>题目：</b>${p.question||''}</div>
          <div style="color:var(--muted);margin-bottom:0.3rem;"><b>你的回答：</b>${(p.answer||'').slice(0, 300)}${(p.answer||'').length>300?'...':''}</div>
          ${p.improvedVersion ? `<div style="background:rgba(79,70,229,0.05);padding:0.4rem;border-radius:4px;margin-bottom:0.3rem;"><b>💡 改进版参考：</b>${p.improvedVersion}</div>` : ''}
          ${p.keyTakeaways ? `<div style="color:var(--accent);"><b>🎯 关键改进点：</b>${p.keyTakeaways}</div>` : ''}
          ${p.scores ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:0.2rem;">STAR:${p.scores.star_completeness||'-'} | 量化:${p.scores.quantification||'-'} | 匹配:${p.scores.position_match||'-'} | 结构:${p.scores.structure||'-'} | 亮点:${p.scores.highlight||'-'}</div>` : ''}
        </div>
      </details>`;
    }).join('');
  } catch { el.innerHTML = '加载失败'; }
}

async function autoSavePracticeRecord(question, answer, result) {
  try {
    const scores = {
      star_completeness: result.star_completeness || result.scores?.star_completeness || 0,
      quantification: result.quantification || result.scores?.quantification || 0,
      position_match: result.position_match || result.scores?.position_match || 0,
      structure: result.structure || result.scores?.structure || 0,
      highlight: result.highlight || result.scores?.highlight || 0
    };
    await fetchRetry('/api/phrases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        answer,
        improvedVersion: result.improved_version || '',
        keyTakeaways: (result.key_takeaways || []).join('；'),
        score: result.overall_score || 0,
        scores,
        tags: ['练习', result.type || ''],
        type: result.type || ''
      })
    });
  } catch { /* 静默失败，不影响主流程 */ }
}



// ===== P1: Follow-up Question System =====
// ============================================================
// AI 辅助按钮组：追问 + 标准答案
// ============================================================
function showFollowUpButton(mode, question, answer, evalResult) {
  var existing = document.querySelector('.follow-up-section');
  if (existing) existing.remove();

  var container = mode === 'practice' ? document.getElementById('practice-feedback') : document.getElementById('drill-feedback');
  if (!container) return;

  var section = document.createElement('div');
  section.className = 'follow-up-section';
  section.innerHTML = '<div class=\"ai-action-row\">' +
    '<button class=\"btn-ai-action btn-ai-followup\" id=\"btn-follow-up-' + mode + '\" title=\"AI根据你的回答弱点生成追问\"><span class=\"ai-action-icon\">💬</span>AI追问练习</button>' +
    '<button class=\"btn-ai-action btn-ai-model\" id=\"btn-model-answer-' + mode + '\" title=\"AI基于你的简历生成标准答案参考\"><span class=\"ai-action-icon\">✨</span>AI标准答案</button>' +
    '</div>';
  container.appendChild(section);

  // ---- 追问按钮 ----
  document.getElementById('btn-follow-up-' + mode).addEventListener('click', async function() {
    var btn = document.getElementById('btn-follow-up-' + mode);
    btn.disabled = true; btn.innerHTML = '<span class=\"ai-action-icon\">⏳</span>生成追问中...';
    try {
      var jd = state.analysis ? (state.analysis.jd || {}) : {};
      var jdSummary = jd.position ? (jd.company || '') + ' ' + jd.position : '';
      var followUp = await fetchRetry('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question,
          answer: answer,
          jdSummary: jdSummary,
          resumeText: (state.resumeText || '').slice(0, 3000)
        })
      }).then(function(r) { return r.json(); });

      if (followUp.should_follow_up) {
        section.innerHTML = '<div class=\"ai-action-row\">' +
          '<button class=\"btn-ai-action btn-ai-followup\" disabled>💬 已追问</button>' +
          '<button class=\"btn-ai-action btn-ai-model\" id=\"btn-model-answer-' + mode + '\" title=\"AI基于你的简历生成标准答案参考\"><span class=\"ai-action-icon\">✨</span>AI标准答案</button>' +
          '</div>' +
          '<div class=\"follow-up-q\">' + (followUp.follow_up_question || '') + '</div>' +
          '<div class=\"follow-up-reason\">追问原因：' + (followUp.reason || '') + ' (' + (followUp.follow_up_type || '') + ')</div>' +
          '<textarea id=\"follow-up-answer-' + mode + '\" rows=\"4\" placeholder=\"输入你的追问回答...\" style=\"width:100%;min-height:100px;resize:vertical;line-height:1.7;padding:0.5rem;border:1px solid var(--rule);border-radius:var(--radius-sm);background:var(--bg);margin-bottom:0.5rem;font-family:var(--font-body);\"></textarea>' +
          '<button class=\"btn-primary\" id=\"btn-follow-up-submit-' + mode + '\" style=\"font-size:0.82rem;\">提交追问回答</button>';

        // 重新绑定标准答案按钮
        loadModelAnswerHandler(mode, question, section);

        document.getElementById('btn-follow-up-submit-' + mode).addEventListener('click', async function() {
          var fuAnswer = document.getElementById('follow-up-answer-' + mode).value.trim();
          if (!fuAnswer || fuAnswer.length < 5) { toast('请写下追问回答（至少5个字）'); return; }
          var fuBtn = document.getElementById('btn-follow-up-submit-' + mode);
          fuBtn.disabled = true; fuBtn.textContent = '评估中...';
          try {
            var fuResult = await apiEvaluateSingle(followUp.follow_up_question, fuAnswer, jdSummary, (state.resumeText || '').slice(0, 3000));
            if (mode === 'practice') {
              renderSingleFeedback(fuResult);
            } else {
              renderDrillFeedback(fuResult);
            }
            autoSavePracticeRecord(followUp.follow_up_question, fuAnswer, fuResult);
            toast('追问评估完成');
          } catch(e) { toast('评估失败: ' + e.message); }
          finally { fuBtn.disabled = false; fuBtn.textContent = '重新提交'; }
        });
      } else {
        section.innerHTML = '<div class=\"ai-action-row\">' +
          '<p style=\"font-size:0.82rem;color:var(--green);margin:0;\">回答已足够充分，无需追问</p>' +
          '<button class=\"btn-ai-action btn-ai-model\" id=\"btn-model-answer-' + mode + '\" title=\"AI基于你的简历生成标准答案参考\"><span class=\"ai-action-icon\">✨</span>AI标准答案</button>' +
          '</div>';
        loadModelAnswerHandler(mode, question, section);
      }
    } catch (e) {
      section.innerHTML = '<p style=\"font-size:0.82rem;color:var(--red);\">追问生成失败: ' + e.message + '</p>';
    }
  });

  // ---- 标准答案按钮 ----
  loadModelAnswerHandler(mode, question, section);
}

// 为面试模式添加标准答案按钮
function showInterviewModelAnswerButton() {
  var existing = document.querySelector('.interview-model-answer-section');
  if (existing) existing.remove();

  var actions = document.querySelector('.interview-actions');
  if (!actions) return;

  var section = document.createElement('div');
  section.className = 'interview-model-answer-section';
  section.innerHTML = '<button class=\"btn-ai-action btn-ai-model\" id=\"btn-interview-model-answer\" title=\"AI基于你的简历生成当前题目的标准答案\"><span class=\"ai-action-icon\">✨</span>AI标准答案参考</button>';

  var parent = actions.parentNode;
  parent.insertBefore(section, actions.nextSibling);

  loadModelAnswerHandler('interview', getCurrentInterviewQuestion(), section);
}

function getCurrentInterviewQuestion() {
  var chat = document.getElementById('interview-chat');
  if (!chat) return '';
  var msgs = chat.querySelectorAll('.chat-msg.interviewer');
  if (msgs.length === 0) return '';
  return msgs[msgs.length - 1].textContent || '';
}

// 通用的标准答案生成逻辑
function loadModelAnswerHandler(mode, question, section) {
  var btnId = mode === 'interview' ? 'btn-interview-model-answer' : 'btn-model-answer-' + mode;
  var btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', async function() {
    btn.disabled = true;
    btn.innerHTML = '<span class=\"ai-action-icon\">⏳</span>AI正在生成标准答案...';

    try {
      var jd = state.analysis ? (state.analysis.jd || {}) : {};
      var jdSummary = jd.position
        ? (jd.company || '') + ' ' + jd.position + ' | ' + (jd.requirements || jd.responsibilities || '')
        : (jd.requirements || jd.responsibilities || '');
      var resumeText = state.resumeText || '';

      var result = await fetchRetry('/api/generate-model-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question,
          jdSummary: jdSummary.slice(0, 400),
          resumeText: resumeText.slice(0, 3000)
        })
      }).then(function(r) { return r.json(); });

      if (result.model_answer) {
        var html = '<div class=\"model-answer-card\">';
        html += '<div class=\"model-answer-header\">✨ AI标准答案参考 <button class=\"btn-speak\" data-text=\"' + result.model_answer.replace(/"/g, '&quot;').replace(/\n/g, ' ') + '\" style=\"width:24px;height:24px;font-size:0.7rem;margin-left:0.4rem;vertical-align:middle;\">🔊</button></div>';
        html += '<div class=\"model-answer-body\">' + result.model_answer.replace(/\n/g, '<br>') + '</div>';
        if (result.resume_anchors && result.resume_anchors.length > 0) {
          html += '<div class=\"model-answer-anchors\"><b>📎 引用的简历经历：</b>' +
            result.resume_anchors.map(function(a) { return '<span class=\"anchor-tag\">' + a + '</span>'; }).join('') +
            '</div>';
        }
        if (result.tips) {
          html += '<div class=\"model-answer-tips\">💡 ' + result.tips + '</div>';
        }
        html += '</div>';

        if (mode === 'interview') {
          var chat = document.getElementById('interview-chat');
          if (chat) {
            var div = document.createElement('div');
            div.className = 'chat-msg system';
            div.innerHTML = html;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
          }
        } else {
          section.innerHTML = html;
          section.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        toast('生成失败：未获取到答案');
        btn.disabled = false;
        btn.innerHTML = '<span class=\"ai-action-icon\">✨</span>AI标准答案';
      }
    } catch (e) {
      toast('标准答案生成失败: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<span class=\"ai-action-icon\">✨</span>AI标准答案';
    }
  });
}

// Tab 小红点系统
function showTabDot(tabName) {
  const dot = document.querySelector(`.tab-dot[data-dot-tab="${tabName}"]`);
  if (!dot || dot.classList.contains('show')) return;
  dot.classList.add('show');
}
function hideTabDot(tabName) {
  const dot = document.querySelector(`.tab-dot[data-dot-tab="${tabName}"]`);
  if (dot) dot.classList.remove('show');
}
// 点击 tab 时自动清除该 tab 的小红点
document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('.nav-tab');
  if (tabBtn) {
    const dot = tabBtn.querySelector('.tab-dot.show');
    if (dot) dot.classList.remove('show');
  }
});


// 语义化版本号比较（返回 -1/0/1）
function compareVersions(a, b) {
  const pa = a.replace(/^v/i, '').split('.').map(Number);
  const pb = b.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
// ===== 版本更新检查 (GitHub Releases API) =====
$('#btn-check-update')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('update-status');
  const detailEl = document.getElementById('update-detail');
  if (!statusEl || !detailEl) return;
  statusEl.textContent = '⏳ 查询中...';
  detailEl.classList.add('hidden');

  try {
    let currentVer = window.__ELECTRON_VERSION__ || '1.2.0';
    try {
      if (window.electronAPI?.getVersion) {
        currentVer = await window.electronAPI.getVersion();
      }
    } catch {}
    const resp = await fetch('https://api.github.com/repos/WXK2905821189/InterviewPrep/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'InterviewPrep' }
    });
    if (!resp.ok) {
      if (resp.status === 403) throw new Error('API 频率限制，请稍后再试');
      throw new Error('无法获取更新信息 (HTTP ' + resp.status + ')');
    }
    const release = await resp.json();
    const latestVer = (release.tag_name || '').replace(/^v/i, '');
    const currentClean = currentVer.replace(/^v/i, '');

    if (compareVersions(latestVer, currentClean) <= 0) {
      statusEl.textContent = '✅ 已是最新版';
      detailEl.classList.remove('hidden');
      detailEl.innerHTML = `<p style="color:var(--green);font-size:0.82rem;">当前 v${currentClean} 已是最新版本。</p>
        <p style="font-size:0.78rem;color:var(--muted);">发布标题：${release.name || latestVer} · ${new Date(release.published_at).toLocaleDateString('zh-CN')}</p>`;
    } else {
      statusEl.textContent = `🆕 发现新版本 v${latestVer}`;
      detailEl.classList.remove('hidden');
      const body = (release.body || '').slice(0, 500).replace(/\n/g, '<br>');
      const asset = (release.assets || []).find(a => a.name.endsWith('.zip'));
      const downloadUrl = asset?.browser_download_url || release.html_url;
      const isElectron = window.__IS_ELECTRON__ && window.electronAPI?.installUpdate;

      detailEl.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:0.8rem;">
          <p style="font-weight:600;color:var(--accent);margin:0 0 0.5rem 0;">📦 v${latestVer} 更新内容</p>
          <p style="font-size:0.8rem;color:var(--muted);margin:0 0 0.8rem 0;">${body || '（无详细说明）'}</p>
          ${isElectron
            ? `<button id="btn-install-update" class="btn-primary" style="font-size:0.82rem;" data-url="${downloadUrl}">⬇️ 一键安装更新</button>`
            : `<a href="${release.html_url}" target="_blank" class="btn-primary" style="font-size:0.82rem;text-decoration:none;display:inline-block;">📥 前往下载</a>`}
        </div>`;

      setTimeout(() => {
        const installBtn = document.getElementById('btn-install-update');
        if (!installBtn) return;
        installBtn.addEventListener('click', async () => {
          installBtn.disabled = true;
          installBtn.textContent = '⏳ 下载中...';
          statusEl.textContent = '⏳ 正在下载更新...';
          try {
            const result = await window.electronAPI.installUpdate(installBtn.dataset.url);
            if (result.success) {
              statusEl.textContent = '✅ 更新已就绪';
              detailEl.innerHTML = `<p style="color:var(--green);font-size:0.82rem;">${result.message}</p>
                <button id="btn-restart-update" class="btn-primary" style="font-size:0.82rem;margin-top:0.5rem;">🔄 立即重启</button>`;
              setTimeout(() => {
                const restartBtn = document.getElementById('btn-restart-update');
                if (restartBtn) restartBtn.addEventListener('click', () => window.electronAPI.restartApp());
              }, 100);
            } else {
              statusEl.textContent = '❌ 更新失败';
              detailEl.innerHTML = `<p style="color:var(--red);font-size:0.82rem;">${result.message}</p>`;
            }
          } catch (e) {
            statusEl.textContent = '❌ 安装失败';
            detailEl.innerHTML = `<p style="color:var(--red);font-size:0.82rem;">${e.message}</p>`;
          }
        });
      }, 100);
    }
  } catch (e) {
    statusEl.textContent = '❌ 检查失败';
    detailEl.classList.remove('hidden');
    detailEl.innerHTML = `<p style="color:var(--red);font-size:0.82rem;">${e.message}</p>`;
  }
});

// 练习详情弹窗关闭
const practiceDetailModal = document.getElementById('practice-detail-modal');
if (practiceDetailModal) {
  document.getElementById('btn-close-practice-detail')?.addEventListener('click', () => {
    practiceDetailModal.classList.add('hidden');
  });
  practiceDetailModal.addEventListener('click', (e) => {
    if (e.target === practiceDetailModal) practiceDetailModal.classList.add('hidden');
  });
}

// 自动检查（静默，启动时）
(async function autoCheckUpdate() {
  try {
    const resp = await fetch('https://api.github.com/repos/WXK2905821189/InterviewPrep/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'InterviewPrep' }
    });
    if (!resp.ok) return;
    const release = await resp.json();
    const latestVer = (release.tag_name || '').replace(/^v/i, '');
    let currentVerRaw = window.__ELECTRON_VERSION__ || '1.2.0';
    try {
      if (window.electronAPI?.getVersion) {
        currentVerRaw = await window.electronAPI.getVersion();
      }
    } catch {}
    const currentVer = currentVerRaw.replace(/^v/i, '');
    if (compareVersions(latestVer, currentVer) > 0) {
      // 在右上角设置按钮旁显示小红点
      const btn = document.getElementById('btn-open-settings');
      if (btn) {
        const badge = document.createElement('span');
        badge.className = 'update-badge';
        badge.title = `新版本 v${latestVer} 可用`;
        badge.textContent = '🆕';
        badge.style.cssText = 'font-size:0.7rem;margin-left:2px;animation:pulse 2s infinite;';
        btn.parentElement.style.position = 'relative';
        btn.appendChild(badge);
      }
    }
  } catch {} // 静默失败
})();

// ===== 简历文件上传 =====
$('#btn-resume-file').addEventListener('click', () => $('#resume-file-input').click());
$('#resume-file-input').addEventListener('change', async () => {
  const file = $('#resume-file-input').files[0];
  if (!file) return;
  $('#resume-file-name').textContent = `⏳ 解析中: ${file.name}`;
  $('#btn-resume-file').disabled = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetchRetry('/api/resume-upload', { method: 'POST', body: form });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const data = await resp.json();
    $('#resume-input').value = data.text;
    state.resumeFileName = data.fileName || '';
    state.resumeSourceType = data.sourceType || '';
    $('#resume-file-name').textContent = `✅ ${data.fileName} (${data.sourceType})`;
    const hintEl = $('#resume-hint');
    hintEl.textContent = `已解析 ${data.sourceType.toUpperCase()} 文件，可手动编辑后再分析`;
    if (data.warnings?.length) {
      hintEl.innerHTML += `<br><span style="color:#e5a020;font-size:0.8rem;">⚠️ ${data.warnings.join('；')}</span>`;
    }
    toast(`✅ 已解析: ${data.fileName}`);
  } catch(e) {
    toast('解析失败: ' + e.message);
    $('#resume-file-name').textContent = '或直接粘贴文本';
  } finally {
    $('#btn-resume-file').disabled = false;
  }
});

// ===== JD 链接扒取（opencli browser bridge）=====
$('#btn-jd-fetch').addEventListener('click', async () => {
  const url = $('#jd-url-input').value.trim();
  if (!url) return toast('请先粘贴岗位链接URL');
  if (!/^https?:\/\//.test(url)) return toast('请输入完整URL (http/https)');
  const btn = $('#btn-jd-fetch');
  btn.disabled = true; btn.textContent = '⏳ 扒取中...';
  try {
    const resp = await fetchRetry('/api/jd-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    $('#jd-input').value = data.text;
    toast(`✅ 已提取 ${data.charCount} 字${data.truncated ? ' (内容较长已截断)' : ''}`);
  } catch(e) {
    toast('扒取失败: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🔗 扒取';
  }
});

// ===== Navigation =====
function switchTab(tabName) {
  $$('.nav-tab').forEach(t => t.classList.remove('active'));
  $$('.tab-content').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (tab) tab.classList.add('active');
  const content = document.getElementById(`tab-${tabName}`);
  if (content) content.classList.add('active');

  // Record tab activation for lazy loading
  if (!content?.dataset.loaded) {
    content?.setAttribute('data-loaded', '1');
    if (tabName === 'bank') loadBank();
    if (tabName === 'company') { renderCompanyResearchHistory(); }
  }

  if (tabName === 'dashboard') { loadDashboard(); loadReadinessScore(); }
  if (tabName === 'interview') renderInterviewTabHistory();
  if (tabName === 'practice') {
    if (state.analysis) renderPracticeQuestions();
    renderPracticeHistory();
  }
  if (tabName === 'resume' && state.analysis) {
    $('#resume-opt-empty').classList.remove('hidden');
    checkAndAutoScore();
  }
  if (tabName === 'mianjing') autoFillMianjingFields();
  if (tabName === 'drill') {
    if (state.analysis) { renderDrillQuestions(); renderDrillMode(); }
    loadDrillStats();
  }
  if (tabName === 'wrongbook') { loadWrongBook(); }
  if (tabName === 'group') {
    // 检查是否有分析结果，有则启用开始按钮
    var btnStart = document.getElementById('btn-group-start');
    var hint = document.getElementById('group-start-hint');
    if (state.analysis && state.analysis.jdParsed) {
      if (btnStart) btnStart.disabled = false;
      if (hint) hint.textContent = '已检测到JD分析结果，可以开始群面模拟';
    } else {
      if (btnStart) btnStart.disabled = true;
      if (hint) hint.textContent = '请先在"分析&押题"中完成JD分析';
    }
  }
}

$$('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ============================================================
// API Calls
// ============================================================
async function apiAnalyze(jdText, resumeText, useMianjing, quickMode, manualUrls = [], resumeFileName = '', resumeSourceType = '') {
  setStatus('🔄 分析中...');

  // 显示进度条
  const pb = $('#progress-bar-wrap');
  const ps = $('#progress-steps');
  const pd = $('#progress-detail');
  pb.classList.remove('hidden');
  ps.innerHTML = '';
  pd.textContent = '正在启动分析...';

  const STEPS = quickMode
    ? ['jd_parse','resume_parse','gap_analysis','question_gen','done']
    : ['jd_parse','resume_parse','gap_analysis','question_gen','done'];
  const labels = { jd_parse:'解析JD', resume_parse:'解析简历', gap_analysis:'差距分析', question_gen:'生成押题', done:'完成' };

  // 渲染步骤条
  ps.innerHTML = STEPS.map(s => `<span class="pstep" id="pstep-${s}">${labels[s]}</span>`).join('');
  if (quickMode) {
    pd.textContent = '⚡ 快速模式：跳过面经采集，3类核心题型并行生成...';
  } else {
    pd.textContent = '正在启动分析...';
  }

  // — 计时 &
  const startTime = Date.now();
  let completedSteps = 0; let okSteps = new Set();
  const totalSteps = STEPS.length;
  const etaEl = document.createElement('span');
  etaEl.id = 'progress-eta';
  etaEl.style.cssText = 'font-size:0.78rem;color:var(--muted);display:block;margin-top:0.3rem;';
  pd.after(etaEl);

  function updateEta() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const el = document.getElementById('progress-eta');
    if (!el) return;
    if (completedSteps === 0) {
      el.textContent = `⏱ 已等待 ${elapsed}s...`;
    } else if (completedSteps >= totalSteps) {
      el.textContent = `✅ 完成，总耗时 ${elapsed}s`;
    } else {
      const avgPerStep = elapsed / Math.max(1, completedSteps);
      const remaining = Math.ceil(avgPerStep * (totalSteps - completedSteps));
      el.textContent = `⏱ 已过 ${elapsed}s · 预计还需 ${remaining}s (${completedSteps}/${totalSteps} 步)`;
    }
  }
  const etaTimer = setInterval(updateEta, 2000);

  let result = null;

  try {
    const resp = await fetch(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText, resumeText, useMianjing, quickMode, manualUrls, resumeFileName, resumeSourceType })
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 解析SSE消息
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { throw new Error(data.error); }
            if (data._done) { result = data; continue; }

            // 更新步骤状态
            if (data.step) {
              const idx = STEPS.indexOf(data.step);
              completedSteps = Math.max(completedSteps, idx);
              for (let i = 0; i < idx; i++) {
                const el = document.getElementById(`pstep-${STEPS[i]}`);
                if (el) el.classList.add('done');
              }
              const cur = document.getElementById(`pstep-${data.step}`);
              if (cur) {
                if (data.status === 'warn') {
                  cur.classList.add('warn');
                  cur.classList.remove('active');
                } else if (data.status === 'ok') {
                  cur.classList.add('done');
                  cur.classList.remove('active');
                } else {
                  cur.classList.add('active');
                }
              }
              if (data.detail) pd.textContent = data.detail;
            }
            if (data.status === 'ok') {
              okSteps.add(data.step);
              completedSteps = okSteps.size;
            }
          } catch(e) { /* skip malformed events */ }
        }
      }
    }
  } catch(e) {
    clearInterval(etaTimer);
    pb.classList.add('hidden');
    throw e;
  }

  if (!result) { clearInterval(etaTimer); throw new Error('未收到分析结果'); }

  clearInterval(etaTimer);
  updateEta();
  // 标记全部完成
  STEPS.forEach(s => {
    const el = document.getElementById(`pstep-${s}`);
    if (el) el.classList.add('done');
  });
  pd.textContent = '分析完成！查看押题清单 →';
  setTimeout(() => pb.classList.add('hidden'), 1500);

  return {
    sessionId: result.sessionId,
    jd: result.jd, resume: result.resume, gap: result.gap,
    questions: result.questions, insights: result.insights,
    mianjing: result.mianjing, kb_supplement: result.kb_supplement
  };
}

async function apiInterviewStart() {
  setStatus('🔄 面试启动中...');
  const resp = await fetchRetry(`${API}/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiInterviewAnswer(answer) {
  const resp = await fetchRetry(`${API}/interview/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId, answer })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiInterviewSkip() {
  const resp = await fetchRetry(`${API}/interview/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiInterviewEvaluate() {
  setStatus('🔄 生成报告...');
  const resp = await fetchRetry(`${API}/interview/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiEvaluateSingle(question, answer, jdSummary, resumeText) {
  const resp = await fetchRetry(`${API}/evaluate-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, answer, jdSummary: jdSummary || '', resumeText: resumeText || '' })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiOptimizeResume() {
  setStatus('🔄 优化中...');
  // 使用原始简历文本（state.resumeText），而非分析结果
  const rawResume = state.resumeText || $('#resume-input').value.trim() || '';
  const resp = await fetchRetry(`${API}/optimize-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      resumeText: rawResume
    })
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

async function apiSavePhrase(data) {
  const resp = await fetchRetry(`${API}/phrases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return resp.json();
}

async function apiLoadPhrases() {
  const resp = await fetchRetry(`${API}/phrases`);
  return resp.json();
}

async function apiDeletePhrase(id) {
  await fetchRetry(`${API}/phrases/${id}`, { method: 'DELETE' });
}

// ============================================================
// Tab 1: 分析 & 押题
// ============================================================
$('#btn-analyze').addEventListener('click', async () => {
  const jdText = $('#jd-input').value.trim();
  const resumeText = $('#resume-input').value.trim();
  const quickMode = $('#use-quick-mode')?.checked || false;

  if (!jdText || !resumeText) return toast('请同时填写JD和简历内容');

  const btn = $('#btn-analyze');
  btn.disabled = true;
  const modeLabel = quickMode ? '⚡快速' : '完整';
  btn.textContent = `${modeLabel}分析中...`;

  try {
    const result = await apiAnalyze(jdText, resumeText, false, quickMode, [], state.resumeFileName, state.resumeSourceType);
    state.sessionId = result.sessionId;
    state.analysis = result;
    state.jdText = jdText;
    state.resumeText = resumeText;
    // resume metadata already in state from upload (or '' from text paste)
    state.resumeFileName = state.resumeFileName || '';
    state.resumeSourceType = state.resumeSourceType || '';
    setStatus('✅ 分析完成，渲染结果...');
    toast('分析完成！查看押题清单');
    // 延迟渲染，让浏览器先消化最后一条 SSE 事件 + 更新状态文字
    setTimeout(() => {
      renderAnalysisResult(result);
      refreshSessionList();
      $('#nav-session-label').textContent = result.jd?.position || result.jd?.company || '当前岗位';
      $('#phrase-banner').style.display = 'none';
    }, 80);
  } catch (e) { 
    toast('❌ 分析失败: ' + e.message); 
    $('#analysis-result').innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--red);">' +
      '<p style="font-size:1.1rem;font-weight:600;margin-bottom:0.5rem;">❌ 分析请求失败</p>' +
      '<p style="color:var(--muted);margin-bottom:1rem;">' + e.message + '</p>' +
      '<p style="font-size:0.82rem;color:var(--muted);">💡 请检查：<br>1) AI 供应商是否已在⚙️设置中连接<br>2) 网络是否正常<br>3) API Key 是否有效</p>' +
      '</div>';
  } finally {
    btn.disabled = false; btn.textContent = '重新分析 →';
  }
});

// ---- JD 文本格式化 (显示用) ----
function formatJdText(text) {
  if (!text) return '';
  // 兜底：双反斜杠换行 → 真正换行
  text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const lines = text.split('\n');
  const parts = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      parts.push('<div style="height:0.4rem;"></div>');
      continue;
    }
    // 检测标题行: 【...】, ##..., 短行以】或：结尾, 2-8个纯中文标题
    const isHeader = /^【[^】]+】/.test(trimmed) ||
      /^##\s/.test(trimmed) ||
      (/[】：]$/.test(trimmed) && trimmed.length <= 30) ||
      /^[\u4e00-\u9fff]{2,8}$/.test(trimmed);
    // 检测列表项
    const isListItem = /^[-•·]/.test(trimmed) || /^\d+[.、)）]/.test(trimmed);

    if (isHeader) {
      parts.push('<span class="jd-section-header">' + trimmed + '</span>');
    } else if (isListItem) {
      parts.push('<span class="jd-list-item">' + trimmed + '</span>');
    } else {
      parts.push('<span class="jd-text-line">' + trimmed + '</span>');
    }
  }
  return parts.join('');
}

// ---- JD 文本框内快速排版 (本地) ----
function reformatJdInTextarea() {
  const raw = $('#jd-input').value.trim();
  if (!raw) return toast('请先粘贴JD文本');
  $('#btn-jd-format').disabled = true; $('#btn-jd-format').textContent = '⏳';
  
  fetchRetry('/api/jd-format', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: raw })
  }).then(r => r.json()).then(data => {
    if (data.text) { $('#jd-input').value = data.text; toast(data.changed ? '✅ 已排版' : '✓ 格式已良好'); }
  }).catch(e => toast('排版失败: ' + e.message))
    .finally(() => { $('#btn-jd-format').disabled = false; $('#btn-jd-format').textContent = '✨ 排版'; });
}

function renderAnalysisResult(data) {
  $('#analysis-result').classList.remove('hidden');
  const jd = data.jd || {};
  const gap = data.gap || {};

  // ---- 原始 JD / 简历卡片（可折叠） ----
  const rawJdText = state.jdText || '';
  const rawResumeText = state.resumeText || '';
  const isPdfResume = state.resumeSourceType === 'pdf';
  if (rawJdText || rawResumeText) {
    let jdHtml = '';
    if (rawJdText) {
      jdHtml += `
        <div class="raw-jd-section">
          <div class="raw-jd-title" onclick="this.parentElement.classList.toggle('collapsed')">
            📋 岗位JD原文 <span class="raw-jd-toggle">▼</span>
          </div>
          <div class="raw-jd-body">${formatJdText(rawJdText)}</div>
        </div>`;
    }
    if (rawResumeText) {
      const pdfBadge = isPdfResume ? ' <span class="pdf-badge" style="font-size:0.75rem;background:#e74c3c;color:#fff;padding:1px 6px;border-radius:3px;margin-left:4px;">PDF</span>' : '';
      const resumeHtml = isPdfResume
        ? `<div class="raw-jd-body">${formatJdText(rawResumeText)}</div>`
        : `<div class="raw-jd-body"><pre>${rawResumeText}</pre></div>`;
      jdHtml += `
        <div class="raw-jd-section">
          <div class="raw-jd-title" onclick="this.parentElement.classList.toggle('collapsed')">
            📄 简历原文${pdfBadge} <span class="raw-jd-toggle">▼</span>
          </div>
          ${resumeHtml}
        </div>`;
    }
    $('#result-meta').innerHTML = jdHtml + `
      <span style="font-size:0.85rem;">
        岗位: <strong>${jd.position || '未知'}</strong> ·
        公司: <strong>${jd.company || '未知'}</strong> ·
        匹配度: <strong>${gap.match_score || '--'}分</strong>
      </span>
    `;
  } else {
    $('#result-meta').innerHTML = `
      岗位: <strong>${jd.position || '未知'}</strong> ·
      公司: <strong>${jd.company || '未知'}</strong> ·
      匹配度: <strong>${gap.match_score || '--'}分</strong>
    `;
  }

  if (gap.match_points || gap.advantage_points || gap.weak_points) {
    const gc = $('#gap-card');
    gc.style.display = 'block';
    $('#gap-content').innerHTML = `
      <div class="gap-row">
        <div class="gap-col">
          <h4>匹配点</h4>
          ${(gap.match_points || []).map(p => `<span class="tag">${p}</span>`).join('')}
        </div>
        <div class="gap-col">
          <h4>优势点</h4>
          ${(gap.advantage_points || []).map(p => `<span class="tag advantage">${p}</span>`).join('')}
        </div>
        <div class="gap-col">
          <h4>薄弱点</h4>
          ${(gap.weak_points || []).map(p => `<span class="tag weak">${p}</span>`).join('')}
        </div>
      </div>
      ${gap.interview_strategy ? `<p style="font-size:0.85rem;color:var(--muted);">💡 ${gap.interview_strategy}</p>` : ''}
    `;
  }

  const questions = data.questions || [];
  const kbSupp = data.kb_supplement || [];
  const allQ = [...questions];
  for (const kq of kbSupp) {
    if (!allQ.find(q => q.question === kq.question)) {
      allQ.push({ ...kq, type: kq.type || '通用', source: '知识库' });
    }
  }

  const types = [...new Set(allQ.map(q => q.type || '其他'))];
  $('#q-filters').innerHTML = `
    <span class="q-filter active" data-type="all">全部(${allQ.length})</span>
    ${types.map(t => `<span class="q-filter" data-type="${t}">${t}</span>`).join('')}
  `;
  renderQuestionList(allQ, 'all');

  $$('#q-filters .q-filter').forEach(f => {
    f.addEventListener('click', () => {
      $$('#q-filters .q-filter').forEach(x => x.classList.remove('active'));
      f.classList.add('active');
      renderQuestionList(allQ, f.dataset.type);
    });
  });

  // 延迟滚动，避免和渲染竞争
  setTimeout(() => {
    $('#analysis-result').scrollIntoView({ behavior: 'smooth' });
  }, 120);

  // 下一步引导卡片（先移除旧的，避免重复）
  const oldCard = document.getElementById('next-steps-card');
  if (oldCard) oldCard.remove();
  const actions = $('#analysis-result');
  const actionCard = document.createElement('div');
  actionCard.id = 'next-steps-card';
  actionCard.className = 'card';
  actionCard.style.cssText = 'text-align:center;margin-top:1.5rem;border:2px dashed var(--accent2);background:linear-gradient(135deg, rgba(6,182,212,0.05), rgba(79,70,229,0.05));';
  actionCard.innerHTML = 
    '<h3 style="margin-bottom:0.8rem;">🎯 接下来做什么？</h3>' +
    '<div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap;">' +
    '<button onclick="switchTab(\'practice\')" class="btn-primary" style="font-size:0.82rem;">💪 开始单题练习</button>' +
    '<button onclick="switchTab(\'mianjing\')" class="btn-outline" style="font-size:0.82rem;">📡 采集面经真题</button>' +
    '<button onclick="switchTab(\'interview\')" class="btn-outline" style="font-size:0.82rem;">🎤 全真模拟面试</button>' +
    '</div>';
  actions.appendChild(actionCard);
}

const PAGE_SIZE = 6; // 默认每页显示条数

function renderQuestionList(questions, filterType) {
  const filtered = filterType === 'all'
    ? questions : questions.filter(q => (q.type || '').includes(filterType));

  const wrapper = document.getElementById('questions-list');
  wrapper.innerHTML = '';

  const pageSize = PAGE_SIZE;
  const total = filtered.length;
  const pages = Math.ceil(total / pageSize);
  let currentPage = 1;

  const container = document.createElement('div');
  container.id = 'questions-grid';
  wrapper.appendChild(container);

  const paginationEl = document.createElement('div');
  paginationEl.className = 'q-pagination';
  wrapper.appendChild(paginationEl);

  function renderPage(page) {
    currentPage = page;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    // 渲染题目卡片
    container.innerHTML = pageItems.map((q, i) => {
      const realIdx = start + i + 1;
      return `
    <div class="q-card" data-idx="${start + i}" data-question="${encodeURIComponent(q.question)}">
      <span class="q-card-num">${realIdx}</span>
      <div class="q-card-body">
        <div class="q-card-header">
          <span class="q-type ${getTypeClass(q.type)}">${q.type || '其他'}</span>
          ${q.frequency_in_mianjing ? `<span class="q-freq-badge">🔥 ${q.frequency_in_mianjing}次</span>` : ''}
          ${q.source === '知识库' ? '<span class="q-kb-badge">📚 知识库</span>' : ''}
        </div>
        <div class="q-card-q">${q.question}</div>
        <div class="q-card-intent">🎯 ${q.examiner_intent || '考察综合能力'}</div>
        <button class="btn-bookmark" data-q="${encodeURIComponent(q.question)}" data-type="${q.type||''}">⭐ 收藏</button>
      </div>
    </div>`;
    }).join('');

    // 收藏按钮
    $$('.q-card .btn-bookmark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const question = decodeURIComponent(btn.dataset.q);
        const type = btn.dataset.type;
        btn.textContent = '⏳'; btn.disabled = true;
        try {
          const analysis = state.analysis || {};
          const resp = await fetchRetry('/api/bank/bookmark', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, type, company: analysis.jd?.company || '', position: analysis.jd?.position || '', sessionId: state.sessionId })
          });
          if (!resp.ok) throw new Error((await resp.json()).error);
          btn.textContent = '✅ 已收藏'; toast('已收藏到真题库');
        } catch(e) {
          btn.textContent = '⭐ 收藏'; btn.disabled = false;
          toast('收藏失败: ' + e.message);
        }
      });
    });
    // 点击卡片跳转练习
    $$('.q-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const question = decodeURIComponent(card.dataset.question);
        switchTab('practice');
        // Ensure practice area is visible before selecting question
        setTimeout(() => {
          $('#practice-area').classList.remove('hidden');
          $('#practice-empty').classList.add('hidden');
          selectPracticeQuestion(question);
        }, 400);
      });
    });

    // 分页：直接用 data-page 属性渲染，用事件委托处理点击
    if (pages <= 1) { paginationEl.innerHTML = ''; paginationEl.onclick = null; return; }
    let html = `<span class="q-page-info">${total} 道题 · ${page}/${pages} 页</span>`;
    if (page > 1) html += `<button class="q-page-btn" data-page="${page - 1}">◀ 上一页</button>`;
    if (page < pages) html += `<button class="q-page-btn" data-page="${page + 1}">下一页 ▶</button>`;
    paginationEl.innerHTML = html;
    // 事件委托：点击分页容器内的按钮统一处理（避免 innerHTML 替换导致监听器丢失）
    paginationEl.onclick = (e) => {
      const btn = e.target.closest('.q-page-btn');
      if (!btn) return;
      const targetPage = parseInt(btn.dataset.page);
      if (!isNaN(targetPage)) renderPage(targetPage);
    };
  }

  renderPage(1);
}

function getTypeClass(type) {
  if (!type) return '';
  if (type.includes('行为')) return 'behavioral';
  if (type.includes('专业') || type.includes('能力')) return 'professional';
  if (type.includes('项目') || type.includes('深挖')) return 'project';
  if (type.includes('压力') || type.includes('陷阱')) return 'pressure';
  return '';
}

// ============================================================
// Tab 2: 单题练习 + 话术库
// ============================================================
function renderPracticeQuestions() {
  if (!state.analysis) return;
  const qs = state.analysis.questions || [];
  const kb = state.analysis.kb_supplement || [];
  const mj = state.analysis.mianjing || [];
  const custom = (state._customQuestions || []);
  
  // Build combined list with source labels
  const allQs = [];
  qs.forEach(q => allQs.push({ ...q, _source: '' }));
  kb.forEach(q => allQs.push({ ...q, _source: '📚知识库' }));
  mj.forEach(q => allQs.push({ ...q, _source: '📡面经' }));
  custom.forEach(q => allQs.push({ ...q, _source: '✏️自定义' }));
  
  if (allQs.length === 0) return;
  
  // Render two sections: 押题 + 面经采集(分开标题)
  const qSection = qs.length + kb.length;
  const mjSection = mj.length;
  
  // 性能优化：一次性 innerHTML 赋值减少 DOM 重排，然后批量绑定事件
  if (mjSection > 0) {
    // Two-section layout
    const renderList = (items, startIdx) => items.map((q, i) => `
      <li data-idx="${startIdx + i}" data-question="${encodeURIComponent(q.question||'')}" style="${q._source ? 'background:var(--tag-bg);border-radius:4px;margin:2px 0;' : ''}">
        <span class="q-num">${startIdx + i + 1}</span>
        ${q._source ? `<span style="font-size:0.65rem;color:var(--accent);margin-right:4px;">${q._source}</span>` : ''}
        ${q.question || ''}
      </li>
    `).join('');
    
    const practiceItems = [...qs, ...kb];
    $('#practice-question-list').innerHTML = 
      '<div style="margin-bottom:0.5rem;font-weight:600;font-size:0.85rem;">📋 押题清单 (' + (qSection) + '题)</div>' +
      renderList(practiceItems, 0) +
      '<div style="margin:0.8rem 0 0.5rem;font-weight:600;font-size:0.85rem;border-top:1px dashed var(--rule);padding-top:0.5rem;">📡 面经采集 (' + mjSection + '题)</div>' +
      renderList(mj, qSection);
  } else {
    // Single section
    $('#practice-question-list').innerHTML = allQs.map((q, i) => `
      <li data-idx="${i}" data-question="${encodeURIComponent(q.question||'')}">
        <span class="q-num">${i + 1}</span>
        ${q._source ? `<span style="font-size:0.65rem;color:var(--accent);margin-right:4px;">${q._source}</span>` : ''}
        ${q.question || ''}
      </li>
    `).join('');
  }
  
  $$('#practice-question-list li').forEach(li => {
    li.addEventListener('click', () => selectPracticeQuestion(decodeURIComponent(li.dataset.question)));
  });
  const countEl = document.getElementById('practice-q-count');
  if (countEl) countEl.textContent = allQs.length;
  $('#practice-empty').classList.add('hidden');
  $('#practice-area').classList.remove('hidden');
}

function selectPracticeQuestion(question) {
  if (!state.analysis) state.analysis = { questions:[], mianjing:[], kb_supplement:[], jd:{}, resume:{} };
  const qs = state.analysis.questions || [];
  const kb = state.analysis.kb_supplement || [];
  const mj = state.analysis.mianjing || [];
  
  // Ensure renderPracticeQuestions has completed
  if (!document.getElementById('practice-area')?.classList.contains('hidden') === false) {
    renderPracticeQuestions();
  }
  
  const allQs = [...qs, ...kb, ...mj];
  let found = allQs.find(q => q && q.question === question);
  
  // Fallback: partial match (question text might differ slightly)
  if (!found && allQs.length > 0) {
    found = allQs.find(q => q && q.question && q.question.includes(question) || (question && question.includes(q.question)));
  }
  
  if (!found) {
    console.warn('[练习] 未找到题目:', question?.slice(0,50));
    $('#practice-q-text').textContent = question || '';
    $('#practice-q-meta').innerHTML = '<span class="q-type">题目</span>';
  } else {
    $('#practice-q-meta').innerHTML = `
      <span class="q-type ${getTypeClass(found.type)}">${found.type || ''}</span>
      <span style="font-size:0.78rem;color:var(--muted);">${found._source || ''} 🎯 ${found.examiner_intent || ''}</span>
    `;
    $('#practice-q-text').textContent = found.question || question;
  }
  
  $('#practice-answer').value = '';
  $('#practice-feedback').classList.add('hidden');
  $('#btn-save-phrase').classList.add('hidden');
  state._practiceQuestion = question;
  state._lastFeedback = null;
  $('#practice-empty').classList.add('hidden');
  $('#practice-area').classList.remove('hidden');
  
  // Highlight the correct item in the list
  $$('#practice-question-list li').forEach(li => {
    const liQ = decodeURIComponent(li.dataset.question || '');
    li.classList.toggle('active', liQ === question || liQ.includes(question) || (question && question.includes(liQ)));
  });
  
  setTimeout(() => { 
    const card = document.getElementById('practice-question-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ta = document.getElementById('practice-answer'); 
    if (ta) ta.focus(); 
  }, 200);
}

// 回答框自动扩高
(function() {
  const ta = document.getElementById('practice-answer');
  if (ta) {
    ta.addEventListener('input', debounce(() => {
      ta.style.height = 'auto';
      ta.style.height = Math.max(100, ta.scrollHeight) + 'px';
    }));
  }
})();

$('#btn-practice-submit').addEventListener('click', async () => {
  const answer = $('#practice-answer').value.trim();
  const question = state._practiceQuestion;
  if (!question) return toast('请先选择题面');
  if (!answer || answer.length < 5) return toast('请写下你的回答（至少5个字）');

  const btn = $('#btn-practice-submit');
  btn.disabled = true; btn.textContent = '评估中...';
  setStatus('🔄 评估中...');

  try {
    // 构建 JD 摘要 + 简历上下文
    const jd = state.analysis?.jd || {};
    const jdSummary = jd.position
      ? `${jd.company || ''} ${jd.position} | ${jd.requirements || jd.responsibilities || ''}`.slice(0, 400)
      : (jd.requirements || jd.responsibilities || '');
    const resumeText = state.resumeText || '';
    const result = await apiEvaluateSingle(question, answer, jdSummary, resumeText.slice(0, 3000));
    state._lastFeedback = result;
    renderSingleFeedback(result);
    // 自动保存练习记录到服务端（题目+回答+评估+改进版+关键改进点）
    autoSavePracticeRecord(question, answer, result);
    if ((result.overall_score || 0) >= 85) {
      $('#btn-save-phrase').classList.remove('hidden');
    }
    // 小红点标记
    showTabDot('practice');
    setStatus('✅ 评估完成');
    // 追问按钮
    showFollowUpButton('practice', question, answer, result);
  } catch (e) {
    toast('评估失败: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '重新提交';
  }
});

function renderSingleFeedback(data) {
  const scores = data.scores || {};
  const lines = data.line_by_line || [];
  $('#practice-feedback').classList.remove('hidden');
  $('#practice-feedback').innerHTML = `
    <div class="card feedback-card">
      <h3>评估结果 — 综合 ${data.overall_score || '--'}分</h3>
      <div class="feedback-scores">
        ${['star_completeness','quantification','position_match','structure','highlight'].map(k => `
          <div class="feedback-score">
            <div class="num">${scores[k] || '--'}</div>
            <div class="label">${{star_completeness:'STAR完整性',quantification:'量化程度',position_match:'岗位匹配',structure:'表达结构',highlight:'亮点突出'}[k]}</div>
          </div>
        `).join('')}
      </div>
      <div class="feedback-lines">
        ${lines.map(l => `
          <div class="feedback-line ${l.is_good ? 'good' : 'bad'}">
            ${l.is_good ? '✅' : '⚠️'} "${l.quote}" — ${l.comment}
          </div>
        `).join('')}
      </div>
      ${data.improved_version ? `
      <div class="feedback-improved">
        <strong>改进版参考：</strong><br>${data.improved_version}
      </div>` : ''}
      ${data.key_takeaways ? `
      <div style="font-size:0.82rem;color:var(--muted);">
        <strong>关键改进点：</strong>${data.key_takeaways.join('；')}
      </div>` : ''}
    </div>
  `;
  $('#practice-feedback').scrollIntoView({ behavior: 'smooth' });
}

// 话术库保存
$('#btn-save-phrase').addEventListener('click', async () => {
  if (!state._lastFeedback) return;
  const fb = state._lastFeedback;
  try {
    await apiSavePhrase({
      question: state._practiceQuestion,
      answer: $('#practice-answer').value.trim(),
      improvedVersion: fb.improved_version || fb.raw || '',
      score: fb.overall_score || 0,
      tags: ['练习']
    });
    toast('✅ 已存入话术库');
    $('#btn-save-phrase').textContent = '✅ 已保存';
    // 自动打开话术库面板
    const pp = document.getElementById('phrase-panel');
    if (pp) { pp.open = true; pp.classList.remove('hidden'); refreshPhraseList(); }
    setTimeout(() => { $('#btn-save-phrase').classList.add('hidden'); }, 2000);
  } catch (e) { toast('保存失败: ' + e.message); }
});

// 话术库面板（使用 <details> 原生折叠，自动加载）
(function() {
  const panel = document.getElementById('phrase-panel');
  if (panel) {
    panel.addEventListener('toggle', () => {
      if (panel.open) refreshPhraseList();
    });
  }
})();
$('#phrase-score-filter')?.addEventListener('change', () => refreshPhraseList());

async function refreshPhraseList() {
  try {
    const minScore = parseInt($('#phrase-score-filter')?.value || '0') || 0;
    const data = await apiLoadPhrases();
    let phrases = data.phrases;
    if (minScore > 0) phrases = phrases.filter(p => (p.score || 0) >= minScore);
    if (phrases.length === 0) {
      $('#phrase-list').innerHTML = '<p style="color:var(--muted);">' + (minScore > 0 ? '没有 ≥' + minScore + '分 的话术' : '话术库为空。练习中得分85+的回答可手动存入。') + '</p>';
      return;
    }
    $('#phrase-list').innerHTML = phrases.map(p => `
      <div class="phrase-item">
        <div class="phrase-header">
          <span class="phrase-score">${p.score}分</span>
          <span class="phrase-date">${new Date(p.createdAt).toLocaleDateString('zh-CN')}</span>
          <button class="phrase-del" data-id="${p.id}" title="删除">✕</button>
        </div>
        <div class="phrase-q">Q: ${p.question}</div>
        <details><summary>查看回答</summary><div class="phrase-a">${p.answer}</div></details>
        ${p.improvedVersion ? `<details><summary>改进版</summary><div class="phrase-a improved">${p.improvedVersion}</div></details>` : ''}
      </div>
    `).join('');
    $$('.phrase-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await apiDeletePhrase(btn.dataset.id);
        await refreshPhraseList();
      });
    });
  } catch (e) { /* ignore */ }
}

// ============================================================
// Tab 3: 全真模拟面试
// ============================================================
$('#btn-interview-start').addEventListener('click', async () => {
  if (!state.sessionId) {
    toast('⚠️ 请先在「分析 & 押题」完成JD分析，或在「单题练习」中逐题练习');
    return;
  }
  const btn = $('#btn-interview-start');
  btn.disabled = true; btn.textContent = '启动中...';
  try {
    const result = await apiInterviewStart();
    state.interviewActive = true;
    $('#interview-empty').classList.add('hidden');
    $('#interview-area').classList.remove('hidden');
    $('#interview-report').classList.add('hidden');
    $('#interview-chat').innerHTML = '';
    addChatMsg('interviewer', result.message, result.stage);
    setStatus('🎤 面试中');
    setTimeout(function() { showInterviewModelAnswerButton(); }, 300);
    // 显示标准答案按钮
    showInterviewModelAnswerButton();
  } catch (e) { toast('启动失败: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '开始模拟面试'; }
});

function addChatMsg(role, content, stage) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  if (stage) div.innerHTML = `<div class="chat-stage">${stage}</div>${content}`;
  else div.textContent = content;
  // Add speak button for interviewer messages
  if (role === 'interviewer') {
    var speakBtn = document.createElement('button');
    speakBtn.className = 'btn-speak';
    speakBtn.textContent = '🔊';
    speakBtn.dataset.text = content;
    speakBtn.style.cssText = 'margin-left:0.4rem;width:28px;height:28px;font-size:0.8rem;flex-shrink:0;';
    div.style.display = 'flex';
    div.style.alignItems = 'flex-start';
    div.style.gap = '0.3rem';
    var textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    if (stage) textSpan.innerHTML = `<div class="chat-stage">${stage}</div>${content}`;
    else textSpan.textContent = content;
    div.textContent = '';
    div.appendChild(textSpan);
    div.appendChild(speakBtn);
  }
  $('#interview-chat').appendChild(div);
  $('#interview-chat').scrollTop = $('#interview-chat').scrollHeight;
}

async function submitInterviewAnswer() {
  const answer = $('#interview-answer').value.trim();
  if (!answer || answer.length < 3) return toast('请输入你的回答');
  if (!state.interviewActive) return;
  addChatMsg('candidate', answer);
  $('#interview-answer').value = '';
  const btn = $('#btn-interview-submit');
  btn.disabled = true;
  try {
    const result = await apiInterviewAnswer(answer);
    if (result.type === 'end') {
      addChatMsg('system', '面试结束！正在生成评估报告...');
      state.interviewActive = false;
      await loadInterviewReport();
    } else if (result.type === 'follow_up') {
      addChatMsg('system', `追问 — ${result.followUpType || ''}`);
      addChatMsg('interviewer', result.message);
    } else {
      addChatMsg('interviewer', result.message, result.stage);
      // 更新标准答案按钮的题目
      showInterviewModelAnswerButton();
    }
  } catch (e) { toast('处理失败: ' + e.message); }
  finally { btn.disabled = false; }
}

$('#btn-interview-submit').addEventListener('click', submitInterviewAnswer);
$('#interview-answer').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); submitInterviewAnswer(); }
  // Ctrl+Enter / Shift+Enter = 换行
});

$('#btn-interview-skip').addEventListener('click', async () => {
  if (!state.interviewActive) return;
  try {
    const result = await apiInterviewSkip();
    if (result.type === 'end') {
      addChatMsg('system', '面试结束！正在生成评估报告...');
      state.interviewActive = false;
      await loadInterviewReport();
    } else { addChatMsg('interviewer', result.message, result.stage); }
  } catch (e) { toast('跳过失败: ' + e.message); }
});

$('#btn-interview-end').addEventListener('click', async () => {
  if (!state.sessionId) return;
  
  // Check if there are answered questions
  const interview = state._interviewState;
  const hasAnswers = interview?.history?.some(m => m.role === 'candidate');
  
  if (!hasAnswers) {
    // No answers yet - just reset
    resetInterviewUI();
    toast('面试已取消');
    return;
  }
  
  // Show graceful transition UI
  const chat = $('#interview-chat');
  const inputArea = document.querySelector('.interview-input');
  if (inputArea) inputArea.style.display = 'none';
  
  chat.innerHTML += `
    <div class="card" style="text-align:center;padding:2rem;border:2px dashed var(--accent2);">
      <div class="spinner" style="margin:0 auto 1rem;"></div>
      <p style="font-size:1rem;font-weight:600;">面试结束 · AI 正在整理评估报告...</p>
      <p style="font-size:0.8rem;color:var(--muted);margin-top:0.5rem;">
        已回答 ${interview?.askedQuestions?.length || 0} 题，即将生成五维能力雷达图与逐题点评
      </p>
    </div>
  `;
  chat.scrollTop = chat.scrollHeight;
  
  try {
    const resp = await fetchRetry('/api/interview/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId })
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const data = await resp.json();
    
    // Replace spinner with report
    setTimeout(() => {
      chat.innerHTML = '';
      chat.insertAdjacentHTML('beforeend', `
        <div class="card" style="text-align:center;padding:1rem;background:linear-gradient(135deg, rgba(79,70,229,0.08), rgba(6,182,212,0.08));border:1px solid var(--accent);">
          <p style="font-size:1.05rem;font-weight:600;">面试完毕</p>
          <p style="font-size:0.85rem;color:var(--muted);">共回答 ${interview?.askedQuestions?.length || '?'} 题 · 综合评分 ${data.report?.overall_score || '--'}</p>
        </div>
      `);
      renderInterviewReport(data);
      if (inputArea) inputArea.style.display = '';
      resetInterviewUI(true);
    }, 800);
    
  } catch (e) { 
    toast('评估失败: ' + e.message); 
    if (inputArea) inputArea.style.display = '';
  }
});

function resetInterviewUI(keepReport = false) {
  const chat = $('#interview-chat');
  chat.innerHTML = '';
  const inputArea = document.querySelector('.interview-input');
  if (inputArea) inputArea.style.display = 'none';
  if (!keepReport) {
    $('#interview-report').classList.add('hidden');
    $('#interview-report').innerHTML = '';
    $('#interview-report-actions').classList.add('hidden');
  }
  $('#interview-area').classList.add('hidden');
  $('#interview-empty').classList.remove('hidden');
  $('#btn-interview-start').disabled = false;
  $('#btn-interview-start').textContent = '开始模拟面试';
}

async function loadInterviewReport() {
  try {
    const result = await apiInterviewEvaluate();
    renderInterviewReport(result.report);
    setStatus('✅ 报告已生成');
  } catch (e) { toast('报告生成失败: ' + e.message); setStatus('❌ 报告失败'); }
}

function renderInterviewReport(report) {
  if (!report) return;
  const avg = report.average_scores || {};
  const perQ = report.per_question || [];

  let html = `
    <div class="card report-card">
      <h2>面试评估报告</h2>
      <div class="report-overall">
        <div class="big-score">${report.overall_score || '--'}</div>
        <div class="big-label">综合评分 · 共${report.total_questions || 0}题</div>
      </div>
      <!-- 雷达图 -->
      <div style="display:flex;justify-content:center;margin:1rem 0;">
        <div id="radar-chart" style="width:100%;max-width:480px;height:380px;"></div>
      </div>
      <div class="report-scores">
        ${['star_completeness','quantification','position_match','structure','highlight'].map(k => `
          <div class="report-score-item">
            <div class="s-num">${avg[k] || '--'}</div>
            <div class="s-label">${{star_completeness:'STAR完整性',quantification:'量化程度',position_match:'岗位匹配',structure:'表达结构',highlight:'亮点突出'}[k]}</div>
          </div>
        `).join('')}
      </div>
      ${perQ.map((q, i) => `
        <div class="card" style="background:var(--bg);">
          <h4>#${i+1} — 综合 ${q.overall_score || '--'}分</h4>
          ${(q.line_by_line || []).map(l => `
            <div class="feedback-line ${l.is_good ? 'good' : 'bad'}" style="font-size:0.82rem;">
              ${l.is_good ? '✅' : '⚠️'} "${l.quote}" — ${l.comment}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;

  $('#interview-report').innerHTML = html;
  $('#interview-report').classList.remove('hidden');
  $('#interview-report').scrollIntoView({ behavior: 'smooth' });
  $('#interview-report-actions').classList.remove('hidden');

  // Save to interview history
  try {
    const history = JSON.parse(localStorage.getItem('interview_history') || '[]');
    history.unshift({
      date: new Date().toISOString(),
      score: report.overall_score || '--',
      questions: state._interviewState?.askedQuestions?.length || 0,
      position: state.analysis?.jd?.position || '未知岗位'
    });
    localStorage.setItem('interview_history', JSON.stringify(history.slice(0, 20)));
  } catch {}

  // 渲染雷达图
  setTimeout(() => renderInterviewRadarChart(avg), 200);
}

function renderInterviewRadarChart(avg) {
  const el = document.getElementById('radar-chart');
  if (!el || !window.echarts) return;
  const chart = echarts.init(el, null, { renderer: 'svg' });
  const labels = ['STAR完整性', '量化程度', '岗位匹配', '表达结构', '亮点突出'];
  const keys = ['star_completeness', 'quantification', 'position_match', 'structure', 'highlight'];
  const values = keys.map(k => avg[k] || 0);
  chart.setOption({
    animation: false,
    radar: {
      center: ['50%', '50%'],
      radius: '70%',
      indicator: labels.map(label => ({ name: label, max: 100 })),
      axisName: { color: '#71748A', fontSize: 11 },
      splitArea: { areaStyle: { color: ['rgba(79,70,229,0.02)', 'rgba(79,70,229,0.04)'] } }
    },
    series: [{
      type: 'radar',
      data: [{ value: values, name: '你的得分', areaStyle: { color: 'rgba(79,70,229,0.15)' } }],
      symbol: 'circle', symbolSize: 5,
      lineStyle: { color: '#4F46E5', width: 2 },
      itemStyle: { color: '#4F46E5' }
    }]
  });
  window.addEventListener('resize', () => chart.resize());
}

// ============================================================
// Tab 4: 简历优化
// ============================================================
$('#btn-optimize-resume').addEventListener('click', async () => {
  if (!state.sessionId) return toast('请先完成分析');
  const btn = $('#btn-optimize-resume');
  btn.disabled = true; btn.textContent = '优化中...';
  const emptyEl = $('#resume-opt-empty');
  emptyEl.classList.remove('hidden');
  emptyEl.innerHTML = '<div style="text-align:center;padding:2rem;">'
    + '<div class="spinner"></div>'
    + '<p style="margin-top:0.8rem;color:var(--muted);" id="opt-status-text">AI 正在分析简历并生成优化建议...</p>'
    + '<div id="opt-stream-preview" style="max-height:200px;overflow-y:auto;margin-top:0.8rem;text-align:left;font-size:0.82rem;color:var(--muted);background:var(--bg);border-radius:8px;padding:0.8rem;display:none;"></div>'
    + '</div>';

  const statusEl = document.getElementById('opt-status-text');
  const previewEl = document.getElementById('opt-stream-preview');

  const updateStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  // 阶段指示器：显示当前优化阶段
  var phases = [
    '正在解析JD与简历的匹配度...',
    '正在分析硬技能要求...',
    '正在逐段优化工作经历...',
    '正在优化项目经验表述...',
    '正在生成自我评价建议...',
    '正在整理最终优化结果...'
  ];
  var phaseIdx = 0;
  var phaseTimer = setInterval(function() {
    if (statusEl && phaseIdx < phases.length) {
      statusEl.textContent = phases[phaseIdx];
      phaseIdx++;
    }
  }, 8000);

  // 超时保护：90秒后强制中断
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    if (phaseTimer) clearInterval(phaseTimer);
    btn.disabled = false; btn.textContent = '重新生成';
    emptyEl.innerHTML = '<p style="text-align:center;color:var(--red);padding:2rem;">❌ AI 响应超时，请检查网络或 AI 供应商连接后重试</p>';
  }, 90000);

  try {
    const resp = await fetch(`${API}/optimize-resume-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'HTTP ' + resp.status);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case 'start':
              case 'progress':
                updateStatus(data.message);
                break;
              case 'stream':
                // Phase indicator: silently accumulate, no display jumping
                break;
              case 'done':
                result = data.result;
                break;
              case 'error':
                throw new Error(data.message);
            }
          } catch (e) {
            if (e.message && !e.message.startsWith('Unexpected')) throw e;
          }
        }
      }
    }

    clearTimeout(timeoutId);
    if (phaseTimer) clearInterval(phaseTimer);

    if (!result || (!result.optimizations?.length && !result.elevator_pitch && !result.raw)) {
      emptyEl.innerHTML = '<p style="text-align:center;color:#D97706;padding:2rem;">⚠️ AI 返回了空结果，请确认AI供应商连接正常后重试</p>';
      btn.disabled = false; btn.textContent = '重新生成';
      return;
    }
    renderResumeOptimization(result);
    setStatus('✅ 优化完成');
    showTabDot('tab-optimize');
  } catch (e) {
    clearTimeout(timeoutId);
    if (phaseTimer) clearInterval(phaseTimer);
    emptyEl.innerHTML = '<p style="text-align:center;color:var(--red);padding:2rem;">❌ 优化失败: ' + (e.message || '网络错误') + '</p>';
    toast('优化失败: ' + e.message);
  }
  finally {
    if (phaseTimer) clearInterval(phaseTimer);
    clearTimeout(timeoutId);
    btn.disabled = false; btn.textContent = '重新生成';
  }
});

function renderResumeOptimization(data) {
  $('#resume-opt-empty').classList.add('hidden');
  $('#resume-opt-area').classList.remove('hidden');

  // Elevator pitch + 自我介绍脚本
  if (data.elevator_pitch || data.self_intro_script) {
    const el = $('#resume-elevator');
    el.style.display = 'block';
    el.innerHTML = `
      <h3>🎤 一句话自我介绍</h3>
      <p style="font-size:1rem;font-weight:600;color:var(--accent);">${data.elevator_pitch || ''}</p>
      ${data.self_intro_script ? `
      <h3 style="margin-top:1rem;">📝 1分钟自我介绍脚本</h3>
      <p style="background:var(--tag-bg);padding:1rem;border-radius:8px;font-size:0.88rem;line-height:1.7;">${data.self_intro_script}</p>` : ''}
    `;
  }

  // 逐段优化建议
  const opts = data.optimizations || [];
  $('#resume-opt-list').innerHTML = opts.map((o, i) => `
    <div class="card opt-card">
      <h4>#${i + 1} 优化建议</h4>
      <div class="opt-row">
        <div class="opt-col">
          <div class="opt-label">原文</div>
          <div class="opt-text original" style="max-height:none;white-space:pre-wrap;word-break:break-word;">${o.original || ''}</div>
        </div>
        <div class="opt-arrow">→</div>
        <div class="opt-col">
          <div class="opt-label">优化后</div>
          <div class="opt-text improved" style="max-height:none;white-space:pre-wrap;word-break:break-word;line-height:1.8;">${o.suggestion || ''}</div>
        </div>
      </div>
      <div class="opt-reason">💡 ${o.reason || ''}</div>
    </div>
  `).join('');

  if (opts.length === 0) {
    $('#resume-opt-list').innerHTML = '<div class="card"><p style="color:var(--muted);">暂无优化建议返回，请尝试重新生成。</p></div>';
  }

  $('#resume-opt-area').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// 📊 简历评分
// ============================================================

async function scoreResume() {
  const resumeText = $('#resume-input').value.trim() || state.resumeText || '';
  if (!resumeText) return toast('请先在分析页输入简历内容');
  const btn = $('#btn-score-resume');
  btn.disabled = true; btn.textContent = '⏳ 评分中...';
  try {
    const resp = await fetchRetry('/api/score-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    renderResumeScore(data);
  } catch (e) { toast('评分失败: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '🔄 重新评分'; }
}

function renderResumeScore(data) {
  const card = $('#resume-score-card');
  card.style.display = 'block';

  const scores = data.scores || {};
  const bars = [
    { key: 'format', label: '格式规范', color: '#4F46E5' },
    { key: 'completeness', label: '内容完整', color: '#10B981' },
    { key: 'quantification', label: '量化程度', color: '#F59E0B' },
    { key: 'star_structure', label: 'STAR结构', color: '#8B5CF6' },
    { key: 'position_alignment', label: '岗位对齐', color: '#EC4899' },
  ];

  $('#resume-score-detail').innerHTML = bars.map(b => {
    const v = scores[b.key] || 0;
    return '<div style="display:flex;align-items:center;gap:0.5rem;margin:0.4rem 0;">' +
      '<span style="width:80px;font-size:0.8rem;">' + b.label + '</span>' +
      '<div style="flex:1;height:10px;background:var(--bg2);border-radius:5px;overflow:hidden;">' +
      '<div style="height:100%;width:' + v + '%;background:' + b.color + ';border-radius:5px;transition:width 0.5s;"></div></div>' +
      '<span style="width:35px;font-size:0.8rem;text-align:right;">' + v + '</span></div>';
  }).join('');

  $('#resume-score-overall').innerHTML = '<strong>综合评分：' + data.overall_score + '分</strong>' +
    (data.suggestion ? '<p style="margin-top:0.3rem;color:var(--muted);font-size:0.82rem;">💡 ' + data.suggestion + '</p>' : '');
}

$('#btn-score-resume').addEventListener('click', scoreResume);

async function checkAndAutoScore() {
  const card = $('#resume-score-card');
  const resumeText = $('#resume-input').value.trim() || state.resumeText || '';
  if (!resumeText) {
    card.style.display = 'none';
    return;
  }
  // If card is already populated, don't re-score
  const detail = $('#resume-score-detail');
  if (detail.innerHTML.trim() && card.style.display !== 'none') return;
  card.style.display = 'block';
}

// ============================================================
// ============================================================
// 自我介绍生成
// ============================================================
function checkAndShowSelfIntroCard() {
  var card = document.getElementById('self-intro-card');
  if (!card) return;
  var resumeText = (document.getElementById('resume-input')?.value?.trim() || state.resumeText || '');
  if (resumeText.length > 20) {
    card.style.display = 'block';
  }
}

// 切换到简历页时检查
var _origSwitchTab = switchTab;
switchTab = function(tabName) {
  _origSwitchTab(tabName);
  if (tabName === 'resume') {
    setTimeout(checkAndShowSelfIntroCard, 200);
  }
};

// 生成自我介绍按钮
document.getElementById('btn-generate-self-intro')?.addEventListener('click', async function() {
  var btn = document.getElementById('btn-generate-self-intro');
  var resultEl = document.getElementById('self-intro-result');
  var saveBtn = document.getElementById('btn-save-self-intro');
  if (!btn || !resultEl) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="ai-action-icon">⏳</span>AI正在生成自我介绍...';
  resultEl.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);"><div class="spinner" style="margin:0 auto 0.5rem;"></div>正在分析简历并生成自我介绍...</div>';
  if (saveBtn) saveBtn.style.display = 'none';

  try {
    var jd = state.analysis ? (state.analysis.jd || {}) : {};
    var jdSummary = jd.position
      ? (jd.company || '') + ' ' + jd.position + ' | ' + (jd.requirements || jd.responsibilities || '')
      : (jd.requirements || jd.responsibilities || '');
    var resumeText = (document.getElementById('resume-input')?.value?.trim() || state.resumeText || '');
    var customPrompt = document.getElementById('self-intro-custom-prompt')?.value?.trim() || '';

    var result = await fetchRetry('/api/generate-self-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jdSummary: jdSummary.slice(0, 400),
        resumeText: resumeText.slice(0, 4000),
        customPrompt: customPrompt.slice(0, 500)
      })
    }).then(function(r) { return r.json(); });

    if (result.self_intro) {
      var highlights = result.highlights && result.highlights.length > 0
        ? '<div class="self-intro-highlights">' + result.highlights.map(function(h) { return '<span class="anchor-tag">' + h + '</span>'; }).join('') + '</div>'
        : '';
      var duration = result.duration_estimate ? '<span class="self-intro-duration">⏱ ' + result.duration_estimate + '</span>' : '';

      resultEl.innerHTML = '<div class="model-answer-card">' +
        '<div class="model-answer-header">🎙️ AI生成的自我介绍 ' + duration + ' <button class="btn-speak" data-text="' + result.self_intro.replace(/"/g, '&quot;').replace(/\n/g, ' ') + '" style="width:24px;height:24px;font-size:0.7rem;margin-left:0.4rem;vertical-align:middle;">🔊</button></div>' +
        '<div class="model-answer-body">' + result.self_intro.replace(/\n/g, '<br>') + '</div>' +
        (result.tips ? '<div class="model-answer-tips">💡 ' + result.tips + '</div>' : '') +
        highlights +
        '</div>';

      window._currentSelfIntro = result.self_intro;
      if (saveBtn) saveBtn.style.display = 'inline-flex';
      resultEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      resultEl.innerHTML = '<p style="color:var(--red);padding:1rem;">生成失败：未获取到内容，请重试</p>';
    }
  } catch (e) {
    resultEl.innerHTML = '<p style="color:var(--red);padding:1rem;">生成失败: ' + e.message + '</p>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="ai-action-icon">✨</span>重新生成';
  }
});

// 保存自我介绍到话术库
document.getElementById('btn-save-self-intro')?.addEventListener('click', async function() {
  var btn = document.getElementById('btn-save-self-intro');
  if (!btn || !window._currentSelfIntro) return toast('请先生成自我介绍');

  btn.disabled = true;
  btn.innerHTML = '<span class="ai-action-icon">⏳</span>保存中...';

  try {
    await fetchRetry('/api/phrases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: '面试自我介绍',
        answer: window._currentSelfIntro,
        tags: ['自我介绍', '简历'],
        type: '自我介绍',
        score: 0
      })
    });
    toast('✅ 自我介绍已保存到话术库');
    btn.innerHTML = '<span class="ai-action-icon">✅</span>已保存';
    setTimeout(function() {
      btn.innerHTML = '<span class="ai-action-icon">💾</span>保存';
      btn.disabled = false;
    }, 2000);
  } catch (e) {
    toast('保存失败: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<span class="ai-action-icon">💾</span>保存';
  }
});

// ============================================================
// 设置面板
// ============================================================

// 打开/关闭设置
$('#btn-open-settings')?.addEventListener('click', async () => {
  $('#settings-modal').classList.remove('hidden');
  loadSettingsData();
  loadTemperatures();
  // 默认显示当前版本号（从 Electron 主进程获取或使用注入值）
  const showVersion = async () => {
    try {
      if (window.electronAPI?.getVersion) {
        const ver = await window.electronAPI.getVersion();
        $('#current-version').textContent = 'v' + ver;
      } else if (window.__ELECTRON_VERSION__) {
        $('#current-version').textContent = 'v' + window.__ELECTRON_VERSION__;
      }
    } catch { /* fallback */ }
  };
  showVersion();
  // 同时加载 opencli 环境状态
  try {
    const h = await fetchRetry('/api/health').then(r => r.json());
    renderEnvPanel(h);
  } catch {}
});

// Temperature 滑块
$('#settings-temperature').addEventListener('input', () => {
  $('#settings-temp-val').textContent = $('#settings-temperature').value;
});

async function loadTemperatures() {
  try {
    const data = await fetchRetry('/api/providers/temperatures').then(r => r.json());
    _settingsTemperatures = data.temperatures || {};
    applyStoredTemperatures();
  } catch {}
}
let _settingsTemperatures = {};

function applyStoredTemperatures() {
  // 设置 temperature 滑块到当前选中连接的存储值（如果有），否则 0.7
  const connId = _settingsSelectedConnectionId;
  const t = connId && _settingsTemperatures[connId] != null ? _settingsTemperatures[connId] : 0.7;
  $('#settings-temperature').value = t;
  $('#settings-temp-val').textContent = t;
}
let _settingsSelectedConnectionId = null;
$('#btn-close-settings').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
$('#settings-modal').addEventListener('click', (e) => {
  if (e.target === $('#settings-modal')) $('#settings-modal').classList.add('hidden');
});
const opencliSetupBtn = $('#btn-opencli-setup-settings');
if (opencliSetupBtn) opencliSetupBtn.onclick = () => startOpencliSetup();

async function loadSettingsData() {
  // 加载供应商预设
  try {
    const p = await fetchRetry('/api/providers/list').then(r => r.json());
    const sel = $('#settings-provider');
    sel.innerHTML = (p.providers || []).map(pr =>
      `<option value="${pr.id}" data-baseurl="${pr.baseUrl || ''}" data-model="${pr.defaultModel || ''}" data-protocol="${pr.protocol || 'openai-compatible'}">${pr.name} (${pr.id})</option>`
    ).join('');
    // 监听供应商切换，自动填 Base URL 和模型
    sel.addEventListener('change', () => {
      const opt = sel.selectedOptions[0];
      $('#settings-baseurl').value = opt.dataset.baseurl || '';
      const s = $('#settings-model-select');
      s.innerHTML = opt.dataset.model ? `<option value="${opt.dataset.model}">${opt.dataset.model}</option>` : '<option value="">需拉取</option>';
      $('#settings-name').placeholder = `如：我的${opt.textContent.trim()}`;
      // 隐藏手动输入模型框
      $('#settings-model-manual').style.display = 'none';
      _settingsLastApiKey = '';
    });
    sel.dispatchEvent(new Event('change'));

    // 监听API Key输入框：失去焦点时自动拉取模型
    const apikeyInput = $('#settings-apikey');
    apikeyInput.addEventListener('blur', () => autoFetchModelsOnKeyInput());
  } catch {}

  // 加载已保存的连接
  await refreshConnectionList();
}

let _settingsLastApiKey = '';

async function autoFetchModelsOnKeyInput() {
  const apiKey = $('#settings-apikey').value.trim();
  if (!apiKey || apiKey === _settingsLastApiKey) return;
  _settingsLastApiKey = apiKey;

  const sel = $('#settings-provider');
  const opt = sel.selectedOptions[0];
  const baseUrl = $('#settings-baseurl').value.trim() || opt.dataset.baseurl || '';
  const protocol = opt.dataset.protocol || 'openai-compatible';

  if (!baseUrl) return;

  const s = $('#settings-model-select');
  s.innerHTML = '<option value="">⏳ 正在拉取模型列表...</option>';
  s.disabled = true;

  try {
    const result = await fetchRetry('/api/providers/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiBaseUrl: baseUrl, apiKey, protocol, providerId: sel.value })
    }).then(r => r.json());

    if (result.models?.length) {
      s.innerHTML = result.models.map(m => `<option value="${m}">${m}</option>`).join('');
      $('#settings-model').value = result.models[0];
      toast(`✅ 发现 ${result.models.length} 个可用模型`);
    } else {
      s.innerHTML = '<option value="">⚠️ 未获取到模型，请手动输入</option>';
    }
  } catch(e) {
    s.innerHTML = '<option value="">❌ 拉取失败，请手动输入</option>';
    $('#settings-model-manual').style.display = 'block';
  } finally {
    s.disabled = false;
  }
}

async function refreshConnectionList() {
  try {
    const c = await fetchRetry('/api/providers/connections').then(r => r.json());
    const connections = c.connections || [];
    const activeId = c.activeConnectionId;

    // 状态栏
    if (activeId && connections.length > 0) {
      const active = connections.find(x => x.id === activeId);
      $('#settings-connections-status').innerHTML = active
        ? `<p><span class="conn-badge active">✅ 已连接</span> ${active.name} · ${active.providerId} · ${active.hasApiKey ? '已配置Key' : '⚠️ 未配置Key'}</p>`
        : '<p style="color:var(--muted);">未设置激活连接，将使用第一个可用连接</p>';
    } else {
      $('#settings-connections-status').innerHTML = '<p style="color:var(--muted);">⚠️ 尚未配置任何AI连接</p>';
    }

    // 连接列表
    if (connections.length === 0) {
      $('#settings-connections-list').innerHTML = '<p style="color:var(--muted);">暂无连接，请在下方添加</p>';
      return;
    }
    $('#settings-connections-list').innerHTML = connections.map(conn => {
      const t = _settingsTemperatures[conn.id] != null ? _settingsTemperatures[conn.id] : 0.7;
      return `
      <div class="conn-item">
        <div class="conn-info">
          <span class="conn-provider">${conn.name || conn.providerId}</span>
          <span class="conn-key">${conn.providerId} · ${conn.hasApiKey ? '🔑 已配置' : '⚠️ 无Key'} · 模型: ${conn.model || '未设置'} · 创意度: ${t}${conn.id === activeId ? ' · <strong style="color:var(--accent);">激活</strong>' : ''}</span>
          ${conn.models?.length ? `<span class="conn-key" style="display:block;margin-top:2px;">可用模型: ${conn.models.slice(0,10).join(', ')}${conn.models.length > 10 ? '...等' + conn.models.length + '个' : ''}</span>` : ''}
        </div>
        <div class="conn-actions">
          <button onclick="fetchModelsForConn('${conn.id}')" title="拉取模型列表">📡</button>
          ${conn.id !== activeId ? `<button onclick="activateConnection('${conn.id}')">激活</button>` : ''}
          <button onclick="editConnectionTemp('${conn.id}',${t})" title="调整创意度">🌡️</button>
          <button class="danger" onclick="deleteConnection('${conn.id}')">删除</button>
        </div>
      </div>
    `}).join('');
  } catch {}
}

window.activateConnection = async function(id) {
  try {
    await fetchRetry('/api/providers/connections/active', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await refreshConnectionList();
    toast('✅ 已切换激活连接');
  } catch(e) { toast('切换失败'); }
};

// 为已保存的连接拉取模型列表
window.fetchModelsForConn = async function(connectionId) {
  toast('📡 正在拉取模型列表...');
  try {
    const result = await fetchRetry('/api/providers/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId })
    }).then(r => r.json());
    if (result.models?.length) {
      toast(`✅ 发现 ${result.models.length} 个模型`);
    } else {
      toast('⚠️ 未获取到模型列表');
    }
    await refreshConnectionList();
  } catch(e) { toast('拉取模型失败: ' + e.message); }
};

window.deleteConnection = async function(id) {
  if (!confirm('确定删除此连接？')) return;
  try {
    const resp = await fetchRetry(`/api/providers/connections/${id}`, { method: 'DELETE' });
    const result = await resp.json();
    if (!result.ok) throw new Error(result.error || '删除失败');
    toast('✅ 已删除');
    await refreshConnectionList();
    const c = await fetchRetry('/api/providers/connections').then(r => r.json());
    if (!c.activeConnectionId) setStatus('⚠️ 未配置AI — 点击 ⚙️ 设置');
  } catch(e) { toast('删除失败: ' + e.message); }
};

// 快速调整创意度
window.editConnectionTemp = async function(id, current) {
  const val = prompt('创意度 (0=精确, 1=平衡, 2=创意):', current);
  if (val == null) return;
  const t = Math.max(0, Math.min(2, parseFloat(val) || 0.7));
  try {
    await fetchRetry('/api/providers/temperature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: id, temperature: t })
    });
    _settingsTemperatures[id] = t;
    await refreshConnectionList();
    toast(`✅ 创意度已设为 ${t}`);
  } catch(e) { toast('调整失败: ' + e.message); }
};

// 添加/保存连接
$('#settings-add-connection').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const sel = $('#settings-provider');
    const opt = sel.selectedOptions[0];
    const result = await fetchRetry('/api/providers/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#settings-name').value.trim(),
        providerId: sel.value,
        protocol: opt.dataset.protocol || 'openai-compatible',
        apiBaseUrl: $('#settings-baseurl').value.trim() || opt.dataset.baseurl || '',
        apiKey: $('#settings-apikey').value.trim(),
        model: $('#settings-model-select').value || $('#settings-model-manual').value.trim() || $('#settings-model').value.trim() || opt.dataset.model || '',
        setActive: $('#settings-set-active').checked
      })
    });
    if (!result.ok && result.error) throw new Error(result.error);
    toast('✅ 连接已保存');
    $('#settings-apikey').value = '';
    await refreshConnectionList();

    // 保存 temperature
    const savedId = result.activeConnectionId || (result.connections?.length && result.connections[result.connections.length - 1]?.id);
    if (savedId) {
      const t = parseFloat($('#settings-temperature').value) || 0.7;
      await fetchRetry('/api/providers/temperature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: savedId, temperature: t })
      });
      _settingsTemperatures[savedId] = t;
    }

    // 自动拉取模型列表
    if (savedId) {
      toast('📡 正在自动拉取可用模型...');
      try {
        const modelsResp = await fetchRetry('/api/providers/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: savedId })
        }).then(r => r.json());
        if (modelsResp.models?.length) {
          toast(`✅ 连接成功！发现 ${modelsResp.models.length} 个可用模型`);
          const models = modelsResp.models;
          const s = $('#settings-model-select');
          s.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
          s.value = models[0];
          $('#settings-model').value = models[0];
          await refreshConnectionList();
        }
      } catch { /* 模型拉取失败不阻塞 */ }
    }

    setStatus('✅ 已连接');
  } catch(e) { toast('保存失败: ' + e.message); }
});

// 测试连接
$('#btn-test-connection').addEventListener('click', async () => {
  const sel = $('#settings-provider');
  const opt = sel.selectedOptions[0];
  const btn = $('#btn-test-connection');
  const res = $('#settings-test-result');
  btn.disabled = true; btn.textContent = '测试中...';
  res.classList.remove('hidden', 'ok', 'fail');
  res.textContent = '⏳ 正在测试...';

  try {
    const result = await fetchRetry('/api/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: sel.value,
        apiBaseUrl: $('#settings-baseurl').value.trim() || opt.dataset.baseurl || '',
        apiKey: $('#settings-apikey').value.trim(),
        model: $('#settings-model-select').value || $('#settings-model').value.trim() || opt.dataset.model || '',
        protocol: opt.dataset.protocol || 'openai-compatible'
      })
    }).then(r => r.json());

    if (result.ok) {
      res.classList.add('ok');
      res.textContent = `✅ 连接成功！发现 ${result.models?.length || 0} 个模型`;
      // 自动填充模型下拉
      if (result.models?.length) {
        const s = $('#settings-model-select');
        s.innerHTML = result.models.map(m => `<option value="${m}">${m}</option>`).join('');
        s.value = result.models[0];
      }
    } else {
      res.classList.add('fail');
      res.textContent = `❌ 连接失败: ${result.message || '未知错误'}`;
    }
  } catch(err) {
    res.classList.add('fail');
    res.textContent = `❌ 网络错误: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
    res.classList.remove('hidden');
  }
});

// ============================================================
// 会话管理 — 岗位切换
// ============================================================
let _refreshingSessions = false;
async function refreshSessionList() {
  if (_refreshingSessions) return;
  _refreshingSessions = true;
  const sel = $('#nav-session-select');
  try {
    const data = await fetchRetry('/api/sessions').then(r => r.json());
    const list = data.sessions || [];
    sel.innerHTML = list.length ? list.map(s =>
      `<option value="${s.id}" ${s.isActive ? 'selected' : ''}>${s.label} · ${s.matchScore}分</option>`
    ).join('') : '<option value="">暂无面试</option>';
    if (!state.sessionId && list.length > 0) {
      await switchToSession(list[0].id);
    }
    if (!list.length) {
      // 所有会话被删除：清空界面
      state.sessionId = null;
      state.analysis = null;
      $('#nav-session-label').textContent = '当前岗位';
      $('#analysis-result').classList.add('hidden');
      $('#practice-area').classList.add('hidden');
      $('#practice-empty').classList.remove('hidden');
      $('#interview-area').classList.add('hidden');
      $('#interview-empty').classList.remove('hidden');
      $('#interview-chat').innerHTML = '';
      state.interviewActive = false;
    }
  } catch {} finally {
    _refreshingSessions = false;
  }
}
async function switchToSession(sessionId) {
  if (!sessionId) return;
  const data = await fetchRetry('/api/sessions/switch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  }).then(r => r.json());
  if (!data.ok) return toast('切换失败');
  state.sessionId = sessionId;
  state.jdText = data.jdText || '';
  state.resumeText = data.resumeText || '';
  state.resumeFileName = data.resumeFileName || '';
  state.resumeSourceType = data.resumeSourceType || '';
  state.analysis = { jd: data.jd, resume: data.resume, gap: data.gap,
    questions: data.questions, insights: data.insights, mianjing: data.mianjing, kb_supplement: data.kb_supplement };
  $('#nav-session-label').textContent = data.label || '当前岗位';
  // 恢复 textarea
  $('#jd-input').value = state.jdText;
  $('#resume-input').value = state.resumeText;
  renderAnalysisResult(state.analysis);
  toast(`已切换到: ${data.label}`);
  setStatus('✅ ' + (data.label || ''));
}

$('#nav-session-select').addEventListener('change', async () => {
  if (_refreshingSessions) return;
  const id = $('#nav-session-select').value;
  if (id && id !== state.sessionId) await switchToSession(id);
});

// 删除当前会话
$('#btn-delete-session').addEventListener('click', async () => {
  const id = $('#nav-session-select').value;
  if (!id) return toast('没有可删除的会话');
  if (!confirm('确定删除此岗位的所有面试数据？不可恢复。')) return;
  try {
    await fetchRetry(`/api/sessions/${id}`, { method: 'DELETE' });
    state.sessionId = null;
    state.analysis = null;
    await refreshSessionList();
    $('#analysis-result').classList.add('hidden');
    $('#practice-area').classList.add('hidden');
    $('#practice-empty').classList.remove('hidden');
    $('#nav-session-label').textContent = '当前岗位';
    toast('已删除');
  } catch(e) { toast('删除失败: ' + e.message); }
});

// ============================================================
// Tab 5: 真题库
// ============================================================
async function loadBank(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  const data = await fetchRetry(`/api/mianjing-bank?${params}`).then(r => r.json());

  // 过滤器
  const all = '全部';
  let filterHtml = '<span style="font-weight:700;font-size:0.82rem;">筛选: </span>';
  filterHtml += `<select class="bank-filter" data-key="company"><option value="">公司 (${data.companies.length})</option>${data.companies.map(c => `<option value="${c}" ${filters.company===c?'selected':''}>${c}</option>`).join('')}</select>`;
  filterHtml += `<select class="bank-filter" data-key="position"><option value="">岗位 (${data.positions.length})</option>${data.positions.map(p => `<option value="${p}" ${filters.position===p?'selected':''}>${p}</option>`).join('')}</select>`;
  filterHtml += `<select class="bank-filter" data-key="type"><option value="">类型 (${data.types.length})</option>${data.types.map(t => `<option value="${t}" ${filters.type===t?'selected':''}>${t}</option>`).join('')}</select>`;
  filterHtml += `<span style="font-size:0.75rem;color:var(--muted);">共 ${data.total} 题${data.filtered !== data.total ? `· 显示 ${data.filtered}` : ''}</span>`;
  $('#bank-filters').innerHTML = filterHtml;

  // 事件
  $$('.bank-filter').forEach(el => {
    el.addEventListener('change', () => {
      const f = {};
      $$('.bank-filter').forEach(e => { if (e.value) f[e.dataset.key] = e.value; });
      loadBank(f);
    });
  });

  // 题目列表
  const qs = data.questions || [];
  if (!qs.length) {
    $('#bank-list').innerHTML = '<div class="empty-state"><p>真题库为空。完成一次含面经采集的分析后，面经真题会自动归档。</p></div>';
    $('#bank-trends').innerHTML = '';
    return;
  }

  // 热趋势：最早/最新采集时间
  const dates = qs.map(q => q.collectedAt).filter(Boolean).sort();
  let trendHtml = '';
  if (dates.length) {
    trendHtml = `📊 时间跨度: ${new Date(dates[0]).toLocaleDateString('zh-CN')} ~ ${new Date(dates[dates.length-1]).toLocaleDateString('zh-CN')}`;
    if (qs.length >= 3) trendHtml += ` · 涉及 ${data.companies.length} 家公司`;
  }
  trendHtml += ` · <a href="/api/export/mianjing" style="color:var(--accent);">📥 导出DOCX</a>`;
  $('#bank-trends').innerHTML = trendHtml;

  $('#bank-list').innerHTML = qs.map((q, idx) => `
    <div class="q-item bank-item" data-question="${encodeURIComponent(q.question)}" data-company="${encodeURIComponent(q.company||'')}">
      <div class="q-header">
        <span class="q-type ${getTypeClass(q.type)}">${q.type || ''}</span>
        <span class="q-source">${q.company || ''} · ${q.position || ''}${q.frequency ? ' · 出现'+q.frequency+'次' : ''}</span>
        <button class="btn-bank-delete" title="删除此题">✕</button>
        <button class="btn-outline bank-practice-btn" data-q="${encodeURIComponent(q.question || '')}" style="font-size:0.72rem;padding:0.15rem 0.5rem;margin-left:0.5rem;">练习</button>
      </div>
      <div class="q-text">${q.question}</div>
      <div class="q-intent" style="font-size:0.72rem;color:var(--muted);">📅 ${new Date(q.collectedAt || '').toLocaleDateString('zh-CN')} · 轮次: ${q.round || '未知'} · 来源: ${q.source || ''}${q.source_platforms?.length ? ' · ' + q.source_platforms.map(s => '📎 ' + s).join(' ') : ''}</div>
      ${q.sourceUrls?.length ? `<div class="q-intent" style="font-size:0.7rem;color:var(--accent);margin-top:1px;">来源: ${q.sourceUrls.map(s => `<a href="${s.url}" target="_blank" style="color:var(--accent);">${s.title?.slice(0,20) || s.platform}</a>`).join(' | ')}</div>` : ''}
    </div>
  `).join('');

  // 删除按钮事件
  $$('.btn-bank-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.bank-item');
      const question = decodeURIComponent(item.dataset.question);
      const company = decodeURIComponent(item.dataset.company);
      if (!confirm(`确定删除此题？\n\n「${question.slice(0,60)}」`)) return;
      try {
        const resp = await fetchRetry('/api/bank/question', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, company })
        });
        if (!resp.ok) throw new Error((await resp.json()).error);
        item.remove();
        toast('已删除');
      } catch(e) {
        toast('删除失败: ' + e.message);
      }
    });
  });

  // 练习按钮事件
  document.querySelectorAll('.bank-practice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const question = decodeURIComponent(btn.dataset.q);
      // Add to practice list if not already there
      if (!state.analysis) state.analysis = { questions:[], mianjing:[], kb_supplement:[], jd:{}, resume:{} };
      state.analysis.mianjing = state.analysis.mianjing || [];
      if (!state.analysis.mianjing.find(mq => mq.question === question)) {
        // Find the full question object from bank data
        const fullQ = data.questions.find(q => q.question === question);
        state.analysis.mianjing.push({ 
          question, type: fullQ?.type || '真题库', 
          _source: '题库', sample_answer_points: fullQ?.sample_answer_points || [],
          examiner_intent: fullQ?.examiner_intent || '', tags: fullQ?.tags || []
        });
      }
      switchTab('practice');
      setTimeout(() => selectPracticeQuestion(question), 300);
    });
  });
}

// 切换Tab时加载真题库
$$('.nav-tab').forEach(tab => {
  const orig = tab.onclick;
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'bank') loadBank({});
  });
});

// ============================================================
// 📡 面经采集
// ============================================================
$('#btn-mj-search').addEventListener('click', async () => {
  let company = $('#mj-company-input').value.trim();
  let position = $('#mj-position-input').value.trim();
  if ((!company || !position) && state.analysis?.jd) {
    company = company || state.analysis.jd.company || '';
    position = position || state.analysis.jd.position || '';
    $('#mj-company-input').value = company;
    $('#mj-position-input').value = position;
  }
  if (!company && !position) return toast('请输入公司名或岗位，或先完成分析');

  const pw = $('#mj-progress-wrap'); const pd = $('#mj-progress-detail');
  pw.style.display = 'block'; pd.innerHTML = '';
  const btn = $('#btn-mj-search'); btn.disabled = true; btn.textContent = '⏳ 采集中...';

  try {
    const manualUrls = ($('#mj-manual-urls').value || '').trim().split(/[\n\r]+/).map(u => u.trim()).filter(Boolean);
    const resp = await fetch('/api/mianjing-collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId, company, position, manualUrls })
    });
    const reader = resp.body.getReader(); const decoder = new TextDecoder();
    let buffer = '', result = null;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          pd.innerHTML += '🟢 ' + (ev.detail || '') + '<br>';
          pd.parentElement.scrollTop = pd.parentElement.scrollHeight;
          if (ev.step === 'done') result = ev.result;
          if (ev.step === 'error') throw new Error(ev.detail);
        } catch {}
      }
    }
    if (result?.mianjing?.questions?.length) {
      window._mjQuestions = result.mianjing.questions;
      renderMianjingResults(result.mianjing);
      toast(`采集完成: ${result.mianjing.questions.length} 题`);
      showTabDot('mianjing');
    } else { renderMianjingResults({ questions: [], sources: [] }); toast('未采集到面经题目'); }
  } catch (e) { pd.innerHTML += '<br>❌ 采集失败: ' + (e.message || '未知'); toast('采集失败'); }
  finally { btn.disabled = false; btn.textContent = '🔍 开始采集'; }
});

function renderMianjingResults(mData) {
  $('#mj-result').style.display = 'block';
  const qs = mData.questions || [];
  $('#mj-q-count').textContent = qs.length;
  $('#mj-question-list').innerHTML = qs.map((q, i) => `
    <div class="card" style="padding:0.8rem;margin-bottom:0.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
        <div style="flex:1;">
          <span style="font-size:0.75rem;color:var(--accent);background:var(--tag-bg);padding:1px 6px;border-radius:3px;">${q.type || '未知'}</span>
          <span style="margin-left:0.5rem;font-size:0.85rem;">${i+1}. ${q.question || ''}</span>
          ${q.sample_answer_points?.length ? '<div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem;">💡 ' + q.sample_answer_points.join(' / ') + '</div>' : ''}
        </div>
        <div style="display:flex;gap:0.3rem;flex-shrink:0;">
          <button class="btn-outline mj-add-practice" data-idx="${i}" style="font-size:0.7rem;padding:0.15rem 0.4rem;">➕练习</button>
          <button class="btn-outline mj-add-bank" data-idx="${i}" style="font-size:0.7rem;padding:0.15rem 0.4rem;">📚入库</button>
        </div>
      </div>
    </div>
  `).join('');
  document.querySelectorAll('.mj-add-practice').forEach(b => b.addEventListener('click', () => {
    const q = window._mjQuestions?.[parseInt(b.dataset.idx)]; if (q) addMjToPractice(q);
  }));
  document.querySelectorAll('.mj-add-bank').forEach(b => b.addEventListener('click', () => {
    const q = window._mjQuestions?.[parseInt(b.dataset.idx)]; if (q) addMjToBank(q);
  }));
  updateMjButtonStates();

  // Add sync button
  const resultDiv = $('#mj-result');
  if (resultDiv && !document.getElementById('btn-mj-sync-questions')) {
    const syncBtn = document.createElement('button');
    syncBtn.id = 'btn-mj-sync-questions';
    syncBtn.className = 'btn-outline';
    syncBtn.style.cssText = 'font-size:0.78rem;margin-top:0.5rem;';
    syncBtn.textContent = '📋 同步到押题清单';
    syncBtn.addEventListener('click', () => {
      if (!state.analysis) state.analysis = { questions:[], mianjing:[], kb_supplement:[], jd:{}, resume:{} };
      const mj = window._mjQuestions || [];
      const existing = new Set((state.analysis.questions || []).map(q => q.question));
      mj.forEach(q => {
        if (!existing.has(q.question)) {
          state.analysis.questions.push({ ...q, _source: '📡面经' });
          existing.add(q.question);
        }
      });
      toast(`已同步 ${mj.length} 道题到押题清单`);
      switchTab('analyze');
    });
    const card = resultDiv.querySelector('.card');
    if (card) card.appendChild(syncBtn);
  }
}

function addMjToPractice(q) {
  if (!state.analysis) state.analysis = { questions:[],mianjing:[],kb_supplement:[],jd:{},resume:{} };
  state.analysis.mianjing = state.analysis.mianjing || [];
  if (state.analysis.mianjing.find(mq => mq.question === q.question)) return toast('已在练习列表中');
  state.analysis.mianjing.push({ 
    question: q.question||'', type: q.type||'面经', tags: q.tags||[],
    _source: '📡面经',
    sample_answer_points: q.sample_answer_points || [],
    examiner_intent: q.examiner_intent || '',
    tips: q.tips || []
  });
  toast('已加入练习'); updateMjButtonStates();
  if (document.getElementById('tab-practice').classList.contains('active')) renderPracticeQuestions();
}

async function addMjToBank(q) {
  try {
    const resp = await fetchRetry('/api/bank/bookmark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.question, type: q.type, company: state.analysis?.jd?.company||'', position: state.analysis?.jd?.position||'', sessionId: state.sessionId })
    });
    const data = await resp.json();
    toast(resp.ok ? '已加入真题库' : (data.error || '添加失败'));
    updateMjButtonStates();
  } catch { toast('添加失败'); }
}

$('#btn-mj-add-all-practice').addEventListener('click', () => {
  if (!window._mjQuestions?.length) return toast('无题目');
  window._mjQuestions.forEach(q => addMjToPractice(q));
});
$('#btn-mj-add-all-bank').addEventListener('click', async () => {
  if (!window._mjQuestions?.length) return toast('无题目');
  for (const q of window._mjQuestions) await addMjToBank(q);
  toast('全部加入真题库');
});

function updateMjButtonStates() {
  document.querySelectorAll('.mj-add-practice').forEach(b => {
    const q = window._mjQuestions?.[parseInt(b.dataset.idx)];
    if (q && (state.analysis?.mianjing||[]).find(mq => mq.question===q.question)) { b.textContent='✅'; b.disabled=true; b.style.opacity='0.5'; }
  });
}

function autoFillMianjingFields() {
  if (state.analysis?.jd) {
    if (!$('#mj-company-input').value) $('#mj-company-input').value = state.analysis.jd.company||'';
    if (!$('#mj-position-input').value) $('#mj-position-input').value = state.analysis.jd.position||'';
  }
}

// ============================================================
// 公司调研 — 面试导向 · 进度条 + 知识图谱
// ============================================================

// 公司调研历史记录
async function saveCompanyResearchHistory(company, position, result) {
  try {
    const resp = await fetchRetry('/api/company-research/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, position, result })
    });
    const data = await resp.json();
    if (data.ok) renderCompanyResearchHistory();
  } catch { /* 静默失败 */ }
}

async function loadCompanyResearchHistory() {
  try {
    const resp = await fetchRetry('/api/company-research/history');
    const data = await resp.json();
    return data.history || [];
  } catch { return []; }
}

async function renderCompanyResearchHistory() {
  const el = document.getElementById('company-history-list');
  if (!el) return;
  const history = await loadCompanyResearchHistory();
  if (!history.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">暂无调研记录</p>';
    return;
  }
  el.innerHTML = history.slice(0, 20).map((h, i) => {
    const d = h.createdAt ? new Date(h.createdAt).toLocaleDateString('zh-CN') + ' ' + new Date(h.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="company-history-item" data-idx="${i}" style="padding:0.4rem 0.6rem;margin:4px 0;background:var(--tag-bg);border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;" title="点击查看详情">
      <span>🏢 ${h.company || ''}${h.position ? ' · ' + h.position : ''}</span>
      <span style="color:var(--muted);font-size:0.72rem;">${d}</span>
    </div>`;
  }).join('');

  // 点击历史记录查看详情
  el.querySelectorAll('.company-history-item').forEach(item => {
    item.addEventListener('click', async () => {
      const idx = parseInt(item.dataset.idx);
      const h = history[idx];
      if (h && h.result) {
        renderCompanyInterviewPrep(h.result, h.company);
        // 滚动到结果区域
        const resultEl = document.getElementById('company-result');
        if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}
async function doCompanyResearch() {
  const company = $('#company-search-input')?.value?.trim();
  if (!company) return toast('请输入公司名');
  const position = $('#company-position-input')?.value?.trim() || '';
  const btn = $('#btn-company-research');
  const pw = $('#company-progress-wrap');
  const ps = $('#company-progress-steps');
  const pd = $('#company-progress-detail');
  const re = $('#company-result');

  re.innerHTML = '';
  btn.disabled = true; btn.textContent = '⏳ 调研中...';
  pw.style.display = 'block';

  // 进度步骤
  const STEPS = ['search', 'llm', 'done'];
  const LABELS = { search: '多维搜索', llm: '面试图谱', done: '完成' };
  ps.innerHTML = STEPS.map(s => `<span class="pstep" id="cr-step-${s}">${LABELS[s]}</span>`).join('');
  pd.textContent = '🔍 启动调研...';

  const t0 = Date.now();
  const totalSteps = STEPS.length;
  let completed = 0;
  function eta() {
    const elapsed = (Date.now() - t0) / 1000;
    const avg = completed > 0 ? elapsed / completed : 10;
    return Math.ceil(avg * (totalSteps - completed));
  }

  try {
    const resp = await fetch('/api/company-research', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, position })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) throw new Error(data.error);
            if (data._done) { result = data; continue; }

            if (data.step === 'search') {
              // 更新搜索子步骤状态
              const el = document.getElementById('cr-step-search');
              if (el && !el.classList.contains('done')) {
                if (data.status === 'ok') {
                  // 不立即标完成，等全部搜索结束再标
                } else {
                  el.classList.add('active');
                }
              }
              pd.textContent = `🔍 ${data.label}: ${data.detail}  ⏱ 预计剩余 ${eta()}s`;
            }
            if (data.step === 'llm') {
              const el = document.getElementById('cr-step-search');
              if (el) { el.classList.add('done'); el.classList.remove('active'); }
              const el2 = document.getElementById('cr-step-llm');
              if (el2) {
                el2.classList.add(data.status === 'ok' ? 'done' : 'active');
              }
              completed = 1;
              pd.textContent = `🧠 ${data.detail}  ⏱ 预计剩余 ${eta()}s`;
            }
          } catch {}
        }
      }
    }

    if (result) {
      const el2 = document.getElementById('cr-step-llm');
      if (el2) { el2.classList.add('done'); el2.classList.remove('active'); }
      const el3 = document.getElementById('cr-step-done');
      if (el3) el3.classList.add('done');
      pd.textContent = '✅ 调研完成';

      renderCompanyInterviewPrep(result, company);
      // 自动保存到调研历史
      saveCompanyResearchHistory(company, position, result);
    }
  } catch (e) {
    pd.textContent = '❌ ' + e.message;
    toast('公司调研失败: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🔍 调研';
    setTimeout(() => { pw.style.display = 'none'; }, 3000);
  }
}

function renderCompanyInterviewPrep(data, company) {
  const el = $('#company-result');
  if (!data || data.error) {
    el.innerHTML = `<div class="empty-state"><p>${data?.error || '暂无数据'}</p></div>`;
    return;
  }

  const html = [];
  html.push(`<h3 style="margin-bottom:0.5rem;">🎯 「${company}」面试备战手册</h3>`);

  // ———— 顶部摘要卡 ————
  if (data._summary) {
    html.push(`<div class="ci-summary-box">${data._summary.replace(/\n/g, '<br>')}</div>`);
  }

  // ———— 核心：面试话术 ————
  if (data.interview_talking_points) {
    const tp = data.interview_talking_points;
    html.push(`<div class="ci-section highlight">
      <div class="ci-section-title">💬 面试话术 — 你的回答框架</div>
      <div class="ci-section-body">
        ${tp.why_join?.length ? `<div class="ci-line"><b>💼 「为什么想加入我们？」</b><br>${tp.why_join.map(p => `• ${p}`).join('<br>')}</div>` : ''}
        ${tp.what_know?.length ? `<div class="ci-line" style="margin-top:0.6rem;"><b>📋 「你对我们了解多少？」</b><br>${tp.what_know.map(p => `• ${p}`).join('<br>')}</div>` : ''}
        ${tp.my_value?.length ? `<div class="ci-line" style="margin-top:0.6rem;"><b>🔧 「你能带来什么？」</b><br>${tp.my_value.map(p => `• ${p}`).join('<br>')}</div>` : ''}
      </div>
    </div>`);
  }

  // ———— 模拟 Q&A ————
  if (data.mock_qa?.length) {
    const qas = data.mock_qa.map(qa => `
      <div class="ci-line" style="margin-bottom:0.6rem;padding:0.4rem 0.6rem;background:var(--bg2);border-radius:4px;">
        <b>❓ ${qa.q}</b><br>
        <span style="color:var(--accent);font-size:0.8rem;">💡 ${qa.a_tips}</span>
      </div>
    `).join('');
    html.push(`<div class="ci-section">
      <div class="ci-section-title">🎯 面试官可能这样问你</div>
      <div class="ci-section-body">${qas}</div>
    </div>`);
  }

  // ———— 公司速览 ————
  if (data.company_basics) {
    const b = data.company_basics;
    const meta = [];
    if (b.one_liner) meta.push(`<div class="ci-summary">${b.one_liner}</div>`);
    const tags = [];
    if (b.founded) tags.push(`📅 ${b.founded}`);
    if (b.headquarters) tags.push(`📍 ${b.headquarters}`);
    if (b.scale) tags.push(`👥 ${b.scale}`);
    if (b.industry) tags.push(`🏭 ${b.industry}`);
    if (tags.length) meta.push(`<div class="ci-meta">${tags.map(t => `<span class="ci-tag">${t}</span>`).join(' ')}</div>`);
    html.push(`<div class="ci-section">
      <div class="ci-section-title">🏢 公司速览</div>
      <div class="ci-section-body">${meta.join('\n')}</div>
    </div>`);
  }

  // ———— 业务洞察 ————
  if (data.business_insight) {
    const bi = data.business_insight;
    const items = [];
    if (bi.main_business?.length) items.push(`<div class="ci-line"><b>核心业务：</b>${bi.main_business.join('、')}</div>`);
    if (bi.flagship_product) items.push(`<div class="ci-line"><b>王牌产品：</b>${bi.flagship_product}</div>`);
    if (bi.business_model) items.push(`<div class="ci-line"><b>商业模式：</b>${bi.business_model}</div>`);
    if (bi.tech_focus?.length) items.push(`<div class="ci-line"><b>技术重点：</b>${bi.tech_focus.map(t => `<code>${t}</code>`).join(' ')}</div>`);
    html.push(`<div class="ci-section">
      <div class="ci-section-title">📦 业务洞察</div>
      <div class="ci-section-body">${items.join('\n')}</div>
    </div>`);
  }

  // ———— 竞品与动态 ————
  if (data.competitive_edge) {
    const ce = data.competitive_edge;
    const items = [];
    if (ce.vs_competitors) items.push(`<div class="ci-line">${ce.vs_competitors}</div>`);
    if (ce.recent_milestones?.length) items.push(`<div class="ci-line"><b>近期里程碑：</b>${ce.recent_milestones.map(m => `<span class="ci-tag">${m}</span>`).join(' ')}</div>`);
    if (ce.risk_awareness?.length) items.push(`<div class="ci-line" style="font-size:0.8rem;"><b>💭 面试中可提及的挑战（显深度）：</b>${ce.risk_awareness.join('、')}</div>`);
    html.push(`<div class="ci-section">
      <div class="ci-section-title">⚔️ 竞争格局</div>
      <div class="ci-section-body">${items.join('\n')}</div>
    </div>`);
  }

  // ———— 文化氛围 ————
  if (data.culture_signals) {
    const cs = data.culture_signals;
    const items = [];
    if (cs.vibe) items.push(`<div class="ci-line"><b>氛围：</b>${cs.vibe}</div>`);
    if (cs.perks?.length) items.push(`<div class="ci-line"><b>福利：</b>${cs.perks.join('、')}</div>`);
    if (cs.watch_out?.length) items.push(`<div class="ci-line" style="color:var(--red);"><b>⚠️ 注意：</b>${cs.watch_out.join('、')}</div>`);
    html.push(`<div class="ci-section">
      <div class="ci-section-title">💡 文化信号</div>
      <div class="ci-section-body">${items.join('\n')}</div>
    </div>`);
  }

  // ———— 面试备战速查 ————
  if (data.hot_prep) {
    const hp = data.hot_prep;
    const items = [];
    if (hp.must_know_3?.length) items.push(`<div class="ci-line"><b>🔑 必知3件事：</b><br>${hp.must_know_3.map(f => `• ${f}`).join('<br>')}</div>`);
    if (hp.green_flags?.length) items.push(`<div class="ci-line" style="color:var(--green);margin-top:0.5rem;"><b>🟢 正面信号：</b>${hp.green_flags.join('、')}</div>`);
    if (hp.red_flags?.length) items.push(`<div class="ci-line" style="color:var(--red);"><b>🔴 警惕：</b>${hp.red_flags.join('、')}</div>`);
    if (hp.suggested_question_to_ask?.length) items.push(`<div class="ci-line" style="margin-top:0.5rem;"><b>🔄 建议反问面试官：</b><br>${hp.suggested_question_to_ask.map(q => `• ${q}`).join('<br>')}</div>`);
    html.push(`<div class="ci-section highlight">
      <div class="ci-section-title">🧠 面试速查清单</div>
      <div class="ci-section-body">${items.join('\n')}</div>
    </div>`);
  }

  el.innerHTML = html.join('\n');
  el.scrollIntoView({ behavior: 'smooth' });
}
// ============================================================
// opencli 环境面板 — 内嵌展示 + 一键安装
// ============================================================

function statusIcon(ok) { return ok ? '🟢' : '🔴'; }

/**
 * 渲染 opencli 环境状态面板（替换旧的全屏弹窗引导）
 */
function renderEnvPanel(healthData) {
  const oc = healthData?.opencli || {};
  const itemsContainer = $('#settings-env-items');
  if (!itemsContainer) return;

  const items = [
    { label: 'Node.js', ok: true, detail: oc.node_version || '未知', fix: null },
    { label: 'opencli CLI', ok: oc.installed, detail: oc.installed ? 'v' + oc.version : '未安装', fix: null },
    { label: 'Daemon', ok: oc.daemon_running, detail: oc.daemon_running ? '运行中' : '未运行', fix: null },
    { label: 'Chrome 扩展', ok: oc.ext_installed, detail: oc.ext_installed ? '已连接' : '未连接', fix: 'btn-opencli-setup' },
    { label: '小红书适配器', ok: oc.has_xiaohongshu, detail: oc.has_xiaohongshu ? '可用' : '不可用', fix: oc.installed ? 'btn-opencli-setup' : null },
  ];

  const allOk = oc.installed && oc.browser_ready && oc.has_xiaohongshu;
  const overallStatus = allOk ? '✅ 全部就绪' : (oc.installed ? '⚠️ 部分就绪' : '🔴 需要配置');

  const itemsHtml = items.map(it => '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;">' +
    '<span>' + statusIcon(it.ok) + '</span>' +
    '<span style="flex:1;"><b>' + it.label + '</b>: ' + it.detail + '</span>' +
    (it.fix ? '<span style="color:var(--accent);cursor:pointer;font-size:0.78rem;" data-fix="' + it.fix + '">🔧 修复</span>' : '') +
    '</div>').join('');

  itemsContainer.innerHTML = '<div style="margin-bottom:0.4rem;"><b>' + overallStatus + '</b></div>' + itemsHtml;

  itemsContainer.querySelectorAll('[data-fix]').forEach(el => {
    el.addEventListener('click', () => startOpencliSetup());
  });
}

/**
 * 一键安装 opencli（SSE 流式进度）
 */
async function startOpencliSetup() {
  const progressEl = $('#settings-env-progress');
  const btn = $('#btn-opencli-setup-settings');
  if (!progressEl || !btn) return;

  btn.disabled = true;
  btn.textContent = '⏳ 配置中...';
  progressEl.style.display = 'block';
  progressEl.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;">⏳ 开始环境配置...</p>';

  try {
    const resp = await fetch('/api/opencli-setup', { method: 'POST' });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          progressEl.innerHTML = renderSetupProgress(ev);
          if (ev.step === 'done' || ev.step === 'error') {
            btn.disabled = false;
            btn.textContent = ev.status === 'ok' ? '✅ 已完成' : '🔧 重新配置';
            const h = await fetchRetry('/api/health').then(r => r.json());
            renderEnvPanel(h);
          }
        } catch {}
      }
    }
  } catch (e) {
    progressEl.innerHTML = '<p style="color:var(--red);font-size:0.8rem;">❌ 配置失败: ' + e.message + '</p>';
    btn.disabled = false;
    btn.textContent = '🔧 重新配置';
  }
}

function renderSetupProgress(ev) {
  const icon = ev.status === 'ok' ? '✅' : ev.status === 'warn' ? '⚠️' : ev.status === 'error' ? '❌' : '⏳';
  const color = ev.status === 'ok' ? 'var(--green)' : ev.status === 'warn' ? '#e6a817' : ev.status === 'error' ? 'var(--red)' : 'var(--muted)';
  if (ev.step === 'done') {
    return '<p style="color:' + color + ';font-size:0.82rem;white-space:pre-line;">' + icon + ' ' + ev.detail + '</p>';
  }
  return '<p style="color:' + color + ';font-size:0.8rem;margin:0.2rem 0;white-space:pre-line;">' + icon + ' [' + ev.step + '] ' + (ev.detail || '') + '</p>';
}


// 小红书扫码登录
async function openXhsForLogin() {
  const el = document.getElementById('recheck-login');
  if (el) el.textContent = '⏳ 正在打开小红书...';
  try {
    const resp = await fetchRetry('/api/open-xhs-login', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    if (el) el.textContent = '✅ 小红书已打开！请在浏览器中完成扫码登录，登录成功后回到此页面点「已完成登录」';
  } catch(e) {
    if (el) el.textContent = '❌ 打开失败: ' + e.message;
  }
}
async function markXhsLoginDone() {
  state._xhsLoginDone = true;
  try {
    const h = await fetchRetry('/api/health').then(r => r.json());
    await renderEnvPanel(h);
  } catch(e) { /* ignore */ }
}
window.openXhsForLogin = openXhsForLogin;
window.markXhsLoginDone = markXhsLoginDone;

// ============================================================
// 导出功能 — DOCX + Markdown
// ============================================================

function exportMarkdown(title, content, sections) {
  let md = `# ${title}\n\n`;
  md += `> 由 InterviewPrep 导出 · ${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}\n\n`;
  if (sections) {
    for (const [label, text] of Object.entries(sections)) {
      md += `## ${label}\n\n${text}\n\n`;
    }
  } else {
    md += content;
  }
  downloadFile(`${title}.md`, md, 'text/markdown');
}

async function exportDocx(title, content, sections) {
  try {
    const resp = await fetchRetry('/api/export/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, sections })
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { toast('导出DOCX失败: ' + e.message); }
}

function exportCurrentQuestionsMD() {
  if (!state.analysis) return toast('请先完成分析');
  const qs = (state.analysis.questions || []).concat(state.analysis.kb_supplement || []).concat(state.analysis.mianjing || []);
  if (!qs.length) return toast('没有题目可导出');
  const sections = {};
  sections['押题清单'] = qs.map((q,i) => `${i+1}. [${q.type||'通用'}] ${q.question}\n   🎯 ${q.examiner_intent || ''}${q.sample_answer_points?.length ? '\n   💡 ' + q.sample_answer_points.join(' / ') : ''}${q.tips?.length ? '\n   🔧 ' + q.tips.join(' / ') : ''}`).join('\n\n');
  const company = state.analysis.jd?.company || '未知';
  const position = state.analysis.jd?.position || '面试';
  exportMarkdown(`${company} ${position} 押题清单`, '', sections);
}

async function exportCurrentQuestionsDocx() {
  if (!state.analysis) return toast('请先完成分析');
  const qs = (state.analysis.questions || []).concat(state.analysis.kb_supplement || []).concat(state.analysis.mianjing || []);
  if (!qs.length) return toast('没有题目可导出');
  const sections = {};
  sections['押题清单'] = qs.map((q,i) => `${i+1}. [${q.type||'通用'}] ${q.question}\n   🎯 ${q.examiner_intent || ''}${q.sample_answer_points?.length ? '\n   💡 ' + q.sample_answer_points.join(' / ') : ''}${q.tips?.length ? '\n   🔧 ' + q.tips.join(' / ') : ''}`).join('\n\n');
  const company = state.analysis.jd?.company || '未知';
  const position = state.analysis.jd?.position || '面试';
  await exportDocx(`${company} ${position} 押题清单`, '', sections);
}

function exportPracticeHistoryMD() {
  const el = $('#phrase-panel');
  if (!el || el.classList.contains('hidden')) { 
    // Force load phrases
    loadPhrasesForExport().then(phrases => {
      if (!phrases.length) return toast('暂无练习记录');
      const sections = {};
      sections['练习历史'] = phrases.map((p,i) => `${i+1}. **${p.question||''}** (${p.score||0}分)\n   回答: ${(p.answer||'').slice(0, 200)}${(p.answer||'').length>200?'...':''}\n   ${p.improvedVersion ? '改进版: ' + p.improvedVersion + '\n' : ''}${p.keyTakeaways ? '关键点: ' + p.keyTakeaways : ''}`).join('\n\n');
      exportMarkdown('练习历史记录', '', sections);
    });
    return;
  }
  // Read from rendered DOM
  const items = document.querySelectorAll('#phrase-list .phrase-item');
  if (!items.length) return toast('暂无练习记录');
  const sections = {};
  sections['练习历史'] = Array.from(items).map((item, i) => {
    const qEl = item.querySelector('.phrase-q');
    const aEl = item.querySelector('.phrase-a');
    const scoreEl = item.querySelector('.phrase-score');
    return `${i+1}. ${qEl?.textContent?.replace(/^Q:\s*/,'')||''} (${scoreEl?.textContent||'0分'})\n   ${aEl?.textContent?.slice(0,300)||''}`;
  }).join('\n\n');
  exportMarkdown('练习历史记录', '', sections);
}

async function loadPhrasesForExport() {
  try {
    const data = await fetchRetry('/api/phrases?tag=练习');
    return data.phrases || [];
  } catch { return []; }
}

function exportInterviewReportMD() {
  const reportEl = $('#interview-report');
  if (!reportEl || reportEl.classList.contains('hidden')) return toast('暂无面试报告可导出');
  const sections = {};
  sections['面试报告'] = reportEl.innerText;
  exportMarkdown('面试评估报告', '', sections);
}

async function exportInterviewReportDocx() {
  const reportEl = $('#interview-report');
  const reportText = reportEl?.innerText || '';
  if (!reportText) return toast('暂无面试报告可导出');
  await exportDocx('面试评估报告', reportText);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
  toast('✅ 已导出 ' + filename);
}

// 导出按钮事件绑定
(function() {
  const btnQMd = document.getElementById('btn-export-questions-md');
  const btnQDocx = document.getElementById('btn-export-questions-docx');
  const btnPMd = document.getElementById('btn-export-practice-md');
  const btnIMd = document.getElementById('btn-export-interview-md');
  const btnIDocx = document.getElementById('btn-export-interview-docx');
  
  if (btnQMd) btnQMd.addEventListener('click', exportCurrentQuestionsMD);
  if (btnQDocx) btnQDocx.addEventListener('click', exportCurrentQuestionsDocx);
  if (btnPMd) btnPMd.addEventListener('click', exportPracticeHistoryMD);
  if (btnIMd) btnIMd.addEventListener('click', exportInterviewReportMD);
  if (btnIDocx) btnIDocx.addEventListener('click', exportInterviewReportDocx);
})();

// ============================================================
(async () => {
  await refreshSessionList();

  // 公司调研按钮
  $('#btn-company-research')?.addEventListener('click', () => doCompanyResearch());
  $('#btn-jd-format')?.addEventListener('click', () => reformatJdInTextarea());

  try {
    const h = await fetchRetry('/api/health').then(r => r.json());

    // 状态栏 — 同步更新 opencli 状态
    const oc = h.opencli || {};
    let statusParts = [];
    if (h.provider && h.provider !== '未连接' && h.provider !== '未配置激活连接') {
      statusParts.push('✅ ' + h.provider);
    } else {
      statusParts.push('⚠️ 未配置AI — 点击 ⚙️ 设置');
    }
    if (!oc.installed) {
      statusParts.push('❌ opencli 未安装');
    } else if (!oc.browser_ready) {
      statusParts.push('⚠️ 浏览器未绑定');
    }
    // Token 用量
    const usage = h.usage;
    if (usage && usage.total > 0) {
      const k = usage.total >= 1000 ? (usage.total / 1000).toFixed(1) + 'k' : usage.total;
      statusParts.push(`📊 ${k} tokens`);
    }
    setStatus(statusParts.join(' · '));
} catch { setStatus('\u26aa 就绪 — 请填写JD和简历开始'); }

})();
  // ============================================================
  // 专项训练模块
  // ============================================================
  function renderDrillMode() {
    document.querySelectorAll('.drill-mode-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.mode === state._drillMode);
    });
    loadDrillTypeFilter();
    renderDrillQuestions();
  }

  function loadDrillTypeFilter() {
    var allQs = getAllDrillQuestions();
    var types = {};
    allQs.forEach(function(q) { var t = q.type || '其他'; types[t] = (types[t] || 0) + 1; });
    var filterEl = document.getElementById('drill-filter');
    if (!filterEl) return;
    var html = '<button class="btn-filter drill-filter-btn active" data="">全部 (' + allQs.length + ')</button>';
    Object.keys(types).forEach(function(t) {
      html += '<button class="btn-filter drill-filter-btn" data="' + t + '">' + t + ' (' + types[t] + ')</button>';
    });
    filterEl.innerHTML = html;
    document.querySelectorAll('.drill-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.drill-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state._drillType = btn.dataset.type;
        renderDrillQuestions();
      });
    });
  }

  function getAllDrillQuestions() {
    if (!state.analysis) return [];
    var qs = state.analysis.questions || [];
    var kb = state.analysis.kb_supplement || [];
    var mj = state.analysis.mianjing || [];
    var all = [];
    qs.forEach(function(q) { all.push(Object.assign({}, q, { _source: '' })); });
    kb.forEach(function(q) { all.push(Object.assign({}, q, { _source: '知识库' })); });
    mj.forEach(function(q) { all.push(Object.assign({}, q, { _source: '面经' })); });
    return all;
  }

  function renderDrillQuestions() {
    var allQs = getAllDrillQuestions();
    var drillEmpty = document.getElementById('drill-empty');
    var drillArea = document.getElementById('drill-area');
    if (!allQs.length) {
      if (drillEmpty) drillEmpty.classList.remove('hidden');
      if (drillArea) drillArea.classList.add('hidden');
      return;
    }
    if (drillEmpty) drillEmpty.classList.add('hidden');
    if (drillArea) drillArea.classList.remove('hidden');
    var filtered = state._drillType ? allQs.filter(function(q) { return (q.type || '') === state._drillType; }) : allQs;
    var listEl = document.getElementById('drill-question-list');
    var countEl = document.getElementById('drill-q-count');
    if (countEl) countEl.textContent = filtered.length;
    listEl.innerHTML = filtered.map(function(q, i) {
      var source = q._source ? '<span style="font-size:0.65rem;color:var(--accent);margin-right:4px;">' + q._source + '</span>' : '';
      return '<li data-question="' + encodeURIComponent(q.question || '') + '">' +
        '<span class="num">' + (i + 1) + '</span>' + source + (q.question || '') + '</li>';
    }).join('');
    listEl.querySelectorAll('li').forEach(function(li) {
      li.addEventListener('click', function() { selectDrillQuestion(decodeURIComponent(li.dataset.question)); });
    });
  }

  function selectDrillQuestion(question) {
    var allQs = getAllDrillQuestions();
    var found = null;
    for (var i = 0; i < allQs.length; i++) {
      if (allQs[i].question === question) { found = allQs[i]; break; }
    }
    if (!found) {
      for (var j = 0; j < allQs.length; j++) {
        if (allQs[j].question.indexOf(question) !== -1 || (question && question.indexOf(allQs[j].question) !== -1)) {
          found = allQs[j]; break;
        }
      }
    }
    state._drillQuestion = question;
    state._drillFeedback = null;
    clearDrillTimer();
    var taskCard = document.getElementById('drill-task-card');
    var taskType = document.getElementById('drill-task-type');
    var taskQ = document.getElementById('drill-task-question');
    var taskPoints = document.getElementById('drill-task-points');
    if (found) {
      taskType.innerHTML = '<span class="' + getTypeClass(found.type) + '">' + (found.type || '') + '</span>';
      taskQ.textContent = found.question || question;
      taskPoints.innerHTML = '<strong>回答要点：</strong>使用 STAR 框架，量化成果，突出你的贡献，控制在 2 分钟内';
    } else {
      taskType.innerHTML = '<span>题目</span>';
      taskQ.textContent = question || '';
      taskPoints.innerHTML = '<strong>回答要点：</strong>使用 STAR 框架，量化成果，突出你的贡献';
    }
    taskCard.style.display = 'block';
    document.getElementById('drill-timer-card').style.display = 'block';
    document.getElementById('drill-answer-card').style.display = 'none';
    document.getElementById('drill-feedback').classList.add('hidden');
    document.getElementById('drill-history-card').style.display = 'none';
    document.getElementById('btn-drill-retry').classList.add('hidden');
    document.getElementById('drill-timer-phase').textContent = '准备作答';
    document.getElementById('drill-timer-display').textContent = '0:30';
    document.getElementById('drill-timer-display').className = '';
    document.getElementById('drill-timer-actions').style.display = 'flex';
    document.getElementById('drill-answer').value = '';
    loadDrillAttemptInfo(question);
    loadDrillHistory(question);
    document.querySelectorAll('#drill-question-list li').forEach(function(li) {
      var liQ = decodeURIComponent(li.dataset.question || '');
      li.classList.toggle('active', liQ === question);
    });
    var idx = -1;
    for (var k = 0; k < allQs.length; k++) { if (allQs[k].question === question) { idx = k; break; } }
    var currentEl = document.getElementById('drill-current-type');
    if (currentEl) currentEl.textContent = '当前：第 ' + (idx + 1) + ' / ' + allQs.length + ' 题';
    setTimeout(function() {
      document.getElementById('drill-task-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  async function loadDrillAttemptInfo(question) {
    try {
      var data = await fetchRetry('/api/drill/records?question=' + encodeURIComponent(question)).then(function(r) { return r.json(); });
      var total = data.total || 0;
      var el = document.getElementById('drill-attempt-info');
      if (!el) return;
      if (total > 0) {
        var latest = data.records[0];
        el.innerHTML = '已练习 <b>' + total + '</b> 次' + (latest ? ' · 上次 ' + latest.overallScore + '分' : '');
      } else {
        el.textContent = '首次练习';
      }
    } catch(e) { /* ignore */ }
  }

  // ===== Timer =====
  document.getElementById('btn-drill-start-prepare').addEventListener('click', function() {
    startDrillTimer('prepare', 30);
  });
  document.getElementById('btn-drill-skip-prepare').addEventListener('click', function() {
    startDrillTimer('answer', 120);
  });
  function clearDrillTimer() {
    if (state._drillTimer) {
      clearInterval(state._drillTimer);
      state._drillTimer = null;
      state._drillPhase = null;
    }
  }
  function startDrillTimer(phase, seconds) {
    clearDrillTimer();
    state._drillPhase = phase;
    var display = document.getElementById('drill-timer-display');
    var phaseEl = document.getElementById('drill-timer-phase');
    var actions = document.getElementById('drill-timer-actions');
    var answerCard = document.getElementById('drill-answer-card');
    var answerTimer = document.getElementById('drill-answer-timer');
    actions.style.display = 'none';
    display.className = '';
    if (phase === 'prepare') {
      phaseEl.textContent = '准备时间 — 思考你的回答结构';
      answerCard.style.display = 'none';
    } else {
      phaseEl.textContent = '作答时间 — 开始回答';
      answerCard.style.display = 'block';
      document.getElementById('drill-answer').focus();
    }
    var remaining = seconds;
    var updateDisplay = function() {
      var mins = Math.floor(remaining / 60);
      var secs = remaining % 60;
      display.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      if (remaining <= 10) display.className = 'danger';
      else if (remaining <= 20) display.className = 'warning';
      if (phase === 'answer' && answerTimer) {
        answerTimer.textContent = '（剩余 ' + mins + ':' + (secs < 10 ? '0' : '') + secs + '）';
      }
    };
    updateDisplay();
    state._drillTimer = setInterval(function() {
      remaining--;
      updateDisplay();
      if (remaining <= 0) {
        clearDrillTimer();
        if (phase === 'prepare') {
          phaseEl.textContent = '准备时间结束，开始作答';
          startDrillTimer('answer', 120);
        } else {
          phaseEl.textContent = '时间到！';
          display.className = 'danger';
          if (answerTimer) answerTimer.textContent = '（时间到）';
        }
      }
    }, 1000);
  }

  // ===== Submit =====
  document.getElementById('btn-drill-submit').addEventListener('click', async function() {
    var answer = document.getElementById('drill-answer').value.trim();
    var question = state._drillQuestion;
    if (!question) { toast('请先选择一道题目'); return; }
    if (!answer || answer.length < 5) { toast('请写下你的回答（至少5个字）'); return; }
    var btn = document.getElementById('btn-drill-submit');
    btn.disabled = true; btn.textContent = '评估中...';
    setStatus('评估中...');
    try {
      clearDrillTimer();
      var jd = state.analysis ? (state.analysis.jd || {}) : {};
      var jdSummary = jd.position
        ? (jd.company || '') + ' ' + jd.position + ' | ' + (jd.requirements || jd.responsibilities || '')
        : (jd.requirements || jd.responsibilities || '');
      var resumeText = (state.resumeText || '').slice(0, 3000);
      var result = await apiEvaluateSingle(question, answer, jdSummary, resumeText);
      state._drillFeedback = result;
      renderDrillFeedback(result);
      var allQs = getAllDrillQuestions();
      var found = null;
      for (var i = 0; i < allQs.length; i++) { if (allQs[i].question === question) { found = allQs[i]; break; } }
      var questionType = found ? (found.type || '') : '';
      await saveDrillRecord(question, questionType, answer, result);
      // 同时保存到话术库（练习历史），确保仪表盘和练习历史都能看到
      await autoSavePracticeRecord(question, answer, result);
      document.getElementById('btn-drill-retry').classList.remove('hidden');
      loadDrillAttemptInfo(question);
      loadDrillHistory(question);
      showTabDot('drill');
      setStatus('评估完成');
      // 追问按钮
      showFollowUpButton('drill', question, answer, result);
    } catch (e) {
      toast('评估失败: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = '重新提交';
    }
  });

  async function saveDrillRecord(question, questionType, answer, result) {
    try {
      var sc = result.scores || {};
      var scores = {
        star_completeness: sc.star_completeness || 0,
        quantification: sc.quantification || 0,
        position_match: sc.position_match || 0,
        structure: sc.structure || 0,
        highlight: sc.highlight || 0
      };
      await fetchRetry('/api/drill/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question, questionType: questionType, answer: answer, scores: scores,
          overallScore: result.overall_score || result.over_score || 0,
          improvedVersion: result.improved_version || '',
          keyTakeaways: result.key_takeaways || [],
          lineByLine: result.line_by_line || []
        })
      });
    } catch(e) { /* silent */ }
  }

  function renderDrillFeedback(data) {
    var scores = data.scores || {};
    var lines = data.line_by_line || [];
    var fb = document.getElementById('drill-feedback');
    fb.classList.remove('hidden');
    var labelMap = {star_completeness: 'STAR', quantification: '量化', position_match: '匹配', structure: '结构', highlight: '亮点'};
    fb.innerHTML = '<div class="card feedback-card">' +
      '<h3>评估结果 — 综合 ' + (data.overall_score || data.over_score || '--') + '分</h3>' +
      '<div class="feedback-scores">' +
      ['star_completeness', 'quantification', 'position_match', 'structure', 'highlight'].map(function(k) {
        return '<div class="feedback-score"><div class="num">' + (scores[k] || '--') + '</div><div class="label">' + labelMap[k] + '</div></div>';
      }).join('') +
      '</div>' +
      '<div class="feedback-lines">' + lines.map(function(l) {
        return '<div class="feedback-line ' + (l.is_good ? 'good' : 'bad') + '">' +
        (l.is_good ? '✓' : '✗') + ' "' + (l.quote || '') + '" — ' + (l.comment || '') + '</div>';
      }).join('') + '</div>' +
      (data.improved_version ? '<div class="feedback-improved"><strong>改进参考：</strong><br>' + data.improved_version + '</div>' : '') +
      (data.key_takeaways ? '<div style="font-size:0.82rem;color:var(--muted);"><strong>关键改进点：</strong>' + (Array.isArray(data.key_takeaways) ? data.key_takeaways.join('；') : data.key_takeaways) + '</div>' : '') +
      '</div>';
    fb.scrollIntoView({ behavior: 'smooth' });
  }

  // ===== Retry =====
  document.getElementById('btn-drill-retry').addEventListener('click', function() {
    document.getElementById('drill-answer').value = '';
    document.getElementById('drill-feedback').classList.add('hidden');
    document.getElementById('btn-drill-retry').classList.add('hidden');
    document.getElementById('drill-timer-card').style.display = 'block';
    document.getElementById('drill-timer-phase').textContent = '准备作答';
    document.getElementById('drill-timer-display').textContent = '0:30';
    document.getElementById('drill-timer-display').className = '';
    document.getElementById('drill-timer-actions').style.display = 'flex';
    document.getElementById('drill-answer-card').style.display = 'none';
    document.getElementById('drill-task-card').scrollIntoView({ behavior: 'smooth' });
  });

  // ===== Skip =====
  document.getElementById('btn-drill-skip').addEventListener('click', function() {
    var allQs = getAllDrillQuestions();
    var filtered = state._drillType ? allQs.filter(function(q) { return (q.type || '') === state._drillType; }) : allQs;
    var currentIdx = -1;
    for (var i = 0; i < filtered.length; i++) { if (filtered[i].question === state._drillQuestion) { currentIdx = i; break; } }
    var nextIdx = (currentIdx + 1) % filtered.length;
    if (filtered[nextIdx]) {
      selectDrillQuestion(filtered[nextIdx].question);
    }
  });

  // ===== Mode Switch =====
  document.querySelectorAll('.drill-mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state._drillMode = btn.dataset.mode;
      renderDrillMode();
    });
  });

  // ===== Drill History =====
  async function loadDrillHistory(question) {
    var card = document.getElementById('drill-history-card');
    var list = document.getElementById('drill-history-list');
    if (!card || !list) return;
    try {
      var data = await fetchRetry('/api/drill/records?question=' + encodeURIComponent(question)).then(function(r) { return r.json(); });
      var records = data.records || [];
      if (records.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      list.innerHTML = records.map(function(r, i) {
        var prev = records[i + 1];
        var trend = '';
        if (prev) {
          var diff = (r.overallScore || 0) - (prev.overallScore || 0);
          if (diff > 0) trend = '<span class="drill-score-trend-up">↑' + diff + '</span>';
          else if (diff < 0) trend = '<span class="drill-score-trend-down">↓' + Math.abs(diff) + '</span>';
          else trend = '<span class="drill-score-trend-same">→</span>';
        }
        var date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') + ' ' + new Date(r.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        return '<div class="drill-history-item">' +
          '<span class="drill-attempt-badge">#' + (r.attemptNumber || '-') + '</span>' +
          '<span style="flex:1;">' + date + '</span>' +
          '<span style="font-weight:700;font-size:1.1rem;color:var(--accent);">' + (r.overallScore || '-') + '分</span>' +
          trend + '</div>';
      }).join('');
      var chartEl = document.getElementById('drill-history-chart');
      if (chartEl && typeof echarts !== 'undefined') {
        renderDrillHistoryChart(chartEl, records);
      }
    } catch(e) { card.style.display = 'none'; }
  }

  function renderDrillHistoryChart(el, records) {
    var sorted = [].concat(records).reverse();
    var labels = sorted.map(function(r, i) { return '#' + (i + 1); });
    var scores = sorted.map(function(r) { return r.overallScore || 0; });
    if (typeof echarts === 'undefined') {
      el.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem;">图表加载中...</p>';
      return;
    }
    var chart = echarts.init(el);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 11 } },
      series: [{
        data: scores, type: 'line', smooth: true,
        lineStyle: { color: '#4F46E5', width: 2 },
        itemStyle: { color: '#4F46E5' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(79,70,229,0.2)' }, { offset: 1, color: 'rgba(79,70,229,0.02)' }] } },
        markLine: { silent: true, data: [{ yAxis: 60, lineStyle: { color: '#F59E0B', type: 'dashed' }, label: { formatter: '及格线 60' } }] }
      }]
    });
    var resizeFn = function() { try { chart.resize(); } catch(e) {} };
    window.addEventListener('resize', resizeFn);
    el._chart = chart;
    el._resizeFn = resizeFn;
  }

  // ===== Drill Stats =====
  function loadDrillStats() {
    var panel = document.getElementById('drill-stats-panel');
    var content = document.getElementById('drill-stats-content');
    if (!panel || !content) return;
    panel.addEventListener('toggle', function() {
      if (panel.open && !content.dataset.loaded) {
        content.dataset.loaded = '1';
        fetchRetry('/api/drill/stats').then(function(r) { return r.json(); }).then(function(data) {
          var html = '<div class="drill-stats-grid">' +
            '<div class="drill-stat-card"><div class="num">' + (data.totalDrills || 0) + '</div><div class="label">总训练次数</div></div>';
          Object.keys(data.typeStats || {}).forEach(function(t) {
            var s = data.typeStats[t];
            html += '<div class="drill-stat-card"><div class="num">' + s.avgScore + '</div><div class="label">' + t + '平均分</div></div>';
          });
          html += '</div>';
          if (data.topQuestions && data.topQuestions.length > 0) {
            html += '<h4 style="margin-bottom:0.5rem;">刻意练习最多</h4>';
            data.topQuestions.forEach(function(q) {
              var trendIcon = q.trend > 0 ? ' <span class="drill-score-trend-up">↑' + q.trend + '</span>' :
                q.trend < 0 ? ' <span class="drill-score-trend-down">↓' + Math.abs(q.trend) + '</span>' : '';
              html += '<div class="drill-history-item">' +
                '<span class="drill-attempt-badge">' + q.attemptCount + '次</span>' +
                '<span style="flex:1;font-size:0.82rem;">' + (q.question || '').slice(0, 60) + '</span>' +
                '<span style="font-size:0.78rem;color:var(--muted);">' + q.firstScore + '→' + q.latestScore + '</span>' +
                trendIcon + '</div>';
            });
          }
          content.innerHTML = html;
        }).catch(function(e) { content.innerHTML = '<p style="color:var(--muted);">加载失败</p>'; });
      }
    });
  }

  // ===== Drill Answer Auto-resize =====
  (function() {
    var ta = document.getElementById('drill-answer');
    if (ta) {
      ta.addEventListener('input', debounce(function() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(100, ta.scrollHeight) + 'px';
      }, 300));
    }
  })();

// ===== Voice Recording =====
  var voiceBtn = document.getElementById('btn-drill-voice');
  var voiceStatus = document.getElementById('drill-voice-status');
  var voiceRecognition = null;
  var voiceIsRecording = false;

  if (voiceBtn) {
    // Check browser support
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      voiceBtn.style.display = 'flex';
      voiceBtn.addEventListener('click', function() {
        if (voiceIsRecording) {
          stopVoiceRecording();
        } else {
          startVoiceRecording();
        }
      });

      function startVoiceRecording() {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'zh-CN';
        voiceRecognition.interimResults = true;
        voiceRecognition.continuous = true;
        voiceRecognition.maxAlternatives = 1;

        var finalTranscript = '';
        var ta = document.getElementById('drill-answer');

        voiceRecognition.onresult = function(event) {
          var interim = '';
          for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          ta.value = (finalTranscript + interim).trim();
          ta.style.height = 'auto';
          ta.style.height = Math.max(100, ta.scrollHeight) + 'px';
        };

        voiceRecognition.onerror = function(event) {
          if (event.error === 'no-speech') return;
          console.warn('Speech recognition error:', event.error);
          stopVoiceRecording();
          if (event.error === 'not-allowed') {
            toast('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
          }
        };

        voiceRecognition.onend = function() {
          if (voiceIsRecording) {
            // Auto-restart for continuous recording
            try { voiceRecognition.start(); } catch(e) {}
          }
        };

        try {
          voiceRecognition.start();
          voiceIsRecording = true;
          voiceBtn.classList.add('recording');
          voiceBtn.textContent = '⏹';
          if (voiceStatus) voiceStatus.style.display = 'block';
          // Also start the answer timer if not already started
          var answerCard = document.getElementById('drill-answer-card');
          if (answerCard && answerCard.style.display === 'block' && !state._drillTimer) {
            startDrillTimer('answer', 120);
          }
        } catch(e) {
          toast('语音识别启动失败: ' + e.message);
        }
      }

      function stopVoiceRecording() {
        voiceIsRecording = false;
        if (voiceRecognition) {
          try { voiceRecognition.stop(); } catch(e) {}
          voiceRecognition = null;
        }
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = '🎤';
        if (voiceStatus) voiceStatus.style.display = 'none';
      }
    } else {
      voiceBtn.style.display = 'none';
      console.log('Speech Recognition not supported in this browser');
    }
  }

  // ===== Smart Recommendation =====
  var smartBtn = document.createElement('button');
  smartBtn.className = 'drill-smart-btn';
  smartBtn.textContent = '🎯 智能推荐';
  smartBtn.style.display = 'none';
  smartBtn.addEventListener('click', function() {
    var isActive = smartBtn.classList.toggle('active');
    if (isActive) {
      loadSmartRecommendation();
    } else {
      state._drillType = '';
      renderDrillQuestions();
      // Reset filter buttons
      document.querySelectorAll('.drill-filter-btn').forEach(function(b) { b.classList.remove('active'); });
      var allBtn = document.querySelector('.drill-filter-btn[data=""]');
      if (allBtn) allBtn.classList.add('active');
    }
  });

  var filterContainer = document.getElementById('drill-filter');
  if (filterContainer) {
    filterContainer.parentNode.insertBefore(smartBtn, filterContainer.nextSibling);
  }

  async function loadSmartRecommendation() {
    try {
      smartBtn.textContent = '⏳ 分析中...';
      var data = await fetchRetry('/api/drill/weakness').then(function(r) { return r.json(); });
      var weakQs = data.weakQuestions || [];
      if (weakQs.length === 0) {
        toast('暂无足够数据，请先完成几次练习');
        smartBtn.classList.remove('active');
        smartBtn.textContent = '🎯 智能推荐';
        return;
      }
      state._smartQuestions = weakQs.map(function(q) { return q.question; });
      renderDrillQuestions();
      smartBtn.textContent = '🎯 智能推荐 (' + weakQs.length + '题)';
    } catch(e) {
      toast('智能推荐加载失败');
      smartBtn.classList.remove('active');
      smartBtn.textContent = '🎯 智能推荐';
    }
  }

  // Override getAllDrillQuestions to support smart sort
  var _origGetAllDrillQuestions = getAllDrillQuestions;
  getAllDrillQuestions = function() {
    var all = _origGetAllDrillQuestions();
    if (smartBtn.classList.contains('active') && state._smartQuestions && state._smartQuestions.length > 0) {
      var smartSet = {};
      state._smartQuestions.forEach(function(q, i) { smartSet[q] = i; });
      all.sort(function(a, b) {
        var aIdx = smartSet.hasOwnProperty(a.question) ? smartSet[a.question] : 999;
        var bIdx = smartSet.hasOwnProperty(b.question) ? smartSet[b.question] : 999;
        return aIdx - bIdx;
      });
    }
    return all;
  };

  // ===== Weakness Card on Dashboard =====
  var _origLoadDashboard = loadDashboard;
  loadDashboard = async function() {
    await _origLoadDashboard();
    renderWeaknessCard();
  };

  async function renderWeaknessCard() {
    var container = document.getElementById('tab-dashboard');
    if (!container) return;
    // Remove existing weakness card
    var existing = document.getElementById('dash-weakness-card');
    if (existing) existing.remove();

    try {
      var data = await fetchRetry('/api/drill/weakness').then(function(r) { return r.json(); });
      var weaknesses = data.weaknesses || [];
      if (weaknesses.length === 0) return;

      var card = document.createElement('div');
      card.id = 'dash-weakness-card';
      card.className = 'card weakness-card';
      var emojiMap = { star_completeness: '📋', quantification: '📊', position_match: '🎯', structure: '🗂️', highlight: '✨' };

      var html = '<h3 style="margin-bottom:0.8rem;">⚠️ 待提升维度</h3>';
      weaknesses.forEach(function(w) {
        var pct = Math.max(5, w.avgScore);
        html += '<div class="weakness-dim">' +
          '<span class="weakness-dim-label">' + (emojiMap[w.key] || '') + ' ' + w.label + '</span>' +
          '<div class="weakness-dim-bar"><div class="weakness-dim-fill" style="width:' + pct + '%;"></div></div>' +
          '<span class="weakness-dim-score">' + w.avgScore + '分</span>' +
          '</div>';
      });
      html += '<p style="font-size:0.75rem;color:var(--muted);margin-top:0.5rem;">💡 去「专项训练」使用「智能推荐」针对性练习</p>';

      card.innerHTML = html;
      var statsEl = document.getElementById('dash-stats');
      if (statsEl) {
        statsEl.parentNode.insertBefore(card, statsEl.nextSibling);
      } else {
        container.appendChild(card);
      }
    } catch(e) { /* ignore */ }
  }

  

// ============================================================
// P1: Custom Question Management
// ============================================================
(function() {
  var customPanel = document.getElementById('custom-question-panel');
  if (!customPanel) return;

  customPanel.addEventListener('toggle', function() {
    if (customPanel.open) loadCustomQuestionList();
  });

  document.getElementById('btn-custom-q-add').addEventListener('click', async function() {
    var text = document.getElementById('custom-q-text').value.trim();
    var type = document.getElementById('custom-q-type').value;
    if (!text) { toast('请输入题目内容'); return; }
    try {
      await fetchRetry('/api/custom-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, type: type })
      });
      document.getElementById('custom-q-text').value = '';
      toast('题目已添加');
      loadCustomQuestionList();
      if (typeof renderDrillQuestions === 'function') renderDrillQuestions();
      if (typeof renderPracticeQuestions === 'function') renderPracticeQuestions();
    } catch(e) { toast('添加失败: ' + e.message); }
  });

  async function loadCustomQuestionList() {
    var el = document.getElementById('custom-q-list');
    try {
      var data = await fetchRetry('/api/custom-questions').then(function(r) { return r.json(); });
      var qs = data.questions || [];
      if (qs.length === 0) {
        el.innerHTML = '<p style=\"color:var(--muted);\">暂无自定义题目，在上方添加</p>';
        return;
      }
      el.innerHTML = qs.map(function(q) {
        return '<div class=\"custom-q-item\">' +
          '<span style=\"flex:1;\">[' + (q.type || '') + '] ' + (q.question || '') + '</span>' +
          '<button class=\"custom-q-del\" data-id=\"' + q.id + '\">x</button>' +
          '</div>';
      }).join('');
      el.querySelectorAll('.custom-q-del').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
          e.stopPropagation();
          var id = btn.dataset.id;
          try {
            await fetchRetry('/api/custom-questions/' + id, { method: 'DELETE' });
            loadCustomQuestionList();
            if (typeof renderDrillQuestions === 'function') renderDrillQuestions();
            if (typeof renderPracticeQuestions === 'function') renderPracticeQuestions();
          } catch(e) { toast('删除失败'); }
        });
      });
    } catch(e) { el.innerHTML = '<p style=\"color:var(--red);\">加载失败</p>'; }
  }

  // Load custom questions eagerly into state for sync access
  (async function() {
    try {
      var data = await fetchRetry('/api/custom-questions').then(function(r) { return r.json(); });
      state._customQuestions = (data.questions || []).map(function(q) {
        return {
          question: q.question,
          type: q.type || '自定义',
          category: q.category || '',
          examiner_intent: q.examiner_intent || '',
          difficulty: q.difficulty || '中等',
          _source: '自定义'
        };
      });
    } catch(e) { state._customQuestions = []; }
  })();

  // Patch getAllDrillQuestions to include custom questions (sync, not async)
  if (typeof getAllDrillQuestions === 'function') {
    var _origGetAllDrill = getAllDrillQuestions;
    getAllDrillQuestions = function() {
      var all = _origGetAllDrill();
      if (state._customQuestions && state._customQuestions.length > 0) {
        all = all.concat(state._customQuestions);
      }
      return all;
    };
  }
})();

// ============================================================
// P2: Review Cards (Flashcard)
// ============================================================
(function() {
  var reviewCards = [];
  var reviewIndex = 0;
  var reviewCard = document.getElementById('review-card');
  var reviewSection = document.getElementById('review-cards-section');

  async function loadReviewCards() {
    try {
      var data = await fetchRetry('/api/review/cards').then(function(r) { return r.json(); });
      reviewCards = data.cards || [];
      if (reviewCards.length === 0) {
        if (reviewSection) reviewSection.style.display = 'none';
        return;
      }
      if (reviewSection) reviewSection.style.display = 'block';
      reviewIndex = 0;
      renderReviewCard();
    } catch(e) {
      if (reviewSection) reviewSection.style.display = 'none';
    }
  }

  function renderReviewCard() {
    if (!reviewCard || reviewCards.length === 0) return;
    var card = reviewCards[reviewIndex];
    var indexEl = document.getElementById('review-card-index');
    if (indexEl) indexEl.textContent = (reviewIndex + 1) + '/' + reviewCards.length;

    document.getElementById('review-card-type').textContent = card.questionType || '题目';
    document.getElementById('review-card-question').textContent = card.question || '';

    var sc = card.latestScores || {};
    var dimLabels = { star_completeness: 'STAR', quantification: '量化', position_match: '匹配', structure: '结构', highlight: '亮点' };
    var scoresHtml = Object.keys(dimLabels).map(function(k) {
      var v = sc[k] || 0;
      var cls = v < 60 ? ' weak' : '';
      return '<span class=\"review-score-item' + cls + '\">' + dimLabels[k] + ': ' + v + '</span>';
    }).join('');
    document.getElementById('review-card-scores').innerHTML = scoresHtml;
    document.getElementById('review-card-improved').innerHTML = '<strong>改进参考：</strong><br>' + (card.latestImproved || '暂无');
    var takeaways = card.latestTakeaways || [];
    document.getElementById('review-card-takeaways').innerHTML = takeaways.length > 0 ?
      '<strong>关键改进点：</strong><ul>' + takeaways.map(function(t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' :
      '<strong>关键改进点：</strong>暂无';
  }

  if (reviewCard) {
    reviewCard.addEventListener('click', function() {
      reviewCard.classList.toggle('flipped');
    });
  }

  document.getElementById('btn-review-prev').addEventListener('click', function(e) {
    e.stopPropagation();
    if (reviewCards.length === 0) return;
    reviewIndex = (reviewIndex - 1 + reviewCards.length) % reviewCards.length;
    if (reviewCard) reviewCard.classList.remove('flipped');
    renderReviewCard();
  });

  document.getElementById('btn-review-next').addEventListener('click', function(e) {
    e.stopPropagation();
    if (reviewCards.length === 0) return;
    reviewIndex = (reviewIndex + 1) % reviewCards.length;
    if (reviewCard) reviewCard.classList.remove('flipped');
    renderReviewCard();
  });

  if (typeof loadDashboard === 'function') {
    var _origLoadDashboard2 = loadDashboard;
    loadDashboard = async function() {
      await _origLoadDashboard2();
      loadReviewCards();
      loadStudyPlan();
    };
  }
})();

// ============================================================
// P2: Study Plan
// ============================================================
(function() {
  async function loadStudyPlan() {
    try {
      var data = await fetchRetry('/api/study-plan').then(function(r) { return r.json(); });
      var plan = data.plan || {};
      var empty = document.getElementById('study-plan-empty');
      var active = document.getElementById('study-plan-active');

      if (!plan.targetDate) {
        if (empty) empty.style.display = 'block';
        if (active) active.style.display = 'none';
        return;
      }

      if (empty) empty.style.display = 'none';
      if (active) active.style.display = 'block';

      var days = data.daysRemaining || 0;
      document.getElementById('study-countdown').textContent = days + '天';
      document.getElementById('study-streak').textContent = data.streak || 0;
      document.getElementById('study-today').textContent = (data.todayCount || 0) + '/' + (data.todayGoal || 5);

      var pct = Math.min(100, data.progress || 0);
      document.getElementById('study-progress-fill').style.width = pct + '%';
      document.getElementById('study-progress-text').textContent = '总进度 ' + pct + '%';

      document.getElementById('study-target-date').value = plan.targetDate ? plan.targetDate.slice(0, 10) : '';
      document.getElementById('study-daily-goal').value = plan.dailyGoal || 5;
    } catch(e) { /* ignore */ }
  }

  document.getElementById('btn-study-plan-save').addEventListener('click', async function() {
    var targetDate = document.getElementById('study-target-date').value;
    var dailyGoal = parseInt(document.getElementById('study-daily-goal').value) || 5;
    if (!targetDate) { toast('请选择目标面试日期'); return; }
    try {
      await fetchRetry('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: targetDate, dailyGoal: dailyGoal })
      });
      toast('计划已保存');
      loadStudyPlan();
    } catch(e) { toast('保存失败: ' + e.message); }
  });

  document.getElementById('btn-study-plan-edit').addEventListener('click', function() {
    var empty = document.getElementById('study-plan-empty');
    var active = document.getElementById('study-plan-active');
    if (empty) empty.style.display = 'block';
    if (active) active.style.display = 'none';
  });

})();

// ============================================================
// Phase 1: Keyboard Shortcuts
// ============================================================
(function initKeyboardShortcuts() {
  var shortcuts = {
    ' ': function() { var btn = document.getElementById('btn-pause'); if (btn && btn.offsetParent) btn.click(); },
    '1': function() { var el = document.getElementById('score-1'); if (el && el.offsetParent) el.click(); },
    '2': function() { var el = document.getElementById('score-2'); if (el && el.offsetParent) el.click(); },
    '3': function() { var el = document.getElementById('score-3'); if (el && el.offsetParent) el.click(); },
    '4': function() { var el = document.getElementById('score-4'); if (el && el.offsetParent) el.click(); },
    '5': function() { var el = document.getElementById('score-5'); if (el && el.offsetParent) el.click(); },
    'Enter': function() { var btn = document.getElementById('btn-submit-answer'); if (btn && !btn.disabled) btn.click(); },
    'Escape': function() {
      var modal = document.querySelector('.modal-overlay.show');
      if (modal) { var close = modal.querySelector('.modal-close'); if (close) close.click(); else modal.remove(); }
    }
  };
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var handler = shortcuts[e.key];
    if (handler) { e.preventDefault(); handler(); }
  });
  function updateShortcutHints() {
    var existing = document.getElementById('shortcut-hints');
    if (existing) existing.remove();
    var isPractice = document.getElementById('tab-practice') && document.getElementById('tab-practice').classList.contains('active');
    var isInterview = document.getElementById('tab-interview') && document.getElementById('tab-interview').classList.contains('active');
    if (isPractice || isInterview) {
      var hints = document.createElement('div');
      hints.id = 'shortcut-hints';
      hints.style.cssText = 'position:fixed;bottom:12px;right:12px;display:flex;gap:6px;flex-wrap:wrap;z-index:100;pointer-events:none;';
      hints.innerHTML = '<span class="shortcut-tag">Space \u6682\u505C</span><span class="shortcut-tag">1-5 \u8BC4\u5206</span><span class="shortcut-tag">Enter \u63D0\u4EA4</span><span class="shortcut-tag">Esc \u5173\u95ED</span>';
      document.body.appendChild(hints);
    }
  }
  var observer = new MutationObserver(updateShortcutHints);
  document.querySelectorAll('.tab-content').forEach(function(el) { observer.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  updateShortcutHints();
})();

// ============================================================
// Phase 1: Auto Theme
// ============================================================
(function initAutoTheme() {
  var setting = localStorage.getItem('autoTheme');
  if (setting === 'off') return;
  function applyAutoTheme() {
    var hour = new Date().getHours();
    var isDark = hour < 6 || hour >= 18;
    var currentIsDark = document.documentElement.classList.contains('dark');
    if (isDark !== currentIsDark) {
      document.documentElement.classList.toggle('dark', isDark);
      var moonBtn = document.getElementById('btn-toggle-theme');
      if (moonBtn) moonBtn.textContent = isDark ? '\u2600' : '\uD83C\uDF19';
    }
  }
  applyAutoTheme();
  setInterval(applyAutoTheme, 3600000);
  var moonBtn = document.getElementById('btn-toggle-theme');
  if (moonBtn) {
    moonBtn.addEventListener('click', function() {
      localStorage.setItem('autoTheme', 'off');
      setTimeout(function() { localStorage.removeItem('autoTheme'); }, 3600000);
    });
  }
})();

// ============================================================
// Phase 1: Readiness Score
// ============================================================
async function loadReadinessScore() {
  try {
    var resp = await fetch(API + '/dashboard/readiness-score');
    if (!resp.ok) return;
    var data = await resp.json();
    var scoreEl = document.getElementById('readiness-score');
    var levelEl = document.getElementById('readiness-level');
    if (scoreEl) scoreEl.textContent = data.overall;
    if (levelEl) {
      levelEl.textContent = data.level === 'ready' ? 'ready' : data.level === 'approaching' ? 'approaching' : 'need work';
      levelEl.style.color = data.level === 'ready' ? 'var(--green)' : data.level === 'approaching' ? 'var(--accent)' : 'var(--red)';
    }
    var dims = data.dimensions;
    var dimNames = { practice_volume: '\u7EC3\u4E60\u91CF', score_quality: '\u5F97\u5206\u8D28\u91CF', consistency: '\u8FDE\u7EED\u6027', breadth: '\u5E7F\u5EA6', mock_experience: '\u6A21\u62DF\u7ECF\u9A8C', improvement: '\u8FDB\u6B65\u8D8B\u52BF' };
    var dimHTML = '';
    Object.entries(dims).forEach(function(entry) {
      var key = entry[0], val = entry[1];
      var color = val >= 80 ? 'var(--green)' : val >= 50 ? 'var(--accent)' : 'var(--red)';
      dimHTML += '<div style="margin-bottom:4px;"><span style="font-size:0.72rem;color:var(--muted);">' + (dimNames[key]||key) + '</span><div style="background:var(--rule);border-radius:3px;height:6px;margin-top:2px;"><div style="background:' + color + ';border-radius:3px;height:100%;width:' + val + '%;transition:width 0.8s ease;"></div></div></div>';
    });
    var dimEl = document.getElementById('readiness-dimensions');
    if (dimEl) dimEl.innerHTML = dimHTML;
    var sugHTML = '';
    (data.suggestions || []).slice(0, 3).forEach(function(s) { sugHTML += '<div style="font-size:0.76rem;color:var(--muted);margin-bottom:3px;">\uD83D\uDCA1 ' + escapeHtml(s) + '</div>'; });
    var sugEl = document.getElementById('readiness-suggestions');
    if (sugEl) sugEl.innerHTML = sugHTML || '<div style="font-size:0.76rem;color:var(--muted);">\u6682\u65E0\u5EFA\u8BAE</div>';
  } catch (e) { console.warn('Readiness score load failed:', e); }
}

// ============================================================
// Phase 1: Comparison View
// ============================================================
function showComparisonView(question, userAnswer, modelAnswer, feedback) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = '<div class="modal-card" style="max-width:900px;max-height:85vh;overflow-y:auto;">' +
    '<div class="modal-header"><h3>\u56DE\u7B54\u5BF9\u6BD4\u5206\u6790</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">\u2715</button></div>' +
    '<div class="modal-body" style="padding:1rem;">' +
    '<div style="background:var(--bg);border-radius:8px;padding:0.8rem;margin-bottom:1rem;"><strong>\u9898\u76EE: </strong>' + escapeHtml(question) + '</div>' +
    (feedback ? '<div style="background:rgba(200,135,43,0.06);border-radius:8px;padding:0.8rem;margin-bottom:1rem;font-size:0.82rem;"><strong>AI \u70B9\u8BC4: </strong>' + escapeHtml(feedback) + '</div>' : '') +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">' +
    '<div><h4 style="color:var(--muted);margin-bottom:0.5rem;">\u4F60\u7684\u56DE\u7B54</h4><div style="background:var(--bg);border:1px solid var(--rule);border-radius:8px;padding:0.8rem;font-size:0.82rem;line-height:1.7;white-space:pre-line;min-height:100px;">' + escapeHtml(userAnswer || '(\u672A\u4F5C\u7B54)') + '</div></div>' +
    '<div><h4 style="color:var(--accent);margin-bottom:0.5rem;">AI \u6807\u51C6\u7B54\u6848</h4><div style="background:rgba(200,135,43,0.04);border:1px solid rgba(200,135,43,0.15);border-radius:8px;padding:0.8rem;font-size:0.82rem;line-height:1.7;white-space:pre-line;min-height:100px;">' + escapeHtml(modelAnswer || '(\u6682\u65E0)') + '</div></div>' +
    '</div></div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// ============================================================
// Phase 2: Batch Questions
// ============================================================
async function generateBatchQuestions(jdText, resumeText) {
  var btn = document.createElement('button');
  btn.textContent = '\u6279\u91CF\u751F\u621015\u9898';
  btn.className = 'btn-primary';
  btn.style.cssText = 'margin-top:0.5rem;';
  btn.onclick = async function() {
    btn.disabled = true;
    btn.textContent = '\u751F\u6210\u4E2D...';
    try {
      var resp = await fetch(API + '/generate-questions-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jdText: jdText, resumeText: resumeText, count: 15 }) });
      var data = await resp.json();
      if (data.questions && data.questions.length) {
        renderBatchResults(data.questions);
        btn.textContent = '\u5DF2\u5B8C\u6210 ' + data.total + ' \u9898';
      } else { btn.textContent = '\u5931\u8D25\uFF0C\u91CD\u8BD5'; }
    } catch (e) { btn.textContent = '\u7F51\u7EDC\u9519\u8BEF'; }
    btn.disabled = false;
  };
  return btn;
}
function renderBatchResults(questions) {
  var byType = {};
  questions.forEach(function(q) { var t = q._type || '\u5176\u4ED6'; if (!byType[t]) byType[t] = []; byType[t].push(q); });
  var html = '<div class="card" style="margin-top:1rem;"><h3>\u6279\u91CF\u751F\u6210\u7ED3\u679C</h3>';
  Object.entries(byType).forEach(function(entry) {
    var type = entry[0], qs = entry[1];
    html += '<h4 style="margin-top:0.8rem;">' + type + ' (' + qs.length + ' \u9898)</h4>';
    qs.forEach(function(q, i) {
      html += '<div style="background:var(--bg);border-radius:6px;padding:0.6rem;margin-bottom:0.4rem;"><div style="font-weight:600;font-size:0.82rem;">' + (i+1) + '. ' + escapeHtml(q.question) + '</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.3rem;font-size:0.72rem;color:var(--muted);"><span>\u96BE\u5EA6: ' + (q.difficulty||'\u4E2D\u7B49') + '</span><span>\u610F\u56FE: ' + (q.examiner_intent||'--') + '</span></div></div>';
    });
  });
  html += '</div>';
  var container = document.getElementById('batch-questions-container');
  if (container) container.innerHTML = html;
}

// ============================================================
// Phase 2: WrongBook
// ============================================================
async function loadWrongBook() {
  var minScore = (document.getElementById('wrongbook-score-filter') ? document.getElementById('wrongbook-score-filter').value : '60');
  var type = (document.getElementById('wrongbook-type-filter') ? document.getElementById('wrongbook-type-filter').value : '');
  try {
    var resp = await fetch(API + '/drill/wrong-answers?min_score=' + minScore + (type ? '&type=' + encodeURIComponent(type) : ''));
    if (!resp.ok) return;
    var data = await resp.json();
    var statsEl = document.getElementById('wrongbook-stats');
    if (statsEl) {
      statsEl.innerHTML = '<div style="display:flex;gap:1rem;flex-wrap:wrap;">' +
        '<div class="card" style="flex:1;min-width:120px;text-align:center;"><div style="font-size:2rem;font-weight:700;color:var(--red);">' + data.stats.wrong_count + '</div><div style="font-size:0.78rem;color:var(--muted);">\u9519\u9898</div></div>' +
        '<div class="card" style="flex:1;min-width:120px;text-align:center;"><div style="font-size:2rem;font-weight:700;color:var(--green);">' + data.stats.improvement_rate + '%</div><div style="font-size:0.78rem;color:var(--muted);">\u8FDB\u6B65\u7387</div></div>' +
        '<div class="card" style="flex:1;min-width:120px;text-align:center;"><div style="font-size:2rem;font-weight:700;color:var(--accent);">' + data.stats.total_practice + '</div><div style="font-size:0.78rem;color:var(--muted);">\u603B\u7EC3\u4E60</div></div></div>';
    }
    var typeFilter = document.getElementById('wrongbook-type-filter');
    if (typeFilter) typeFilter.innerHTML = '<option value="">\u5168\u90E8\u9898\u578B</option>' + (data.all_types || []).map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
    var listHTML = '';
    (data.wrong || []).forEach(function(q, i) {
      var color = q.bestScore < 40 ? 'var(--red)' : q.bestScore < 60 ? 'var(--accent)' : 'var(--green)';
      listHTML += '<div class="card" style="margin-bottom:0.6rem;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;"><div style="flex:1;"><div style="font-weight:600;font-size:0.85rem;">' + (i+1) + '. ' + escapeHtml(q.question) + '</div><div style="display:flex;gap:0.5rem;margin-top:0.3rem;flex-wrap:wrap;"><span style="font-size:0.72rem;background:rgba(200,135,43,0.1);color:var(--accent);padding:0.1rem 0.4rem;border-radius:3px;">' + q.questionType + '</span><span style="font-size:0.72rem;color:' + color + ';font-weight:600;">\u6700\u4F73: ' + q.bestScore + '</span><span style="font-size:0.72rem;color:var(--muted);">\u5C1D\u8BD5: ' + q.attempts.length + ' \u6B21</span></div></div><button class="btn-ai-action btn-ai-followup" onclick="redoWrongQuestion(\'' + escapeHtml(q.question).replace(/'/g, "\\'") + '\')" style="flex-shrink:0;">\u91CD\u505A</button></div></div>';
    });
    var listEl = document.getElementById('wrongbook-list');
    if (listEl) listEl.innerHTML = listHTML || '<p style="color:var(--muted);text-align:center;padding:2rem;">\u6CA1\u6709\u9519\u9898\uFF01</p>';
  } catch (e) { console.warn('Wrong book load failed:', e); }
}
function redoWrongQuestion(question) {
  switchTab('practice');
  setTimeout(function() { var input = document.getElementById('practice-question'); if (input) input.value = question; }, 300);
}

// ============================================================
// Phase 2: JD URL Parse
// ============================================================
(function initJdUrlParse() {
  var btn = document.getElementById('btn-jd-fetch');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var url = (document.getElementById('jd-url-input') ? document.getElementById('jd-url-input').value : '').trim();
    if (!url) { toast('\u8BF7\u8F93\u5165URL'); return; }
    btn.disabled = true;
    btn.textContent = '\u89E3\u6790\u4E2D...';
    try {
      var resp = await fetch(API + '/parse-jd-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }) });
      var data = await resp.json();
      if (data.error) { toast('\u89E3\u6790\u5931\u8D25: ' + data.error); }
      else if (data.jd_text) {
        var jdInput = document.getElementById('jd-input');
        if (jdInput) jdInput.value = data.jd_text;
        toast('\u5DF2\u89E3\u6790: ' + (data.company || '') + ' ' + (data.position || ''));
      } else { toast('\u65E0\u6CD5\u8BC6\u522BJD\uFF0C\u8BF7\u624B\u52A8\u7C98\u8D34'); }
    } catch (e) { toast('\u7F51\u7EDC\u9519\u8BEF: ' + e.message); }
    btn.disabled = false;
    btn.textContent = '\u89E3\u6790\u94FE\u63A5';
  });
})();

// ============================================================
// Phase 3: Voice Input (Web Speech API)
// ============================================================
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var recognition = null;
var currentVoiceTarget = null;

function initSpeechRecognition() {
  if (!SpeechRecognition) { console.warn('\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8BC6\u522B'); return; }
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  
  recognition.onresult = function(event) {
    var final = '', interim = '';
    for (var i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    if (currentVoiceTarget) {
      currentVoiceTarget.value = (currentVoiceTarget.dataset.origValue || '') + final;
      if (interim) currentVoiceTarget.placeholder = '\u8BC6\u522B\u4E2D: ' + interim;
    }
  };
  
  recognition.onend = function() {
    if (currentVoiceTarget) {
      var btn = document.querySelector('[data-voice-target=\"' + currentVoiceTarget.id + '\"]');
      if (btn) btn.textContent = '\uD83C\uDFA4';
    }
  };
  
  recognition.onerror = function() {
    if (currentVoiceTarget) {
      var btn = document.querySelector('[data-voice-target=\"' + currentVoiceTarget.id + '\"]');
      if (btn) btn.textContent = '\uD83C\uDFA4';
    }
    currentVoiceTarget = null;
  };
}

function startVoiceInput(targetId) {
  if (!recognition) { alert('\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8BC6\u522B\uFF0C\u8BF7\u4F7F\u7528Chrome/Edge'); return; }
  var el = document.getElementById(targetId);
  if (!el) return;
  currentVoiceTarget = el;
  el.dataset.origValue = el.value;
  var btn = document.querySelector('[data-voice-target=\"' + targetId + '\"]');
  if (btn) btn.textContent = '\uD83D\uDD34';
  try { recognition.start(); } catch(e) {}
}

// Global binding: all .btn-mic click triggers voice input
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-mic');
  if (!btn) return;
  var targetId = btn.dataset.voiceTarget;
  if (targetId) startVoiceInput(targetId);
});

// Initialize voice recognition on load
initSpeechRecognition();

// ============================================================
// Phase 3: TTS (SpeechSynthesis)
// ============================================================
function speakText(text) {
  if (!window.speechSynthesis) { alert('\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u6717\u8BFB'); return; }
  window.speechSynthesis.cancel();
  var utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  // Select Chinese voice
  var voices = window.speechSynthesis.getVoices();
  var zhVoice = voices.find(function(v) { return v.lang.startsWith('zh'); });
  if (zhVoice) utter.voice = zhVoice;
  window.speechSynthesis.speak(utter);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
}

// Global binding: all .btn-speak click reads data-text content
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-speak');
  if (!btn) return;
  var text = btn.dataset.text;
  if (text) speakText(text);
});

// ============================================================
// Phase 3: Group Interview (群面模拟)
// ============================================================
var groupSession = null;
var groupTimer = null;

function getCurrentSession() {
  return { sessionId: state.sessionId, analysis: state.analysis };
}

async function startGroupInterview() {
  var session = getCurrentSession();
  if (!session || !session.analysis) { alert('\u8BF7\u5148\u5728\u201C\u5206\u6790&\u62BC\u9898\u201D\u4E2D\u5B8C\u6210JD\u5206\u6790'); return; }
  
  try {
    var resp = await fetchRetry('/api/group-interview/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdParsed: session.analysis.jdParsed, resumeParsed: session.analysis.resumeParsed })
    });
    var data = await resp.json();
    if (data.error) { alert(data.error); return; }
    
    groupSession = data;
    renderGroupTopic(data.topic);
    document.getElementById('group-start-card').style.display = 'none';
    document.getElementById('group-discussion-card').style.display = '';
    document.getElementById('group-discussion-log').innerHTML = '';
    
    // Add interviewer opening
    addGroupMessage('\u9762\u8BD5\u5B98', '\u9762\u8BD5\u5B98', '\u9898\u76EE\uFF1A' + data.topic.topic + '\n\n\u80CC\u666F\uFF1A' + data.topic.background + '\n\n\u8BF7\u5404\u4F4D\u5019\u9009\u4EBA\u75282\u5206\u949F\u65F6\u95F4\u601D\u8003\uFF0C\u7136\u540E\u81EA\u7531\u8BA8\u8BBA\u3002\u8BA8\u8BBA\u65F6\u95F415\u5206\u949F\u3002');
    startGroupTimer(900); // 15 min
  } catch(e) { alert('\u542F\u52A8\u7FA4\u9762\u5931\u8D25: ' + e.message); }
}

function addGroupMessage(speaker, role, message) {
  var log = document.getElementById('group-discussion-log');
  var isUser = speaker === '\u6211';
  var div = document.createElement('div');
  div.className = 'group-msg' + (isUser ? ' group-msg-user' : '');
  div.innerHTML = 
    '<div class=\"group-msg-header\">' +
    '<span class=\"group-msg-speaker\" style=\"color:' + getGroupRoleColor(role) + '\">' + speaker + '</span>' +
    '<span class=\"group-msg-role\">' + role + '</span>' +
    '</div>' +
    '<div class=\"group-msg-body\">' + escapeHtml(message) + '</div>' +
    (!isUser ? '<button class=\"btn-speak\" data-text=\"' + escapeHtml(message).replace(/\"/g, '&quot;') + '\" style=\"width:24px;height:24px;font-size:0.7rem;margin-top:0.3rem;\">\uD83D\uDD0A</button>' : '');
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function getGroupRoleColor(role) {
  if (role === '\u9762\u8BD5\u5B98') return '#6366f1';
  if (role === '\u6FC0\u8FDB\u578B') return '#ef4444';
  if (role === '\u534F\u4F5C\u578B') return '#22c55e';
  if (role === '\u5206\u6790\u578B') return '#3b82f6';
  return 'var(--accent)';
}

async function submitGroupMessage() {
  var input = document.getElementById('group-input');
  var msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  
  addGroupMessage('\u6211', '\u5019\u9009\u4EBA', msg);
  
  try {
    var resp = await fetchRetry('/api/group-interview/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    var data = await resp.json();
    if (data.error) { alert(data.error); return; }
    addGroupMessage(data.speaker, data.role, data.message);
  } catch(e) { alert('\u53D1\u8A00\u5931\u8D25: ' + e.message); }
}

async function endGroupInterview() {
  clearInterval(groupTimer);
  try {
    var resp = await fetchRetry('/api/group-interview/evaluate', { method: 'POST' });
    var data = await resp.json();
    document.getElementById('group-discussion-card').style.display = 'none';
    document.getElementById('group-report-card').style.display = '';
    renderGroupReport(data);
  } catch(e) { alert('\u8BC4\u4F30\u5931\u8D25: ' + e.message); }
}

function renderGroupTopic(topic) {
  var info = document.getElementById('group-topic-info');
  info.style.display = '';
  info.innerHTML = 
    '<div style=\"background:var(--tag-bg);padding:0.8rem;border-radius:var(--radius-sm);\">' +
    '<strong>' + escapeHtml(topic.topic) + '</strong>' +
    '<p style=\"margin:0.5rem 0 0;color:var(--muted);\">' + escapeHtml(topic.background) + '</p>' +
    '<span style=\"font-size:0.75rem;color:var(--accent);\">\u9898\u578B\uFF1A' + escapeHtml(topic.type) + '</span>' +
    '</div>';
}

function renderGroupReport(report) {
  var content = document.getElementById('group-report-content');
  var dimsHTML = (report.dimensions || []).map(function(d) {
    return '<div style=\"margin-bottom:0.8rem;\">' +
      '<div style=\"display:flex;justify-content:space-between;\">' +
      '<span>' + d.name + '</span><span style=\"color:var(--accent);\">' + d.score + '/100</span>' +
      '</div>' +
      '<div style=\"background:var(--rule);height:6px;border-radius:3px;margin-top:0.3rem;\">' +
      '<div style=\"background:var(--accent);height:100%;border-radius:3px;width:' + d.score + '%;\"></div>' +
      '</div>' +
      '<div style=\"font-size:0.8rem;color:var(--muted);\">' + d.comment + '</div>' +
      '</div>';
  }).join('');
  content.innerHTML = 
    '<div style=\"text-align:center;margin-bottom:1rem;\">' +
    '<div style=\"font-size:3rem;font-weight:700;color:var(--accent);\">' + report.overall_score + '</div>' +
    '<div style=\"color:var(--muted);\">\u7EFC\u5408\u8BC4\u5206</div>' +
    '</div>' +
    dimsHTML +
    '<div style=\"margin-top:1rem;\">' +
    '<strong>\uD83D\uDCAA \u4F18\u52BF</strong><ul>' + (report.strengths || []).map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul>' +
    '<strong>\uD83D\uDD27 \u5F85\u6539\u8FDB</strong><ul>' + (report.weaknesses || []).map(function(w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('') + '</ul>' +
    '<strong>\uD83D\uDCA1 \u5EFA\u8BAE</strong><ul>' + (report.suggestions || []).map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul>' +
    '</div>' +
    '<div style=\"margin-top:1rem;padding:0.8rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
    '<strong>\u89D2\u8272\u5206\u6790\uFF1A</strong>' + escapeHtml(report.role_analysis || '') +
    '</div>';
}

function startGroupTimer(seconds) {
  clearInterval(groupTimer);
  var remaining = seconds;
  updateGroupTimer(remaining);
  groupTimer = setInterval(function() {
    remaining--;
    updateGroupTimer(remaining);
    if (remaining <= 0) { clearInterval(groupTimer); endGroupInterview(); }
  }, 1000);
}

function updateGroupTimer(seconds) {
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  document.getElementById('group-timer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Group interview knowledge base
function showGroupKnowledgeBase() {
  var content = document.getElementById('group-kb-content');
  if (content.style.display === 'none') {
    content.style.display = '';
    fetch('/knowledge/group-interview.json')
      .then(function(r) { return r.json(); })
      .then(function(kb) { renderGroupKB(kb, content); })
      .catch(function() { content.innerHTML = '<p>\u52A0\u8F7D\u77E5\u8BC6\u5E93\u5931\u8D25</p>'; });
  } else {
    content.style.display = 'none';
  }
}

function renderGroupKB(kb, container) {
  var html = '<div style=\"display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;\">';
  var sections = ['overview', 'interview_flow', 'roles', 'question_types', 'evaluation_criteria', 'speech_templates', 'classic_cases', 'common_mistakes', 'preparation_checklist'];
  var labels = ['\u6982\u8FF0', '\u9762\u8BD5\u6D41\u7A0B', '\u89D2\u8272\u7B56\u7565', '\u9898\u578B\u5206\u7C7B', '\u8BC4\u5206\u6807\u51C6', '\u8BDD\u672F\u6A21\u677F', '\u7ECF\u5178\u6848\u4F8B', '\u5E38\u89C1\u9519\u8BEF', '\u51C6\u5907\u6E05\u5355'];
  sections.forEach(function(s, i) {
    html += '<button class=\"btn-outline btn-sm kb-tab-btn\" data-kb-section=\"' + s + '\">' + labels[i] + '</button>';
  });
  html += '</div><div id=\"group-kb-detail\"></div>';
  container.innerHTML = html;
  
  document.querySelectorAll('.kb-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var section = btn.dataset.kbSection;
      var detail = document.getElementById('group-kb-detail');
      detail.innerHTML = renderKBSection(kb, section);
    });
  });
  // Default: show overview
  document.getElementById('group-kb-detail').innerHTML = renderKBSection(kb, 'overview');
}

function renderKBSection(kb, section) {
  var data = kb[section];
  if (!data) return '<p>\u6682\u65E0\u5185\u5BB9</p>';
  
  if (section === 'overview') {
    return '<div style=\"line-height:1.8;\">' +
      '<p><strong>\u5B9A\u4E49\uFF1A</strong>' + data.definition + '</p>' +
      '<p><strong>\u76EE\u7684\uFF1A</strong>' + data.purpose + '</p>' +
      '<p><strong>\u5F62\u5F0F\uFF1A</strong>' + data.typical_format + '</p>' +
      '<p><strong>\u901A\u8FC7\u7387\uFF1A</strong>' + data.pass_rate + '</p>' +
      '<p style=\"color:var(--accent);\"><strong>\u6838\u5FC3\u6D1E\u5BDF\uFF1A</strong>' + data.key_insight + '</p>' +
      '</div>';
  }
  
  if (section === 'interview_flow') {
    return data.stages.map(function(s) {
      return '<div style=\"margin-bottom:1rem;padding:0.8rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
        '<strong>' + s.name + '</strong> <span style=\"color:var(--muted);\">(' + s.duration + ')</span>' +
        '<p style=\"margin:0.3rem 0;\">' + s.description + '</p>' +
        '<ul>' + s.tips.map(function(t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
        '</div>';
    }).join('');
  }
  
  if (section === 'roles') {
    return '<p style=\"margin-bottom:0.8rem;\">' + data.description + '</p>' +
      data.roles.map(function(r) {
        return '<div style=\"margin-bottom:0.8rem;padding:0.8rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
          '<strong>' + r.icon + ' ' + r.name + '</strong>' +
          '<p style=\"margin:0.3rem 0;\">' + r.responsibility + '</p>' +
          '<p style=\"font-size:0.85rem;color:var(--accent);\">\uD83D\uDCA1 ' + r.how_to + '</p>' +
          '<p style=\"font-size:0.8rem;color:var(--red);\">\u26A0 ' + r.risk + '</p>' +
          '</div>';
      }).join('') + '<p style=\"color:var(--muted);\">' + data.role_selection_advice + '</p>';
  }
  
  if (section === 'question_types') {
    return data.types.map(function(t) {
      return '<div style=\"margin-bottom:0.8rem;padding:0.8rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
        '<strong>' + t.name + '</strong> <span style=\"color:var(--accent);\">\u96BE\u5EA6\uFF1A' + t.difficulty + '</span>' +
        '<p style=\"margin:0.3rem 0;\"><em>\u793A\u4F8B\uFF1A' + t.example + '</em></p>' +
        '<p style=\"font-size:0.85rem;\">' + t.characteristics + '</p>' +
        '<p style=\"font-size:0.85rem;color:var(--accent2);\">\u7B56\u7565\uFF1A' + t.strategy + '</p>' +
        '</div>';
    }).join('');
  }
  
  if (section === 'evaluation_criteria') {
    return data.dimensions.map(function(d) {
      return '<div style=\"margin-bottom:0.6rem;display:flex;justify-content:space-between;align-items:center;\">' +
        '<span>' + d.name + ' (' + d.weight + ')</span>' +
        '<span style=\"font-size:0.8rem;color:var(--muted);\">' + d.description + '</span>' +
        '</div>';
    }).join('');
  }
  
  if (section === 'speech_templates') {
    return Object.entries(data.templates).map(function(entry) {
      var key = entry[0], templates = entry[1];
      var labelMap = { ice_breaker: '\u7834\u51B0\u53D1\u8A00', time_management: '\u65F6\u95F4\u7BA1\u7406', building_on_others: '\u627F\u63A5\u4ED6\u4EBA', polite_disagreement: '\u793C\u8C8C\u53CD\u9A73', redirecting: '\u62C9\u56DE\u6B63\u9898', building_consensus: '\u5EFA\u7ACB\u5171\u8BC6', summary: '\u603B\u7ED3\u9648\u8FF0' };
      return '<div style=\"margin-bottom:1rem;\">' +
        '<strong>' + (labelMap[key] || key) + '</strong>' +
        templates.map(function(t) { return '<p style=\"font-size:0.85rem;padding:0.4rem;background:var(--tag-bg);border-radius:4px;margin:0.3rem 0;\">' + t + '</p>'; }).join('') +
        '</div>';
    }).join('');
  }
  
  if (section === 'classic_cases') {
    return data.map(function(c) {
      return '<div style=\"margin-bottom:1rem;padding:0.8rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
        '<strong>' + c.title + '</strong> <span style=\"color:var(--accent);\">[' + c.type + ']</span>' +
        '<p style=\"margin:0.3rem 0;\">' + c.scenario + '</p>' +
        (c.analysis_framework ? '<p style=\"font-size:0.85rem;color:var(--accent2);\">\u5206\u6790\u6846\u67B6\uFF1A' + c.analysis_framework + '</p>' : '') +
        (c.items ? '<p style=\"font-size:0.8rem;color:var(--muted);\">\u7269\u54C1\uFF1A' + c.items + '</p>' : '') +
        '<p style=\"font-size:0.85rem;color:var(--accent);\">\uD83D\uDCA1 ' + c.key_insight + '</p>' +
        '</div>';
    }).join('');
  }
  
  if (section === 'common_mistakes') {
    return data.mistakes.map(function(m) {
      return '<div style=\"margin-bottom:0.6rem;padding:0.6rem;background:var(--tag-bg);border-radius:var(--radius-sm);\">' +
        '<strong style=\"color:var(--red);\">\u274C ' + m.mistake + '</strong>' +
        '<p style=\"margin:0.2rem 0;font-size:0.85rem;\">\u540E\u679C\uFF1A' + m.consequence + '</p>' +
        '<p style=\"font-size:0.85rem;color:var(--accent2);\">\u2705 \u5BF9\u7B56\uFF1A' + m.fix + '</p>' +
        '</div>';
    }).join('');
  }
  
  if (section === 'preparation_checklist') {
    return '<ul>' + data.map(function(item) { return '<li>' + item + '</li>'; }).join('') + '</ul>';
  }
  
  return '<p>\u6682\u65E0\u5185\u5BB9</p>';
}

// ============================================================
// Phase 3: Mianjing Analysis (面经整合分析)
// ============================================================
async function doMianjingAnalysis() {
  var company = document.getElementById('mj-analysis-company').value.trim();
  var position = document.getElementById('mj-analysis-position').value.trim();
  if (!company && !position) { alert('\u8BF7\u81F3\u5C11\u8F93\u5165\u516C\u53F8\u540D\u6216\u5C97\u4F4D\u540D'); return; }
  
  var result = document.getElementById('mj-analysis-result');
  result.style.display = '';
  result.innerHTML = '<p>\u6B63\u5728\u5206\u6790\u4E2D...</p>';
  
  try {
    var resp = await fetchRetry('/api/mianjing-analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: company, position: position })
    });
    
    var body = resp.body;
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    
    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.startsWith('data: ')) {
          try {
            var data = JSON.parse(line.slice(6));
            if (data._done) break;
            if (data.error) { result.innerHTML = '<p style=\"color:var(--red);\">' + data.error + '</p>'; return; }
            renderMianjingAnalysis(data, result);
          } catch(e) {}
        }
      }
    }
  } catch(e) { result.innerHTML = '<p style=\"color:var(--red);\">\u5206\u6790\u5931\u8D25: ' + e.message + '</p>'; }
}

function renderMianjingAnalysis(data, container) {
  var html = '';
  if (data.company_analysis) {
    html += '<div style=\"margin-bottom:1rem;\"><h4>\uD83C\uDFE2 ' + (data.company_analysis.company || '\u516C\u53F8\u5206\u6790') + '</h4>';
    html += '<p>\u9762\u8BD5\u6D41\u7A0B\uFF1A' + (data.company_analysis.interview_rounds || '\u6682\u65E0\u6570\u636E') + '</p>';
    html += '<p>\u96BE\u5EA6\uFF1A' + (data.company_analysis.difficulty_level || '\u6682\u65E0\u6570\u636E') + '</p>';
    html += '<p>\u85AA\u8D44\u8303\u56F4\uFF1A' + (data.company_analysis.salary_range || '\u6682\u65E0\u6570\u636E') + '</p>';
    html += '<p>\u9762\u8BD5\u98CE\u683C\uFF1A' + (data.company_analysis.interview_style || '\u6682\u65E0\u6570\u636E') + '</p>';
    if (data.company_analysis.common_questions) {
      html += '<strong>\u9AD8\u9891\u9898\uFF1A</strong><ul>' + data.company_analysis.common_questions.slice(0, 10).map(function(q) { return '<li>' + escapeHtml(q.question) + ' (' + q.frequency + '\u6B21)</li>'; }).join('') + '</ul>';
    }
    html += '</div>';
  }
  if (data.position_analysis) {
    html += '<div style=\"margin-bottom:1rem;\"><h4>\uD83D\uDCBC \u5C97\u4F4D\u5206\u6790</h4>';
    if (data.position_analysis.skill_requirements) {
      html += '<strong>\u6280\u80FD\u8981\u6C42\uFF1A</strong>' + data.position_analysis.skill_requirements.map(function(s) { return '<span style=\"display:inline-block;background:var(--tag-bg);padding:0.2rem 0.5rem;border-radius:4px;margin:0.2rem;\">' + escapeHtml(s.skill) + ' (' + s.frequency + '\u6B21)</span>'; }).join('');
    }
    html += '</div>';
  }
  if (data.preparation_advice) {
    html += '<div><h4>\uD83D\uDCA1 \u51C6\u5907\u5EFA\u8BAE</h4><ul>' + data.preparation_advice.map(function(a) { return '<li>' + escapeHtml(a) + '</li>'; }).join('') + '</ul></div>';
  }
  container.innerHTML = html;
}

// ============================================================
// Phase 3: Group Interview Event Bindings
// ============================================================
(function() {
  var btnStart = document.getElementById('btn-group-start');
  if (btnStart) btnStart.addEventListener('click', startGroupInterview);
  
  var btnSpeak = document.getElementById('btn-group-speak');
  if (btnSpeak) btnSpeak.addEventListener('click', submitGroupMessage);
  
  var btnEnd = document.getElementById('btn-group-end');
  if (btnEnd) btnEnd.addEventListener('click', endGroupInterview);
  
  var btnSkip = document.getElementById('btn-group-skip');
  if (btnSkip) btnSkip.addEventListener('click', function() {
    submitGroupMessage(); // For now, skip just sends an empty or placeholder
  });
  
  var btnKb = document.getElementById('btn-group-kb');
  if (btnKb) btnKb.addEventListener('click', showGroupKnowledgeBase);
  
  var btnMjAnalysis = document.getElementById('btn-mj-analysis');
  if (btnMjAnalysis) btnMjAnalysis.addEventListener('click', doMianjingAnalysis);
  
  // Enter key in group input submits message
  var groupInput = document.getElementById('group-input');
  if (groupInput) {
    groupInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        submitGroupMessage();
      }
    });
  }
})();
