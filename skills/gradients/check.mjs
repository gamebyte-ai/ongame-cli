#!/usr/bin/env node
/**
 * Finds fades faked with stacked shapes in a game's source: a loop that draws rings, bands, strips or discs and
 * steps their fill from one pass to the next. On screen each step shows as a visible ring or band. The fix is one
 * shape with one gradient fill (PixiJS v8 `FillGradient`, Canvas 2D `createLinearGradient` / `createRadialGradient`);
 * SKILL.md next to this file has the code.
 *
 *   node check.mjs <gameDir | file>...     # exit 0 = none found, 1 = found (each printed as file:line), 2 = bad input
 *
 * A loop is reported when it draws a shape and fills that same object, and either
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
 * It parses each file (.ts .tsx .js .jsx .mjs .cjs under the paths given; node_modules, dist and build are skipped)
 * into a syntax tree with the Babel parser in vendor/, and reads the rules from its nodes, so spacing, comments,
 * semicolons and quoting do not change what it finds. It needs nothing but Node. A file it cannot parse is named and
 * not checked, and the run exits 2 unless it found a fade.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { parse } = createRequire(import.meta.url)('./vendor/babel-parser.cjs');

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
const PAINTS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText']); // Canvas paint calls
const CANVAS_STYLES = new Set(['fillStyle', 'globalAlpha', 'strokeStyle']);
const WAIVER = /gradient-check:\s*ok\b/;
const MIN_STEPS = 6; // fewer passes than this make layers (a glow under a line), not a fade
// Style keys that set what a fill or stroke looks like in colour; `width`, `alignment`, `cap` and the rest do not.
const COLOUR_KEYS = new Set(['color', 'alpha', 'fill', 'fillStyle', 'strokeStyle']);

// ---------------------------------------------------------------------------------------------------------------
// The syntax tree

const OPTIONS = {
  sourceType: 'unambiguous', errorRecovery: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true, allowUndeclaredExports: true, allowSuperOutsideMethod: true,
  allowNewTargetOutsideFunction: true,
};

/**
 * The file's syntax tree. The parser is chosen by extension (TypeScript for .ts, TypeScript with JSX for .tsx, JSX
 * for JavaScript); with no file name each one is tried. The first tree without errors wins, else the one with the
 * fewest; when every try throws, the first error is thrown.
 */
function tree(src, file = '') {
  const ext = extname(file);
  const tries = ext === '.ts' ? [['typescript']] : ext === '.tsx' ? [['typescript', 'jsx']]
    : EXTS.has(ext) ? [['jsx'], ['typescript', 'jsx']] : [['typescript'], ['jsx'], ['typescript', 'jsx']];
  let best, first;
  for (const plugins of tries) {
    try {
      const ast = parse(src, { ...OPTIONS, plugins: [...plugins, 'decorators-legacy'] });
      if (!ast.errors?.length) return ast;
      if (!best || ast.errors.length < best.errors.length) best = ast;
    } catch (e) { first ??= e; }
  }
  if (best) return best;
  throw first;
}

const SKIP_KEYS = new Set(['loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens', 'errors']);
// TypeScript nodes that hold run-time code; every other TS node is a type and is never read.
const TS_CODE = new Set([
  'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSInstantiationExpression',
  'TSParameterProperty', 'TSEnumDeclaration', 'TSEnumMember', 'TSModuleDeclaration', 'TSModuleBlock',
  'TSExportAssignment', 'TSImportEqualsDeclaration', 'TSExternalModuleReference',
]);
const isType = (n) => n.type.startsWith('TS') && !TS_CODE.has(n.type);

/** The child nodes of `node` that hold code, with the key each sits under. */
function children(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string' && !isType(x)) out.push([key, x]); }
    else if (v && typeof v.type === 'string' && !isType(v)) out.push([key, v]);
  }
  return out;
}

/** Every node under `root` (itself included) in source order, each with its parent recorded in `parents`. */
function nodes(root, parents) {
  const out = [];
  const visit = (n, parent, key) => {
    if (parents && parent) parents.set(n, { node: parent, key });
    out.push(n);
    for (const [k, c] of children(n)) visit(c, n, k);
  };
  visit(root, null, null);
  return out.sort((a, b) => a.start - b.start);
}

const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion',
  'TSInstantiationExpression', 'ParenthesizedExpression', 'TypeCastExpression']);
/** `node` without the type casts and brackets around it: `(g as Graphics)!` -> `g`. */
const unwrap = (n) => { while (n && WRAPPERS.has(n.type)) n = n.expression; return n; };
const isMember = (n) => !!n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const isCall = (n) => !!n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod',
  'ClassMethod', 'ClassPrivateMethod', 'StaticBlock']);

