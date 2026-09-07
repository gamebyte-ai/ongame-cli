#!/usr/bin/env node
/**
 * Obligation dispatcher — NOT a verifier and NOT a harness.
 *
 * It owns exactly one thing the pipeline did not have: turning a reference obligation into a
 * machine-made PASS / FAIL / BLOCKED with evidence, so the result is not whatever an agent wrote in
 * free text. Every check it runs reads a surface that ALREADY exists:
 *   prov     — the source tree (no runtime)
 *   hitArea  — window.__game.diagnostics.hitAreas   (code SKILL §9)
 *   state    — window.__game.state / .board          (code SKILL §9)
 *   pixel    — a screenshot sample the probe takes, anchored on a hitArea rect
 *   pose     — window.__game.diagnostics.subjects    (§9 exposes a COUNTER only — see BLOCKED)
 *   model/geometry — the game's own functions, which only the game can bind
 *
 * It does not drive a browser. `probe` prints one snippet for the browser tool the pipeline already
 * uses; `score` grades what came back. Transport stays with the caller, judgement does not.
 *
 * THE RULE THAT GIVES IT TEETH: a blocking obligation with no result is a FAIL, never a skip.
 * Silence used to read as success; that is the failure this file exists to remove.
 *
 * PREDICATES ARE DATA, NOT CODE. An earlier version evaluated the predicate string with
 * `new Function`. That was arbitrary Node execution as the workflow user: the compiler ingests
 * EXTERNAL reference material, and obligations.json lives in gameDir where anything in the build can
 * rewrite it. "Compiler-authored" is not a trust boundary. The schema below is the whole language —
 * a string predicate is refused, never run. Its shapes are sized to the predicates real builds
 * actually shipped, not invented: see test/obligations.test.mjs, where each one is transcribed.
 *
 *   term  := <number|string|boolean|null>
 *          | {path:"state.belt.balls.length"}      // safe dotted walk over the collected payload
 *          | {item:"width"}                        // a field of the item under a quantifier
 *          | {count:<sel>} | {sum:<sel>, of:<term>} | {gaps:<sel>, axis:"x"|"y"}
 *          | {px:"<key>", channel:"r"|"g"|"b"}     // a sample the probe collected
 *          | {lookup:<sel>, at:<term>, of:"<field>"}
 *          | {div|mul|add|sub:[<term>,<term>]} | {abs:<term>}
 *   sel   := {hitAreas:"<glob>"} | {path:"<dotted path to an array>"}   (+ optional where:<pred>)
 *   payload: hitAreas (viewport px) · W,H (the CANVAS drawing box) · viewportW,viewportH · state ·
 *            board · subjects · px
 *   pred  := {all|any:[<pred>...]} | {not:<pred>} | {when:<pred>, then:<pred>}
 *          | {cmp:[<term>, "eq"|"ne"|"lt"|"lte"|"gt"|"gte", <term>]}
 *          | {near:[<term>, <target>, <tol>]}  | {truthy:<term>}
 *          | {every|some|none:<sel>, satisfies:<pred>}
 *
 * Evidence is GENERATED from the evaluation trace, so a FAIL carries the measured number. The old
 * `evidence` field was a second JavaScript expression and is now ignored if present.
 *
 *   node obligations.mjs probe <gameDir>             -> sample keys + one page snippet, on stdout
 *   node obligations.mjs score <gameDir> [data.json] -> verdicts + docs/obligations.result.json
 *                                                       exit 1 if any blocking obligation FAILs
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , cmd, gameDir, dataFile] = process.argv;
if (!cmd || !gameDir) { console.error('usage: obligations.mjs probe|score <gameDir> [data.json]'); process.exit(2); }
const OBL = path.join(gameDir, 'docs/obligations.json');
const OUT = path.join(gameDir, 'docs/obligations.result.json');
const PRIMITIVES = new Set(['prov', 'model', 'geometry', 'state', 'hitArea', 'pose', 'pixel']);
const RUNTIME = new Set(['hitArea', 'state', 'pixel', 'pose']);

/**
 * The capability gaps this dispatcher KNOWS it cannot cover. BLOCKED is only reachable through one
 * of these: otherwise `blocked_on: "reasons"` becomes a way to opt out of every check, which is the
 * same silence-reads-as-success failure in a new costume.
 */
/** Which primitives each gap may legitimately hold open. A recognised id was previously accepted on
 * ANY obligation, so `pixel.sample` could waive a `state` check. `reference.resolution` is not about a
 * surface at all — it says the REFERENCE has no number — and an obligation in that position was never
 * a blocking one: it is an open assumption, which §4 wants NAMED in `blocking` instead. */
const GAP_SCOPE = { 'pose.transform': ['pose'], 'pixel.sample': ['pixel'], 'reference.resolution': 'advisory-only' };
const KNOWN_GAPS = {
  'pose.transform': 'diagnostics.subjects exposes poseChanges (a counter) and no rendered rect or rotation, ' +
    'so where a moving subject actually landed cannot be expressed yet',
  'pixel.sample': 'the page could not give up a pixel for this sample (no 2d getImageData, or a tainted canvas)',
  // Not a gap in this file but in the EVIDENCE: the primitive could read the build fine, and there is
  // simply no reference number to compare it against (2 s sampling cannot resolve a 300 ms easing).
  // A real package surfaced this and the registry had no room for it. It is legitimate precisely
  // because it is checkable: §4 requires the constant to be NAMED in `blocking` as well.
  'reference.resolution': 'the reference evidence cannot resolve this quantity, so there is no measured target to check against',
};

