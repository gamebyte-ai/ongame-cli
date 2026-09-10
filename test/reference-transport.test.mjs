import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runObligations } from '../skills/reference/obligations.mjs';

async function fixture(t, entries = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-transport-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [name, value] of Object.entries({ 'docs/obligations.json': '[{"id":"opaque","predicate":{"anything":"unchanged"}}]',
    'src/game.ts': 'const source = "unchanged";', ...entries })) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), value);
  }
  return dir;
}
function io(transport) {
  const out = [], err = [];
  return { transport, out: (line) => out.push(line), err: (line) => err.push(line), stdout: out, stderr: err };
}

test('probe forwards opaque obligations, both source layouts, and logical media paths', async (t) => {
  const dir = await fixture(t, {
    'Assets/Scripts/Game.cs': 'class Game {}', '.ref/frame.png': 'image bytes stay local',
    'evidence/video.webm': 'video bytes stay local', 'public/assets/icon.png': 'asset bytes stay local',
    '.env': 'secret', 'src/.env.local': 'secret', 'node_modules/hidden.ts': 'secret',
    'src/node_modules/hidden.ts': 'secret', '.git/secret.png': 'secret',
  });
  let request;
  const client = io(async (name, payload) => {
    assert.equal(name, 'reference_evaluate'); request = payload;
    return { ok: true, statesNeeded: ['state-id'], pixelSamples: { sampleId: { point: [0.2, 0.3] } }, snippet: 'window.opaqueProbe();' };
  });
  assert.equal(await runObligations(['probe', dir], client), 0);
  assert.deepEqual(request.obligations, [{ id: 'opaque', predicate: { anything: 'unchanged' } }]);
  assert.equal(request.operation, 'probe');
  assert.deepEqual(request.sources, [{ path: 'Assets/Scripts/Game.cs', text: 'class Game {}' },
    { path: 'src/game.ts', text: 'const source = "unchanged";' }]);
  assert.deepEqual(request.evidence, ['.ref/frame.png', 'evidence/video.webm']);
  assert.deepEqual(request.assets, ['public/assets/icon.png']);
  assert.doesNotMatch(JSON.stringify(request), /secret|bytes stay local/);
  assert.match(client.stdout.join('\n'), /BEGIN PAGE SNIPPET\nwindow\.opaqueProbe\(\);\n\/\/ ---8<--- END PAGE SNIPPET/);
  assert.equal(client.stderr.length, 0);
});

test('Unity build caches are skipped while generated image paths remain in the inventory', async (t) => {
  const dir = await fixture(t, {
    'Assets/Scripts/Game.cs': 'class Game {}', 'Library/cache.png': 'cache', 'Temp/cache.png': 'cache',
    'Obj/cache.png': 'cache', 'obj/cache.png': 'cache', 'Logs/cache.png': 'cache', '.cache/cache.png': 'cache',
    '.ongame/buildlogs/log.png': 'cache', '.ongame/screenshots/runtime.png': 'generated', 'docs/concept/concept.png': 'generated',
  });
  await fs.symlink('/outside/unused', path.join(dir, 'Library/linked.png'));
  const client = io(async (_name, payload) => {
    assert.deepEqual(payload.assets, ['.ongame/screenshots/runtime.png', 'docs/concept/concept.png']);
    assert.equal(payload.sources.some(({ path }) => path === 'Assets/Scripts/Game.cs'), true);
    return { ok: true, statesNeeded: [], pixelSamples: {}, snippet: 'opaque' };
  });
  assert.equal(await runObligations(['probe', dir], client), 0, client.stderr.join('\n'));
});

test('the one MiB and 256-source boundaries are inclusive', async (t) => {
  const entries = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`src/file-${i}.ts`, 'x']));
  entries['src/game.ts'] = 'x'.repeat(1024 * 1024 - 255);
  const dir = await fixture(t, entries);
  let calls = 0;
  const client = io(async (_name, payload) => {
    calls++;
    assert.equal(payload.sources.length, 256);
    assert.equal(payload.sources.reduce((size, file) => size + Buffer.byteLength(file.text), 0), 1024 * 1024);
    return { ok: true, statesNeeded: [], pixelSamples: {}, snippet: 'opaque' };
  });
  assert.equal(await runObligations(['probe', dir], client), 0, client.stderr.join('\n'));
  assert.equal(calls, 1);
});

test('score writes the response at the original artifact path and exits only on REJECT', async (t) => {
  const dir = await fixture(t, { 'collected.json': '{"evidence":"opaque collected data"}' });
  for (const decision of ['ACCEPT', 'REJECT']) {
    const result = { at: 'fixture-time', decision, blocked: ['gap-id'], results: [{ id: 'opaque', verdict: 'BLOCKED' }] };
    const client = io(async (_name, payload) => {
      assert.deepEqual(payload.collected, { evidence: 'opaque collected data' });
      return { ok: true, ...result };
    });
    assert.equal(await runObligations(['score', dir, path.join(dir, 'collected.json')], client), decision === 'REJECT' ? 1 : 0, client.stderr.join('\n'));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'docs/obligations.result.json'), 'utf8')), result);
    assert.deepEqual(JSON.parse(client.stdout.join('')), result);
    assert.equal(client.stderr.length, 0);
  }
});