/** A member's property name: `a.b` and `a['b']` give 'b'; a key that is not a literal (`a[k]`) gives undefined. */
function propName(m) {
  const p = m.property;
  if (!m.computed) return p.type === 'Identifier' ? p.name : p.type === 'PrivateName' ? `#${p.id.name}` : undefined;
  const k = unwrap(p);
  if (k.type === 'StringLiteral') return k.value;
  if (k.type === 'NumericLiteral') return String(k.value);
  if (k.type === 'TemplateLiteral' && !k.expressions.length) return k.quasis[0].value.cooked;
  return undefined;
}

/** The name a call is made by: `g.circle(`, `g['circle'](` and `circle(` all give 'circle'. */
function callName(c) {
  const f = unwrap(c.callee);
  return f.type === 'Identifier' ? f.name : isMember(f) ? propName(f) : undefined;
}

/** The object a call is made on (`g` in `g.circle(...)`), or null for a plain function call. */
function objectOf(c) {
  const f = unwrap(c.callee);
  return isMember(f) ? f.object : null;
}

/**
 * The object path of an expression, root first, as [{ name, called }]: `a.b().c` gives a, b (called), c. A lookup
 * with a key that is not a literal (`layers[i]`) adds no name. A chain that starts with `new` gives 'new'.
 */
function chain(node) {
  const n = unwrap(node);
  if (!n) return [];
  if (n.type === 'Identifier') return [{ name: n.name }];
  if (n.type === 'ThisExpression') return [{ name: 'this' }];
  if (n.type === 'Super') return [{ name: 'super' }];
  if (n.type === 'NewExpression') return 'new';
  if (isMember(n)) {
    const base = chain(n.object);
    if (base === 'new') return base;
    const name = propName(n);
    return name === undefined ? base : [...base, { name }];
  }
  if (isCall(n)) {
    const base = chain(n.callee);
    if (base === 'new' || !base.length) return base;
    return [...base.slice(0, -1), { ...base[base.length - 1], called: true }];
  }
  return [];
}

/**
 * The root name of an object (`b` for `b.bg`, `this.glow` for `this.glow`): one name per pass of a loop. A new
 * object gives 'new'; no object (a plain function call) gives ''.
 */
function receiver(object) {
  const c = chain(object);
  if (c === 'new') return c;
  if (!c.length) return '';
  return c[0].name === 'this' && c.length > 1 ? `this.${c[1].name}` : c[0].name;
}

/**
 * The object something is drawn on, as its whole property path: `layer.rings` for `layer.rings.circle(`, `g` for
 * `g.circle(...).stroke(`. Two Graphics kept on one owner (`layer.rings`, `layer.path`) are two objects. The path
 * stops at the first call in the chain. A chain that starts with `new` gives 'new'.
 */
function target(object) {
  const c = chain(object);
  if (c === 'new') return c;
  const out = [];
  for (const seg of c) { out.push(seg.name); if (seg.called) { if (out.length > 1) out.pop(); break; } }
  return out.join('.');
}

/** A plain name path (`ctx`, `this.ctx`, `a['b']`), or undefined when the path has a call or a computed key. */
function plainPath(node) {
  const n = unwrap(node);
  if (n?.type === 'Identifier') return n.name;
  if (n?.type === 'ThisExpression') return 'this';
  if (isMember(n)) {
    const base = plainPath(n.object), name = propName(n);
    return base === undefined || name === undefined ? undefined : `${base}.${name}`;
  }
  return undefined;
}

/** The names a binding pattern declares: `{ a, b: [c] }` gives a and c. */
function bound(pattern, out = []) {
  const n = unwrap(pattern);
  if (!n) return out;
  if (n.type === 'Identifier') out.push(n.name);
  else if (n.type === 'ObjectPattern') for (const p of n.properties) bound(p.type === 'RestElement' ? p.argument : p.value, out);
  else if (n.type === 'ArrayPattern') for (const e of n.elements) bound(e, out);
  else if (n.type === 'AssignmentPattern') bound(n.left, out);
  else if (n.type === 'RestElement') bound(n.argument, out);
  return out;
}

/**
 * The names an expression reads: references, not property names after `.` and not object keys. With
 * `lookups: false` a lookup's key is not read either: `palette[i]` reads `palette`, not `i`.
 */
function reads(node, lookups = true, out = new Set()) {
  if (Array.isArray(node)) { for (const x of node) reads(x, lookups, out); return out; }
  if (!node || isType(node)) return out;
  if (node.type === 'Identifier') { out.add(node.name); return out; }
  if (isMember(node)) {
    reads(node.object, lookups, out);
    if (node.computed && lookups) reads(node.property, lookups, out);
    return out;
  }
  if (node.type === 'ObjectProperty' || node.type === 'ObjectMethod' || node.type.startsWith('Class') && 'key' in node) {
    for (const [k, c] of children(node)) if (k !== 'key' || node.computed) reads(c, lookups, out);
    return out;
  }
  for (const [, c] of children(node)) reads(c, lookups, out);
  return out;
}

