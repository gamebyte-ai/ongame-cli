// The build panel's state adapter (mods/build-panel/hooks/state.ts) turns ongame's own tool answers and its build
// marker into what the panel shows. It must never show a state or a link no ongame tool reported. These tests feed
// it the answer shapes ongame returns and check what the panel would draw. The shapes are read from gamebyte-ai/ongame:
// the marker from cli/src/hooks/build-marker-write.ts, the state tools from core/src/registry.ts, trace_emit from
// core/src/trace.ts (traceEmit), play_gate and play_review from cli/src/local-registry.ts and cli/src/play-gate.ts,
// preview_start from cli/src/preview.ts, publish_game from cli/src/publish-session.ts, and the `call_pending` answer of
// a call slower than 45 s from cli/src/call-jobs.ts.
//
// Run: node --test test/build-panel-state.test.mjs   (Node strips the TypeScript types itself.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKER_TTL_MS,
  MAX_WAITING,
  emptyState,
  fromMarker,
  observe,
  ongameTool,
  publishedRecord,
  readOutput,
  view,
  withPublished,
} from '../mods/build-panel/hooks/state.ts';

const T0 = Date.parse('2026-11-24T09:00:00Z');
const MIN = 60_000;
const BUILD = 'b_0123456789abcdef';
const OTHER = 'b_fedcba9876543210';
const tool = (name) => `mcp__plugin_ongame_ongame__${name}`;
const call = (name, input, output, isError = false) => ({ tool: tool(name), input, output, isError });

const PLAN = { phases: ['concept', 'assets', 'code', 'levels', 'polish'] };
/** The build document core keeps (core/src/state-store.ts BuildState), as far as the panel reads it. */
const doc = (buildId, gameId, currentPhase, completed, done = false) =>
  ({ buildId, tenantId: 't_1', gameId, plan: PLAN, currentPhase, completed, done, iterations: {}, approved: [], phaseSpans: {} });
/** state_init answers `{ buildId, state, lessons, lessonsStatus, jury }`. */
const init = (gameId = 'fizzlab', buildId = BUILD) =>
  call('state_init', { gameId, plan: PLAN }, { buildId, state: doc(buildId, gameId, null, []), lessons: [], lessonsStatus: 'none', jury: { provisioned: false, reason: 'free' } });
/** state_advance, state_get, approve_phase and record_iteration answer the build document itself. */
const advance = (currentPhase, completed, buildId = BUILD, done = false) =>
  call('state_advance', { buildId }, doc(buildId, 'fizzlab', currentPhase, completed, done));

function fold(calls, start = emptyState(), now = T0) {
  return calls.reduce((s, c, i) => observe(s, c, now + i * MIN), start);
}

const GAME_DIR = '/games/fizzlab';
const RUN = '3f6c1a52-9d0e-4b7a-8c11-5e2f0a9d7b31'; // play_gate mints one UUID per run
const OTHER_RUN = '8b1d4e7f-2a35-4c69-9f02-6d7e1c3a5b48';
const FAILS = [{ id: 'input_touch', status: 'fail', detail: 'x' }, { id: 'layout_fits', status: 'fail', detail: 'x' }, { id: 'reaches_goal', status: 'pass', detail: 'x' }];

/** A play_gate run as runPlayGate answers it: `blocked` or `awaiting_review`, with the run's id. */
const gate = (state, { buildId = BUILD, gameDir = GAME_DIR, runId = RUN, checks = [] } = {}) =>
  call('play_gate', { gameDir, ...(buildId === null ? {} : { buildId }), desktop: [{ key: 'ArrowRight' }], phone: [{ tap: 'play' }] }, {
    status: 'ok', state, runId, checks, footage: { desktop: { path: '.ongame/play-gate/desktop.jpg', frames: ['#1 start'] }, phone: { path: '.ongame/play-gate/phone.jpg', frames: ['#1 start'] } },
    consoleErrors: [], next: 'x',
  });
/** A play_gate call that ran nothing: skipped, unverified or refused. */
const gateAnswer = (output, input = {}) => call('play_gate', { gameDir: GAME_DIR, buildId: BUILD, ...input }, output);
/** play_review as the CLI takes it: a folder and a run, never a build. */
const review = ({ gameDir = GAME_DIR, runId = RUN } = {}, output = { status: 'passed' }) =>
  call('play_review', {
    gameDir, runId, review: 'The player reaches the goal on both sizes and nothing is cut off.',
    moments: [{ run: 'desktop', frame: 1, saw: 'the start screen' }, { run: 'phone', frame: 1, saw: 'the start screen' }],
  }, output);