/* ---------- typed exit: a malformed package is a VERDICT, not a Node stack ---------- */
/** Write the machine verdict and leave. Callers parse one file shape, always. */
function bail(evidence) {
  const results = [{ id: '__file__', primitive: 'file', enforcement: 'blocking', verdict: 'FAIL', evidence }];
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), decision: 'REJECT', blocked: [], results }, null, 1));
  } catch { /* if we cannot even write, the exit code is all the caller gets */ }
  console.log(`  FAIL          __file__   [file    ] ${evidence}`);
  console.log('  build decision: REJECT — the obligation file itself did not parse');
  process.exit(1);
}

if (!fs.existsSync(OBL)) { console.error(`no obligations at ${OBL} — nothing to dispatch`); process.exit(2); }
let obligations;
try { obligations = JSON.parse(fs.readFileSync(OBL, 'utf8')); }
catch (e) { bail(`docs/obligations.json is not valid JSON: ${e.message}`); }
if (!Array.isArray(obligations)) {
  bail(`docs/obligations.json must be an ARRAY of obligations, got ${obligations === null ? 'null' : typeof obligations}`);
}
// An empty array used to score as zero results, zero blocking failures, decision ACCEPT. A reference
// package owes at least the standing provenance lock, so emptiness is the vacuous pass this file exists
// to remove — not a build with nothing to check.
// Bindings are keyed by id alone, so two obligations sharing one id both passed off a single
// `bound[id]`. An id is how an obligation is cited; duplicates make the whole file ambiguous.
if (cmd === 'score') {
  const seen = new Set(), dupes = new Set();
  for (const o of obligations) {
    const id = o && typeof o.id === 'string' ? o.id : null;
    if (!id) continue;
    if (seen.has(id)) dupes.add(id); else seen.add(id);
  }
  if (dupes.size) {
    bail(`docs/obligations.json carries duplicate obligation id(s) [${[...dupes].join(', ')}] — bindings ` +
      `and results are keyed by id, so one assertion would silently satisfy every row sharing it`);
  }
}
if (cmd === 'score' && !obligations.length) {
  bail('docs/obligations.json is empty — a reference package must carry at least the standing PROV-01 ' +
    'provenance obligation, so an empty list is a compiler failure, not a build with nothing to check');
}

/* ---------- probe: sample keys + one snippet, evaluated in the page by the caller's browser tool ---------- */
if (cmd === 'probe') {
  const states = [...new Set(obligations.filter((o) => o && RUNTIME.has(o.primitive)).map((o) => o.state || 'any'))];
  const samples = {};
  for (const o of obligations) {
    if (!o || o.primitive !== 'pixel' || !o.samples || typeof o.samples !== 'object') continue;
    for (const [k, s] of Object.entries(o.samples)) samples[k] = s;
  }
  console.log(JSON.stringify({ statesNeeded: states, pixelSamples: samples }, null, 1));
  console.log('\n// Evaluate the snippet below in the page, once per state in statesNeeded, and save the');
  console.log('// returned objects keyed by state into a JSON file for `score`. It reads only surfaces');
  console.log('// the code SKILL §9 contract already exposes, and takes every declared pixel sample.');
  console.log('// ---8<--- BEGIN PAGE SNIPPET');
  console.log(`(() => {
  const g = window.__game || {}, d = g.diagnostics || {};
  // The LARGEST canvas, not the first: a hidden preloader canvas ahead of the game canvas silently
  // sourced W/H and every pixel sample from the wrong surface.
  const cs = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('canvas')) : [];
  const all = cs.length ? cs : [document.querySelector('canvas')].filter(Boolean);
  const area = (c) => { const r = c.getBoundingClientRect(); return r.width * r.height; };
  const el = all.slice().sort((a, b) => area(b) - area(a))[0] || null;
  const box = (el || document.body).getBoundingClientRect();
  const hitAreas = (d.hitAreas || []).map(h => ({ id: h.id, x: h.x, y: h.y, width: h.width, height: h.height }));
  // Pixel samples are anchored on a hit area, at a FRACTION of its rect, so the key survives a
  // resolution change. Viewport px -> canvas px is scaled by the canvas, never by \`resolution\`.
  const SAMPLES = ${JSON.stringify(samples)};
  const px = {}, pxUnavailable = {};
  let c2d = null;
  try { c2d = el && el.getContext ? el.getContext('2d') : null; } catch (e) { c2d = null; }
  for (const key of Object.keys(SAMPLES)) {
    const s = SAMPLES[key] || {};
    const a = hitAreas.filter(h => h.id === s.hitArea)[0];
    if (!a) { pxUnavailable[key] = 'no hit area "' + s.hitArea + '" registered in this state'; continue; }
    if (!c2d || !c2d.getImageData) { pxUnavailable[key] = 'canvas exposes no 2d getImageData (WebGL or tainted)'; continue; }
    const at = Array.isArray(s.at) ? s.at : [0.5, 0.5];
    const vx = a.x + at[0] * a.width, vy = a.y + at[1] * a.height;
    const sx = (el.width || box.width) / box.width, sy = (el.height || box.height) / box.height;
    try {
      const dat = c2d.getImageData(Math.round((vx - box.left) * sx), Math.round((vy - box.top) * sy), 1, 1).data;
      px[key] = [dat[0], dat[1], dat[2]];
    } catch (e) { pxUnavailable[key] = 'getImageData threw: ' + e.message; }
  }
  return {
    // W/H are the CANVAS drawing box — the surface a fidelity ratio should be taken against. The
    // viewport is reported separately because on a letterboxed canvas they differ, and dividing a
    // viewport-px hit area by the wrong one is a silently wrong number.
    state: g.state ?? null, board: g.board ?? null, W: box.width, H: box.height, hitAreas,
    viewportW: window.innerWidth ?? box.width, viewportH: window.innerHeight ?? box.height,
    subjects: d.subjects ? JSON.parse(JSON.stringify(d.subjects)) : null,
    bindingsSettled: d.bindingsSettled ?? null, px, pxUnavailable,
  };
})()`);
  console.log('// ---8<--- END PAGE SNIPPET');
  process.exit(0);
}

