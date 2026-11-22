#!/usr/bin/env node
// Static mobile-ready check for a web game's source. Read-only, no dependencies.
//   node check.mjs <gameDir>
// Exit 0 = no FAIL (WARN/INFO lines still need a look). Exit 1 = at least one FAIL. Exit 2 = bad usage.
// It reads index.html, package.json and the source tree; it cannot see runtime behaviour, so a pass here is
// necessary, not sufficient: the runtime probes in references/measure.md are the proof.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

process.on('uncaughtException', (e) => {
  console.error(`mobile-ready check: ${e.code ? `${e.code} ` : ''}${e.message}`);
  process.exit(2);
});

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'index.html'))) {
  console.error('usage: node check.mjs <gameDir>   (the directory holding index.html)');
  process.exit(2);
}

const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'android', 'ios', 'public', 'coverage', '.claude']);
const EXT = /\.(ts|tsx|js|jsx|mjs|css|vue|svelte)$/;
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(d, e.name)); }
    else if (EXT.test(e.name) && !/\.(test|spec)\./.test(e.name) && statSync(join(d, e.name)).size < 2e6) files.push(join(d, e.name));
  }
})(existsSync(join(dir, 'src')) ? join(dir, 'src') : dir);

const html = readFileSync(join(dir, 'index.html'), 'utf8');
const pkgPath = join(dir, 'package.json');
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const src = files.map((f) => ({ f: relative(dir, f), t: readFileSync(f, 'utf8') }));
const all = html + '\n' + src.map((s) => s.t).join('\n');
// Comments and logs name lifecycle events without handling them; listener checks read code only.
const stripComments = (t) => {
  let o = '', q = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { o += c; if (c === '\\') o += t[++i] ?? ''; else if (c === q) q = null; continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; o += '\n'; continue; }
    if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 1; o += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    o += c;
  }
  return o;
};
const code = html.replace(/<!--[\s\S]*?-->/g, '') + '\n' +
  src.map((s) => /\.css$/.test(s.f) ? '' : stripComments(s.t)).join('\n');
const where = (re) => src.filter((s) => re.test(s.t)).map((s) => s.f).slice(0, 3).join(', ');
const lines = (re) => src.flatMap((s) => s.t.split('\n')).filter((l) => re.test(l));

const out = [];
const add = (level, id, msg) => out.push({ level, id, msg });

