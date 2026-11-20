#!/usr/bin/env node
/**
 * Finds fades faked with stacked shapes in a game's source: a loop that draws rings, bands, strips or discs and
 * steps their fill from one pass to the next. On screen each step shows as a visible ring or band. The fix is one
 * shape with one gradient fill (PixiJS v8 `FillGradient`, Canvas 2D `createLinearGradient` / `createRadialGradient`);
 * SKILL.md next to this file has the code.
 *
 *   node check.mjs <gameDir | file>...     # exit 0 = none found, 1 = found (each printed as file:line), 2 = bad input
 *
 * A loop is reported when it draws a shape and fills it, and either
 *   - the fill changes with the loop (an alpha or colour computed from the loop counter); for a stroke, only when the
 *     shapes are concentric (rings of one centre), or
 *   - the shape's size changes with the loop, its position does not, and the fill is translucent (stacked discs).
 * Not reported: a colour looked up from a list (`palette[i]`) or mixed with per-item data (a particle's age, a
 * random number, `%`), a tapered stroke along a path, a loop of fewer than 6 passes with literal bounds (a
 * glow layer under a line), shapes drawn on a new object each pass (one Graphics per particle or per button), and
 * stacked outlines (strokes of growing size are line art).
 *
 * A loop that really needs stepped fills (a trail of separate dots, a stepped pixel-art sky) is waived with a
 * comment on the line above the loop: `// gradient-check: ok <reason>`.
 *
 * It reads source text only (.ts .tsx .js .jsx .mjs .cjs under the paths given; node_modules, dist and build are
 * skipped) and needs no dependency.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
// Shape calls and the argument positions that set the shape's size (the rest set its position).
const SHAPES = {
  circle: [2], ellipse: [2, 3], rect: [2, 3], roundRect: [2, 3, 4], drawCircle: [2], drawEllipse: [2, 3],
  drawRect: [2, 3], drawRoundedRect: [2, 3, 4], regularPoly: [2], star: [3, 4], arc: [2],
  poly: [], moveTo: [], lineTo: [], fillRect: [2, 3],
};
const FILLS = new Set(['fill', 'stroke', 'beginFill', 'lineStyle', 'setStrokeStyle', 'setFillStyle']);
const FILL_ONLY = new Set(['fill', 'beginFill', 'setFillStyle']); // stacked outlines are line art, not a fade
const WAIVER = /gradient-check:\s*ok\b/;
const MIN_STEPS = 6; // fewer passes than this make layers (a glow under a line), not a fade

/** Blank comments and string contents (keeping `${...}` in template literals), preserving offsets and newlines. */
export function blank(src) {
  const out = src.split('');
  const wipe = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  const n = src.length;
  const tpl = []; // brace depth stack for template-literal substitutions
  while (i < n) {
    const c = src[i];
    if (tpl.length && c === '}' && tpl[tpl.length - 1] === 0) { tpl.pop(); i = template(i + 1); continue; }
    if (tpl.length && c === '{') tpl[tpl.length - 1]++;
    if (tpl.length && c === '}') tpl[tpl.length - 1]--;
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; wipe(i, j); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; wipe(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      wipe(i + 1, j); i = j + 1; continue;
    }
    if (c === '`') { i = template(i + 1); continue; }
    i++;
  }
  return out.join('');

  // Inside a template literal from `j`: blank text up to the closing backtick or a `${`.
  function template(j) {
    const start = j;
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '`') { wipe(start, j); return j + 1; }
      if (src[j] === '$' && src[j + 1] === '{') { wipe(start, j); tpl.push(0); return j + 2; }
      j++;
    }
    wipe(start, n);
    return n;
  }
}

/** Index of the bracket that closes the one at `open` (same kind), or -1. */
function close(s, open) {
  const o = s[open];
  const c = { '(': ')', '{': '}', '[': ']' }[o];
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === o) d++;
    else if (s[k] === c && --d === 0) return k;
  }
  return -1;
}