/* ---------- static check: provenance. Deterministic, no runtime, no binding. ---------- */
/**
 * PROV-01: a constant claiming MEASURED must cite evidence that RESOLVES. Four outcomes per citation,
 * tested in THIS ORDER — the denylist outranks the basename lookup, or a basename collision launders
 * a generated artefact into reference authority:
 *   2. matches a generated-artefact path                                             -> VIOLATION (fabricated authority)
 *   1. resolves in the evidence root (.ref/ or evidence/, at any depth, by basename) -> reference truth, fine
 *   3. resolves somewhere in the build itself                                        -> allowed: measuring your OWN
 *                                                                                       shipped sprite is not a claim
 *                                                                                       about the reference
 *   4. resolves nowhere at all                                                       -> VIOLATION (unresolvable citation)
 */
function checkProvenance(dir) {
  const roots = ['.ref', 'evidence'].map((r) => path.join(dir, r)).filter((p) => fs.existsSync(p));
  const evNames = new Set();
  for (const root of roots) {
    (function walkEv(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walkEv(path.join(d, e.name));
        else evNames.add(e.name);
      }
    })(root);
  }
  const GENERATED = [/assets\/concept\//, /docs\/concept\//, /\.ongame\/screenshots\//, /(^|\/)runtime[-_][\w-]*\.(png|jpg)/];
  // Any mention of measuring or observing counts, in any phrasing: `observed from` alone let
  // `observed in <path>` slip past. Broadening costs no noise because the CITED FILE below is the
  // gate — measured on four shipped builds, it catches 2-8 more real claims each and adds no prose.
  const CLAIM = /(measured|observed)/i;   // no \b: `DIRECTLY_OBSERVED` has no word boundary
  // Backslashes are captured, then normalised: excluding them meant a Windows-style citation was
  // captured as its bare basename and laundered straight through the evidence lookup.
  const PATHRE = /[\w.\\/-]+\.(png|jpg|jpeg|mp4|webm)/g;
  const files = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(e.name)) walk(p); }
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(p);
    }
  })(path.join(dir, 'src'));
  const violations = [];
  let claims = 0, selfMeasured = 0;
  // The build side gets the SAME basename resolution as the evidence root, and for the same measured
  // reason: real code writes `bottle-glass.png`, not `public/assets/bottle-glass.png`. Checking three
  // fixed prefixes flagged a genuine self-measurement on a shipped build. Widening it is safe because
  // the generated-artefact denylist is tested BEFORE this.
  const buildNames = new Set();
  (function walkAssets(d, depth) {
    if (depth > 6 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!/^(node_modules|\.git|dist|\.ref|evidence)$/.test(e.name)) walkAssets(path.join(d, e.name), depth + 1);
      } else if (/\.(png|jpg|jpeg|mp4|webm)$/i.test(e.name)) buildNames.add(e.name);
    }
  })(dir, 0);
  const resolvesInBuild = (c) => buildNames.has(path.basename(c));
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!CLAIM.test(lines[i])) continue;
      const cited = [...lines.slice(i, i + 4).join(' ').matchAll(PATHRE)].map((m) => m[0].replace(/\\/g, '/'));
      if (!cited.length) continue;
      claims++;
      for (const c of cited) {
        const where = `${path.relative(dir, f)}:${i + 1}`;
        // The denylist is checked FIRST. Basename-first meant a citation under assets/concept/ was
        // waved through whenever ANY evidence file happened to share its basename, which reopens the
        // whole bypass: a generated path is never reference authority, coincidence or not.
        if (GENERATED.some((rx) => rx.test(c))) { violations.push(`${where} cites the generated artefact ${c}`); continue; } // 2
        if (evNames.has(path.basename(c))) continue;                                       // 1
        if (resolvesInBuild(c)) { selfMeasured++; continue; }                              // 3
        violations.push(`${where} cites ${c}, which resolves in neither the evidence root nor the build`); // 4
      }
    }
  }
  const roots_ = roots.length ? roots.map((p) => path.relative(dir, p)).join(' + ') : '(no evidence root found)';
  return {
    pass: violations.length === 0,
    evidence: `${claims} MEASURED claims scanned against ${roots_} (${evNames.size} files); ` +
      `${selfMeasured} measured off the build's own assets; ${violations.length} unsourced` +
      (violations.length ? `: ${violations.join(' | ')}` : ''),
  };
}

