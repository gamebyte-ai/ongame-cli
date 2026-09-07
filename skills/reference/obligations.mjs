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
 *   pixel    — a sampled screenshot, anchored on a hitArea rect
 *   pose     — window.__game.diagnostics.subjects    (§9 exposes a COUNTER only — see BLOCKED)
 *   model/geometry — the game's own functions, which only the game can bind
 *
 * It does not drive a browser. `probe` prints one snippet for the browser tool the pipeline already
 * uses; `score` grades what came back. Transport stays with the caller, judgement does not.
 *
 * THE RULE THAT GIVES IT TEETH: a blocking obligation with no result is a FAIL, never a skip.
 * Silence used to read as success; that is the failure this file exists to remove.
 *
 *   node obligations.mjs probe <gameDir>            -> a page snippet to evaluate, on stdout
 *   node obligations.mjs score <gameDir> [data.json] -> verdicts + docs/obligations.result.json
 *                                                      exit 1 if any blocking obligation is not PASS
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , cmd, gameDir, dataFile] = process.argv;
if (!cmd || !gameDir) { console.error('usage: obligations.mjs probe|score <gameDir> [data.json]'); process.exit(2); }
const OBL = path.join(gameDir, 'docs/obligations.json');
if (!fs.existsSync(OBL)) { console.error(`no obligations at ${OBL} — nothing to dispatch`); process.exit(2); }
const obligations = JSON.parse(fs.readFileSync(OBL, 'utf8'));
const RUNTIME = new Set(['hitArea', 'state', 'pixel', 'pose']);

/* ---------- probe: one snippet, evaluated in the page by the caller's existing browser tool ---------- */
if (cmd === 'probe') {
  const states = [...new Set(obligations.filter((o) => RUNTIME.has(o.primitive)).map((o) => o.state || 'any'))];
  console.log(JSON.stringify({ statesNeeded: states }, null, 1));
  console.log(`
// Evaluate this in the page, once per state in statesNeeded, and pass the results to \`score\`.
(() => {
  const g = window.__game || {}, d = g.diagnostics || {};
  const r = (document.querySelector('canvas') || document.body).getBoundingClientRect();
  return {
    state: g.state ?? null,
    board: g.board ?? null,
    W: r.width, H: r.height,
    hitAreas: (d.hitAreas || []).map(h => ({ id: h.id, x: h.x, y: h.y, width: h.width, height: h.height })),
    subjects: d.subjects ? JSON.parse(JSON.stringify(d.subjects)) : null,
    bindingsSettled: d.bindingsSettled ?? null,
  };
})()`);
  process.exit(0);
}

/* ---------- static check: provenance. Deterministic, no runtime, no binding. ---------- */
function checkProvenance(dir) {
  const EV = path.join(dir, 'evidence');
  const evNames = new Set(fs.existsSync(EV) ? fs.readdirSync(EV) : []);
  const GENERATED = [/assets\/concept\//, /docs\/concept\//, /\.ongame\/screenshots\//, /runtime_[a-z_]*\.(png|jpg)/];
  const CLAIM = /\b(MEASURED|measured from|measured, from|observed from)\b/i;
  const PATHRE = /[\w./-]+\.(png|jpg|jpeg|mp4|webm)/g;
  const src = path.join(dir, 'src');
  const files = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(e.name)) walk(p); }
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(p);
    }
  })(src);
  const violations = [];
  let claims = 0;
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!CLAIM.test(lines[i])) continue;
      const cited = [...lines.slice(i, i + 4).join(' ').matchAll(PATHRE)].map((m) => m[0]);
      if (!cited.length) continue;
      claims++;
      for (const c of cited) {
        // A generated artefact standing in for reference truth. Measuring your OWN shipped sprite is fine.
        if (GENERATED.some((rx) => rx.test(c)) && !evNames.has(path.basename(c))) {
          violations.push(`${path.relative(dir, f)}:${i + 1} cites ${c}`);
        }
      }
    }
  }
  return { pass: violations.length === 0, evidence: `${claims} MEASURED claims scanned, ${violations.length} sourced from a generated artefact` + (violations.length ? `: ${violations.join(' | ')}` : '') };
}

/* ---------- score ---------- */
const collected = dataFile && fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : {};
const byState = Array.isArray(collected) ? Object.fromEntries(collected.map((c) => [c.state || 'any', c])) : collected;