/** trace_emit, whose answer is `{ ok }` plus the event's own fields. */
const trace = (name, payload, output, buildId = BUILD) => call('trace_emit', { buildId, name, payload }, output);
const buildDone = (payload = { path: 'production' }, output = { ok: true }, buildId = BUILD) => trace('build.done', payload, output, buildId);
const PUBLISHED = { ok: true, source: 'not_given', repo: 'recorded' };
const publishDone = (gameId = 'fizzlab', output = PUBLISHED, buildId = BUILD) => trace('publish.done', { gameId, repo: 'none' }, output, buildId);
const publish = (gameId = 'fizzlab', url = `https://play.ongame.test/${gameId}/`) =>
  call('publish_game', { gameId, files: [{ path: 'index.html', size: 512 }] }, { publishId: 'f0a1b2c3-0000-4000-8000-000000000001', publicUrl: url, signing: 'v4', fileCount: 1, source: { status: 'ready', key: 'k' } });

/** What any call slower than 45 s answers first; its own answer then comes through call_wait. */
const CALL = '5d2c9c1e-7a44-4e0b-b6a3-0c1d2e3f4a5b';
const pending = (tool, callId = CALL) => ({ ok: false, reason: 'call_pending', retryable: true, callId, tool, fix: 'x' });
/** call_wait: the waited call's own answer, `call_pending` again, or `call_not_found`. */
const wait = (output, callId = CALL) => call('call_wait', { callId }, output);
const previewFail = (code) => call('preview_start', { gameDir: GAME_DIR }, { ok: false, code, reason: 'x', fix: 'x' });
const previewOk = (url = 'http://localhost:5173/') => call('preview_start', { gameDir: GAME_DIR }, { ok: true, url, pid: 42 });

test('only ongame server tools are read', () => {
  assert.equal(ongameTool('mcp__plugin_ongame_ongame__state_init'), 'state_init');
  assert.equal(ongameTool('mcp__plugin_ongame-cli_ongame-local__preview_start'), 'preview_start');
  assert.equal(ongameTool('mcp__other__state_init'), null, 'another server with the same tool name');
  assert.equal(ongameTool('Bash'), null);
  assert.equal(ongameTool('mcp__ongame'), null);
});

test('no game means no panel content', () => {
  assert.equal(view(emptyState(), T0), null);
});

