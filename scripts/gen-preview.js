#!/usr/bin/env node
/**
 * 生成截图用静态 HTML（preview/*.html）。
 * 数据源直接复用 miniprogram/mock/checkin-list.ts，避免截图与代码不一致。
 * 用法：node scripts/gen-preview.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, '.preview-build');

fs.rmSync(BUILD, { recursive: true, force: true });
execSync(
  `npx tsc miniprogram/mock/checkin-list.ts --outDir .preview-build --rootDir miniprogram ` +
    `--module commonjs --target ES2020 --skipLibCheck --esModuleInterop`,
  { cwd: ROOT, stdio: 'inherit' },
);

const { MOCK_RECORDS, MOCK_EVENT } = require(path.join(BUILD, 'mock/checkin-list.js'));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const tail = (ticketNo) => String(ticketNo).replace(/[\s-]/g, '').slice(-4);
const initials = (name) => name.slice(-2);

const expected = MOCK_RECORDS.length;
const arrived = MOCK_RECORDS.filter((r) => r.checkedIn).length;
const rate = Math.round((arrived / expected) * 100);

const RING_R = 54;
const CIRC = 2 * Math.PI * RING_R;

function ring() {
  const dash = ((rate / 100) * CIRC).toFixed(2);
  return `<div class="ring">
        <svg width="139" height="139" viewBox="0 0 139 139">
          <circle cx="69.5" cy="69.5" r="${RING_R}" fill="none" stroke="#e7e7e7" stroke-width="9"/>
          <circle cx="69.5" cy="69.5" r="${RING_R}" fill="none" stroke="#0052d9" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="${dash} ${CIRC.toFixed(2)}"
            transform="rotate(-90 69.5 69.5)"/>
        </svg>
        <div class="ring-center">
          <div class="ring-num">${rate}<small>%</small></div>
          <div class="ring-cap">签到率</div>
        </div>
      </div>`;
}

function row(r) {
  const ok = r.checkedIn;
  const time = ok && r.checkinAt ? String(r.checkinAt).slice(0, 5) : '';
  return `<div class="row">
        <div class="avatar${ok ? ' ok' : ''}">${esc(initials(r.name))}</div>
        <div class="row-main">
          <div class="row-head">
            <span class="row-name">${esc(r.name)}</span>
            <span class="tag ${ok ? 'ok' : 'grey'}">${ok ? (r.checkinMethod === 'manual' ? '手动' : '扫码') : '未签到'}</span>
          </div>
          <div class="row-company">${esc(r.company)}</div>
          <div class="row-meta">
            <span>票号 ${esc(tail(r.ticketNo))}</span>
            ${ok ? `<span class="time">${time} 已签到</span>` : ''}
          </div>
        </div>
        ${ok ? '' : '<div class="row-action"><span class="btn-makeup">手动补签</span></div>'}
      </div>`;
}

function tabs(active) {
  const items = [
    ['all', '全部'],
    ['checked', '已签到'],
    ['unchecked', '未签到'],
  ];
  return items
    .map(
      ([key, label]) =>
        `<div class="tab${key === active ? ' active' : ''}">${label}</div>`,
    )
    .join('');
}

function page({ activeTab, records, footer }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<title>员工签到名单</title>
<link rel="stylesheet" href="preview.css">
<link rel="stylesheet" href="checkin.css">
</head>
<body>
<div class="statusbar"><span>9:41</span><span class="sig">●●● ▮▮</span></div>
<div class="navbar"><span class="back">‹</span>员工签到名单<span class="capsule">···　⊙</span></div>
<div class="page">
  <div class="hero">
    <div class="hero-top">
      <div>
        <div class="hero-title">${esc(MOCK_EVENT.title)}</div>
        <div class="hero-sub">${esc(MOCK_EVENT.date)} · 员工签到台</div>
      </div>
      <div class="live"><i></i>30 秒自动刷新</div>
    </div>
    <div class="hero-body">
      ${ring()}
      <div class="kpis">
        <div class="kpi"><div class="kpi-num">${expected}</div><div class="kpi-label">应到</div></div>
        <div class="kpi-split"></div>
        <div class="kpi"><div class="kpi-num ok">${arrived}</div><div class="kpi-label">已到</div></div>
        <div class="kpi-split"></div>
        <div class="kpi"><div class="kpi-num grey">${expected - arrived}</div><div class="kpi-label">未到</div></div>
      </div>
    </div>
    <div class="hero-foot"><span>最近更新 10:12:30</span><span>名单共 ${expected} 人</span></div>
  </div>

  <div class="filters">
    <div class="tabs">${tabs(activeTab)}</div>
    <div class="search">
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2">
        <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21" stroke-linecap="round"/>
      </svg>
      <input value="" placeholder="搜索姓名 / 企业 / 票号后 4 位" readonly>
    </div>
  </div>

  <div class="list">
      ${records.map(row).join('\n      ')}
    <div class="list-foot">${esc(footer)}</div>
  </div>
</div>
</body>
</html>
`;
}

const checkedRows = MOCK_RECORDS.filter((r) => r.checkedIn);
const uncheckedRows = MOCK_RECORDS.filter((r) => !r.checkedIn);

const pages = [
  {
    file: 'all.html',
    activeTab: 'all',
    records: MOCK_RECORDS.slice(0, 12),
    footer: '共 48 人 · 上滑加载更多',
  },
  {
    file: 'checked.html',
    activeTab: 'checked',
    records: checkedRows.slice(0, 12),
    footer: '已签到 25 人 · 上滑加载更多',
  },
  {
    file: 'unchecked.html',
    activeTab: 'unchecked',
    records: uncheckedRows.slice(0, 12),
    footer: '未签到 23 人 · 上滑加载更多',
  },
];

for (const p of pages) {
  const target = path.join(ROOT, 'preview', p.file);
  fs.writeFileSync(target, page(p), 'utf8');
  console.log('generated', path.relative(ROOT, target));
}