/** Split at top-level `sep`. */
function splitTop(s, sep) {
  const parts = [];
  let d = 0, from = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
    else if (ch === sep && d === 0) { parts.push(s.slice(from, k)); from = k + 1; }
  }
  parts.push(s.slice(from));
  return parts;
}

/** Split a call's argument text at top-level commas. */
function splitArgs(s) {
  const parts = [];
  let d = 0, from = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
    else if (ch === ',' && d === 0) { parts.push(s.slice(from, k)); from = k + 1; }
  }
  parts.push(s.slice(from));
  return parts;
}

/** The identifiers an expression reads: not property names after `.`, not object keys before `:`. */
function reads(expr) {
  const names = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  let m;
  while ((m = re.exec(expr))) {
    const before = expr.slice(0, m.index).trimEnd();
    if (before.endsWith('.') && !before.endsWith('..')) continue;
    const after = expr.slice(m.index + m[0].length).trimStart();
    if (after.startsWith(':') && !after.startsWith('::') && /[{,]$/.test(before)) continue;
    names.add(m[0]);
  }
  return names;
}

/** `expr` with every `[...]` lookup removed: `palette[i]` reads `palette`, not `i`. */
function withoutLookups(expr) {
  let s = expr;
  for (let k = s.indexOf('['); k >= 0; k = s.indexOf('[', k)) {
    const e = close(s, k);
    if (e < 0) break;
    s = s.slice(0, k) + s.slice(e + 1);
  }
  return s;
}

const depends = (expr, dep) => [...reads(expr)].some((x) => dep.has(x));

/** Every call `.<name>(args)` or `<name>(args)` in `body`: { name, args: [text], at: offset }. */
function calls(body, names) {
  const out = [];
  const re = /(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[1];
    if (!names(name)) continue;
    const open = m.index + m[0].length - 1;
    const end = close(body, open);
    if (end < 0) continue;
    out.push({ name, args: splitArgs(body.slice(open + 1, end)), at: open });
  }
  return out;
}

/** How many passes a loop head makes when its bounds are literals, else Infinity. */
function steps(kind, head) {
  if (kind !== 'for') return Infinity;
  const of = /\s(?:of|in)\s+([\s\S]*)$/.exec(head);
  if (of) {
    const list = of[1].trim().replace(/\s+as\s+const$/, '');
    return list.startsWith('[') && close(list, 0) === list.length - 1 ? splitArgs(list.slice(1, -1)).filter((x) => x.trim()).length : Infinity;
  }
  const m = /=\s*(-?\d+(?:\.\d+)?)\s*[,;][^;]*?(<=?)\s*(-?\d+(?:\.\d+)?)\s*;/.exec(head);
  return m ? Math.max(0, Number(m[3]) - Number(m[1]) + (m[2] === '<=' ? 1 : 0)) : Infinity;
}

/** The root name of the object a call at `open` (its `(`) is made on: `b.bg.rect(...).fill(` -> `b`. */
function receiver(s, open) {
  let k = open - 1;
  const ident = () => { const e = k + 1; while (k >= 0 && /[\w$]/.test(s[k])) k--; return s.slice(k + 1, e); };
  const ws = () => { while (k >= 0 && /\s/.test(s[k])) k--; };
  let root = '', prev = '';
  ident(); // the method name
  for (;;) {
    ws();
    if (s[k] === '?' && s[k + 1] === '.') k--;
    if (s[k] !== '.') return root;
    k--; ws();
    while (s[k] === ')' || s[k] === ']') { // a call or lookup in the chain: step over it
      const o = s[k] === ')' ? '(' : '[', c = s[k];
      let d = 0;
      for (; k >= 0; k--) { if (s[k] === c) d++; else if (s[k] === o && --d === 0) break; }
      k--; ws();
    }
    const name = ident();
    if (!name) return root;
    prev = root; root = name;
    if (root === 'this') return prev ? `this.${prev}` : 'this';
  }
}

/** The loops in blanked source: { at, vars, body, bodyAt, steps }. */
function loops(s) {
  const out = [];
  const re = /(?:^|[^\w$.])(for|while)\s*\(/g;
  let m;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1;
    const end = close(s, open);
    if (end < 0) continue;
    const head = s.slice(open + 1, end);
    const vars = new Set();
    if (m[1] === 'for') {
      const decl = /^\s*(?:let|const|var)?\s*([\s\S]*?)\s+(?:of|in)\s/.exec(head) || /^\s*(?:let|const|var)?\s*([^;]*);/.exec(head);
      if (decl) for (const part of splitArgs(decl[1])) {
        const v = /^\s*[[{]?\s*([A-Za-z_$][\w$]*)/.exec(part);
        if (v) vars.add(v[1]);
      }
    } else for (const v of reads(head)) vars.add(v);
    let k = end + 1;
    while (/\s/.test(s[k] || '')) k++;
    let body, bodyAt;
    if (s[k] === '{') { const e = close(s, k); if (e < 0) continue; body = s.slice(k + 1, e); bodyAt = k + 1; }
    else { const e = s.indexOf(';', k); body = s.slice(k, e < 0 ? s.length : e + 1); bodyAt = k; }
    const counter = m[1] === 'for' && splitTop(head, ';').length === 3;
    out.push({ at: m.index + m[0].length - m[1].length - 1, vars, body, bodyAt, counter, steps: steps(m[1], head) });
  }
  return out;
}

/**
 * Names that change with the loop (`all`), and the subset that is a plain ramp of its counter (`ramp`): computed
 * from the counter with arithmetic only. A value that also passes through a lookup by the counter, a member of a
 * per-pass object, `%`, a random number or the clock is per-item data (a particle, a grid cell), not a fade.
 */
function loopDependent(loop) {
  const all = new Set(loop.vars), ramp = new Set(loop.counter ? loop.vars : []);
  const defs = [...loop.body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g),
    ...loop.body.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=\s*([^,;\n]*)/g)].map((m) => [m[1], m[2]]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, rhs] of defs) {
      if (!all.has(name) && depends(rhs, all)) { all.add(name); grew = true; }
      if (!ramp.has(name) && depends(withoutLookups(rhs), ramp) && !impure(rhs, all)) { ramp.add(name); grew = true; }
    }
  }
  return { all, ramp };
}

