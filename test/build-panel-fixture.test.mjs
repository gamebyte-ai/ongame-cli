// mods/build-panel/dev/ongame-fixture.mjs stands in for ongame's MCP server when the build panel is tried in a real
// Claude Code session. It must answer with the CLI's answer shapes and survive what a client may send: a line that is
// not JSON, a notification, an unknown tool. This runs it as a child process and talks JSON-RPC over its stdin.
//
// Run: node --test test/build-panel-fixture.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../mods/build-panel/dev/ongame-fixture.mjs', import.meta.url));
const DEADLINE_MS = 10_000;

/** Sends `lines` to a fresh fixture and resolves with its answers by id, once every id in `expectIds` answered. */
function talk(lines, expectIds) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [FIXTURE], { stdio: ['pipe', 'pipe', 'pipe'] });
    const answers = new Map();
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no answer for ${expectIds.filter((id) => !answers.has(id))} within ${DEADLINE_MS} ms; stderr: ${stderr}`));
    }, DEADLINE_MS);
    child.stderr.on('data', (d) => (stderr += d));
    child.on('exit', (code) => {
      if (expectIds.every((id) => answers.has(id))) return;
      clearTimeout(timer);
      reject(new Error(`fixture exited with ${code} before answering; stderr: ${stderr}`));
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      const msg = JSON.parse(line);
      answers.set(msg.id, msg);
      if (expectIds.every((id) => answers.has(id))) {
        clearTimeout(timer);
        child.kill();
        resolve(answers);
      }
    });
    for (const line of lines) child.stdin.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
  });
}

/** A fixture kept open, for a talk whose next request needs the last answer. `ask` resolves with the answer to one
 *  request, or rejects at the deadline; `close` stops the fixture. */
function open() {
  const child = spawn(process.execPath, [FIXTURE], { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  });
  return {
    ask(request) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no answer for ${request.id} within ${DEADLINE_MS} ms; stderr: ${stderr}`)), DEADLINE_MS);
        waiting.set(request.id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        child.stdin.write(`${JSON.stringify(request)}\n`);
      });
    },
    close: () => child.kill(),
  };
}

const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const callTool = (id, name, args) => rpc(id, 'tools/call', { name, arguments: args });
const answerOf = (msg) => JSON.parse(msg.result.content[0].text);

test('the fixture lists the five ongame tools the panel reads', async () => {
  const a = await talk([rpc(1, 'initialize', { protocolVersion: '2025-06-18' }), rpc(2, 'tools/list')], [1, 2]);
  assert.equal(a.get(1).result.serverInfo.name, 'ongame-fixture');
  assert.equal(a.get(1).result.protocolVersion, '2025-06-18');
  assert.deepEqual(a.get(2).result.tools.map((t) => t.name), ['state_init', 'state_advance', 'play_gate', 'play_review', 'preview_start']);
});

test('the fixture answers with the CLI answer shapes and walks the plan', async () => {
  const plan = { phases: ['concept', 'code'] };
  const a = await talk([
    callTool(1, 'state_init', { gameId: 'fizzlab', plan }),
    callTool(2, 'state_advance', { buildId: 'b_0123456789abcdef' }),
    callTool(3, 'state_advance', { buildId: 'b_0123456789abcdef' }),
    callTool(4, 'state_advance', { buildId: 'b_0123456789abcdef' }),
    callTool(5, 'play_gate', { gameDir: '.', buildId: 'b_0123456789abcdef' }),
    callTool(7, 'preview_start', { gameDir: '.' }),
  ], [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(answerOf(a.get(1)), { buildId: 'b_0123456789abcdef', state: { currentPhase: null, completed: [], done: false, plan } });
  assert.equal(answerOf(a.get(2)).state.currentPhase, 'concept');
  assert.deepEqual(answerOf(a.get(3)).state.completed, ['concept']);
  assert.equal(answerOf(a.get(4)).state.done, true);
  assert.equal(answerOf(a.get(5)).status, 'ok');
  assert.equal(answerOf(a.get(5)).state, 'awaiting_review');
  assert.match(answerOf(a.get(5)).runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'a run id of its own, as the CLI mints one');
  assert.equal(answerOf(a.get(7)).url, 'http://localhost:5173/');
});

test('play_review takes a folder and a run, and passes only the latest run in its folder', async () => {
  // The real tool has no buildId (ongame cli/src/local-registry.ts). The run id is only known once play_gate
  // answered, so this talks to one fixture step by step.
  const moments = [{ run: 'desktop', frame: 1, saw: 'the start screen' }, { run: 'phone', frame: 1, saw: 'the start screen' }];
  const reviewOf = (gameDir, runId) => ({ gameDir, runId, review: 'The player reaches the goal on both sizes.', moments });
  const fixture = open();
  try {
    const tools = (await fixture.ask(rpc(1, 'tools/list'))).result.tools;
    const schema = tools.find((t) => t.name === 'play_review').inputSchema;
    assert.deepEqual(schema.required, ['gameDir', 'runId', 'review', 'moments']);
    assert.equal('buildId' in schema.properties, false);

    assert.deepEqual(answerOf(await fixture.ask(callTool(2, 'play_review', reviewOf('game', 'x')))), { status: 'refused', reason: 'no_run', next: 'Call play_gate first.' });
    const first = answerOf(await fixture.ask(callTool(3, 'play_gate', { gameDir: 'game', buildId: 'b_0123456789abcdef' })));
    const second = answerOf(await fixture.ask(callTool(4, 'play_gate', { gameDir: 'game', buildId: 'b_0123456789abcdef' })));
    assert.notEqual(first.runId, second.runId);
    assert.equal(answerOf(await fixture.ask(callTool(5, 'play_review', reviewOf('game', first.runId)))).reason, 'stale_run', 'an earlier run');
    assert.equal(answerOf(await fixture.ask(callTool(6, 'play_review', reviewOf('other-game', second.runId)))).reason, 'no_run', 'another folder');
    assert.deepEqual(answerOf(await fixture.ask(callTool(7, 'play_review', reviewOf('game', second.runId)))), { status: 'passed' });
  } finally {
    fixture.close();
  }
});

test('a broken line, a notification and an unknown tool leave the fixture answering', async () => {
  const a = await talk([
    'this is not json',
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    callTool(1, 'no_such_tool', {}),
    rpc(2, 'no/such/method'),
    rpc(3, 'tools/list'),
  ], [1, 2, 3]);
  assert.equal(a.get(1).error.code, -32602);
  assert.equal(a.get(2).error.code, -32601);
  assert.equal(a.get(3).result.tools.length, 5);
  assert.equal(a.size, 3, 'nothing answers the notification or the broken line');
});