test('state_init names the game and the build', () => {
  const v = view(fold([init()]), T0 + MIN);
  assert.equal(v.game, 'fizzlab');
  assert.equal(v.state.label, 'Building');
  assert.equal(v.state.tone, 'active');
  assert.equal(v.phase, null, 'no phase is current until state_advance opens one');
  assert.deepEqual(v.steps.map((s) => s.status), ['pending', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(v.updated, 'Started 1 min ago');
});

test('state_advance moves the phase and the steps', () => {
  const v = view(fold([init(), advance('concept', []), advance('assets', ['concept']), advance('code', ['concept', 'assets'])]), T0 + 3 * MIN);
  assert.deepEqual(v.phase, { name: 'code', index: 3, total: 5 });
  assert.deepEqual(v.steps.map((s) => `${s.name}:${s.status}`), [
    'concept:done', 'assets:done', 'code:current', 'levels:pending', 'polish:pending',
  ]);
  assert.equal(v.updated, 'Updated just now');
});

test('an answer for another build does not move this one', () => {
  const s = fold([init(), advance('code', ['concept', 'assets']), advance('polish', ['x'], OTHER)]);
  assert.equal(s.currentPhase, 'code');
  assert.equal(s.buildId, BUILD);
});

test('a failed call changes nothing', () => {
  const s = fold([init(), call('state_advance', { buildId: BUILD }, doc(BUILD, 'fizzlab', 'code', []), true)]);
  assert.equal(s.currentPhase, null);
});

test('build.done finishes the build; done:true from state_advance does too', () => {
  const traced = view(fold([init(), advance('code', ['concept']), buildDone()]), T0 + 9 * MIN);
  assert.equal(traced.state.label, 'Build finished');
  assert.equal(traced.state.tone, 'done');
  assert.equal(traced.phase, null);

  const advanced = view(fold([init(), advance(null, PLAN.phases, BUILD, true)]), T0 + 2 * MIN);
  assert.equal(advanced.state.label, 'Build finished');
  assert.ok(advanced.steps.every((s) => s.status === 'done'));
});

test('build.done of another build, and other trace events, change nothing', () => {
  const s = fold([init(), buildDone({}, { ok: true }, OTHER), trace('phase.code.done', {}, { ok: true, phaseSpanId: 'span:code:1:ab12cd34' })]);
  assert.equal(s.isDone, false);
});

test('a build.done that ongame did not accept does not finish the build', () => {
  // { ok: false }: ongame knows no such build (core/src/trace.ts). The build is not finished on its record.
  for (const output of [{ ok: false }, pending('trace_emit'), {}]) {
    const v = view(fold([init(), advance('code', ['concept']), buildDone({}, output)]), T0 + 3 * MIN);
    assert.equal(v.state.label, 'Building', JSON.stringify(output));
    assert.deepEqual(v.phase, { name: 'code', index: 3, total: 5 });
  }
  const noBuildNamed = call('trace_emit', { name: 'build.done', payload: {} }, { ok: true });
  assert.equal(fold([init(), noBuildNamed]).isDone, false, 'a real build.done names its build');
});

test('a build that ended failed or abandoned says so, and gets no success marks', () => {
  const walked = [init(), advance('concept', []), advance('assets', ['concept']), advance('code', ['concept', 'assets'])];

  const failed = view(fold([...walked, buildDone({ outcome: 'failed' })]), T0 + 9 * MIN);
  assert.deepEqual(failed.state, { label: 'Build failed', tone: 'failed' });
  assert.equal(failed.phase, null);
  assert.deepEqual(failed.steps.map((s) => `${s.name}:${s.status}`), [
    'concept:done', 'assets:done', 'code:pending', 'levels:pending', 'polish:pending',
  ], 'only the steps ongame reported complete are done');

  const abandoned = view(fold([...walked, buildDone({ outcome: 'abandoned' })]), T0 + 9 * MIN);
  assert.deepEqual(abandoned.state, { label: 'Build abandoned', tone: 'muted' });
  assert.ok(abandoned.steps.some((s) => s.status !== 'done'));

  // The outcomes that are a success, and an outcome ongame does not know, read as finished.
  for (const outcome of ['completed', 'published', 'whatever', 7, undefined]) {
    const v = view(fold([...walked, buildDone({ outcome })]), T0 + 9 * MIN);
    assert.deepEqual(v.state, { label: 'Build finished', tone: 'done' }, `outcome ${outcome}`);
  }
});

test('a failed build that is worked on again, or finished again, drops the old outcome', () => {
  const failed = fold([init(), advance('code', ['concept']), buildDone({ outcome: 'failed' })]);
  assert.equal(failed.outcome, 'failed');

  // record_iteration re-opens a phase: the build runs again.
  const reopened = observe(failed, call('record_iteration', { buildId: BUILD, phase: 'code' }, { buildId: BUILD, currentPhase: 'code', completed: ['concept'], done: false, plan: PLAN }), T0 + 5 * MIN);
  assert.equal(reopened.outcome, null);
  assert.equal(view(reopened, T0 + 5 * MIN).state.label, 'Building');

  const finished = observe(failed, buildDone(), T0 + 6 * MIN);
  assert.equal(view(finished, T0 + 6 * MIN).state.label, 'Build finished');

  // A state answer that still says done keeps what build.done said.
  const stillDone = observe(failed, call('state_get', { buildId: BUILD }, { buildId: BUILD, currentPhase: null, completed: ['concept', 'code'], done: true, plan: PLAN }), T0 + 7 * MIN);
  assert.equal(view(stillDone, T0 + 7 * MIN).state.label, 'Build failed');

  assert.equal(fold([init(), buildDone({ outcome: 'failed' }), init('fizzlab', OTHER)]).outcome, null, 'a new build starts clean');
});

test('the play check shows the real result, failures counted', () => {
  let v = view(fold([init(), gate('blocked', { checks: FAILS })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Play check failed: 2 checks', tone: 'failed' });

  v = view(fold([init(), gate('blocked', { checks: FAILS }), gate('awaiting_review', { runId: OTHER_RUN })]), T0 + 3 * MIN);
  assert.deepEqual(v.check, { label: 'Play check waiting for review', tone: 'active' });

  v = view(fold([init(), gate('awaiting_review'), review()]), T0 + 3 * MIN);
  assert.deepEqual(v.check, { label: 'Play check passed', tone: 'done' });

  v = view(fold([init(), gateAnswer({ status: 'unverified', reason: 'browser_unavailable', next: 'x' })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Play check could not run', tone: 'muted' });

  v = view(fold([init(), gateAnswer({ status: 'ok', state: 'skipped', runId: RUN, next: 'x' }, { skip: { reason: 'a Unity game with no WebGL build here' } })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Not played on record', tone: 'muted' });

  const refused = fold([init(), gate('blocked', { checks: FAILS }), gateAnswer({ status: 'refused', reason: 'bad_waiver', next: 'x' })]);
  assert.equal(refused.check.result, 'blocked', 'a refused call is not a new result');

  // A check that could not run replaces an earlier pass: the latest answer for this build is what shows.
  const noBrowser = gateAnswer({ status: 'unverified', reason: 'browser_unavailable', next: 'x' });
  assert.equal(fold([init(), gate('awaiting_review'), review(), noBrowser]).check.result, 'unverified');

  assert.equal(view(fold([init()]), T0).check, null, 'no play check yet: no line');
});

test('a review counts only for the run this build\'s play check came from', () => {
  // The reviewer's case: this build is blocked, another game is played and reviewed in its own folder.
  const mine = gate('blocked', { checks: FAILS });
  const theirs = gate('awaiting_review', { buildId: OTHER, gameDir: '/games/another', runId: OTHER_RUN });
  const theirReview = review({ gameDir: '/games/another', runId: OTHER_RUN });
  const s = fold([init(), mine, theirs, theirReview]);
  assert.equal(s.check.result, 'blocked', 'another game\'s review is not this build\'s pass');
  assert.equal(s.check.failed, 2);
  assert.deepEqual(view(s, T0 + 4 * MIN).check, { label: 'Play check failed: 2 checks', tone: 'failed' });

  const waiting = fold([init(), gate('awaiting_review')]);
  assert.equal(observe(waiting, review({ runId: OTHER_RUN }), T0).check.result, 'awaiting_review', 'a review of another run');
  assert.equal(observe(waiting, review({ gameDir: '/games/copy' }), T0).check.result, 'awaiting_review', 'the same run id in another folder');
  assert.equal(observe(waiting, review({}, { status: 'refused', reason: 'review_too_short', next: 'x' }), T0).check.result, 'awaiting_review', 'a refused review');
  assert.equal(observe(waiting, call('play_review', { buildId: BUILD }, { status: 'passed' }), T0).check.result, 'awaiting_review', 'a review that names no run');
  assert.equal(observe(waiting, review(), T0).check.result, 'passed', 'the review of this run');

  // With no play check of this build on the panel, a review has nothing to pass.
  assert.equal(fold([init(), review()]).check, null);
  // A check that recorded no run cannot be reviewed.
  const unverified = fold([init(), gateAnswer({ status: 'unverified', reason: 'no_dist', next: 'x' })]);
  assert.equal(observe(unverified, review(), T0).check.result, 'unverified');
});

test('only a play_gate that names this build is this build\'s check', () => {
  // ongame counts a run for a build only when the run names it (cli/src/play-gate.ts playGateStatus).
  assert.equal(fold([init(), gate('blocked', { buildId: OTHER, checks: FAILS })]).check, null, 'a run of another build');
  assert.equal(fold([init(), gate('awaiting_review', { buildId: null })]).check, null, 'a run that names no build');
  assert.equal(fold([gate('awaiting_review')]).check, null, 'no build on the panel');
  const s = fold([init(), gate('blocked', { checks: FAILS }), gate('awaiting_review', { buildId: OTHER, runId: OTHER_RUN })]);
  assert.equal(s.check.result, 'blocked', 'this build\'s result stays');
  assert.equal(fold([init(), gate('awaiting_review')]).check.result, 'awaiting_review');
});

test('a play_gate still running after 45 s leaves no earlier result on the panel', () => {
  // The CLI deletes the last report when a run starts (runPlayGate), so the earlier result no longer stands, and the
  // new one is not known until call_wait brings it.
  const s = fold([init(), gate('blocked', { checks: FAILS }), gateAnswer(pending('play_gate'))]);
  assert.equal(s.check, null);
  assert.equal(observe(s, review(), T0).check, null, 'a review cannot pass a run the panel has not seen');
  // A slow run of another build says nothing about this one.
  const other = fold([init(), gate('blocked', { checks: FAILS }), gateAnswer(pending('play_gate'), { buildId: OTHER })]);
  assert.equal(other.check.result, 'blocked');
});

test('the answer of a slow call arrives through call_wait and counts as that call\'s answer', () => {
  // play_gate plays the game in a browser, so it is the call most likely to pass 45 s. Its run id is what the
  // review is matched on, and it is only in the answer call_wait brings.
  const slow = [init(), gateAnswer(pending('play_gate'))];
  const answer = gate('awaiting_review').output;
  let s = fold([...slow, wait(pending('play_gate'))]);
  assert.equal(s.check, null, 'still running');
  s = fold([...slow, wait(pending('play_gate')), wait(answer)]);
  assert.equal(s.check.result, 'awaiting_review');
  assert.equal(s.check.runId, RUN);
  assert.equal(s.check.gameDir, GAME_DIR, 'the folder of the call that was waited on');
  assert.deepEqual(s.waiting, {}, 'a delivered answer is not waited on again');
  assert.equal(observe(s, review(), T0).check.result, 'passed');

  // The same for every watched tool: a build that registers slowly, a slow preview, a slow publish.done.
  s = fold([call('state_init', { gameId: 'fizzlab', plan: PLAN }, pending('state_init')), wait(init().output)]);
  assert.equal(s.buildId, BUILD);
  assert.equal(view(s, T0 + MIN).game, 'fizzlab');
  s = fold([init(), call('preview_start', { gameDir: GAME_DIR }, pending('preview_start')), wait({ ok: true, url: 'http://localhost:5173/', pid: 42 })]);
  assert.equal(s.preview.url, 'http://localhost:5173/');
  s = fold([init(), publish(), publishDone('fizzlab', pending('trace_emit')), wait(PUBLISHED)]);
  assert.equal(s.published.url, 'https://play.ongame.test/fizzlab/');
  s = fold([init(), buildDone({ outcome: 'failed' }, pending('trace_emit')), wait({ ok: true })]);
  assert.equal(view(s, T0 + 2 * MIN).state.label, 'Build failed', 'the waited call keeps its own input');
});

test('call_wait changes nothing unless it answers a call the panel waits on', () => {
  const slow = fold([init(), gateAnswer(pending('play_gate'))]);
  const answer = gate('awaiting_review').output;
  assert.deepEqual(observe(slow, wait(answer, 'another-call'), T0), slow, 'a call the panel does not know');
  assert.deepEqual(observe(slow, call('call_wait', {}, answer), T0), slow, 'no call id');
  assert.deepEqual(observe(slow, { ...wait(answer), isError: true }, T0), slow, 'a wait that failed');
  // The same id on another ongame server is another call.
  const elsewhere = { ...wait(answer), tool: 'mcp__plugin_ongame-cli_ongame-core__call_wait' };
  assert.deepEqual(observe(slow, elsewhere, T0), slow);
  // The CLI no longer holds the result: it is never known, and nothing is waited on.
  const lost = observe(slow, wait({ ok: false, reason: 'call_not_found', retryable: false, fix: 'x' }), T0);
  assert.equal(lost.check, null);
  assert.deepEqual(lost.waiting, {});
  // An answer for a call nobody waits on any more does nothing.
  assert.deepEqual(observe(lost, wait(answer), T0), lost);
  // A call that was not watched is never waited on.
  const unwatched = fold([init(), call('forge_request', { gameId: 'fizzlab' }, pending('forge_request'))]);
  assert.deepEqual(unwatched.waiting, {});
  // An id that names something every object has is not a call the panel waits on.
  for (const id of ['__proto__', 'constructor', 'toString']) {
    assert.deepEqual(observe(slow, wait(answer, id), T0), slow, id);
  }
  const odd = fold([init(), gateAnswer(pending('play_gate', '__proto__')), wait(answer, '__proto__')]);
  assert.equal(odd.check.result, 'awaiting_review', 'such an id still works as an id');
  assert.deepEqual(Object.keys(odd.waiting), []);
  // A slow state call is not an update: the panel's time stays.
  const before = fold([init(), advance('code', ['concept'])]);
  const waited = observe(before, call('state_get', { buildId: BUILD }, pending('state_get')), T0 + 9 * MIN);
  assert.equal(waited.updatedAt, before.updatedAt);
  assert.equal(waited.currentPhase, 'code');
});

test('a waited call keeps only the fields the panel reads, and only the newest calls', () => {
  const script = Array.from({ length: 200 }, () => ({ key: 'ArrowRight' }));
  const s = fold([init(), call('play_gate', { gameDir: GAME_DIR, buildId: BUILD, desktop: script, phone: script }, pending('play_gate'))]);
  assert.deepEqual(s.waiting, { [CALL]: { tool: tool('play_gate'), input: { gameDir: GAME_DIR, buildId: BUILD } } });
  const files = Array.from({ length: 500 }, (_, i) => ({ path: `assets/${i}.png`, size: 1 }));
  const p = fold([init(), call('publish_game', { gameId: 'fizzlab', files }, pending('publish_game'))]);
  assert.deepEqual(p.waiting[CALL].input, { gameId: 'fizzlab' });
  const t = fold([init(), trace('publish.done', { gameId: 'fizzlab', source: 'k', repo: 'none' }, pending('trace_emit'))]);
  assert.deepEqual(t.waiting[CALL].input, { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab' } });

  const many = Array.from({ length: MAX_WAITING + 3 }, (_, i) => call('state_get', { buildId: BUILD }, pending('state_get', `call-${i}`)));
  const held = Object.keys(fold([init(), ...many]).waiting);
  assert.equal(held.length, MAX_WAITING);
  assert.equal(held[0], 'call-3', 'the oldest go first');
  // A new build does not forget the calls still running.
  assert.equal(Object.keys(fold([init(), gateAnswer(pending('play_gate')), init('fizzlab', OTHER)]).waiting).length, 1);
});

test('a publish of another game is not this game\'s link', () => {
  // ongame answers publish.done for the build's own game only, so `another` is published under its own build.
  const s = fold([init(), publish('another'), publishDone('another', PUBLISHED, OTHER)]);
  assert.equal(s.pendingPublish, null);
  assert.equal(s.published, null);
  assert.equal(publishedRecord(s), null, 'nothing is kept under fizzlab');

  // A publish that started before another game took over the panel is not promoted either.
  const switched = { ...fold([init(), publish()]), gameId: 'another' };
  assert.equal(observe(switched, publishDone(), T0).published, null);

  // This game's publish is held; a publish.done that verified another game does not promote it.
  const held = fold([init(), publish(), publishDone('another', PUBLISHED, OTHER)]);
  assert.equal(held.published, null);
  assert.equal(held.pendingPublish.url, 'https://play.ongame.test/fizzlab/');
});

test('a publish.done that ongame refused leaves the address unverified', () => {
  // The reviewer's case: publish.done with an empty payload answers { ok: false, reason: 'game_id_mismatch' }.
  const refusals = [
    trace('publish.done', {}, { ok: false, reason: 'game_id_mismatch' }),
    trace('publish.done', { gameId: 'fizlab' }, { ok: false, reason: 'game_id_mismatch' }),
    publishDone('fizzlab', { ok: false }), // ongame knows no such build
    publishDone('fizzlab', pending('trace_emit')),
    publishDone('fizzlab', {}),
  ];
  for (const refusal of refusals) {
    const s = fold([init(), publish(), refusal]);
    assert.equal(s.published, null, JSON.stringify(refusal.output));
    assert.equal(publishedRecord(s), null, 'nothing is kept for the next session');
    assert.deepEqual(view(s, T0 + 3 * MIN).links, []);
    assert.equal(s.pendingPublish.url, 'https://play.ongame.test/fizzlab/', 'the publish still waits for its check');
    // The same publish, once ongame records it, shows.
    assert.equal(observe(s, publishDone(), T0 + 3 * MIN).published.url, 'https://play.ongame.test/fizzlab/');
  }
  // An accepted publish.done always names the game ongame stamped. One that names none proves no game's link.
  const unnamed = fold([init(), publish(), trace('publish.done', {}, PUBLISHED)]);
  assert.equal(unnamed.published, null);
});

test('preview_start gives a local play link; a failed start or preview_stop takes it away', () => {
  let v = view(fold([init(), previewOk()]), T0 + 2 * MIN);
  assert.deepEqual(v.links, [{ kind: 'local', url: 'http://localhost:5173/', label: 'Play here', note: 'works while this session runs' }]);

  // These failures come after the CLI stopped the last preview server (cli/src/preview.ts), so its link is gone.
  for (const code of ['port_in_use', 'bind_timeout', 'exited_early', 'spawn_failed', 'process_error']) {
    v = view(fold([init(), previewOk(), previewFail(code)]), T0 + 3 * MIN);
    assert.deepEqual(v.links, [], code);
  }
  // So does a start still running after 45 s: the last server is stopped, the new address is not known.
  assert.deepEqual(view(fold([init(), previewOk(), call('preview_start', { gameDir: GAME_DIR }, pending('preview_start'))]), T0).links, []);
  // A failure with no code the panel knows is read the same way: no link it cannot stand behind.
  assert.equal(fold([init(), previewOk(), call('preview_start', { gameDir: GAME_DIR }, { ok: false, reason: 'x' })]).preview, null);

  v = view(fold([init(), previewOk(), call('preview_stop', {}, { ok: true })]), T0 + 3 * MIN);
  assert.deepEqual(v.links, []);
});

test('a preview_start refused before anything was stopped keeps the running play link', () => {
  // The reviewer's case: a preview runs, then built=true is asked before dist/index.html exists. The CLI answers
  // no_dist before it stops anything, so the server and its link are still up.
  const running = fold([init(), previewOk()]);
  const noDist = call('preview_start', { gameDir: GAME_DIR, built: true }, { ok: false, code: 'no_dist', reason: 'no_dist', fix: 'x' });
  const noProject = call('preview_start', { gameDir: '/games/unity-thing' }, { ok: false, code: 'no_npm_project', reason: "no package.json in '/games/unity-thing'", fix: 'x' });
  for (const refusal of [noDist, noProject]) {
    const s = observe(running, refusal, T0 + 2 * MIN);
    assert.deepEqual(s.preview, { url: 'http://localhost:5173/', at: T0 + MIN }, refusal.output.code);
    assert.equal(view(s, T0 + 2 * MIN).links[0].url, 'http://localhost:5173/');
  }
  assert.equal(observe(fold([init()]), noDist, T0).preview, null, 'with no preview running there is still none');
});

test('a preview_start that a newer call overtook leaves the link to the newer call\'s answer', () => {
  // `superseded` says only "use the newer result" (cli/src/preview.ts). The two answers can arrive in either order.
  const newer = previewOk('http://localhost:5174/');
  assert.equal(fold([init(), previewOk(), previewFail('superseded'), newer]).preview.url, 'http://localhost:5174/');
  assert.equal(fold([init(), previewOk(), newer, previewFail('superseded')]).preview.url, 'http://localhost:5174/', 'the newer server stays linked');
  assert.equal(fold([init(), previewOk(), previewFail('superseded'), previewFail('port_in_use')]).preview, null, 'the newer call failed');
  assert.equal(fold([init(), previewOk(), call('preview_stop', {}, { ok: true }), previewFail('superseded')]).preview, null, 'a stop overtook it');
});

test('a link must be an http or https address with no control characters', () => {
  const unsafe = [
    'javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', 42, null, `https://x.test/${'a'.repeat(2100)}`,
    'http://localhost:5173/\u001b]8;;https://evil.test\u0007', ' http://localhost:5173/', 'http://local\nhost:5173/', 'http://localhost:5173/\u009b',
  ];
  for (const url of unsafe) {
    const s = fold([init(), call('preview_start', { gameDir: GAME_DIR }, { ok: true, url, pid: 42 })]);
    assert.equal(s.preview, null, `${JSON.stringify(url)?.slice(0, 40)} must not become a link`);
  }
  const s = fold([init(), call('preview_start', { gameDir: GAME_DIR }, { ok: true, url: 'HTTP://LocalHost:5173', pid: 42 })]);
  assert.equal(s.preview.url, 'http://localhost:5173/', 'the checked, normal form is what is drawn');
});

test('names drawn carry no control characters', () => {
  const v = view(fold([init('fizz\u001b[31mlab')]), T0);
  assert.equal(v.game, 'fizz[31mlab');
});

test('a published link shows only after publish.done', () => {
  const upload = call('publish_upload', { gameDir: GAME_DIR, publishId: 'f0a1b2c3-0000-4000-8000-000000000001' }, { uploaded: ['index.html'], source: { status: 'not_kept' }, repo: 'none' });

  assert.deepEqual(view(fold([init(), publish(), upload]), T0 + 3 * MIN).links, [], 'uploaded but not verified live: no link');

  const v = view(fold([init(), publish(), upload, publishDone()]), T0 + 4 * MIN);
  assert.deepEqual(v.links, [{ kind: 'online', url: 'https://play.ongame.test/fizzlab/', label: 'Play online', note: 'published 1 min ago' }]);

  const refused = call('publish_game', { gameId: 'fizzlab', files: [] }, { refused: true, reason: 'no_entry_point', detail: 'x', retryable: false, publicUrl: 'https://x.test/' });
  assert.equal(fold([init(), refused, publishDone()]).published, null, 'a refused publish has no link');

  // publish.partial records an upload that did not complete. It never marks a game as published.
  const partial = trace('publish.partial', { gameId: 'fizzlab', uploaded: [], failed: ['index.html'], skipped: [] }, { ok: true, recorded: true });
  assert.equal(fold([init(), publish(), partial]).published, null);
});

test('local and online links show together, local first', () => {
  const s = fold([
    init(),
    previewOk('http://127.0.0.1:4173/'),
    publish(),
    publishDone(),
  ]);
  assert.deepEqual(view(s, T0 + 4 * MIN).links.map((l) => l.kind), ['local', 'online']);
});

test('a new build of the same game resets the build lines and keeps the links', () => {
  const s = fold([
    init(), advance('code', ['concept']),
    gate('awaiting_review'), review(),
    previewOk(),
    init('fizzlab', OTHER),
  ]);
  assert.equal(s.buildId, OTHER);
  assert.equal(s.currentPhase, null);
  assert.equal(s.check, null, 'the play check was for the earlier build');
  assert.equal(s.preview.url, 'http://localhost:5173/', 'the preview server still runs');
  // The earlier build's run cannot be reviewed into the new build's pass.
  assert.equal(observe(s, review(), T0 + 9 * MIN).check, null);
});

test('a different game resets everything', () => {
  const s = fold([init(), previewOk(), init('other-game', OTHER)]);
  assert.equal(s.gameId, 'other-game');
  assert.equal(s.preview, null);
});

test('the build marker restores a running build at session start', () => {
  const marker = JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: T0 / 1000, startedAt: '2026-11-24T09:00:00Z' });
  const s = fromMarker(emptyState(), marker, T0 + 2 * 3600_000);
  const v = view(s, T0 + 2 * 3600_000);
  assert.equal(v.game, 'fizzlab');
  assert.equal(v.state.label, 'Building');
  assert.equal(v.phase, null, 'the marker names no phase, so none is shown');
  assert.deepEqual(v.steps, []);
  assert.equal(v.updated, 'Started 2 h ago');
});

test('a stale, broken or missing marker is no build', () => {
  const stale = JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: T0 / 1000 });
  assert.equal(view(fromMarker(emptyState(), stale, T0 + MARKER_TTL_MS + 1000), T0), null);
  for (const text of [null, '', '{', '[]', JSON.stringify({ buildId: 'not-an-id', gameId: 'x' }), JSON.stringify({ gameId: 'x' })]) {
    assert.deepEqual(fromMarker(emptyState(), text, T0), emptyState(), `marker ${text}`);
  }
});

test('the marker of the build already known only fills gaps', () => {
  const known = fold([init(), advance('code', ['concept'])]);
  const marker = JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: T0 / 1000 });
  const s = fromMarker(known, marker, T0 + 5 * MIN);
  assert.equal(s.currentPhase, 'code');
  assert.equal(s.startedAt, T0);
});

test('an older marker never replaces a build that started later', () => {
  // build-marker-write could not replace the marker (MARKER_FAILED): it still names the earlier build.
  const known = fold([init('fizzlab', OTHER)], emptyState(), T0 + 10 * MIN);
  const marker = JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: T0 / 1000 });
  assert.equal(fromMarker(known, marker, T0 + 11 * MIN).buildId, OTHER);
});

test('the marker of a newer build replaces the old one', () => {
  const known = fold([init(), advance('code', ['concept'])]);
  const marker = JSON.stringify({ buildId: OTHER, gameId: 'fizzlab', startedAtEpoch: (T0 + 10 * MIN) / 1000 });
  const s = fromMarker(known, marker, T0 + 11 * MIN);
  assert.equal(s.buildId, OTHER);
  assert.equal(s.currentPhase, null);
});

test('an ongame answer reaches the adapter as text or as a structured result', () => {
  assert.deepEqual(readOutput('{"ok":true,"url":"http://localhost:5173/"}', undefined), { ok: true, url: 'http://localhost:5173/' });
  assert.deepEqual(readOutput(undefined, { content: [{ type: 'text', text: '{"status":"passed"}' }] }), { status: 'passed' });
  assert.deepEqual(readOutput(undefined, [{ type: 'text', text: '{"status":"passed"}' }]), { status: 'passed' });
  assert.deepEqual(readOutput(undefined, { status: 'passed' }), { status: 'passed' });
  assert.deepEqual(readOutput('not json', 'still not'), {});
});

test('times read as plain words', () => {
  const s = { ...fold([init()]), startedAt: null };
  assert.equal(view(s, T0 + 30_000).updated, 'Updated just now');
  assert.equal(view(s, T0 + 59 * MIN).updated, 'Updated 59 min ago');
  assert.equal(view(s, T0 + 3 * 3600_000).updated, 'Updated 3 h ago');
  assert.equal(view(s, T0 + 50 * 3600_000).updated, 'Updated 2 days ago');
  assert.equal(view(s, T0 - 5 * MIN).updated, 'Updated just now', 'a clock behind the record');
});

test('a verified online link is kept for the next session of this game', () => {
  const live = fold([
    init(),
    publish(),
    publishDone(),
  ]);
  const record = publishedRecord(live);
  assert.deepEqual(record, { gameId: 'fizzlab', url: 'https://play.ongame.test/fizzlab/', at: T0 + 2 * MIN });
  assert.equal(publishedRecord(fold([init()])), null, 'nothing published: nothing kept');

  const later = view(withPublished(emptyState(), record), record.at + 3 * 24 * 3600_000);
  assert.equal(later.game, 'fizzlab');
  assert.equal(later.state.label, 'No build running');
  assert.deepEqual(later.links, [{ kind: 'online', url: 'https://play.ongame.test/fizzlab/', label: 'Play online', note: 'published 3 days ago' }]);

  assert.equal(withPublished(fold([init('other-game')]), record).published, null, 'another game here now');
  for (const broken of [null, 'x', {}, { ...record, url: 'javascript:x' }, { ...record, at: 'soon' }, { ...record, gameId: '' }]) {
    assert.deepEqual(withPublished(emptyState(), broken), emptyState());
  }
  assert.equal(withPublished(live, { ...record, at: T0 }).published.at, T0 + 2 * MIN, 'an older record does not win');
});

test('the marker TTL boundary and odd start times follow the CLI status line', () => {
  const at = (epoch) => JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: epoch });
  assert.equal(fromMarker(emptyState(), at(T0 / 1000), T0 + MARKER_TTL_MS).buildId, BUILD, 'exactly 36 h: still running');
  assert.equal(fromMarker(emptyState(), at(T0 / 1000), T0 + MARKER_TTL_MS + 1000).buildId, null, 'past 36 h: abandoned');
  // cli/src/statusline.ts treats a missing or non-numeric start as 0 and skips the age check. So does the panel.
  for (const epoch of [0, -1, 'x', undefined]) {
    const s = fromMarker(emptyState(), at(epoch), T0);
    assert.equal(s.buildId, BUILD, `startedAtEpoch ${epoch}`);
    assert.equal(s.startedAt, null);
  }
});

test('a phase outside the registered plan shows by name only', () => {
  const s = fold([init(), call('record_iteration', { buildId: BUILD, phase: 'audio' }, doc(BUILD, 'fizzlab', 'audio', ['concept']))]);
  const v = view(s, T0 + MIN);
  assert.deepEqual(v.phase, { name: 'audio', index: 0, total: 0 });
  assert.deepEqual(v.steps.map((x) => x.status), ['done', 'pending', 'pending', 'pending', 'pending']);
});

test('a state answer with no state fields only touches the update time', () => {
  // null: ongame knows no such build (core/src/registry.ts). The wrapped text 'null' reads as no fields.
  const s = fold([init(), advance('code', ['concept']), call('approve_phase', { buildId: BUILD, phase: 'code' }, {})]);
  assert.equal(s.currentPhase, 'code');
  assert.equal(s.updatedAt, T0 + 2 * MIN);
});

test('an unsafe publish address never becomes a link', () => {
  const s = fold([init(), publish('fizzlab', 'javascript:alert(1)')]);
  assert.equal(s.pendingPublish, null);
});

test('one day reads in the singular', () => {
  const s = { ...fold([init()]), startedAt: null };
  assert.equal(view(s, T0 + 24 * 3600_000).updated, 'Updated 1 day ago');
});
