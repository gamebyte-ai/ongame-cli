import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as M from '../tools/measure/measure.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'measurement-transport-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, '.ref'));
  await fs.writeFile(path.join(dir, '.ref/one.png'), Buffer.from([0, 255, 128, 13, 10]));
  await fs.writeFile(path.join(dir, '.ref/two.jpg'), Buffer.from([255, 0, 17]));
  return dir;
}

test('all single-image operations forward original bytes, IDs and opaque options', async (t) => {
  const dir = await fixture(t);
  const options = { opaqueFutureOption: { nested: [1, 'unchanged'] }, rect: ['opaque'] };
  for (const operation of ['source', 'colour', 'runs', 'pitch', 'count_fills', 'scale']) {
    let calls = 0;
    const result = { ok: true, measurement: { validity: 'opaque', operation }, overlays: [{ data_base64: 'opaque-overlay' }] };
    const client = { overlay: true, transport: async (name, payload) => {
      calls++; assert.equal(name, 'reference_measure');
      assert.deepEqual(payload, { operation, evidence: [{ id: 'source-A', data_base64: 'AP+ADQo=' }], options, overlay: true });
      return result;
    } };
    assert.deepEqual(await M[operation](dir, { id: 'source-A', path: '.ref/one.png' }, options, client), result);
    assert.equal(calls, 1);
  }
});

test('track and rate preserve frame order and send fit data without local evaluation', async (t) => {
  const dir = await fixture(t);
  const frames = [{ id: 'later', path: '.ref/two.jpg' }, { id: 'earlier', path: '.ref/one.png' }];
  const options = { opaque: true }, fit = { futureFitOption: 'opaque' };
  for (const operation of ['track', 'rate']) {
    const client = { transport: async (name, payload) => {
      assert.equal(name, 'reference_measure');
      assert.deepEqual(payload, { operation, evidence: [
        { id: 'later', data_base64: '/wAR' }, { id: 'earlier', data_base64: 'AP+ADQo=' },
      ], options, ...(operation === 'rate' ? { fit } : {}) });
      return { ok: true, measurement: { returned: 'unchanged' } };
    } };
    const response = operation === 'rate' ? await M.rate(dir, frames, options, fit, client) : await M.track(dir, frames, options, client);
    assert.deepEqual(response, { ok: true, measurement: { returned: 'unchanged' } });
  }
});

test('string paths get stable opaque IDs and caller paths never leave the process', async (t) => {
  const dir = await fixture(t);
  let calls = 0;
  await M.track(dir, ['.ref/one.png', '.ref/two.jpg'], {}, { transport: async (_name, payload) => {
    calls++;
    assert.deepEqual(payload.evidence.map(({ id }) => id), ['frame-1', 'frame-2']);
    assert.doesNotMatch(JSON.stringify(payload), /\.ref|one\.png|two\.jpg|measurement-transport/);
    return { ok: true, measurement: {} };
  } });
  assert.equal(calls, 1);
});

test('hardlinked evidence is refused without reading or sending it', async (t) => {
  const dir = await fixture(t), outside = await fixture(t);
  await fs.link(path.join(outside, '.ref/one.png'), path.join(dir, '.ref/linked.png'));
  let calls = 0;
  await assert.rejects(M.source(dir, '.ref/linked.png', {}, { transport: async () => { calls++; return { ok: true }; } }));
  assert.equal(calls, 0);
});

test('non-image inputs are refused before reading or sending bytes', async (t) => {
  const dir = await fixture(t);
  const originalOpen = fs.open;
  let reads = 0, calls = 0;
  t.mock.method(fs, 'open', (...args) => { reads++; return originalOpen(...args); });
  for (const extension of ['txt', 'pem', 'json']) {
    const file = `private.${extension}`;
    await fs.writeFile(path.join(dir, file), 'private content');
    await assert.rejects(M.source(dir, file, {}, { transport: async () => { calls++; return { ok: true, measurement: {} }; } }));
  }
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});

test('measurement errors preserve typed reason and retryability', async (t) => {
  const dir = await fixture(t), response = { ok: false, reason: 'capacity', retryable: true };
  await assert.rejects(M.source(dir, '.ref/one.png', {}, { transport: async () => response }), (error) => {
    assert.deepEqual(error.result, response);
    assert.equal(error.reason, 'capacity');
    assert.equal(error.retryable, true);
    return true;
  });
});

test('the 5 MiB and 24-frame boundaries are inclusive', async (t) => {
  const dir = await fixture(t);
  const bytes = Buffer.alloc(5 * 1024 * 1024, 37);
  await fs.writeFile(path.join(dir, '.ref/large.png'), bytes);
  let calls = 0;
  await M.source(dir, '.ref/large.png', {}, { transport: async (_name, payload) => {
    calls++;
    assert.deepEqual(Buffer.from(payload.evidence[0].data_base64, 'base64'), bytes);
    return { ok: true, measurement: {} };
  } });
  await M.track(dir, Array(24).fill('.ref/one.png'), {}, { transport: async (_name, payload) => {
    calls++;
    assert.equal(payload.evidence.length, 24);
    return { ok: true, measurement: {} };
  } });
  assert.equal(calls, 2);
});

test('gated and malformed responses fail closed', async (t) => {
  const dir = await fixture(t);
  for (const response of [{ ok: false, gated: true, message: 'secret' }, { ok: true }]) {
    await assert.rejects(M.source(dir, '.ref/one.png', {}, { transport: async () => response }),
      (error) => !/secret/.test(error.message));
  }
});

test('symlinks, outside paths and private environment paths are refused before transport', async (t) => {
  const dir = await fixture(t);
  await fs.symlink(path.join(dir, '.ref/one.png'), path.join(dir, '.ref/linked.png'));
  await fs.symlink(path.join(dir, '.ref'), path.join(dir, 'linked-dir'));
  await fs.writeFile(path.join(dir, '.env'), 'secret');
  for (const file of ['.ref/linked.png', 'linked-dir/one.png', '../outside.png', '/tmp/outside.png', '.env', '.git/a.png', 'node_modules/a.png']) {
    let calls = 0;
    await assert.rejects(M.source(dir, file, {}, { transport: async () => { calls++; return { ok: true }; } }));
    assert.equal(calls, 0, file);
  }
});

test('frame count, byte total and IDs are bounded before transport', async (t) => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, '.ref/large.png'), Buffer.alloc(5 * 1024 * 1024));
  const frames = [Array(25).fill('.ref/one.png'), ['.ref/large.png', '.ref/one.png'],
    [{ id: 'duplicate', path: '.ref/one.png' }, { id: 'duplicate', path: '.ref/two.jpg' }],
    [{ id: '../outside', path: '.ref/one.png' }]];
  for (const input of frames) {
    let calls = 0;
    await assert.rejects(M.track(dir, input, {}, { transport: async () => { calls++; return { ok: true }; } }));
    assert.equal(calls, 0);
  }
});

test('a relative gameDir cannot depend on the current working directory', async () => {
  let calls = 0;
  await assert.rejects(M.source('.', '.ref/one.png', {}, { transport: async () => { calls++; return { ok: true }; } }), /absolute/);
  assert.equal(calls, 0);
});