/* ---------- the declarative evaluator ---------- */
class Refuse extends Error {}       // the package is malformed -> FAIL, and name the token
class Unavailable extends Error {}  // a known capability gap   -> BLOCKED

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(4)) : v);

function walkPath(spec, from) {
  if (typeof spec !== 'string' || !spec.trim()) throw new Refuse('a path must be a non-empty string');
  let cur = from;
  for (const seg of spec.split('.')) {
    if (FORBIDDEN.has(seg)) throw new Refuse(`path segment "${seg}" is forbidden — a path may not walk into prototype internals`);
    if (cur == null) return undefined;
    if (seg === 'length' && (Array.isArray(cur) || typeof cur === 'string')) { cur = cur.length; continue; }
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

const globRx = (glob) => new RegExp('^' + String(glob).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

function select(sel, env) {
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) throw new Refuse('a selector must be an object');
  let xs;
  if ('hitAreas' in sel) xs = (env.root.hitAreas || []).filter((h) => globRx(sel.hitAreas).test(h.id));
  else if ('path' in sel) {
    const v = walkPath(sel.path, env.root);
    // An ABSENT surface is not an empty one. `{count:{path:"state.missing"}}` used to be 0 and could
    // satisfy `eq 0` although nothing was ever observed; present-and-empty still counts as zero.
    if (v === undefined || v === null) {
      throw new Refuse(`selector path "${sel.path}" resolves to nothing in the collected payload — ` +
        `an absent surface is not an empty one`);
    }
    if (!Array.isArray(v)) throw new Refuse(`selector path "${sel.path}" is not an array`);
    xs = v;
  } else throw new Refuse(`a selector needs "hitAreas" or "path", got keys [${Object.keys(sel)}]`);
  if (sel.where) xs = xs.filter((item) => evalPred(sel.where, { ...env, item }, []));
  return xs;
}
const selLabel = (sel) => ('hitAreas' in sel ? `hitAreas ${sel.hitAreas}` : `${sel.path}`) + (sel.where ? ' [filtered]' : '');

function evalTerm(t, env) {
  if (t === null || typeof t === 'number' || typeof t === 'string' || typeof t === 'boolean') return t;
  if (Array.isArray(t) || typeof t !== 'object') throw new Refuse(`unsupported term: ${JSON.stringify(t)}`);
  if ('path' in t) return walkPath(t.path, env.root);
  if ('item' in t) {
    if (env.item === undefined) throw new Refuse(`{item:"${t.item}"} used outside a quantifier`);
    return walkPath(t.item, env.item);
  }
  if ('count' in t) return select(t.count, env).length;
  if ('sum' in t) {
    if (t.of === undefined) throw new Refuse('{sum} needs an "of" term');
    return select(t.sum, env).reduce((acc, item) => acc + Number(evalTerm(t.of, { ...env, item })), 0);
  }
  if ('gaps' in t) {
    const axis = t.axis === 'y' ? 'y' : 'x';
    const size = axis === 'y' ? 'height' : 'width';
    if (t.axis !== 'x' && t.axis !== 'y') throw new Refuse(`{gaps} needs axis "x" or "y", got ${JSON.stringify(t.axis)}`);
    const xs = select(t.gaps, env).slice().sort((a, b) => a[axis] - b[axis]);
    let sum = 0;
    for (let i = 1; i < xs.length; i++) sum += xs[i][axis] - (xs[i - 1][axis] + xs[i - 1][size]);
    return sum;
  }
  if ('px' in t) {
    const bag = env.root.px || {}, gone = env.root.pxUnavailable || {};
    if (!(t.px in bag)) {
      if (t.px in gone) throw new Unavailable(`pixel sample "${t.px}": ${gone[t.px]}`);
      throw new Refuse(`no pixel sample "${t.px}" in the collected payload — the obligation must declare it under "samples" and the probe snippet must run`);
    }
    const ch = { r: 0, g: 1, b: 2 }[t.channel];
    if (ch === undefined) throw new Refuse(`{px} needs channel "r", "g" or "b", got ${JSON.stringify(t.channel)}`);
    return bag[t.px][ch];
  }
  if ('lookup' in t) {
    const xs = select(t.lookup, env);
    const at = evalTerm(t.at, env);
    // An INDEX, never a property name: `at: "constructor"` read the array prototype instead of the
    // game's data, and any string key would have done the same.
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) {
      throw new Refuse(`{lookup} "at" must be a non-negative integer index, got ${JSON.stringify(at)}`);
    }
    if (at >= xs.length) throw new Refuse(`{lookup} index ${at} is past the end of ${selLabel(t.lookup)} (length ${xs.length})`);
    const hit = xs[at];
    if (hit == null) return undefined;
    return t.of === undefined ? hit : walkPath(t.of, hit);
  }
  // Arithmetic PROPAGATES absence rather than coercing it. `Number(undefined)` is NaN and
  // `NaN !== null` is true, so one layer of {add:[...,0]} used to turn a missing path back into a PASS.
  const num = (x, label) => {
    const v = evalTerm(x, env);
    if (v === undefined) throw new Refuse(`${label} resolves to nothing in the collected payload — absence is not a value to compute with`);
    return Number(v);
  };
  if ('abs' in t) return Math.abs(num(t.abs, termLabel(t.abs)));
  for (const [k, f] of [['div', (a, b) => a / b], ['mul', (a, b) => a * b], ['add', (a, b) => a + b], ['sub', (a, b) => a - b]]) {
    if (k in t) {
      if (!Array.isArray(t[k]) || t[k].length !== 2) throw new Refuse(`{${k}} needs exactly two terms`);
      return f(num(t[k][0], termLabel(t[k][0])), num(t[k][1], termLabel(t[k][1])));
    }
  }
  throw new Refuse(`unknown term keys [${Object.keys(t)}]`);
}

function termLabel(t) {
  if (t === null || typeof t !== 'object') return JSON.stringify(t);
  if ('path' in t) return t.path;
  if ('item' in t) return t.item;
  if ('count' in t) return `count(${selLabel(t.count)})`;
  if ('sum' in t) return `sum(${selLabel(t.sum)})`;
  if ('gaps' in t) return `gaps(${selLabel(t.gaps)},${t.axis})`;
  if ('px' in t) return `px(${t.px}).${t.channel}`;
  if ('lookup' in t) return `${selLabel(t.lookup)}[at].${t.of ?? ''}`;
  if ('abs' in t) return `abs(${termLabel(t.abs)})`;
  for (const k of ['div', 'mul', 'add', 'sub']) {
    if (k in t && Array.isArray(t[k])) return `${k}(${termLabel(t[k][0])},${termLabel(t[k][1])})`;
  }
  return '?';
}

/**
 * Validate the predicate TREE before evaluating it. Evaluation short-circuits — `{any:[true, X]}`
 * never looks at X, and `{when:false, then:X}` never looks at X either — so a malformed X used to
 * ride along inside a PASS. Shape is checkable without any data, so it is checked without any data.
 */
// operator -> the companion keys that operator is allowed to carry. Validation demands EXACTLY one
// operator and no key outside its companions: taking the first recognised key and ignoring the rest
// let a malformed check hide behind a well-formed sibling in the same object, and let a typo'd
// companion (`satisfy`, `tolerence`) become a silent no-op.
const TERM_COMPANIONS = { path: [], item: [], count: [], sum: ['of'], gaps: ['axis'], px: ['channel'],
  lookup: ['at', 'of'], abs: [], div: [], mul: [], add: [], sub: [] };
const PRED_COMPANIONS = { all: [], any: [], not: [], when: ['then'], truthy: [], cmp: [], near: [],
  every: ['satisfies'], some: ['satisfies'], none: ['satisfies'] };
const TERM_KEYS = Object.keys(TERM_COMPANIONS);
function soleOperator(obj, companions, what) {
  const ops = Object.keys(companions).filter((k) => k in obj);
  if (!ops.length) throw new Refuse(`unknown ${what} keys [${Object.keys(obj)}]`);
  if (ops.length > 1) throw new Refuse(`a ${what} must carry exactly one operator, got [${ops}]`);
  const allowed = new Set([ops[0], ...companions[ops[0]]]);
  const extra = Object.keys(obj).filter((k) => !allowed.has(k));
  if (extra.length) throw new Refuse(`${what} {${ops[0]}} carries unknown key(s) [${extra}] — allowed here: [${[...allowed]}]`);
  return ops[0];
}
function validateTerm(t) {
  if (t === null || typeof t === 'number' || typeof t === 'string' || typeof t === 'boolean') return;
  if (Array.isArray(t) || typeof t !== 'object') throw new Refuse(`unsupported term: ${JSON.stringify(t)}`);
  const key = soleOperator(t, TERM_COMPANIONS, 'term');
  if (key === 'path' || key === 'item') {
    if (typeof t[key] !== 'string' || !t[key].trim()) throw new Refuse(`{${key}} needs a non-empty string`);
    for (const seg of t[key].split('.')) {
      if (FORBIDDEN.has(seg)) throw new Refuse(`path segment "${seg}" is forbidden — a path may not walk into prototype internals`);
    }
    return;
  }
  if (key === 'count') return validateSel(t.count);
  if (key === 'sum') { validateSel(t.sum); if (t.of === undefined) throw new Refuse('{sum} needs an "of" term'); return validateTerm(t.of); }
  if (key === 'gaps') {
    validateSel(t.gaps);
    if (t.axis !== 'x' && t.axis !== 'y') throw new Refuse(`{gaps} needs axis "x" or "y", got ${JSON.stringify(t.axis)}`);
    return;
  }
  if (key === 'px') {
    if (typeof t.px !== 'string' || !t.px) throw new Refuse('{px} needs a sample key');
    if (!['r', 'g', 'b'].includes(t.channel)) throw new Refuse(`{px} needs channel "r", "g" or "b", got ${JSON.stringify(t.channel)}`);
    return;
  }
  if (key === 'lookup') {
    validateSel(t.lookup);
    if (t.at === undefined) throw new Refuse('{lookup} needs an "at" index term');
    if (t.of !== undefined && typeof t.of !== 'string') throw new Refuse('{lookup} "of" must be a field name');
    return validateTerm(t.at);
  }
  if (key === 'abs') return validateTerm(t.abs);
  if (!Array.isArray(t[key]) || t[key].length !== 2) throw new Refuse(`{${key}} needs exactly two terms`);
  t[key].forEach(validateTerm);
}
function validateSel(sel) {
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) throw new Refuse('a selector must be an object');
  if ('hitAreas' in sel) {
    if (typeof sel.hitAreas !== 'string') throw new Refuse('{hitAreas} needs a glob string');
  } else if ('path' in sel) {
    if (typeof sel.path !== 'string' || !sel.path.trim()) throw new Refuse('a selector path must be a non-empty string');
  } else throw new Refuse(`a selector needs "hitAreas" or "path", got keys [${Object.keys(sel)}]`);
  // Selectors escaped the exactly-one-operator rule: {hitAreas, path} validated and then silently
  // used hitAreas.
  if ('hitAreas' in sel && 'path' in sel) throw new Refuse('a selector must name ONE source, got both "hitAreas" and "path"');
  const allowed = new Set(['hitAreas', 'path', 'where']);
  const extra = Object.keys(sel).filter((k) => !allowed.has(k));
  if (extra.length) throw new Refuse(`selector carries unknown key(s) [${extra}]`);
  if (sel.where !== undefined) validatePred(sel.where);
}
function validatePred(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Refuse(`a predicate must be an object, got ${JSON.stringify(p)}`);
  soleOperator(p, PRED_COMPANIONS, 'predicate');
  for (const k of ['all', 'any']) {
    if (!(k in p)) continue;
    if (!Array.isArray(p[k])) throw new Refuse(`{${k}} needs an array`);
    // An empty conjunction is not a check that passes, it is a check nobody wrote.
    if (!p[k].length) throw new Refuse(`{${k}: []} is empty — an empty predicate cannot satisfy an obligation`);
    return p[k].forEach(validatePred);
  }
  if ('not' in p) return validatePred(p.not);
  if ('when' in p) {
    if (!('then' in p)) throw new Refuse('{when} needs a "then" predicate');
    validatePred(p.when); return validatePred(p.then);
  }
  if ('truthy' in p) return validateTerm(p.truthy);
  if ('cmp' in p) {
    if (!Array.isArray(p.cmp) || p.cmp.length !== 3) throw new Refuse('{cmp} needs [left, op, right]');
    if (!(p.cmp[1] in OPS)) throw new Refuse(`unknown operator "${p.cmp[1]}" — allowed: ${Object.keys(OPS).join(', ')}`);
    validateTerm(p.cmp[0]); return validateTerm(p.cmp[2]);
  }
  if ('near' in p) {
    if (!Array.isArray(p.near) || p.near.length !== 3) throw new Refuse('{near} needs [term, target, tolerance]');
    return p.near.forEach(validateTerm);
  }
  for (const kind of ['every', 'some', 'none']) {
    if (!(kind in p)) continue;
    validateSel(p[kind]);
    if (!p.satisfies) throw new Refuse(`{${kind}} needs a "satisfies" predicate`);
    return validatePred(p.satisfies);
  }
  throw new Refuse(`unknown predicate keys [${Object.keys(p)}]`);
}