const depends = (node, dep, lookups = true) => [...reads(node, lookups)].some((x) => dep.has(x));

/** True when identifier `n` names a variable: not a property name after `.` and not an object or class key. */
function isName(n, parents) {
  const p = parents.get(n);
  if (!p) return true;
  if (isMember(p.node) && p.key === 'property' && !p.node.computed) return false;
  return !(p.key === 'key' && !p.node.computed && (p.node.type.startsWith('Object') || p.node.type.startsWith('Class')));
}
const num = (node) => {
  const n = unwrap(node);
  if (n?.type === 'NumericLiteral') return n.value;
  if (n?.type === 'UnaryExpression' && n.operator === '-' && unwrap(n.argument)?.type === 'NumericLiteral') return -unwrap(n.argument).value;
  return undefined;
};

// ---------------------------------------------------------------------------------------------------------------
// Loops

/** How many passes a loop makes when its bounds are literals, else Infinity. */
function steps(loop) {
  if (loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') {
    const list = unwrap(loop.right);
    return list?.type === 'ArrayExpression' ? list.elements.filter(Boolean).length : Infinity;
  }
  if (loop.type !== 'ForStatement') return Infinity;
  // Count only a step of one (`i++`, `i--`, `i += 1`); any other step (`i += 0.01`) makes the count unknown.
  const u = unwrap(loop.update);
  const one = u && ((u.type === 'UpdateExpression' && unwrap(u.argument).type === 'Identifier')
    || (u.type === 'AssignmentExpression' && (u.operator === '+=' || u.operator === '-=') && unwrap(u.left).type === 'Identifier' && num(u.right) === 1));
  if (!one) return Infinity;
  const init = unwrap(loop.init);
  const starts = init?.type === 'VariableDeclaration' ? init.declarations.map((d) => d.init)
    : init?.type === 'SequenceExpression' ? init.expressions.map((e) => unwrap(e)?.right)
      : init?.type === 'AssignmentExpression' ? [init.right] : [];
  const from = num(starts[starts.length - 1]);
  const test = unwrap(loop.test);
  if (from === undefined || test?.type !== 'BinaryExpression' || !['<', '<=', '>', '>='].includes(test.operator)) return Infinity;
  const to = num(test.right);
  return to === undefined ? Infinity : Math.abs(to - from) + (test.operator.length === 2 ? 1 : 0);
}

/** The names a counter loop steps: `i` in `while (i < n) { ...; i++; }`. */
function stepped(names, body) {
  const out = new Set();
  for (const n of body) {
    const name = n.type === 'UpdateExpression' ? unwrap(n.argument)
      : n.type === 'AssignmentExpression' && (n.operator === '+=' || n.operator === '-=') ? unwrap(n.left) : null;
    if (name?.type === 'Identifier' && names.has(name.name)) out.add(name.name);
  }
  return out;
}

/**
 * The loop's facts: { node, vars, body (its nodes), counter, steps }. A counter loop is a `for` with three clauses,
 * or a `while` / `do ... while` whose condition names a variable its body steps; `vars` are its counters.
 */
function loopOf(node) {
  const body = nodes(node.body);
  let vars = new Set(), counter = false;
  if (node.type === 'ForStatement') {
    // The counters: names the head declares, assigns or names (`let i = 0`, `i = 0`, `i`), and names its update steps.
    counter = true;
    const list = (e) => { const u = unwrap(e); return u?.type === 'SequenceExpression' ? u.expressions.map(unwrap) : u ? [u] : []; };
    const init = unwrap(node.init);
    if (init?.type === 'VariableDeclaration') for (const d of init.declarations) bound(d.id).forEach((v) => vars.add(v));
    else for (const a of list(init)) {
      if (a.type === 'AssignmentExpression') bound(a.left).forEach((v) => vars.add(v));
      else if (a.type === 'Identifier') vars.add(a.name);
    }
    for (const u of list(node.update)) {
      const name = unwrap(u.type === 'UpdateExpression' ? u.argument : u.type === 'AssignmentExpression' ? u.left : null);
      if (name?.type === 'Identifier') vars.add(name.name);
    }
  } else if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
    const left = unwrap(node.left);
    for (const d of left.type === 'VariableDeclaration' ? left.declarations.map((x) => x.id) : [left]) bound(d).forEach((v) => vars.add(v));
  } else {
    vars = stepped(reads(node.test), body);
    counter = vars.size > 0;
  }
  return { node, vars, body, counter, steps: steps(node) };
}

