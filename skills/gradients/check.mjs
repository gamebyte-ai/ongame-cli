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
 * Not reported: a colour looked up per item (`palette[i]`, `colorOf(i)`, `i === cur ? on : off`) or mixed with
 * per-item data (a particle's age, a random number, `%`), a tapered stroke along a path, a loop of fewer than 6 passes with literal bounds (a
 * glow layer under a line), rects 1 px wide or tall (a texture painted pixel by pixel), shapes drawn on a new
 * object each pass (one Graphics per particle or per button), and
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

/**
 * Every call `.<name>(args)` or `<name>(args)` in blanked `body`: { name, args, raw, at }. `raw` holds the same
 * arguments from the unblanked source text `rawBody` (same offsets), so string colours such as 'rgba(...)' survive.
 */
function calls(body, names, rawBody = body) {
  const out = [];
  const re = /(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[1];
    if (!names(name)) continue;
    const open = m.index + m[0].length - 1;
    const end = close(body, open);
    if (end < 0) continue;
    const args = splitArgs(body.slice(open + 1, end));
    let from = open + 1;
    const raw = args.map((a) => { const r = rawBody.slice(from, from + a.length); from += a.length + 1; return r; });
    out.push({ name, args, raw, at: open });
  }
  return out;
}

/**
 * Canvas 2D style assignments (`ctx.fillStyle = ...`, `ctx.globalAlpha = ...`) as fill entries, like calls().
 * `globalAlpha` applies to every paint call on its own context up to that context's next `globalAlpha` set (wrapping
 * round the loop body, since it paints on the next pass too). It counts as a fill when one of those calls is a
 * `fill`/`fillRect`/`fillText`, and as a stroke when they are all `stroke`/`strokeRect`/`strokeText`. With no such
 * call in the body it counts as a fill. Paint calls on another context (`other.fillRect`) do not count.
 */