/** True when `expr` mixes the loop with per-item data: see loopDependent. */
function impure(expr, dep) {
  if (/Math\.random|\.now\s*\(|%/.test(expr)) return true;
  for (let k = expr.indexOf('['); k >= 0; k = expr.indexOf('[', k + 1)) {
    const e = close(expr, k);
    if (e > k && depends(expr.slice(k + 1, e), dep)) return true;
  }
  for (const m of expr.matchAll(/([A-Za-z_$][\w$]*)\s*\??\.\s*[A-Za-z_$]/g)) {
    if (dep.has(m[1]) && !/\.\s*$/.test(expr.slice(0, m.index))) return true;
  }
  for (const part of splitArgs(expr.replace(/^\s*\{|\}\s*$/g, ''))) {
    const q = part.indexOf('?');
    if (q > 0 && part[q + 1] !== '.' && part[q + 1] !== '?' && depends(part.slice(part.indexOf(':') + 1 || 0, q), dep)) return true;
  }
  return false;
}

const lineOf = (s, at) => s.slice(0, at).split('\n').length;
const translucent = (style) => /\balpha\s*:/.test(style) || /rgba\s*\(|hsla\s*\(/.test(style) || /#[0-9a-f]{8}\b/i.test(style)
  || /^\s*[^,]+,\s*[^,]+$/.test(style) /* beginFill(color, alpha) */;

/** Findings for one source text: [{ line, fillLine, why }]. */
export function scan(src) {
  const s = blank(src);
  const lines = src.split('\n');
  const found = [];
  const seen = new Set();
  for (const loop of loops(s)) {
    const loopLine = lineOf(s, loop.at);
    if (WAIVER.test(lines[loopLine - 2] || '') || WAIVER.test(lines[loopLine - 1] || '')) continue;
    if (loop.steps < MIN_STEPS) continue; // a glow under a line, a mirrored pair: layers, not a fade
    if (!loop.counter) continue; // `for (const p of particles)`: one shape per item, not a stack
    const { all: dep, ramp } = loopDependent(loop);
    // Shapes drawn on a new object each pass (`const s = new Graphics()`, `b.bg` of each button) are separate
    // objects, not a stack: only a target that stays the same through the loop can build a fade.
    const own = new Set([...loop.body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
    const same = (c) => { const r = receiver(loop.body, c.at); return !(dep.has(r) || own.has(r)); };
    const shapes = calls(loop.body, (x) => x in SHAPES).filter(same);
    const fills = calls(loop.body, (x) => FILLS.has(x)).filter(same);
    if (!shapes.length || !fills.length) continue;
    let why = null, at = 0;
    // Concentric: a shape whose size ramps with the loop while its position stays put (rings, discs, a vignette).
    const concentric = shapes.filter((sh) => {
      const size = SHAPES[sh.name];
      return size.some((k) => sh.args[k] !== undefined && depends(sh.args[k], ramp) && !impure(sh.args[k], dep))
        && !sh.args.some((a, k) => !size.includes(k) && depends(a, dep));
    });
    for (const f of fills) {
      const style = f.args.join(',');
      if (/\bnew\s+FillGradient\b/.test(style)) continue;
      const read = reads(withoutLookups(style));
      if (![...read].some((x) => ramp.has(x))) continue;
      if (impure(style, dep) || [...read].some((x) => dep.has(x) && !ramp.has(x))) continue; // mixed with per-item data
      if (!FILL_ONLY.has(f.name) && !concentric.length) continue; // a tapered stroke along a path: line art
      why = 'its fill changes with each pass of the loop'; at = f.at; break;
    }
    if (!why && concentric.length && fills.some((f) => FILL_ONLY.has(f.name) && translucent(f.args.join(',')))) {
      why = 'it stacks translucent shapes of growing size on one centre'; at = concentric[0].at;
    }
    if (!why) continue;
    const fillLine = lineOf(s, loop.bodyAt + at);
    if (seen.has(fillLine)) continue; // an outer loop around the same fill: report it once
    seen.add(fillLine);
    found.push({ line: loopLine, fillLine, why });
  }
  return found;
}

function files(path, acc = []) {
  const st = statSync(path);
  if (st.isFile()) { if (EXTS.has(extname(path))) acc.push(path); return acc; }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    files(join(path, name), acc);
  }
  return acc;
}

function main(argv) {
  const paths = argv.filter((a) => !a.startsWith('-'));
  if (!paths.length || argv.includes('--help') || argv.includes('-h')) {
    console.error('usage: node check.mjs <gameDir | file>...');
    return 2;
  }
  let total = 0, scanned = 0;
  for (const p of paths) {
    if (!existsSync(p)) { console.error(`gradient-check: ${p} does not exist`); return 2; }
    const root = statSync(p).isDirectory() ? (existsSync(join(p, 'src')) ? join(p, 'src') : p) : p;
    for (const f of files(root)) {
      scanned++;
      for (const x of scan(readFileSync(f, 'utf8'))) {
        total++;
        const name = relative(process.cwd(), f) || f;
        console.log(`${name}:${x.line}: a fade made of stacked shapes - ${x.why} (fill at line ${x.fillLine}). Draw one shape with one gradient fill instead.`);
      }
    }
  }
  if (!scanned) {
    console.error(`gradient-check: no .ts, .tsx, .js, .jsx, .mjs or .cjs file under ${paths.join(', ')}; nothing was checked`);
    return 2;
  }
  if (total) {
    console.log(`gradient-check: ${total} stacked-shape fade${total === 1 ? '' : 's'} in ${scanned} file${scanned === 1 ? '' : 's'}. See skills/gradients/SKILL.md.`);
    return 1;
  }
  console.log(`gradient-check: ok, no stacked-shape fade in ${scanned} file${scanned === 1 ? '' : 's'}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