/** Every `const|let|var` declarator in `list` (nodes) with a value, as [name, value]; a pattern gives each name. */
function declarations(list) {
  const out = [];
  for (const n of list) {
    if (n.type !== 'VariableDeclarator' || !n.init) continue;
    for (const name of bound(n.id)) out.push([name, n.init]);
  }
  return out;
}

/** True when a call is `Math.<something>(...)`: arithmetic, not a lookup. */
const mathCall = (c) => { const o = objectOf(c); return unwrap(o)?.type === 'Identifier' && unwrap(o).name === 'Math'; };

/**
 * True when `node` mixes the loop with per-item data: `%`, `Math.random()`, the clock, a lookup by a loop name
 * (`palette[i]`), a member of a per-pass object (`p.x`), a call given a bare loop name (`colorOf(i)`), or a ternary
 * on the loop (`i === cur ? a : b`, `i < filled ? a : b`: page dots, a segmented bar).
 */
function impure(node, dep) {
  for (const n of Array.isArray(node) ? node.flatMap((x) => nodes(x)) : nodes(node)) {
    if ((n.type === 'BinaryExpression' && n.operator === '%') || (n.type === 'AssignmentExpression' && n.operator === '%=')) return true;
    if (isMember(n)) {
      const obj = unwrap(n.object);
      if (propName(n) === 'random' && obj.type === 'Identifier' && obj.name === 'Math') return true;
      if (n.computed && depends(n.property, dep)) return true;
      if (obj.type === 'Identifier' && dep.has(obj.name)) return true;
    }
    if (isCall(n)) {
      if (callName(n) === 'now' && objectOf(n)) return true; // performance.now(), Date.now()
      // `lerpColor(a, b, i / n)` takes a ramp, not the bare counter, and `Math.sin(i)` is arithmetic.
      if (!mathCall(n) && n.arguments.some((a) => unwrap(a)?.type === 'Identifier' && dep.has(unwrap(a).name))) return true;
    }
    if (n.type === 'ConditionalExpression' && depends(n.test, dep)) return true;
  }
  return false;
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
    for (const [name, value] of defs) {
      if (!all.has(name) && depends(value, all)) { all.add(name); grew = true; }
      if (!ramp.has(name) && depends(value, ramp, false) && !impure(value, all)) { ramp.add(name); grew = true; }
    }
  }
  return { all, ramp };
}

// ---------------------------------------------------------------------------------------------------------------
// Shapes, fills and Canvas styles

/** Every call in `list` whose name passes `names`: { name, node, args, object, at }. `at` is where its callee ends. */
function calls(list, names) {
  return list.filter((n) => isCall(n) && names(callName(n)))
    .map((n) => ({ name: callName(n), node: n, args: n.arguments, object: objectOf(n), at: unwrap(n.callee).end }));
}

/** A Canvas style set (`ctx.fillStyle = x`, `ctx['globalAlpha'] = x`) as { prop, object, value, at }, else null. */
function styleSet(n) {
  if (n.type !== 'AssignmentExpression' || n.operator !== '=') return null;
  const left = unwrap(n.left);
  if (!isMember(left) || !CANVAS_STYLES.has(propName(left))) return null;
  return { prop: propName(left), object: left.object, value: n.right, at: left.end };
}

/**
 * Canvas style sets in the loop body as fill entries, like calls(). `globalAlpha` applies to every paint call on its
 * own context up to that context's next `globalAlpha` set (wrapping round the loop body, since it paints on the next
 * pass too). It counts as a fill when one of those calls is a `fill`/`fillRect`/`fillText`, and as a stroke when they
 * are all `stroke`/`strokeRect`/`strokeText`. With no such call in the body it counts as a fill. Paint calls on
 * another context (`other.fillRect`) do not count.
 */
function styleSets(list) {
  const sets = list.map(styleSet).filter(Boolean).map((s) => ({ ...s, on: target(s.object) }));
  const paints = calls(list, (x) => PAINTS.has(x)).filter((p) => p.object)
    .map((p) => ({ at: p.at, kind: p.name.startsWith('fill') ? 'fill' : 'stroke', on: target(p.object) }));
  const alphas = sets.filter((s) => s.prop === 'globalAlpha');
  const paintedBy = (at, on) => {
    const mine = alphas.filter((a) => a.on === on).map((a) => a.at).sort((a, b) => a - b);
    const next = mine.find((a) => a > at);
    const first = mine[0] ?? at;
    // Up to the next set; with none after it, to the end of the body and on from its start up to the first set.
    const painted = paints.filter((p) => p.on === on && (next !== undefined ? p.at > at && p.at < next : p.at > at || p.at < first));
    return !painted.length || painted.some((p) => p.kind === 'fill') ? 'fill' : 'stroke';
  };
  return sets.map((s) => ({
    name: s.prop === 'strokeStyle' ? 'stroke' : s.prop === 'globalAlpha' ? paintedBy(s.at, s.on) : 'fill',
    prop: s.prop, args: [s.value], object: s.object, at: s.at,
  }));
}

