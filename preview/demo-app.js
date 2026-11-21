/**
 * 手动补签交互演示（AC-2 证据）
 *
 * 本文件只做三件事：
 *   1. 用 demo-bundle.js 里**同一份** miniprogram/logic 代码创建控制器与 mock 接口；
 *   2. 把控制器吐出的 state 渲染成与小程序页面一致的 DOM（hero 计数 / tabs / 搜索 / 列表 / 弹窗）；
 *   3. 暴露一个只读的坐标辅助函数，供录制脚本做真实鼠标点击。
 *
 * 页面上完全不出现「直接改 DOM 状态」的代码 —— 行变已签到、顶部计数 +1 都是
 * controller.applyLocalCheckin() 走完 mock 接口后由 onChange 推送过来的结果。
 */
(function () {
  'use strict';

  var M = window.CheckinModules;
  var controllerMod = M.require('logic/controller.js');
  var apiMod = M.require('logic/api.js');
  var checkinMod = M.require('logic/checkin.js');
  var mockMod = M.require('mock/checkin-list.js');

  var CheckinListController = controllerMod.CheckinListController;
  var createMockApi = apiMod.createMockApi;
  var MAKEUP_REASONS = checkinMod.MAKEUP_REASONS;

  var $ = function (id) { return document.getElementById(id); };
  var CIRC = 2 * Math.PI * 54;

  // ---------- 证据计数器 ----------
  var loadId = Math.random().toString(16).slice(2, 8).toUpperCase();
  var loads = 1;
  try {
    loads = Number(sessionStorage.getItem('ac2_page_loads') || '0') + 1;
    sessionStorage.setItem('ac2_page_loads', String(loads));
  } catch (err) { /* file:// 等环境下 sessionStorage 不可用，load 计数退化为1 */ }
  var counters = { list: 0, makeup: 0 };

  $('loadId').textContent = loadId;
  $('reloadCount').textContent = String(loads - 1); // 本次是第 1 次加载 → 重载 0 次

  var t0 = Date.now();
  setInterval(function () {
    $('uptime').textContent = ((Date.now() - t0) / 1000).toFixed(1);
  }, 100);

  // ---------- 接口（mock，带计数） ----------
  var baseApi = createMockApi({ latency: 260 });
  var api = {
    list: function (q) { counters.list += 1; $('listCalls').textContent = String(counters.list); return baseApi.list(q); },
    getRecord: function (id) { return baseApi.getRecord(id); },
    makeup: function (p) { counters.makeup += 1; $('makeupCalls').textContent = String(counters.makeup); return baseApi.makeup(p); },
  };

  // ---------- 页面本地状态（弹窗表单，非业务状态） ----------
  var form = { reason: '', note: '' };
  var prev = { arrived: -1, checkedIds: {} };
  var toastTimer = null;

  var controller = new CheckinListController({
    api: api,
    role: 'staff',
    onChange: render,
  });

  // ---------- 渲染 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(state) {
    renderHero(state);
    renderTabs(state);
    renderList(state);
    renderDialog(state);
    renderToast(state);
  }

  function renderHero(state) {
    var s = state.stats;
    var absent = Math.max(0, s.expected - s.arrived);
    $('kpiExpected').textContent = String(s.expected);
    $('kpiArrived').textContent = String(s.arrived);
    $('kpiAbsent').textContent = String(absent);
    $('ringRate').innerHTML = s.rate + '<small>%</small>';
    $('ringArc').setAttribute('stroke-dasharray', ((s.rate / 100) * CIRC).toFixed(2) + ' ' + CIRC.toFixed(2));
    $('lastUpdated').textContent = '最近更新 ' + (state.lastUpdated || '—');
    $('totalCount').textContent = '名单共 ' + (s.expected || 0) + ' 人';
    if (state.eventTitle) $('eventTitle').textContent = state.eventTitle;

    if (prev.arrived >= 0 && s.arrived > prev.arrived) {
      var el = $('kpiArrived');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    prev.arrived = s.arrived;
  }

  function renderTabs(state) {
    var tabs = $('tabs').children;
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === state.tab);
    }
  }

  function renderList(state) {
    var list = $('list');
    if (state.forbidden) {
      list.innerHTML = '<div class="empty">暂无访问权限</div>';
      return;
    }
    if (state.loading && state.rows.length === 0) {
      list.innerHTML = '<div class="empty">加载中…</div>';
      return;
    }
    if (state.rows.length === 0) {
      list.innerHTML = '<div class="empty">' + esc(state.emptyText || '暂无记录') + '</div>';
      return;
    }
    var html = state.rows.map(function (r) {
      var ok = r.checkedIn;
      var tagClass = ok ? 'ok' : 'grey';
      var tagText = ok ? r.methodText : '未签到';
      return '' +
        '<div class="row" data-id="' + esc(r.id) + '">' +
          '<div class="avatar' + (ok ? ' ok' : '') + '">' + esc(r.avatarText) + '</div>' +
          '<div class="row-main">' +
            '<div class="row-head">' +
              '<span class="row-name">' + esc(r.name) + '</span>' +
              '<span class="tag ' + tagClass + '">' + esc(tagText) + '</span>' +
            '</div>' +
            '<div class="row-company">' + esc(r.company) + '</div>' +
            '<div class="row-meta">' +
              '<span>票号 ' + esc(r.ticketTail) + '</span>' +
              (ok && r.timeText ? '<span class="time">' + esc(r.timeText) + ' 已签到</span>' : '') +
            '</div>' +
          '</div>' +
          (ok ? '' : '<div class="row-action"><span class="btn-makeup" data-makeup="' + esc(r.id) + '">手动补签</span></div>') +
        '</div>';
    }).join('');
    if (state.hasMore) html += '<div class="list-foot">共 ' + state.total + ' 人 · 上滑加载更多</div>';
    list.innerHTML = html;

    // 刚被补签成功的行做一次高亮，帮助观者定位「就是这一行变了」
    state.rows.forEach(function (r) {
      if (r.checkedIn && !prev.checkedIds[r.id]) {
        if (Object.keys(prev.checkedIds).length > 0) {
          var row = list.querySelector('.row[data-id="' + r.id + '"]');
          if (row) {
            row.classList.add('flash');
            var tag = row.querySelector('.tag');
            if (tag) tag.classList.add('new');
          }
        }
      }
      prev.checkedIds[r.id] = !!r.checkedIn;
    });
  }

  function renderDialog(state) {
    var mask = $('mask');
    if (!state.dialogVisible || !state.dialogTarget) {
      mask.hidden = true;
      return;
    }
    mask.hidden = false;
    var t = state.dialogTarget;
    $('dlgMember').innerHTML =
      '<div class="dlg__avatar">' + esc(t.avatarText) + '</div>' +
      '<div class="dlg__info"><div class="dlg__name">' + esc(t.name) + '</div>' +
      '<div class="dlg__meta">' + esc(t.company) + ' · 票号 ' + esc(t.ticketTail) + '</div></div>';

    $('reasonList').innerHTML = MAKEUP_REASONS.map(function (r) {
      return '<div class="radio' + (form.reason === r.key ? ' on' : '') + '" data-reason="' + r.key + '">' +
        '<span class="dot"></span><span>' + esc(r.label) + '</span></div>';
    }).join('');

    $('noteField').hidden = form.reason !== 'other';
    $('dlgHint').hidden = !(form.reason === 'other' && !form.note.trim());
    $('dlgError').hidden = !state.dialogError;
    $('dlgError').textContent = state.dialogError || '';
    $('btnConfirm').textContent = state.submitting ? '提交中…' : '确认补签';
    $('btnConfirm').disabled = !!state.submitting;
  }

  function renderToast(state) {
    var el = $('toast');
    if (!state.toast) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = state.toast;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { controller.clearToast(); }, 1800);
  }

  // ---------- 交互 ----------
  $('list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-makeup]');
    if (!btn) return;
    form = { reason: '', note: '' };
    $('noteInput').value = '';
    controller.openMakeup(btn.getAttribute('data-makeup'));
  });

  $('tabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    controller.setTab(tab.getAttribute('data-tab'));
  });

  $('searchInput').addEventListener('input', function (e) {
    controller.onKeywordInput(e.target.value);
  });

  $('reasonList').addEventListener('click', function (e) {
    var item = e.target.closest('[data-reason]');
    if (!item) return;
    form.reason = item.getAttribute('data-reason');
    render(controller.snapshot());
  });

  $('noteInput').addEventListener('input', function (e) {
    form.note = e.target.value;
    var hint = $('dlgHint');
    hint.hidden = !(form.reason === 'other' && !form.note.trim());
  });

  $('btnCancel').addEventListener('click', function () {
    controller.closeMakeup();
  });

  $('btnConfirm').addEventListener('click', function () {
    controller.submitMakeup({ reason: form.reason, note: form.note });
  });

  // ---------- 录制脚本用的只读辅助 ----------
  window.__demoHelpers = {
    center: function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    },
    snapshot: function () { return controller.snapshot(); },
    counters: function () { return { list: counters.list, makeup: counters.makeup, loads: loads, loadId: loadId }; },
    firstUnchecked: function () {
      var row = document.querySelector('.row [data-makeup]');
      if (!row) return null;
      var id = row.getAttribute('data-makeup');
      return { id: id, selector: '[data-makeup="' + id + '"]' };
    },
  };

  // ---------- 启动 ----------
  controller.mount(mockMod.MOCK_EVENT_ID, (mockMod.MOCK_EVENT && mockMod.MOCK_EVENT.title) || '2026 秋季合作伙伴大会');
})();
