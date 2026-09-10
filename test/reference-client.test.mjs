import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { callReferenceTool, logicalPath, referenceCliPath } from '../tools/reference-client.mjs';

test('the binary path follows the install root on POSIX and Windows', () => {
  assert.equal(referenceCliPath({ home: '/home/user', platform: 'linux', env: {} }), '/home/user/.ongame/bin/ongame-cli');
  assert.equal(referenceCliPath({ home: '/home/user', platform: 'darwin', env: { ONGAME_INSTALL_DIR: '/custom install' } }), '/custom install/bin/ongame-cli');
  assert.equal(referenceCliPath({ home: 'C:\\Users\\User', platform: 'win32', env: {} }), 'C:\\Users\\User\\.ongame\\bin\\ongame-cli.exe');
  assert.equal(referenceCliPath({ home: 'C:\\Users\\User', platform: 'win32', env: { ONGAME_INSTALL_DIR: 'D:\\Custom Install' } }), 'D:\\Custom Install\\bin\\ongame-cli.exe');
});

test('Windows logical paths normalize native separators for project files and UNC roots', () => {
  const root = { directory: 'C:\\Games\\sample', requestedDirectory: 'C:\\Games\\sample' };
  assert.equal(logicalPath(root, 'C:\\Games\\sample\\.ref\\frame.png', 'win32'), '.ref/frame.png');
  assert.equal(logicalPath(root, '.ref\\frame.png', 'win32'), '.ref/frame.png');
  assert.equal(logicalPath(root, 'c:/games/sample/.ref/frame.png', 'win32'), '.ref/frame.png');
  const unc = { directory: '\\\\server\\share\\game', requestedDirectory: '\\\\server\\share\\game' };
  assert.equal(logicalPath(unc, '\\\\server\\share\\game\\.ref\\frame.png', 'win32'), '.ref/frame.png');
});

test('Windows logical paths reject parent, drive, UNC and private-file escapes', () => {
  const root = { directory: 'C:\\Games\\sample', requestedDirectory: 'C:\\Games\\sample' };
  for (const file of ['..\\outside.png', 'C:\\Games\\sample-other\\frame.png', 'C:\\Games\\outside.png',
    'D:\\Games\\sample\\frame.png', '\\\\other\\share\\frame.png', '\\outside.png', 'C:frame.png',
    '.ref\\..\\outside.png', 'node_modules\\frame.png', '.git\\frame.png', '.env.local']) {
    assert.throws(() => logicalPath(root, file, 'win32'), /inside gameDir/, file);
  }
  const unc = { directory: '\\\\server\\share\\game', requestedDirectory: '\\\\server\\share\\game' };
  for (const file of ['\\\\server\\other\\game\\frame.png', '\\\\other\\share\\game\\frame.png',
    '\\\\server\\share\\game-other\\frame.png']) {
    assert.throws(() => logicalPath(unc, file, 'win32'), /inside gameDir/, file);
  }
});

test('POSIX logical paths retain backslash refusal and canonical root aliases', () => {
  const root = { directory: '/private/tmp/game', requestedDirectory: '/tmp/game' };
  assert.equal(logicalPath(root, '/tmp/game/.ref/frame.png', 'darwin'), '.ref/frame.png');
  assert.equal(logicalPath(root, '/private/tmp/game/.ref/frame.png', 'darwin'), '.ref/frame.png');
  for (const file of ['.ref\\frame.png', '/tmp/game/.ref\\frame.png', '../outside.png', '/tmp/game-other/frame.png']) {
    assert.throws(() => logicalPath(root, file, 'darwin'), /inside gameDir/, file);
  }
});

test('the installed authenticated command receives JSON only through stdin', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-client-'));
  await fs.mkdir(path.join(dir, 'bin'));
  const capture = path.join(dir, 'captured.json');
  const script = `#!${process.execPath}\nimport fs from 'node:fs';
let input = ''; for await (const chunk of process.stdin) input += chunk;
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args: process.argv.slice(2), input: JSON.parse(input)}));
process.stdout.write(JSON.stringify({ok: true, measurement: {id: 'fixture'}}));\n`;
  await fs.writeFile(path.join(dir, 'bin/ongame-cli'), script, { mode: 0o700 });
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  const previous = process.env.ONGAME_INSTALL_DIR, previousPath = process.env.PATH;
  process.env.ONGAME_INSTALL_DIR = dir;
  process.env.PATH = '';
  t.after(async () => {
    if (previous === undefined) delete process.env.ONGAME_INSTALL_DIR; else process.env.ONGAME_INSTALL_DIR = previous;
    process.env.PATH = previousPath;
    await fs.rm(dir, { recursive: true, force: true });
  });
  const payload = { operation: 'source', evidence: [{ id: 'frame-1', data_base64: 'AP+A' }], options: {} };
  assert.deepEqual(await callReferenceTool('reference_measure', payload), { ok: true, measurement: { id: 'fixture' } });
  assert.deepEqual(JSON.parse(await fs.readFile(capture, 'utf8')), {
    args: ['tool-call', 'reference_measure', '-'], input: payload,
  });
});