/**
 * The nodes of a fill that set colour or alpha: a bare colour argument, and in a style object only its colour keys
 * (spreads and computed keys are kept, since they may carry one). v7 `lineStyle(width, color, alpha)` drops its width.
 */
function colourParts(f) {
  const args = f.name === 'lineStyle' && unwrap(f.args[0])?.type !== 'ObjectExpression' ? f.args.slice(1) : f.args;
  return args.flatMap((a) => {
    const o = unwrap(a);
    if (o?.type !== 'ObjectExpression') return [a];
    return o.properties.flatMap((p) => {
      if (p.type === 'SpreadElement') return [p.argument];
      if (p.type !== 'ObjectProperty') return [];
      if (p.computed) return [p.key, p.value];
      const key = p.key.type === 'Identifier' ? p.key.name : p.key.value;
      return COLOUR_KEYS.has(key) ? [p.value] : [];
    });
  });
}

/** The CSS text of a string or template literal (`${...}` as `?`, an unknown), else undefined. */
function cssText(node) {
  const n = unwrap(node);
  if (n?.type === 'StringLiteral') return n.value;
  if (n?.type === 'TemplateLiteral') return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('?');
  return undefined;
}

const opaqueText = (a) => /^\s*(1(\.0*)?|100(\.0*)?%)\s*$/.test(a);
/** True when a colour literal is see-through: undefined when it is not a colour with an alpha at all. */
function colourAlpha(node) {
  const text = cssText(node);
  if (text !== undefined) {
    const css = /\b(?:rgba|hsla)\s*\(([^)]*)\)|\b(?:rgb|hsl)\s*\([^)]*\/([^)]*)\)/i.exec(text);
    if (css) return css[1] !== undefined ? !opaqueText(css[1].split(',')[3] ?? '1') : !opaqueText(css[2]);
    const hex = /#[0-9a-f]{6}([0-9a-f]{2})\b/i.exec(text);
    return hex ? hex[1].toLowerCase() !== 'ff' : undefined;
  }
  const n = unwrap(node);
  const hex = n?.type === 'NumericLiteral' && /^0x[0-9a-f]{6}([0-9a-f]{2})$/i.exec(n.extra?.raw ?? '');
  return hex ? hex[1].toLowerCase() !== 'ff' : undefined;
}

/**
 * True when a fill style is see-through: an alpha other than the literal 1 (an `alpha` key, `beginFill`'s second
 * argument, a Canvas `globalAlpha`), or a colour literal with alpha (`rgba(...)`, `#rrggbbaa`, `0xrrggbbaa`).
 */