const results = obligations.map((o) => {
  const base = { id: o.id, primitive: o.primitive, enforcement: o.enforcement || 'blocking' };

  if (o.primitive === 'prov') {
    const r = checkProvenance(gameDir);
    return { ...base, verdict: r.pass ? 'PASS' : 'FAIL', evidence: r.evidence };
  }
  if (o.blocked_on) {
    return { ...base, verdict: 'BLOCKED', evidence: `needs ${o.blocked_on} — the primitive does not expose it today` };
  }
  if (o.primitive === 'model' || o.primitive === 'geometry') {
    // Only the game knows its own symbols. Unbound is a FAIL, not a skip.
    const bound = (collected.bound || {})[o.id];
    if (bound === undefined) {
      return { ...base, verdict: 'FAIL', evidence: 'no binding supplied — a blocking obligation with no result is a FAIL, not a skip' };
    }
    return { ...base, verdict: bound.pass ? 'PASS' : 'FAIL', evidence: String(bound.evidence ?? '') };
  }
  if (!o.predicate) {
    // A primitive whose limits are KNOWN reports BLOCKED, not FAIL: `pose` exposes a change COUNTER
    // (diagnostics.subjects[].poseChanges) and no rendered transform, so an obligation about where a
    // moving subject actually landed cannot be expressed yet. That is a missing capability, not a
    // broken build — and the difference matters, because FAIL here would reject builds for a gap in
    // this file. Every other primitive still FAILS without a predicate: the compiler owed one.
    if (o.primitive === 'pose') {
      return { ...base, verdict: 'BLOCKED',
        evidence: 'pose without a predicate: diagnostics.subjects exposes poseChanges (a counter) and no rendered rect/rotation, so this cannot be dispatched today' };
    }
    return { ...base, verdict: 'FAIL', evidence: 'obligation carries no predicate — it cannot be dispatched' };
  }
  const ctx = byState[o.state || 'any'];
  if (!ctx) {
    return { ...base, verdict: 'FAIL', evidence: `no page data collected for required_state "${o.state || 'any'}"` };
  }
  const hitAreas = ctx.hitAreas || [];
  const scope = {
    hitAreas, W: ctx.W, H: ctx.H, state: ctx.state, board: ctx.board, subjects: ctx.subjects,
    pick: (glob) => hitAreas.filter((h) => new RegExp('^' + String(glob).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(h.id)),
    // px is a FUNCTION, not a bag. It looks up a colour the collector already sampled — the
    // dispatcher drives no browser, so it cannot go and read a pixel on demand. A predicate that
    // asks for a sample nobody collected gets a clear message instead of `undefined.r`.
    px: (key) => {
      const bag = ctx.px || {};
      if (!(key in bag)) throw new Error(`no pixel sample collected for "${key}" — the probe payload must carry px["${key}"]`);
      return bag[key];
    },
  };
  try {
    const fn = new Function(...Object.keys(scope), `return (${o.predicate});`);
    const pass = !!fn(...Object.values(scope));
    let ev = '';
    if (o.evidence) {
      try { ev = String(new Function(...Object.keys(scope), `return (${o.evidence});`)(...Object.values(scope))); }
      catch (e) { ev = `evidence expression failed: ${e.message}`; }
    }
    return { ...base, verdict: pass ? 'PASS' : 'FAIL', evidence: ev };
  } catch (e) {
    return { ...base, verdict: 'FAIL', evidence: `predicate threw: ${e.message}` };
  }
});

const out = path.join(gameDir, 'docs/obligations.result.json');
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));

const w = (s, n) => String(s).padEnd(n);
for (const r of results) {
  const tag = r.enforcement === 'advisory' && r.verdict === 'FAIL' ? 'ADVISORY-FAIL' : r.verdict;
  console.log(`  ${w(tag, 13)} ${w(r.id, 10)} [${w(r.primitive, 8)}] ${r.evidence}`);
}
const blockingFails = results.filter((r) => r.enforcement !== 'advisory' && r.verdict !== 'PASS');
console.log(`\n  ${results.length} obligations · ${results.filter((r) => r.verdict === 'PASS').length} PASS · ` +
  `${results.filter((r) => r.verdict === 'FAIL').length} FAIL · ${results.filter((r) => r.verdict === 'BLOCKED').length} BLOCKED`);
console.log(`  build decision: ${blockingFails.length ? 'REJECT' : 'ACCEPT'}${blockingFails.length ? ` — ${blockingFails.map((r) => r.id).join(', ')}` : ''}`);
console.log(`  written: ${path.relative(gameDir, out)}`);
process.exit(blockingFails.length ? 1 : 0);