test('the documented node command preserves JSON, artifact and process exit contracts', async (t) => {
  const dir = await fixture(t), install = await fixture(t);
  await fs.mkdir(path.join(install, 'bin'));
  await fs.writeFile(path.join(install, 'package.json'), '{"type":"module"}');
  for (const decision of ['ACCEPT', 'REJECT']) {
    const response = { ok: true, decision, blocked: [], results: [] };
    await fs.writeFile(path.join(install, 'bin/ongame-cli'), `#!${process.execPath}\nfor await (const chunk of process.stdin) {}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../skills/reference/obligations.mjs'), 'score', dir], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, ONGAME_INSTALL_DIR: install, PATH: '' },
    });
    assert.equal(result.status, decision === 'REJECT' ? 1 : 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).decision, decision);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'docs/obligations.result.json'), 'utf8')).decision, decision);
  }
});

test('authentication and malformed response failures do not create an artifact', async (t) => {
  const dir = await fixture(t);
  for (const response of [{ ok: false, gated: true }, { ok: true, unexpected: 'secret' }]) {
    const client = io(async () => response);
    assert.equal(await runObligations(['score', dir], client), 1);
    assert.equal(client.stdout.length, 0);
    assert.equal(client.stderr.length, 1);
    assert.doesNotMatch(client.stderr[0], /secret/);
    await assert.rejects(fs.access(path.join(dir, 'docs/obligations.result.json')));
  }
});

test('source, evidence, document, root and artifact symlinks are refused', async (t) => {
  for (const target of ['src/linked.ts', '.ref/frame.png', 'docs/obligations.json', 'docs/obligations.result.json']) {
    const dir = await fixture(t);
    const linked = path.join(dir, target);
    await fs.mkdir(path.dirname(linked), { recursive: true });
    await fs.rm(linked, { force: true });
    await fs.symlink(path.join(dir, 'src/game.ts'), linked);
    let calls = 0;
    const client = io(async () => { calls++; return { ok: true, decision: 'ACCEPT', blocked: [], results: [] }; });
    assert.equal(await runObligations(['score', dir], client), 1, target);
    assert.equal(calls, 0, target);
  }
  const real = await fixture(t), holder = await fixture(t), link = path.join(holder, 'linked-root');
  await fs.symlink(real, link);
  const client = io(async () => { throw new Error('must not call'); });
  assert.equal(await runObligations(['score', link], client), 1);
});

test('outside-root and environment collected inputs are refused before transport', async (t) => {
  const dir = await fixture(t, { '.env': '{}' });
  for (const file of [path.join(os.tmpdir(), 'outside.json'), '../outside.json', '.env']) {
    let calls = 0;
    const client = io(async () => { calls++; return { ok: true }; });
    assert.equal(await runObligations(['score', dir, file], client), 1);
    assert.equal(calls, 0);
  }
});

test('source and output hardlinks cannot read or replace another file', async (t) => {
  for (const name of ['src/linked.ts', 'docs/obligations.result.json']) {
    const dir = await fixture(t);
    const outside = await fixture(t, { 'protected.txt': 'unchanged' });
    await fs.link(path.join(outside, 'protected.txt'), path.join(dir, name));
    let calls = 0;
    const client = io(async () => { calls++; return { ok: true, decision: 'ACCEPT', results: [] }; });
    assert.equal(await runObligations(['score', dir], client), 1);
    assert.equal(calls, 0);
    assert.equal(await fs.readFile(path.join(outside, 'protected.txt'), 'utf8'), 'unchanged');
  }
});

test('an artifact symlink introduced while waiting cannot redirect a result write', async (t) => {
  const dir = await fixture(t), outside = await fixture(t, { 'protected.txt': 'unchanged' });
  const client = io(async () => {
    await fs.symlink(path.join(outside, 'protected.txt'), path.join(dir, 'docs/obligations.result.json'));
    return { ok: true, decision: 'ACCEPT', results: [] };
  });
  assert.equal(await runObligations(['score', dir], client), 1);
  assert.equal(await fs.readFile(path.join(outside, 'protected.txt'), 'utf8'), 'unchanged');
  assert.equal(client.stdout.length, 0);
});

test('source collection enforces one MiB total and 256 files', async (t) => {
  for (const entries of [{ 'src/oversize.ts': 'x'.repeat(1024 * 1024) },
    Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`src/file-${i}.ts`, 'x']))]) {
    const dir = await fixture(t, entries);
    let calls = 0;
    const client = io(async () => { calls++; return { ok: true }; });
    assert.equal(await runObligations(['probe', dir], client), 1);
    assert.equal(calls, 0);
  }
});

test('invalid JSON and missing explicit gameDir fail without echoing input', async (t) => {
  const dir = await fixture(t, { 'docs/obligations.json': 'secret-invalid-json' });
  for (const argv of [[], ['probe'], ['probe', '.'], ['other', dir], ['score', dir, 'a', 'b'], ['probe', dir]]) {
    const client = io(async () => { throw new Error('must not call'); });
    assert.equal(await runObligations(argv, client), 1);
    assert.equal(client.stdout.length, 0);
    assert.doesNotMatch(client.stderr.join(''), /secret-invalid-json/);
  }
});