function translucent(f) {
  const all = f.args.flatMap((a) => nodes(a));
  let alpha = f.prop === 'globalAlpha' ? f.args[0] : all.find((n) => n.type === 'ObjectProperty' && !n.computed
    && (n.key.type === 'Identifier' ? n.key.name : n.key.value) === 'alpha')?.value;
  if (alpha === undefined && f.name === 'beginFill' && !f.prop) alpha = f.args[1];
  if (alpha !== undefined) return num(alpha) !== 1;
  // The first colour with an alpha decides: a CSS colour first, as rgba() is read before a hex number.
  const css = all.find((n) => cssText(n) !== undefined && /\b(?:rgba|hsla|rgb|hsl)\s*\(/i.test(cssText(n)) && colourAlpha(n) !== undefined);
  if (css) return colourAlpha(css);
  const hex = all.find((n) => colourAlpha(n) !== undefined);
  return hex ? colourAlpha(hex) : false;
}

/**
 * True when fill `f` is see-through. A Canvas `ctx.fill()` carries no style: it paints with the `fillStyle` and
 * `globalAlpha` set last on the same target before it in the loop (`fills` holds only that target's fills). A Canvas
 * style set (`ctx.fillStyle = ...`, `ctx.globalAlpha = ...`) is judged the same way, together with the other one, at
 * `at` (the shape it paints, when that comes later): `globalAlpha = 1` after a see-through `fillStyle` still paints
 * see-through. A bare Pixi `fill()` is assumed to use the last `setFillStyle` the same way (a guess, not checked
 * against PixiJS). A style the loop never sets on that target is read from `pre`, what preLoopStyles() found before
 * the loop on it.
 */
function seeThrough(f, fills, at = f.at, pre = []) {
  const bare = f.name === 'fill' && !f.prop && f.args.every((a) => ['nonzero', 'evenodd'].includes(unwrap(a)?.value));
  if (!bare && !f.prop) return translucent(f);
  const before = fills.filter((x) => x.at <= Math.max(at, f.at)).sort((a, b) => b.at - a.at);
  const isStyle = (x) => x.prop === 'fillStyle' || x.name === 'setFillStyle', isAlpha = (x) => x.prop === 'globalAlpha';
  // A style the loop never sets keeps the value set last before the loop (`pre`, in order) on every pass, when that
  // set surely ran and nothing after it may have changed it.
  const last = (pick) => {
    if (fills.some(pick)) return before.find(pick);
    const x = pre.findLast(pick);
    return x?.sure ? x : undefined;
  };
  return [last(isStyle), last(isAlpha)].some((x) => x && translucent(x));
}

// ---------------------------------------------------------------------------------------------------------------
// Styles set before the loop

/**
 * Writes after which a context's `fillStyle` and `globalAlpha` are not known, and new values of names, in `list`:
 * `restore()`, `reset()`, any write to `ctx.canvas.width` or `.height` (a resize resets every style), an update of a
 * style (`ctx.globalAlpha *= 2`, `++ctx.globalAlpha`), a write through a key that is not a literal (`ctx[key] = 1`),
 * and a declaration or assignment of a name or path (`const ctx = other`, `this.ctx = other`). Each as
 * { on, at, binding }: `on` is the context's path as `target()` gives it, or the name given a new value (`binding`).
 */
function voids(list) {
  const out = [];
  const write = (left, at) => {
    const m = unwrap(left);
    if (!isMember(m)) return;
    const name = propName(m), obj = unwrap(m.object);
    if (isMember(obj) && propName(obj) === 'canvas' && (name === 'width' || name === 'height' || name === undefined)) out.push({ on: target(obj.object), at });
    else if (name === undefined || name === 'fillStyle' || name === 'globalAlpha') out.push({ on: target(m.object), at });
  };
  for (const n of list) {
    if (isCall(n) && objectOf(n) && ['restore', 'reset'].includes(callName(n))) out.push({ on: target(objectOf(n)), at: n.start });
    else if (n.type === 'UpdateExpression') write(n.argument, n.start);
    else if (n.type === 'AssignmentExpression') {
      const left = unwrap(n.left), name = isMember(left) ? propName(left) : undefined;
      // A plain set of a style is a set, not a void; any other write to a member may be a resize or a style.
      if (n.operator !== '=' || name === undefined || !CANVAS_STYLES.has(name)) write(left, n.start);
      const path = plainPath(left);
      if (path !== undefined) out.push({ on: path, at: n.start, binding: true });
      else for (const name of bound(left)) out.push({ on: name, at: n.start, binding: true });
    } else if (n.type === 'VariableDeclarator') {
      for (const name of bound(n.id)) out.push({ on: name, at: n.start, binding: true });
    } else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && unwrap(n.left)?.type !== 'VariableDeclaration') {
      for (const name of bound(n.left)) out.push({ on: name, at: n.start, binding: true });
    }
  }
  return out;
}

/**
 * What may set a Canvas `fillStyle` or `globalAlpha` before `loop`, in its function: fill entries in source order,
 * with the object they are set on (`on`, its whole path as `target()` gives it). An entry is `sure` only when it always
 * runs and stays: a plain statement (or one part of a comma list) in a block that holds the loop. A set in another
 * block (an `if`, a callback, a bare `{}`, another switch case), behind an unbraced `if`/`else`/`&&`/`?`, or in an
 * arrow's expression body is not sure, and every write voids() names adds an unsure entry for both styles.
 * seeThrough() judges by the last entry, so any doubt after a sure set means no judgement.
 */
function preLoopStyles(loop, parents) {
  let fn = loop;
  for (let p = parents.get(fn); p; p = parents.get(fn)) { fn = p.node; if (FUNCTIONS.has(fn.type)) break; }
  const scope = FUNCTIONS.has(fn.type) && !Array.isArray(fn.body) ? fn.body : fn; // a `static {}` block holds a list
  const region = [];
  const visit = (n) => {
    if (n.start >= loop.start) return;
    if (n.end <= loop.start) region.push(n);
    for (const [, c] of children(n)) visit(c);
  };
  visit(scope);
  const holds = (n) => n.start <= loop.start && loop.end <= n.end;
  const sure = (n) => {
    let up = parents.get(n);
    while (up && up.node.type === 'SequenceExpression') { n = up.node; up = parents.get(n); }
    if (up?.node.type !== 'ExpressionStatement') return false;
    const at = parents.get(up.node);
    return !!at && ['BlockStatement', 'Program', 'SwitchCase', 'StaticBlock', 'TSModuleBlock'].includes(at.node.type)
      && (at.key === 'body' || at.key === 'consequent') && holds(at.node);
  };
  const out = [];
  for (const n of region) {
    const s = styleSet(n);
    if (s && s.prop !== 'strokeStyle') {
      out.push({ name: 'fill', prop: s.prop, args: [s.value], on: target(s.object), at: n.start, sure: sure(n) });
    }
  }
  for (const v of voids(region)) {
    for (const prop of ['fillStyle', 'globalAlpha']) out.push({ name: 'fill', prop, on: v.on, binding: !!v.binding, at: v.at, sure: false, args: [] });
  }
  return out.sort((x, y) => x.at - y.at);
}