function styleSets(body, rawBody) {
  const out = [];
  const paints = [...body.matchAll(/\.\s*(fill|stroke)(?:Rect|Text)?\s*\(/g)]
    .map((p) => ({ at: p.index, kind: p[1], on: target(body, p.index + p[0].length - 1) }));
  const alphas = [...body.matchAll(/\.\s*(globalAlpha)\s*=(?!=)/g)]
    .map((a) => ({ at: a.index, on: target(body, a.index + a[0].indexOf(a[1]) + a[1].length) }));
  const paintedBy = (at, on) => {
    const sets = alphas.filter((a) => a.on === on).map((a) => a.at);
    const next = sets.find((a) => a > at);
    const first = sets[0] ?? at;
    // Up to the next set; with none after it, to the end of the body and on from its start up to the first set.
    const mine = paints.filter((p) => p.on === on && (next !== undefined ? p.at > at && p.at < next : p.at > at || p.at < first));
    return !mine.length || mine.some((p) => p.kind === 'fill') ? 'fill' : 'stroke';
  };
  for (const m of body.matchAll(/\.\s*(fillStyle|globalAlpha|strokeStyle)\s*=(?!=)\s*([^;\n]*)/g)) {
    const from = m.index + m[0].length - m[2].length;
    const on = target(body, m.index + m[0].indexOf(m[1]) + m[1].length); // the context it is set on
    const name = m[1] === 'strokeStyle' ? 'stroke' : m[1] === 'globalAlpha' ? paintedBy(m.index, on) : 'fill';
    const value = m[1] === 'globalAlpha' ? `{ alpha: ${m[2]} }` : m[2];
    const raw = m[1] === 'globalAlpha' ? `{ alpha: ${rawBody.slice(from, from + m[2].length)} }` : rawBody.slice(from, from + m[2].length);
    out.push({ name, prop: m[1], args: [value], raw: [raw], at: m.index + 1 + m[1].length + (m[0].indexOf(m[1]) - 1) });
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
  // Count only a step of one (`i++`, `i--`, `i += 1`); any other step (`i += 0.01`) makes the count unknown.
  const parts = splitTop(head, ';');
  if (parts.length !== 3 || !/^\s*(?:[A-Za-z_$][\w$]*\s*(?:\+\+|--|[+-]=\s*1\s*$)|(?:\+\+|--)\s*[A-Za-z_$][\w$]*)\s*$/.test(parts[2])) return Infinity;
  const from = /=\s*(-?\d+(?:\.\d+)?)\s*$/.exec(parts[0]);
  const to = /(<=?|>=?)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(parts[1]);
  if (!from || !to) return Infinity;
  const span = Math.abs(Number(to[2]) - Number(from[1]));
  return span + (to[1].length === 2 ? 1 : 0)
}

/**
 * The root name of the object a call at `open` (its `(`) is made on: `b.bg.rect(...).fill(` -> `b`. A chain that
 * starts with `new` (`new PIXI.Graphics().circle(...)`) gives `new`: a new object, which no variable can be named.
 */
function receiver(s, open) {
  let k = open - 1;
  const ident = () => { const e = k + 1; while (k >= 0 && /[\w$]/.test(s[k])) k--; return s.slice(k + 1, e); };
  const ws = () => { while (k >= 0 && /\s/.test(s[k])) k--; };
  let root = '', prev = '';
  ident(); // the method name
  for (;;) {
    ws();
    if (s[k] === '?' && s[k + 1] === '.') k--;
    if (s[k] !== '.') return /(?:^|[^\w$.])new$/.test(s.slice(Math.max(0, k - 3), k + 1)) ? 'new' : root; // `new X().circle(`: a new object
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

/**
 * The object a drawing call at `open` (its `(`) draws on, as its whole property path: `layer.rings.circle(` ->
 * `layer.rings`, `g.circle(...).stroke(` -> `g`. Two Graphics kept on one owner (`layer.rings`, `layer.path`) are
 * two objects, which `receiver()` (the root name only) cannot tell apart. A chain that starts with `new` gives `new`.
 */
function target(s, open) {
  let k = open - 1;
  const ident = () => { const e = k + 1; while (k >= 0 && /[\w$]/.test(s[k])) k--; return s.slice(k + 1, e); };
  const ws = () => { while (k >= 0 && /\s/.test(s[k])) k--; };
  const path = []; // innermost first: [{ name, called }]
  ident(); // the method name
  for (;;) {
    ws();
    if (s[k] === '?' && s[k + 1] === '.') k--;
    if (s[k] !== '.') {
      if (/(?:^|[^\w$.])new$/.test(s.slice(Math.max(0, k - 3), k + 1))) return 'new';
      break;
    }
    k--; ws();
    let called = false;
    while (s[k] === ')' || s[k] === ']') { // a call or lookup in the chain: step over it
      if (s[k] === ')') called = true;
      const o = s[k] === ')' ? '(' : '[', c = s[k];
      let d = 0;
      for (; k >= 0; k--) { if (s[k] === c) d++; else if (s[k] === o && --d === 0) break; }
      k--; ws();
    }
    const name = ident();
    if (!name) break;
    path.push({ name, called });
  }
  // From the root, the names up to the first call: `g.circle(...)` in `g.circle(...).stroke(` is a drawing call on g.
  const out = [];
  for (const seg of path.reverse()) { out.push(seg.name); if (seg.called) { if (out.length > 1) out.pop(); break; } }
  return out.join('.');
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
    let counter = m[1] === 'for' && splitTop(head, ';').length === 3;
    if (m[1] === 'while') { // a counter while loop steps a name from its condition: `while (i < n) { ...; i++; }`
      const stepped = [...vars].filter((v) => new RegExp(`(?:\\b${v.replace(/\$/g, '\\$')}\\s*(?:\\+\\+|--|[+-]=)|(?:\\+\\+|--)\\s*${v.replace(/\$/g, '\\$')}\\b)`).test(body));
      counter = stepped.length > 0;
      vars.clear(); for (const v of stepped) vars.add(v);
    }
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
  const defs = declarations(loop.body);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, rhs] of defs) {
      if (!all.has(name) && depends(rhs, all)) { all.add(name); grew = true; }
      if (!ramp.has(name) && depends(withoutLookups(rhs), ramp) && !impure(rhs, all)) { ramp.add(name); grew = true; }
    }
  }
  return { all, ramp };
}

/**
 * Every `const|let|var name = value` in `body` as [name, value], one per declarator (`const a = x, b = y`). A
 * declaration runs to its `;`, or to a line end where it is complete: not inside brackets, not after `=` or an
 * operator, and not followed by a line that starts with one (`const t =\n  i / 20;` is one declaration).
 */
function declarations(body) {
  const out = [];
  for (const m of body.matchAll(/(?:^|[^\w$.])(?:const|let|var)\s+/g)) {
    const from = m.index + m[0].length;
    let k = from, d = 0;
    for (; k < body.length; k++) {
      const ch = body[k];
      if ('([{'.includes(ch)) d++;
      else if (')]}'.includes(ch)) { if (--d < 0) break; }
      else if (ch === ';' && d === 0) break;
      else if (ch === '\n' && d === 0 && !/(?:(?<!\+)\+|(?<!-)-|[=*/%&|^!<>?:,~]|^)\s*$/.test(body.slice(from, k))
        && !/^\s*(?:[.?:*/%+\-,=<>&|^]|$)/.test(body.slice(k + 1).split('\n')[0])) break;
    }
    for (const part of splitArgs(body.slice(from, k))) {
      const d = /^\s*([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*([\s\S]*)$/.exec(part);
      if (d) out.push([d[1], d[2]]);
    }
  }
  return out;
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
  // A call that takes the bare counter (`colors(i)`, `colorOf(i)`) looks a value up per item, like `palette[i]`.
  // `lerpColor(a, b, i / n)` takes a ramp, not the bare counter, and `Math.sin(i)` is arithmetic.
  for (const c of calls(expr, () => true)) {
    if (/\bMath\s*\.\s*$/.test(expr.slice(0, c.at).trimEnd().slice(0, -c.name.length))) continue;
    if (c.args.some((a) => dep.has(a.trim()))) return true;
  }
  // A ternary on the loop (`i === cur ? a : b`, `i < filled ? a : b`) picks one of two values per item: page dots,
  // a segmented bar. The condition is the text before the `?`, after an object key (`color:`) if there is one.
  for (const part of splitArgs(expr.replace(/^\s*\{|\}\s*$/g, ''))) {
    const q = /\?(?![.?])/.exec(part.replace(/\?\?/g, '  '))?.index ?? -1;
    if (q <= 0) continue;
    const key = /^\s*[A-Za-z_$][\w$]*\s*:(?!:)/.exec(part);
    if (depends(part.slice(key ? key[0].length : 0, q), dep)) return true;
  }
  return false;
}

const lineOf = (s, at) => s.slice(0, at).split('\n').length;
/** True when a fill style (its raw argument text) is see-through: an alpha below 1 or a colour with alpha. */
function translucent(name, raw) {
  const style = raw.join(',');
  const alpha = /\balpha\s*:\s*([^,}]+)/.exec(style)?.[1] ?? (name === 'beginFill' ? raw[1] : undefined);
  const opaque = (a) => /^\s*(1(\.0*)?|100(\.0*)?%)\s*$/.test(a);
  if (alpha !== undefined) return !opaque(alpha);
  const css = /\b(?:rgba|hsla)\s*\(([^)]*)\)|\b(?:rgb|hsl)\s*\([^)]*\/([^)]*)\)/i.exec(style);
  if (css) return css[1] !== undefined ? !opaque(css[1].split(',')[3] ?? '1') : !opaque(css[2]);
  const hex = /#[0-9a-f]{6}([0-9a-f]{2})\b|0x[0-9a-f]{6}([0-9a-f]{2})\b/i.exec(style);
  return hex ? (hex[1] ?? hex[2]).toLowerCase() !== 'ff' : false
}