// Safe area
if (!/<meta[^>]+name=["']viewport["'][^>]*viewport-fit=cover/i.test(html))
  add('FAIL', 'viewport-fit', 'index.html viewport meta has no viewport-fit=cover: env(safe-area-inset-*) reads 0 and the HUD sits under the notch.');
const usesEnv = /env\(\s*safe-area-inset-/.test(all);
const usesVar = /var\(\s*--safe-area-inset-/.test(all);
if (usesEnv && !usesVar)
  add('FAIL', 'safe-area-android', 'Safe area comes from env() only. Older Android WebViews report env() as 0 while the native shell writes --safe-area-inset-*: use var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) for all four sides.');
else if (!usesEnv && !usesVar && !/safeArea|SafeInsets|getContentRect/i.test(all))
  add('WARN', 'safe-area-unread', 'Nothing reads the safe area. A canvas-drawn HUD takes no CSS padding, so it must read the insets itself.');

// Backgrounding and audio
// pagehide alone is not enough: a backgrounded tab or app fires visibilitychange, not pagehide.
const Q = '[\'"`]';
const listens = new RegExp(`addEventListener\\(\\s*${Q}visibilitychange${Q}|\\bonvisibilitychange\\s*=|` +
  `\\.addListener\\(\\s*${Q}(?:appStateChange|pause)${Q}`).test(code);
// GamelabsApp always starts an AudioService that pauses its own sounds on visibilitychange — nothing else.
const gamelabsApp = /from\s+['"]@gamebyte\/gamelabsjs[^'"]*['"]/.test(code) && /\b(?:extends|new)\s+GamelabsApp\b/.test(code);
const mentions = /visibilitychange|appStateChange|document\.hidden|visibilityState/.test(code);
if (listens) { /* handled */ }
else if (gamelabsApp)
  add('WARN', 'lifecycle-gamelabs', 'Only gamelabs reacts to backgrounding: its AudioService pauses on visibilitychange, but the game state, its timers and any sound outside AudioService keep running. Pause the game on visibilitychange / appStateChange.');
else if (mentions)
  add('WARN', 'lifecycle', `Lifecycle reference without a listener (${where(/visibilitychange|appStateChange|document\.hidden|visibilityState/)}): nothing found calls addEventListener('visibilitychange'), sets onvisibilitychange or App.addListener('appStateChange'). Polling document.hidden in the loop can work; check that a backgrounded game stops and goes silent.`);
else
  add('FAIL', 'lifecycle', /pagehide/.test(code)
    ? 'Only pagehide is handled: it fires when the page is unloaded or cached, while switching apps or tabs fires visibilitychange (and the shell\'s appStateChange), so a backgrounded game keeps running and playing sound.'
    : 'No visibilitychange / appStateChange listener: a backgrounded game keeps running and playing sound.');
const ownCtx = /new\s+(window\.)?(webkit)?AudioContext\b|new\s+\(?\s*window\.AudioContext/.test(all);
if (ownCtx && !/\.suspend\s*\(/.test(all))
  add('FAIL', 'audio-background', `The game creates its own AudioContext (${where(/AudioContext/)}) but never calls suspend(): listening to visibilitychange is not the same as stopping the sound.`);

// Pixel ratio
const renders = /pixi|three|gamelabs|phaser/i.test(Object.keys(deps).join(' ')) || /getContext\(\s*['"](2d|webgl)/.test(all);
const capped = lines(/devicePixelRatio|\bdpr\w*/i).some((l) => /Math\.min|clamp|\bcap|limit/i.test(l)) ||
  lines(/setPixelRatio\s*\(/).some((l) => /Math\.min|\d|CAP|cap/.test(l));
if (renders && !capped)
  add('WARN', 'dpr-cap', 'No capped devicePixelRatio found. A phone reports 3 and the gamelabs host hands the raw value to the 3D renderer on every resize: cap it in onResize (touch 1.5, other 2) and measure every <canvas>.');

// Android back button
if (deps['@capacitor/app'] && !/backButton/.test(all))
  add('FAIL', 'back-button', '@capacitor/app is installed but nothing listens to backButton: the Android back key does nothing or quits mid-run.');

// Haptics
if (/navigator\.vibrate/.test(all) && !deps['@capacitor/haptics'])
  add('WARN', 'haptics', 'navigator.vibrate does nothing on iOS: use the native haptics plugin in a store build.');

// three.js
const usesThree = /from\s+['"]three(\/[^'"]*)?['"]|require\(\s*['"]three['"]\s*\)/.test(all);
if (usesThree && !/\.compile(Async)?\s*\(/.test(all))
  add('WARN', 'three-warmup', `three.js is used (${where(/from\s+['"]three/)}) but nothing calls renderer.compile(): the first appearance of a pooled enemy, effect or light stalls the frame while shaders compile.`);
if (usesThree && !/webglcontextlost/.test(all))
  add('INFO', 'context-lost', 'No webglcontextlost handler: a phone that runs out of GPU memory shows a frozen or black canvas with no recovery.');
const fullEntry = /from\s+['"][^'"]*gamelabsjs['"]/.test(all);
if (fullEntry && !usesThree)
  add('INFO', 'empty-3d-world', 'The game imports the full gamelabs entry but no three.js: an undrawn 3D world may still render every frame at raw DPR. Measure its canvas; size its renderer to 1x1 in onResize, or use the 2D (core) entry.');

const order = { FAIL: 0, WARN: 1, INFO: 2 };
out.sort((a, b) => order[a.level] - order[b.level]);
console.log(`mobile-ready static check: ${dir}  (${src.length} source files)`);
for (const o of out) console.log(`${o.level.padEnd(4)}  ${o.id.padEnd(18)} ${o.msg}`);
const fails = out.filter((o) => o.level === 'FAIL').length;
console.log(fails ? `RESULT: FAIL (${fails})` : `RESULT: pass${out.length ? ' (read the WARN/INFO lines)' : ''} — now run the runtime probes`);
process.exit(fails ? 1 : 0);