const OPS = {
  eq: (a, b) => a === b, ne: (a, b) => a !== b,
  lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b,
};

function evalPred(p, env, tr) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Refuse(`a predicate must be an object, got ${JSON.stringify(p)}`);
  if ('all' in p) { if (!Array.isArray(p.all)) throw new Refuse('{all} needs an array'); return p.all.every((q) => evalPred(q, env, tr)); }
  if ('any' in p) { if (!Array.isArray(p.any)) throw new Refuse('{any} needs an array'); return p.any.some((q) => evalPred(q, env, tr)); }
  if ('not' in p) return !evalPred(p.not, env, tr);
  if ('when' in p) {
    if (!('then' in p)) throw new Refuse('{when} needs a "then" predicate');
    if (!evalPred(p.when, env, [])) { tr.push('when=false (vacuous)'); return true; }
    return evalPred(p.then, env, tr);
  }
  if ('truthy' in p) {
    const v = evalTerm(p.truthy, env);
    tr.push(`${termLabel(p.truthy)}=${JSON.stringify(fmt(v))}`);
    return !!v;
  }
  if ('cmp' in p) {
    if (!Array.isArray(p.cmp) || p.cmp.length !== 3) throw new Refuse('{cmp} needs [left, op, right]');
    const [l, op, rt] = p.cmp;
    if (!(op in OPS)) throw new Refuse(`unknown operator "${op}" — allowed: ${Object.keys(OPS).join(', ')}`);
    const lv = evalTerm(l, env), rv = evalTerm(rt, env);
    // A term that resolves to NOTHING is not a value to compare. `undefined !== null` is true, so a
    // typo in an observable used to satisfy a blocking predicate. A field that is PRESENT and null
    // is still a value, and `truthy` remains the operator for asking whether something is there.
    if (lv === undefined) throw new Refuse(`${termLabel(l)} resolves to nothing in the collected payload — absence is not a value to compare`);
    if (rv === undefined) throw new Refuse(`${termLabel(rt)} resolves to nothing in the collected payload — absence is not a value to compare`);
    tr.push(`${termLabel(l)}=${JSON.stringify(fmt(lv))} ${op} ${JSON.stringify(fmt(rv))}`);
    return OPS[op](lv, rv);
  }
  if ('near' in p) {
    if (!Array.isArray(p.near) || p.near.length !== 3) throw new Refuse('{near} needs [term, target, tolerance]');
    const [l, target, tol] = p.near;
    const raw = [evalTerm(l, env), evalTerm(target, env), evalTerm(tol, env)];
    const missing = [l, target, tol].find((_, i) => raw[i] === undefined);
    if (missing !== undefined) throw new Refuse(`${termLabel(missing)} resolves to nothing in the collected payload — absence is not a value to compare`);
    const [lv, tv, tolv] = raw.map(Number);
    tr.push(`${termLabel(l)}=${fmt(lv)} vs ${fmt(tv)}±${tolv}`);
    return Math.abs(lv - tv) <= tolv;
  }
  for (const kind of ['every', 'some', 'none']) {
    if (!(kind in p)) continue;
    if (!p.satisfies) throw new Refuse(`{${kind}} needs a "satisfies" predicate`);
    const xs = select(p[kind], env);
    const shown = [];
    let hits = 0, firstFail = null;
    for (let i = 0; i < xs.length; i++) {
      const sub = [];
      const ok = evalPred(p.satisfies, { ...env, item: xs[i] }, sub);
      if (shown.length < 6) shown.push(sub.join(' & '));
      if (ok) hits++;
      else if (!firstFail) firstFail = `${xs[i]?.id ?? `#${i}`} -> ${sub.join(' & ')}`;
    }
    // An empty selection is NOT a pass. A fidelity check that matched nothing is the silence this
    // file exists to remove, so `every` and `some` over nothing are failures and say so.
    if (!xs.length && kind !== 'none') { tr.push(`${kind}(${selLabel(p[kind])}) matched NOTHING`); return false; }
    tr.push(`${kind}(${selLabel(p[kind])}) n=${xs.length} ok=${hits}` +
      (firstFail ? ` first-fail ${firstFail}` : ` [${shown.join(' | ')}]`));
    if (kind === 'every') return hits === xs.length;
    if (kind === 'some') return hits > 0;
    return hits === 0;
  }
  throw new Refuse(`unknown predicate keys [${Object.keys(p)}]`);
}