/**
 * True when fill `f` is see-through. A Canvas `ctx.fill()` carries no style: it paints with the `fillStyle` and
 * `globalAlpha` set last before it in the loop. A Canvas style set (`ctx.fillStyle = ...`, `ctx.globalAlpha = ...`)
 * is judged the same way, together with the other one, at `at` (the shape it paints, when that comes later):
 * `globalAlpha = 1` after a see-through `fillStyle` still paints see-through. A bare Pixi `fill()` is assumed to use
 * the last `setFillStyle` the same way (a guess, not checked against PixiJS).
 */
function seeThrough(f, fills, at = f.at, pre = []) {
  const bare = f.name === 'fill' && !f.prop && f.raw.every((a) => /^\s*(?:(['"])(?:nonzero|evenodd)\1)?\s*$/.test(a));
  if (!bare && !f.prop) return translucent(f.name, f.raw);
  const before = fills.filter((x) => x.at <= Math.max(at, f.at)).sort((a, b) => b.at - a.at);
  const isStyle = (x) => x.prop === 'fillStyle' || x.name === 'setFillStyle', isAlpha = (x) => x.prop === 'globalAlpha';
  // A style the loop never sets keeps the value set last before the loop (`pre`, in order) on every pass, when that
  // set surely ran and nothing after it may have changed it.
  const last = (pick) => {
    if (fills.some(pick)) return before.find(pick);
    const x = pre.findLast(pick);
    return x?.sure ? x : undefined;
  };
  return [last(isStyle), last(isAlpha)].some((x) => x && translucent(x.name, x.raw));
}

/**
 * What may set a Canvas `fillStyle` or `globalAlpha` before the loop at `at`, in its function: fill entries in source
 * order, with the object they are set on (`on`, its whole path as `target()` gives it). An entry is `sure` only when
 * it always runs and stays: a plain statement in the blocks that hold the loop. A set in an earlier block (an `if`, a
 * callback, a bare `{}`), behind an unbraced `if`/`else`/`&&`/`?`, or in an arrow's expression body is not sure, and
 * a `restore()` or `reset()` on the object, a resize of its canvas, an update (`*=`) or a comma-joined set adds an
 * unsure entry for both styles. seeThrough() judges by the last entry, so any
 * doubt after a sure set means no judgement.
 */
function preLoopStyles(s, src, at) {
  const keep = s.slice(0, at).split('');
  const dropped = []; // [open, close] of each earlier block
  let d = 0, k = at - 1;
  for (; k >= 0; k--) {
    if (s[k] === '}') d++;
    else if (s[k] === '{' && d > 0) {
      // An earlier block is dropped; its end still ends the statement that holds it (`if (a) { ... }`).
      if (--d === 0) { const e = close(s, k); keep.fill(' ', k, e + 1); keep[e] = ';'; dropped.push([k, e]); }
    }
    else if (s[k] === '{' && functionBody(s, k)) break;
  }
  const text = keep.join(''); // the loop's own blocks, earlier blocks blanked
  const sure = (i) => {
    if (dropped.some(([o, e]) => i > o && i < e)) return false;
    const head = text.slice(Math.max(k, text.lastIndexOf(';', i), text.lastIndexOf('{', i), text.lastIndexOf('}', i)) + 1, i);
    // A condition or a callback; `) x` also catches a head cut at a `for (;;)` header's own `;`.
    return !/^\s*(?:(?:if|else|for|while|do)\b|\))|\)\s*[\w$]|&&|\|\||\?(?!\.)|=>/.test(head);
  };
  const region = s.slice(0, at);
  const out = [];
  const unknown = (on, i) => { for (const prop of ['fillStyle', 'globalAlpha']) out.push({ name: 'fill', prop, on, at: i, sure: false, args: [], raw: [] }); };
  for (const m of region.matchAll(/\.\s*(fillStyle|globalAlpha)\s*=(?!=)\s*([^;\n]*)/g)) {
    if (m.index <= k) continue;
    const end = m.index + m[0].indexOf(m[1]) + m[1].length;
    const from = m.index + m[0].length - m[2].length;
    const raw = src.slice(from, from + m[2].length);
    const entry = { name: 'fill', prop: m[1], on: target(region, end), at: m.index, sure: sure(m.index) };
    // `a = x, b = y` in one statement: this regex reads it as one value, so neither style is known after it.
    if (splitArgs(m[2]).length > 1) { unknown(entry.on, m.index); continue; }
    out.push(m[1] === 'globalAlpha'
      ? { ...entry, args: [`{ alpha: ${m[2]} }`], raw: [`{ alpha: ${raw} }`] }
      : { ...entry, args: [m[2]], raw: [raw] });
  }
  for (const v of styleVoids(region)) if (v.at > k) unknown(v.on, v.at);
  return out.sort((x, y) => x.at - y.at);
}

const UPDATE = String.raw`(?:(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])=|\+\+|--)`;
/**
 * Calls and writes in `text` after which a context's `fillStyle` and `globalAlpha` are not known: `restore()`,
 * `reset()`, any write to `ctx.canvas.width` or `.height` (a resize resets every style), and an update of a style
 * (`ctx.globalAlpha *= 2`). Each as { on, at }, `on` being the context's path as `target()` gives it.
 */
function styleVoids(text) {
  const out = [];
  const add = (re, end) => { for (const m of text.matchAll(re)) out.push({ on: target(text, end(m)), at: m.index }); };
  add(/\.\s*(?:restore|reset)\s*\(/g, (m) => m.index + m[0].length - 1);
  add(new RegExp(String.raw`\.\s*canvas\s*\.\s*(?:width|height)\s*(?:=(?!=)|${UPDATE})`, 'g'), (m) => m.index + m[0].indexOf('canvas') + 6);
  add(new RegExp(String.raw`\.\s*(fillStyle|globalAlpha)\s*${UPDATE}`, 'g'), (m) => m.index + m[0].indexOf(m[1]) + m[1].length);
  return out;
}

/**
 * True when the `{` at `k` opens a function body: after `=>`, or after `(...)` that is not an if/for/while head,
 * with or without a TypeScript return type between them (`draw(ctx): void {`).
 */
function functionBody(s, k) {
  const before = s.slice(0, k).trimEnd().replace(/\)\s*:\s*[\w$.<>[\]|&,'"?\s]+$/, ')');
  if (before.endsWith('=>')) return true;
  if (!before.endsWith(')')) return false;
  let d = 0, j = before.length - 1;
  for (; j >= 0; j--) { if (before[j] === ')') d++; else if (before[j] === '(' && --d === 0) break; }
  return !/(?:^|[^\w$.])(?:if|for|while|switch|catch|with)\s*$/.test(before.slice(0, j));
}

// Style keys that set what a fill or stroke looks like in colour; `width`, `alignment`, `cap` and the rest do not.
const COLOUR_KEYS = new Set(['color', 'alpha', 'fill', 'fillStyle', 'strokeStyle']);
/**
 * The parts of a fill call's arguments that set colour or alpha: a bare colour argument, and in a style object only
 * its colour keys (spreads are kept, since they may carry one). v7 `lineStyle(width, color, alpha)` drops its width.
 */
function colourArgs(f) {
  const args = f.name === 'lineStyle' && !/^\s*\{/.test(f.args[0] ?? '') ? f.args.slice(1) : f.args;
  return args.map((a) => {
    const t = a.trim();
    if (!t.startsWith('{') || close(t, 0) !== t.length - 1) return a;
    return splitArgs(t.slice(1, -1)).filter((e) => {
      const key = /^\s*([A-Za-z_$][\w$]*)\s*(?::(?!:)|$)/.exec(e);
      return !key || COLOUR_KEYS.has(key[1]);
    }).join(',');
  });
}

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
    // A local counts as a new object only when it is created (`new ...`, a call) or picked per pass; a local that
    // aliases one object (`const g = this.glow`) is still the same target.
    const own = new Set(declarations(loop.body)
      .filter(([, v]) => /^\s*new\b|\)\s*$/.test(v) || depends(v, dep)).map(([n]) => n));
    const same = (c) => { const r = receiver(loop.body, c.at); return !(r === 'new' || dep.has(r) || own.has(r)); };
    const raw = src.slice(loop.bodyAt, loop.bodyAt + loop.body.length);
    // A rect 1 px wide or tall paints a texture pixel by pixel: no band can show.
    const pixel = (c) => /rect$/i.test(c.name) && [2, 3].some((k) => /^\s*1\s*$/.test(c.args[k] ?? ''));
    const shapes = calls(loop.body, (x) => Object.hasOwn(SHAPES, x), raw).filter((c) => same(c) && !pixel(c));
    const fills = [...calls(loop.body, (x) => FILLS.has(x), raw), ...styleSets(loop.body, raw)].filter(same);
    const pre = preLoopStyles(s, src, loop.at);
    if (!shapes.length || (!fills.length && !pre.length)) continue;
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
      const colour = colourArgs(f).join(','); // a ramp is in colour or alpha only: a growing line width is line art
      const read = reads(withoutLookups(colour));
      if (![...read].some((x) => ramp.has(x))) continue;
      if (impure(colour, dep) || [...read].some((x) => dep.has(x) && !ramp.has(x))) continue; // mixed with per-item data
      // A stroke is a ring fade only when it strokes rings on its own object; rings on another object beside a
      // tapered line along a path do not make that line a fade.
      if (!FILL_ONLY.has(f.name) && !concentric.some((sh) => target(loop.body, sh.at) === target(loop.body, f.at))) continue;
      why = 'its fill changes with each pass of the loop'; at = f.at; break;
    }
    const shapeTarget = (c) => target(loop.body, c.at); // the whole path (`a.two`), before `target` is shadowed below
    // A restore(), a reset(), a canvas resize or a style update in the loop may undo a style set before it.
    const undone = new Set(styleVoids(loop.body).map((v) => v.on));
    if (!why) {
      // Each concentric shape is judged by the fill that follows it, before the next shape: its own fill. Only shapes
      // and fills on the shape's own object count: `a.fillStyle` does not paint what `b.fillRect` draws.
      const target = (c) => receiver(loop.body, c.at);
      for (const sh of concentric) {
        const on = target(sh);
        const sorted = shapes.filter((x) => target(x) === on).sort((a, b) => a.at - b.at);
        const mine = fills.filter((f) => target(f) === on);
        const next = sorted.find((x) => x.at > sh.at)?.at ?? Infinity;
        const prev = [...sorted].reverse().find((x) => x.at < sh.at)?.at ?? -1;
        // Pixi v8 fills after the shape; v7's beginFill (and Canvas' fillStyle) is set before it.
        const own = mine.filter((f) => f.at > sh.at && f.at < next).sort((a, b) => a.at - b.at)[0]
          ?? mine.filter((f) => f.at < sh.at && f.at > prev && f.name !== 'stroke').sort((a, b) => b.at - a.at)[0];
        // A Canvas fillRect with no style of its own in the loop paints with the one set before the loop.
        const paint = own ?? (sh.name === 'fillRect' ? { name: 'fill', args: [], raw: [], at: sh.at } : undefined);
        if (paint && FILL_ONLY.has(paint.name) && seeThrough(paint, mine, sh.at, undone.has(shapeTarget(sh)) ? [] : pre.filter((x) => x.on === shapeTarget(sh)))) {
          why = 'it stacks translucent shapes of growing size on one centre'; at = sh.at; break;
        }
      }
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
  let total = 0, scanned = 0, hit = 0;
  for (const p of paths) {
    if (!existsSync(p)) { console.error(`gradient-check: ${p} does not exist`); return 2; }
    const root = statSync(p).isDirectory() ? (existsSync(join(p, 'src')) ? join(p, 'src') : p) : p;
    for (const f of files(root)) {
      scanned++;
      const xs = scan(readFileSync(f, 'utf8'));
      if (xs.length) hit++;
      for (const x of xs) {
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
    console.log(`gradient-check: ${total} stacked-shape fade${total === 1 ? '' : 's'} in ${hit} file${hit === 1 ? '' : 's'} (${scanned} checked). See skills/gradients/SKILL.md.`);
    return 1;
  }
  console.log(`gradient-check: ok, no stacked-shape fade in ${scanned} file${scanned === 1 ? '' : 's'}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