test('typed denials and malformed results fail closed without exposing returned text', async () => {
  for (const response of [
    { ok: false, reason: 'invalid_input', message: 'secret-input' },
    { ok: true, gated: true, message: 'secret-token' },
    { ok: true, rateLimited: true },
    { ok: true, isError: true },
    { error: { code: -32001, message: 'secret-token' } },
    { measurement: {} }, null, [],
  ]) {
    await assert.rejects(callReferenceTool('reference_measure', {}, { transport: async () => response }),
      (error) => !/secret/.test(error.message) && /Reference request/.test(error.message));
  }
});

test('transport failures cannot echo credentials or source contents', async () => {
  await assert.rejects(callReferenceTool('reference_evaluate', {}, {
    transport: async () => { throw new Error('Bearer secret-token and source secret-input'); },
  }), (error) => !/secret|Bearer/.test(error.message));
});

test('tool names and request bytes are bounded before transport', async () => {
  let calls = 0;
  const client = { transport: async () => { calls++; return { ok: true }; } };
  await assert.rejects(callReferenceTool('reference_measure;other', {}, client));
  await assert.rejects(callReferenceTool('reference_evaluate', { text: 'x'.repeat(8 * 1024 * 1024) }, client));
  assert.equal(calls, 0);
});

test('a domain rejection is returned unchanged for its caller to handle', async () => {
  const response = { ok: true, decision: 'REJECT', blocked: [], results: [] };
  assert.deepEqual(await callReferenceTool('reference_evaluate', {}, {
    transport: async () => response,
  }), response);
});

test('typed CLI failures survive a nonzero exit without printing remote diagnostics', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-client-failure-'));
  await fs.mkdir(path.join(dir, 'bin'));
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  const previous = process.env.ONGAME_INSTALL_DIR;
  process.env.ONGAME_INSTALL_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.ONGAME_INSTALL_DIR; else process.env.ONGAME_INSTALL_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (const response of [
    { ok: false, reason: 'gated', gated: true, retryable: false, message: 'secret-input' },
    { ok: false, reason: 'rate_limited', rateLimited: true, retryable: true },
    { ok: false, reason: 'capacity', retryable: true },
  ]) {
    await fs.writeFile(path.join(dir, 'bin/ongame-cli'), `#!${process.execPath}\nfor await (const chunk of process.stdin) {}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\nprocess.stderr.write('Bearer secret-token');\nprocess.exitCode = 1;\n`, { mode: 0o700 });
    await assert.rejects(callReferenceTool('reference_measure', {}), (error) => {
      assert.deepEqual(error.result, response);
      assert.equal(error.reason, response.reason);
      assert.equal(error.retryable, response.retryable);
      assert.equal(error.gated, response.gated);
      assert.equal(error.rateLimited, response.rateLimited);
      assert.doesNotMatch(error.message, /secret|Bearer|login/);
      return true;
    });
  }
});

test('nonzero CLI exits and malformed stdout cannot be mistaken for success', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-client-exit-'));
  await fs.mkdir(path.join(dir, 'bin'));
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  const previous = process.env.ONGAME_INSTALL_DIR;
  process.env.ONGAME_INSTALL_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.ONGAME_INSTALL_DIR; else process.env.ONGAME_INSTALL_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (const [stdout, code] of [['{"ok":true}', 1], ['secret-invalid-json', 0]]) {
    await fs.writeFile(path.join(dir, 'bin/ongame-cli'), `#!${process.execPath}\nfor await (const chunk of process.stdin) {}\nprocess.stdout.write(${JSON.stringify(stdout)}); process.exitCode = ${code};\n`, { mode: 0o700 });
    await assert.rejects(callReferenceTool('reference_evaluate', {}), (error) => !/secret/.test(error.message));
  }
});
