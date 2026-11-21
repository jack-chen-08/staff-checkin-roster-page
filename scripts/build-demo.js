#!/usr/bin/env node
/**
 * 为「AC-2 手动补签交互演示」构建浏览器可用的逻辑包。
 *
 * 做两件事：
 *   1. 用 tsc 把 miniprogram/logic/*.ts + miniprogram/mock/checkin-list.ts 编译成 CommonJS（.demo-build/）
 *   2. 把这些编译产物打成一个 IIFE 包（preview/demo-bundle.js），带一个极小的 require shim，
 *      让浏览器里跑的是**与小程序页面完全同一份**业务逻辑（controller / checkin / api / mock），
 *      而不是另写一份演示代码。
 *
 * 用法：node scripts/build-demo.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, '.demo-build');
const OUT = path.join(ROOT, 'preview', 'demo-bundle.js');

fs.rmSync(BUILD, { recursive: true, force: true });

const sources = [
  'miniprogram/logic/checkin.ts',
  'miniprogram/logic/api.ts',
  'miniprogram/logic/debounce.ts',
  'miniprogram/logic/refresh.ts',
  'miniprogram/logic/controller.ts',
  'miniprogram/mock/checkin-list.ts',
];

execSync(
  `npx tsc ${sources.join(' ')} --outDir .demo-build --rootDir miniprogram ` +
    `--module commonjs --target ES2020 --skipLibCheck --esModuleInterop`,
  { cwd: ROOT, stdio: 'inherit' },
);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const files = walk(BUILD);
const chunks = files.map((file) => {
  const id = path.relative(BUILD, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  return `define(${JSON.stringify(id)}, function (module, exports, require) {\n${src}\n});\n`;
});

const bundle = `/* 自动生成，请勿手改 —— node scripts/build-demo.js
 * 内容来源：miniprogram/logic/*.ts + miniprogram/mock/checkin-list.ts（tsc 编译，CommonJS 包装）
 * 生成时间：${new Date().toISOString()}
 */
(function (global) {
  var defs = {};
  var cache = {};
  function define(name, fn) { defs[name] = fn; }
  function normalize(base, spec) {
    if (spec.charAt(0) !== '.') return spec;
    var parts = base.split('/');
    parts.pop();
    spec.split('/').forEach(function (seg) {
      if (seg === '.' || seg === '') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    var resolved = parts.join('/');
    return /\\.js$/.test(resolved) ? resolved : resolved + '.js';
  }
  function requireModule(id) {
    if (cache[id]) return cache[id].exports;
    var fn = defs[id];
    if (!fn) throw new Error('module not found: ' + id);
    var mod = { exports: {} };
    cache[id] = mod;
    fn(mod, mod.exports, function (spec) { return requireModule(normalize(id, spec)); });
    return mod.exports;
  }
${chunks.join('\n')}
  global.CheckinModules = { require: requireModule };
})(window);
`;

fs.writeFileSync(OUT, bundle);
const size = fs.statSync(OUT).size;
console.log(`OK ${path.relative(ROOT, OUT)} ${size} bytes, ${files.length} modules`);
