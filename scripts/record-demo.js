#!/usr/bin/env node
/**
 * AC-2 证据录制脚本（真实交互 · 同一次会话）
 *
 * 做的事：
 *   1. 启动 headless Chrome，打开 preview/interactive.html（页面跑的是 miniprogram/logic 的同一份代码）
 *   2. 用 CDP 真实鼠标事件（Input.dispatchMouseEvent）完成一次「手动补签」
 *   3. 在 6 个关键时刻各截一帧（2x），并记录当时的业务快照（rows / stats / 计数）
 *   4. 把帧序列 + 机读日志写进 demo/evidence/ac2/
 *
 * 产物：
 *   demo/evidence/ac2/frame-01.png … frame-06.png   （连续帧，同一 load ID）
 *   demo/evidence/ac2/session-log.json              （load ID / 接口次数 / 补签前后 stats 与目标行）
 *
 * 用法：node scripts/record-demo.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'demo', 'evidence', 'ac2');
const PAGE = 'file://' + path.join(ROOT, 'preview', 'interactive.html');
const PORT = 9412;
const CHROME = process.env.CHROME_BIN || `${process.env.HOME}/.local/chrome-for-testing/chrome-linux64/chrome`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(path.join(OUT_DIR, 'frame-01.png'), { force: true });

  const profile = fs.mkdtempSync('/tmp/ac2-chrome-');
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--window-size=390,900',
      '--disable-dbus',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  chrome.stderr.on('data', () => {});

  // 等 DevTools 端口就绪
  let wsUrl = null;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const info = await res.json();
      wsUrl = info.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch (e) { /* not ready */ }
    await sleep(100);
  }
  if (!wsUrl) throw new Error('Chrome DevTools 端口未就绪');

  // 浏览器级连接 → 新建页面 target
  const browserWs = new WebSocket(wsUrl);
  await new Promise((r, j) => { browserWs.onopen = r; browserWs.onerror = j; });
  let seq = 0;
  const pending = new Map();
  browserWs.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const bsend = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      browserWs.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await bsend('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => bsend(method, params, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 900, deviceScaleFactor: 2, mobile: true,
  });

  const loaded = new Promise((resolve) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') { browserWs.removeEventListener('message', onMsg); resolve(); }
    };
    browserWs.addEventListener('message', onMsg);
  });
  await send('Page.navigate', { url: PAGE });
  await loaded;
  await sleep(1800); // 等 mock 首屏加载 + 渲染完成

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  let frameNo = 0;
  const shots = [];
  const shot = async (label) => {
    frameNo += 1;
    const name = `frame-${String(frameNo).padStart(2, '0')}.png`;
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(data, 'base64'));
    shots.push({ frame: name, label, at: new Date().toISOString() });
    console.log(`  ✓ ${name}  ${label}`);
    return name;
  };

  const moveCursor = async (x, y) => {
    await evaluate(`(function(){var c=document.getElementById('cursor');
      c.style.left=((${x})-6)+'px';c.style.top=((${y})-3)+'px';c.classList.add('show');})()`);
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await evaluate(`(function(){var r=document.getElementById('clickRing');
      r.style.left=${x}+'px';r.style.top=${y}+'px';r.classList.remove('go');void r.offsetWidth;r.classList.add('go');})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  // ---------- 第 0 步：页面就绪 ----------
  const target = await evaluate('JSON.stringify(window.__demoHelpers.firstUnchecked())');
  const before = await evaluate('JSON.stringify({snapshot:window.__demoHelpers.snapshot(),counters:window.__demoHelpers.counters()})');
  console.log('目标行:', target);

  await shot('初始：顾清和等仍未签到，顶部 已到 25 / 未到 23');

  // ---------- 第 1 步：移动光标到「手动补签」 ----------
  const btn = await evaluate(`JSON.stringify(window.__demoHelpers.center('[data-makeup]'))`);
  const b = JSON.parse(btn);
  await moveCursor(b.x, b.y);
  await sleep(500);
  await shot('光标移到该行「手动补签」按钮（未点击）');

  // ---------- 第 2 步：点击按钮 → 弹窗 ----------
  await clickAt(b.x, b.y);
  await sleep(650);
  await shot('点击后弹出手动补签弹窗，要求必选补签原因');

  // ---------- 第 3 步：选择原因 ----------
  const radio = JSON.parse(await evaluate(`JSON.stringify(window.__demoHelpers.center('[data-reason="no-phone"]'))`));
  await moveCursor(radio.x, radio.y);
  await clickAt(radio.x, radio.y);
  await sleep(450);
  await shot('选择补签原因「未带手机」');

  // ---------- 第 4 步：确认提交 ----------
  const confirmBtn = JSON.parse(await evaluate(`JSON.stringify(window.__demoHelpers.center('#btnConfirm'))`));
  await moveCursor(confirmBtn.x, confirmBtn.y);
  await clickAt(confirmBtn.x, confirmBtn.y);
  await sleep(160);
  await shot('点「确认补签」后立即截取：按钮进入提交中（接口调用已发出）');

  // ---------- 第 5 步：补签完成 ----------
  await sleep(1300);
  await shot('同一会话内：该行变「手动 · 已签到」，顶部 已到 26 / 未到 22，load ID 未变');
  await sleep(1400);
  await shot('提示消失后的稳定态：仍是同一次页面加载（load ID 未变、整页重载 0 次）');

  const after = await evaluate('JSON.stringify({snapshot:window.__demoHelpers.snapshot(),counters:window.__demoHelpers.counters()})');

  const log = {
    page: path.relative(ROOT, path.join(ROOT, 'preview', 'interactive.html')),
    capturedAt: new Date().toISOString(),
    viewport: { width: 390, height: 900, deviceScaleFactor: 2 },
    interaction: 'real CDP mouse events (Input.dispatchMouseEvent) in a single page session',
    frames: shots,
    before: JSON.parse(before),
    after: JSON.parse(after),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'session-log.json'), JSON.stringify(log, null, 2));

  console.log('\n=== 前后对比 ===');
  console.log('before stats:', JSON.stringify(log.before.snapshot.stats), 'loads:', log.before.counters.loads);
  console.log('after  stats:', JSON.stringify(log.after.snapshot.stats), 'loads:', log.after.counters.loads);
  console.log('接口调用:', JSON.stringify(log.after.counters));

  browserWs.close();
  chrome.kill('SIGKILL');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

main().catch((err) => {
  console.error('录制失败:', err);
  process.exit(1);
});