// ---------------------------------------------------------------------------------------------------------------
// The scan

/** Findings for one source text: [{ line, fillLine, why }]. `file` picks the parser; it may be left out. */
export function scan(src, file = '') {
  const ast = tree(src, file);
  const parents = new Map();
  const all = nodes(ast.program, parents);
  const starts = [0];
  for (let k = src.indexOf('\n'); k >= 0; k = src.indexOf('\n', k + 1)) starts.push(k + 1);
  const lineAt = (at) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; } return lo + 1; };
  // A waiver comment on the line above a loop, or on its own line.
  const waived = new Set();
  for (const c of ast.comments ?? []) if (WAIVER.test(c.value)) { waived.add(c.loc.end.line + 1); waived.add(c.loc.start.line); waived.add(c.loc.end.line); }
  const found = [];
  const seen = new Set();
  const LOOPS = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement']);
  for (const node of all.filter((n) => LOOPS.has(n.type))) {
    const loopLine = node.loc.start.line;
    if (waived.has(loopLine)) continue;
    const loop = loopOf(node);
    if (loop.steps < MIN_STEPS) continue; // a glow under a line, a mirrored pair: layers, not a fade
    if (!loop.counter) continue; // `for (const p of particles)`: one shape per item, not a stack
    const { all: dep, ramp } = loopDependent(loop);
    // Shapes drawn on a new object each pass (`const s = new Graphics()`, `b.bg` of each button) are separate
    // objects, not a stack: only a target that stays the same through the loop can build a fade.
    // A local counts as a new object only when it is created (`new ...`, a call) or picked per pass; a local that
    // aliases one object (`const g = this.glow`) is still the same target.
    const own = new Set(declarations(loop.body).filter(([, v]) => {
      const u = unwrap(v);
      return u.type === 'NewExpression' || isCall(u) || chain(u) === 'new' || depends(v, dep);
    }).map(([n]) => n));
    const same = (c) => { const r = receiver(c.object); return !(r === 'new' || dep.has(r) || own.has(r)); };
    // A rect 1 px wide or tall paints a texture pixel by pixel: no band can show.
    const pixel = (c) => /rect$/i.test(c.name) && [2, 3].some((k) => num(c.args[k]) === 1);
    const shapes = calls(loop.body, (x) => Object.hasOwn(SHAPES, x)).filter((c) => same(c) && !pixel(c));
    const fills = [...calls(loop.body, (x) => FILLS.has(x)), ...styleSets(loop.body)].filter(same);
    if (!shapes.length) continue;
    const pre = preLoopStyles(node, parents);
    if (!fills.length && !pre.length) continue;
    const on = (x) => target(x.object); // the object drawn on, by its whole path
    let why = null, at = 0;
    // Concentric: a shape whose size ramps with the loop while its position stays put (rings, discs, a vignette).
    const concentric = shapes.filter((sh) => {
      const size = SHAPES[sh.name];
      return size.some((k) => sh.args[k] !== undefined && depends(sh.args[k], ramp) && !impure(sh.args[k], dep))
        && !sh.args.some((a, k) => !size.includes(k) && depends(a, dep));
    });
    // A fill given a local style object (`const style = { alpha: 0.05 }; g.fill(style)`) is judged by that object.
    // Only a declaration with no other use of the name between it and the fill counts: a write or a helper could
    // change the style.
    const resolved = (f) => {
      if (f.prop) return f;
      const before = loop.body.filter((n) => n.end <= f.at); // the loop's code up to the fill's own arguments
      const args = f.args.map((a) => {
        const u = unwrap(a);
        if (u?.type !== 'Identifier') return a;
        if (before.filter((n) => n.type === 'Identifier' && n.name === u.name && isName(n, parents)).length !== 1) return a;
        const defs = declarations(before).filter(([n]) => n === u.name);
        return defs.length === 1 && unwrap(defs[0][1]).type === 'ObjectExpression' ? defs[0][1] : a;
      });
      return { ...f, args };
    };
    for (const f of fills) {
      if (f.args.some((a) => nodes(a).some((n) => n.type === 'NewExpression' && chain(n.callee).at?.(-1)?.name === 'FillGradient'))) continue;
      const colour = colourParts(resolved(f)); // a ramp is in colour or alpha only: a growing line width is line art
      const read = reads(colour, false);
      if (![...read].some((x) => ramp.has(x))) continue;
      if (impure(colour, dep) || [...read].some((x) => dep.has(x) && !ramp.has(x))) continue; // mixed with per-item data
      // A stroke is a ring fade only when it strokes rings on its own object; rings on another object beside a
      // tapered line along a path do not make that line a fade. A fill ramps a fade only when a shape in the loop
      // is drawn on its own object; rings on another object beside fading text do not make that text a fade.
      if (!(FILL_ONLY.has(f.name) ? shapes : concentric).some((sh) => on(sh) === on(f))) continue;
      why = 'its fill changes with each pass of the loop'; at = f.at; break;
    }
    // A restore(), a reset(), a canvas resize or a style update in the loop may undo a style set before it.
    // So does a new value of the context's name or of an owner on its path (`ctx = other`).
    const inLoop = voids(loop.body);
    const undone = new Set(inLoop.filter((v) => !v.binding).map((v) => v.on));
    const renamed = inLoop.filter((v) => v.binding).map((v) => v.on);
    const unknownHere = (path) => undone.has(path) || renamed.some((n) => path === n || path.startsWith(`${n}.`));
    if (!why) {
      // Each concentric shape is judged by the fill that follows it, before the next shape: its own fill. Only shapes
      // and fills on the shape's own object count: `a.fillStyle` does not paint what `b.fillRect` draws.
      for (const sh of concentric) {
        const path = on(sh);
        const sorted = shapes.filter((x) => on(x) === path).sort((a, b) => a.at - b.at);
        const mine = fills.filter((f) => on(f) === path);
        const next = sorted.find((x) => x.at > sh.at)?.at ?? Infinity;
        const prev = [...sorted].reverse().find((x) => x.at < sh.at)?.at ?? -1;
        // Pixi v8 fills after the shape; v7's beginFill (and Canvas' fillStyle) is set before it.
        const mineOwn = mine.filter((f) => f.at > sh.at && f.at < next).sort((a, b) => a.at - b.at)[0]
          ?? mine.filter((f) => f.at < sh.at && f.at > prev && f.name !== 'stroke').sort((a, b) => b.at - a.at)[0];
        // A Canvas fillRect with no style of its own in the loop paints with the one set before the loop.
        const paint = mineOwn ? resolved(mineOwn) : (sh.name === 'fillRect' ? { name: 'fill', args: [], at: sh.at } : undefined);
        const before = unknownHere(path) ? [] : pre.filter((x) => x.on === path || (x.binding && path.startsWith(`${x.on}.`)));
        if (paint && FILL_ONLY.has(paint.name) && seeThrough(paint, mine, sh.at, before)) {
          why = 'it stacks translucent shapes of growing size on one centre'; at = sh.at; break;
        }
      }
    }
    if (!why) continue;
    const fillLine = lineAt(at);
    if (seen.has(fillLine)) continue; // an outer loop around the same fill: report it once
    seen.add(fillLine);
    found.push({ line: loopLine, fillLine, why });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// The command

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
  let total = 0, scanned = 0, hit = 0, unread = 0;
  for (const p of paths) {
    if (!existsSync(p)) { console.error(`gradient-check: ${p} does not exist`); return 2; }
    const root = statSync(p).isDirectory() ? (existsSync(join(p, 'src')) ? join(p, 'src') : p) : p;
    for (const f of files(root)) {
      const name = relative(process.cwd(), f) || f;
      let xs;
      try { xs = scan(readFileSync(f, 'utf8'), f); } catch (e) {
        unread++;
        console.error(`gradient-check: ${name}: cannot parse this file, so it was not checked: ${e.message}`);
        continue;
      }
      scanned++;
      if (xs.length) hit++;
      for (const x of xs) {
        total++;
        console.log(`${name}:${x.line}: a fade made of stacked shapes - ${x.why} (fill at line ${x.fillLine}). Draw one shape with one gradient fill instead.`);
      }
    }
  }
  if (!scanned && !unread) {
    console.error(`gradient-check: no .ts, .tsx, .js, .jsx, .mjs or .cjs file under ${paths.join(', ')}; nothing was checked`);
    return 2;
  }
  const notRead = unread ? ` ${unread} file${unread === 1 ? '' : 's'} could not be parsed and ${unread === 1 ? 'was' : 'were'} not checked (named above).` : '';
  if (total) {
    console.log(`gradient-check: ${total} stacked-shape fade${total === 1 ? '' : 's'} in ${hit} file${hit === 1 ? '' : 's'} (${scanned} checked). See skills/gradients/SKILL.md.${notRead}`);
    return 1;
  }
  if (unread) {
    console.error(`gradient-check: no stacked-shape fade in ${scanned} file${scanned === 1 ? '' : 's'}.${notRead} Nothing unchecked is a pass.`);
    return 2;
  }
  console.log(`gradient-check: ok, no stacked-shape fade in ${scanned} file${scanned === 1 ? '' : 's'}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
