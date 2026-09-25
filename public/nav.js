/* ============================================================
   InterviewPrep — 两级导航（主模块 + 子模块）
   一级：概览 / 准备 / 练习 / 模拟 / 产出与复盘
   二级：随一级切换显隐，复用 .nav-tab 类名（由本文件动态渲染）

   约定：不改 data-tab 值、不改 tab-xxx 的 section id、不改 switchTab 既有分支。
   本文件只负责「渲染导航外壳 + 同步高亮」，切换动作仍交给 app.js 的 switchTab。

   注意：5 组子导航一次性全部渲染，仅切换显隐 —— 这样 .tab-dot 小红点
   在非当前模块里也能被 app.js 的 showTabDot() 找到（否则后台事件会静默丢点）。
   ============================================================ */
(function () {
  'use strict';

  var MODULE_MAP = [
    { id: 'overview', label: '概览', tabs: [
      { tab: 'dashboard',  label: '📊 仪表盘' },
      { tab: 'studyplan',  label: '📋 备考方案' }
    ]},
    { id: 'prepare', label: '准备', tabs: [
      { tab: 'analyze',    label: '🔍 分析 & 押题', dot: true },
      { tab: 'mianjing',   label: '📡 面经采集', dot: true },
      { tab: 'company',    label: '🏢 公司调研' },
      { tab: 'behavioral', label: '💡 通用题库', dot: true }
    ]},
    { id: 'practice', label: '练习', tabs: [
      { tab: 'practice',   label: '✏️ 单题练习', dot: true },
      { tab: 'drill',      label: '🎯 专项训练', dot: true },
      { tab: 'pg8',        label: '🏆 宝洁八大问' },
      { tab: 'wrongbook',  label: '📝 错题集' }
    ]},
    { id: 'simulate', label: '模拟', tabs: [
      { tab: 'interview',  label: '🎬 全真模拟', dot: true },
      { tab: 'group',      label: '👥 群面模拟', dot: true }
    ]},
    { id: 'output', label: '产出与复盘', tabs: [
      { tab: 'resume',     label: '📄 简历优化', dot: true },
      { tab: 'phrases',    label: '📚 话术库' },
      { tab: 'review',     label: '🔄 面试复盘' }
    ]}
  ];

  var DEFAULT_TAB = 'dashboard';
  var moduleBar = null;
  var subNav = null;
  var currentTab = DEFAULT_TAB;

  function moduleOf(tabName) {
    for (var i = 0; i < MODULE_MAP.length; i++) {
      var m = MODULE_MAP[i];
      for (var j = 0; j < m.tabs.length; j++) {
        if (m.tabs[j].tab === tabName) return m;
      }
    }
    return null;
  }

  function renderAll() {
    moduleBar.innerHTML = MODULE_MAP.map(function (m) {
      return '<button class="nav-module" data-module="' + m.id + '">' + m.label + '</button>';
    }).join('');

    subNav.innerHTML = MODULE_MAP.map(function (m) {
      var btns = m.tabs.map(function (t) {
        var dot = t.dot ? '<span class="tab-dot" data-dot-tab="' + t.tab + '"></span>' : '';
        return '<button class="nav-tab" data-tab="' + t.tab + '">' + t.label + dot + '</button>';
      }).join('');
      return '<div class="sub-nav-group" data-module="' + m.id + '">' + btns + '</div>';
    }).join('');
  }

  function highlight() {
    var mod = moduleOf(currentTab) || MODULE_MAP[0];

    var modules = moduleBar.querySelectorAll('.nav-module');
    for (var i = 0; i < modules.length; i++) {
      modules[i].classList.toggle('active', modules[i].getAttribute('data-module') === mod.id);
    }

    var groups = subNav.querySelectorAll('.sub-nav-group');
    for (var g = 0; g < groups.length; g++) {
      groups[g].classList.toggle('active', groups[g].getAttribute('data-module') === mod.id);
    }

    var tabs = subNav.querySelectorAll('.nav-tab');
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].classList.toggle('active', tabs[k].getAttribute('data-tab') === currentTab);
    }
  }

  // 由 app.js 的 switchTab() 在末尾调用
  function sync(tabName) {
    if (!tabName) return;
    currentTab = tabName;
    if (moduleBar && subNav) highlight();
  }

  function goTab(tabName) {
    if (typeof window.switchTab === 'function') {
      window.switchTab(tabName);
    } else {
      currentTab = tabName;
      highlight();
    }
  }

  function readHashTab() {
    var m = (location.hash || '').match(/tab=([\w-]+)/);
    return m ? m[1] : '';
  }

  function init() {
    moduleBar = document.getElementById('nav-modules');
    subNav = document.getElementById('sub-nav');
    if (!moduleBar || !subNav) return;

    renderAll();

    // 一级：事件委托（子导航会被整体重建，不能直接绑定）
    moduleBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.nav-module');
      if (!btn) return;
      var mod = null;
      for (var i = 0; i < MODULE_MAP.length; i++) {
        if (MODULE_MAP[i].id === btn.getAttribute('data-module')) { mod = MODULE_MAP[i]; break; }
      }
      if (!mod) return;
      var inModule = mod.tabs.some(function (t) { return t.tab === currentTab; });
      if (inModule) highlight();
      else goTab(mod.tabs[0].tab);
    });

    // 初始落点：hash 直达优先，否则仪表盘
    var startTab = readHashTab();
    if (!moduleOf(startTab)) startTab = DEFAULT_TAB;
    goTab(startTab);
  }

  window.Nav = { init: init, sync: sync, goTab: goTab, MODULE_MAP: MODULE_MAP };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();