/* ---------- score ---------- */
let collected = {};
if (dataFile) {
  if (!fs.existsSync(dataFile)) bail(`collected payload ${dataFile} does not exist — refusing to score every obligation against nothing`);
  try { collected = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (e) { bail(`collected payload ${dataFile} is not valid JSON: ${e.message}`); }
}
const byState = Array.isArray(collected) ? Object.fromEntries(collected.map((c) => [c.state || 'any', c])) : collected;

const results = obligations.map((o, idx) => {
  const id = o && typeof o.id === 'string' && o.id.trim() ? o.id : `__unnamed_${idx}__`;
  const base = { id, primitive: (o && o.primitive) || '?', enforcement: (o && o.enforcement) || 'blocking' };
  const FAIL = (evidence) => ({ ...base, verdict: 'FAIL', evidence });

  // --- shape, before anything else. A malformed obligation is a package bug, named as one.
  if (!o || typeof o !== 'object' || Array.isArray(o)) return FAIL('obligation is not an object');
  if (typeof o.id !== 'string' || !o.id.trim()) return FAIL(`obligation #${idx} has no id — every obligation must be citable`);
  if (!PRIMITIVES.has(o.primitive)) {
    return FAIL(`unknown primitive ${JSON.stringify(o.primitive)} — allowed: ${[...PRIMITIVES].join(', ')}`);
  }
  if (o.enforcement !== undefined && o.enforcement !== 'blocking' && o.enforcement !== 'advisory') {
    return FAIL(`enforcement must be "blocking" or "advisory", got ${JSON.stringify(o.enforcement)}`);
  }
  // PROV-01 is the standing provenance lock and is dispatched by primitive, not by id. Drift between
  // the two is a package bug that would otherwise look like a missing model binding.
  // The provenance lock's enforcement is not the package's to choose: `advisory` turned a
  // generated-art citation into an ADVISORY-FAIL and the decision back into ACCEPT.
  if (o.primitive === 'prov') base.enforcement = 'blocking';
  if (/^PROV-/.test(o.id) && o.primitive !== 'prov') {
    return FAIL(`${o.id} must carry primitive "prov" (it is a static source check, not a ${o.primitive} check)`);
  }

  if (o.primitive === 'prov') {
    const r = checkProvenance(gameDir);
    return { ...base, verdict: r.pass ? 'PASS' : 'FAIL', evidence: r.evidence };
  }

  // BLOCKED must be EARNED: only a capability this dispatcher knows it lacks can produce it.
  if (o.blocked_on) {
    // The gap id must LEAD the value. A substring match let any sentence that merely mentioned a gap
    // claim it ("not really reference.resolution, I just do not want to check this").
    const lead = String(o.blocked_on).trim().split(/[\s—,:;(]/)[0];
    const gap = Object.prototype.hasOwnProperty.call(KNOWN_GAPS, lead) ? lead : null;
    if (!gap) {
      return FAIL(`blocked_on ${JSON.stringify(o.blocked_on)} must BEGIN with a capability this dispatcher ` +
        `recognises — one of: ${Object.keys(KNOWN_GAPS).join(', ')} (a free note may follow). Otherwise ` +
        `"blocked" is a way to opt out of the check.`);
    }
    const scope = GAP_SCOPE[gap];
    if (scope === 'advisory-only') {
      if (base.enforcement !== 'advisory') {
        return FAIL(`${gap} says the REFERENCE has no measured target, so this was never a blocking ` +
          `obligation — mark it advisory and name the constant in the package's \`blocking\` list (§4)`);
      }
    } else if (!scope.includes(o.primitive)) {
      return FAIL(`${gap} is a gap in the ${scope.join('/')} surface and cannot hold a ${o.primitive} ` +
        `obligation open — a gap belongs to the surface it describes`);
    }
    return { ...base, verdict: 'BLOCKED', evidence: `${gap}: ${KNOWN_GAPS[gap]}` };
  }

  if (o.primitive === 'model' || o.primitive === 'geometry') {
    // Only the game knows its own symbols. Unbound is a FAIL, not a skip.
    const bound = ((Array.isArray(collected) ? {} : collected.bound) || {})[o.id];
    if (bound === undefined) return FAIL('no binding supplied — a blocking obligation with no result is a FAIL, not a skip');
    return { ...base, verdict: bound.pass ? 'PASS' : 'FAIL', evidence: String(bound.evidence ?? '') };
  }

  // `pose` is documented as a primitive the COMPILER may name, and the dispatcher can only cover it
  // when the package supplies a predicate over the counter it does expose. Without one it reports
  // the capability gap — and a BLOCKED verdict never rejects the build, because a hole in this file
  // is not a defect in the game. Every other primitive still owes a predicate: the compiler said it
  // would write one.
  if (o.predicate === undefined || o.predicate === null) {
    if (o.primitive === 'pose') {
      // NOT auto-BLOCKED. Inferring the gap from the primitive made every predicate-less pose
      // obligation unverifiable-but-accepted, which is an opt-out now that BLOCKED does not reject.
      return FAIL('a pose obligation needs either a predicate over the counter diagnostics.subjects DOES ' +
        `expose, or an explicit blocked_on: pose.transform (${KNOWN_GAPS['pose.transform']})`);
    }
    return FAIL('obligation carries no predicate — it cannot be dispatched');
  }
  if (typeof o.predicate === 'string') {
    return FAIL('predicate is a string — arbitrary JavaScript is NOT executed. The predicate schema is ' +
      'declarative (see the header of obligations.mjs and SKILL.md §3); rewrite it as data.');
  }
  if (o.primitive === 'pixel' && (!o.samples || typeof o.samples !== 'object' || !Object.keys(o.samples).length)) {
    return FAIL('a pixel obligation must declare its samples: {"samples":{"<key>":{"hitArea":"<id>","at":[fx,fy]}}} — ' +
      'without one the probe collects nothing and the check cannot run');
  }

  const ctx = byState[o.state || 'any'];
  if (!ctx) return FAIL(`no page data collected for required_state "${o.state || 'any'}"`);

  const tr = [];
  try {
    validatePred(o.predicate);
    const pass = evalPred(o.predicate, { root: ctx }, tr);
    const note = typeof o.evidence === 'string'
      ? '  (the obligation\'s `evidence` expression was ignored — evidence is generated from the trace)' : '';
    return { ...base, verdict: pass ? 'PASS' : 'FAIL', evidence: tr.join('; ').slice(0, 700) + note };
  } catch (e) {
    if (e instanceof Unavailable) return { ...base, verdict: 'BLOCKED', evidence: `pixel.sample — ${e.message}` };
    if (e instanceof Refuse) return FAIL(`malformed predicate: ${e.message}${tr.length ? ` (trace: ${tr.join('; ')})` : ''}`);
    return FAIL(`predicate could not be evaluated: ${e.message}`);
  }
});

// Same rule one level up: a package that emitted no provenance obligation has not been checked for
// the failure PROV-01 exists for, and that absence must be a row, not a silence.
if (!obligations.some((o) => o && o.primitive === 'prov')) {
  results.push({ id: 'PROV-01', primitive: 'prov', enforcement: 'blocking', verdict: 'FAIL',
    evidence: 'the package emitted no provenance obligation, so nothing checked whether its MEASURED ' +
      'constants cite evidence that resolves — SKILL.md requires at least this one with every package' });
}

const blocked = results.filter((r) => r.verdict === 'BLOCKED').map((r) => r.id);
const blockingFails = results.filter((r) => r.enforcement !== 'advisory' && r.verdict === 'FAIL');
const decision = blockingFails.length ? 'REJECT' : 'ACCEPT';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), decision, blocked, results }, null, 1));

const w = (s, n) => String(s).padEnd(n);
for (const r of results) {
  const tag = r.enforcement === 'advisory' && r.verdict === 'FAIL' ? 'ADVISORY-FAIL' : r.verdict;
  console.log(`  ${w(tag, 13)} ${w(r.id, 10)} [${w(r.primitive, 8)}] ${r.evidence}`);
}
console.log(`\n  ${results.length} obligations · ${results.filter((r) => r.verdict === 'PASS').length} PASS · ` +
  `${results.filter((r) => r.verdict === 'FAIL').length} FAIL · ${blocked.length} BLOCKED`);
if (blocked.length) {
  console.log(`  BLOCKED (unverifiable today, recorded as capability gaps — these do NOT reject): ${blocked.join(', ')}`);
}
console.log(`  build decision: ${decision}${blockingFails.length ? ` — ${blockingFails.map((r) => r.id).join(', ')}` : ''}`);
console.log(`  written: ${path.relative(gameDir, OUT)}`);
process.exit(blockingFails.length ? 1 : 0);
