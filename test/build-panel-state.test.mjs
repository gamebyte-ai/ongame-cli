// The build panel's state adapter (mods/build-panel/hooks/state.ts) turns ongame's own tool answers and its build
// marker into what the panel shows. It must never show a state or a link no ongame tool reported. These tests feed
// it the answer shapes the ongame CLI returns (cli/src/hooks/build-marker-write.ts, core/src/registry.ts,
// cli/src/preview.ts, cli/src/play-gate.ts, commands/publish.md) and check what the panel would draw.
//
// Run: node --test test/build-panel-state.test.mjs   (Node strips the TypeScript types itself.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKER_TTL_MS,
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
const init = (gameId = 'fizzlab', buildId = BUILD) =>
  call('state_init', { gameId, plan: PLAN }, { buildId, state: { currentPhase: null, completed: [], done: false, plan: PLAN } });
const advance = (currentPhase, completed, buildId = BUILD, done = false) =>
  call('state_advance', { buildId }, { buildId, state: { currentPhase, completed, done, plan: PLAN } });

function fold(calls, start = emptyState(), now = T0) {
  return calls.reduce((s, c, i) => observe(s, c, now + i * MIN), start);
}

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
  const s = fold([init(), call('state_advance', { buildId: BUILD }, { buildId: BUILD, state: { currentPhase: 'code', completed: [] } }, true)]);
  assert.equal(s.currentPhase, null);
});

test('build.done finishes the build; done:true from state_advance does too', () => {
  const traced = view(fold([init(), advance('code', ['concept']), call('trace_emit', { buildId: BUILD, name: 'build.done' }, { recorded: true })]), T0 + 9 * MIN);
  assert.equal(traced.state.label, 'Build finished');
  assert.equal(traced.state.tone, 'done');
  assert.equal(traced.phase, null);

  const advanced = view(fold([init(), advance(null, PLAN.phases, BUILD, true)]), T0 + 2 * MIN);
  assert.equal(advanced.state.label, 'Build finished');
  assert.ok(advanced.steps.every((s) => s.status === 'done'));
});

test('build.done of another build, and other trace events, change nothing', () => {
  const s = fold([init(), call('trace_emit', { buildId: OTHER, name: 'build.done' }, {}), call('trace_emit', { buildId: BUILD, name: 'phase.code.done' }, {})]);
  assert.equal(s.isDone, false);
});

test('the play check shows the real result, failures counted', () => {
  const blocked = call('play_gate', { gameDir: '/g' }, {
    status: 'ok', state: 'blocked', checks: [
      { id: 'input_touch', status: 'fail' }, { id: 'layout_fits', status: 'fail' }, { id: 'reaches_goal', status: 'pass' },
    ],
  });
  let v = view(fold([init(), blocked]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Play check failed: 2 checks', tone: 'failed' });

  v = view(fold([init(), blocked, call('play_gate', { gameDir: '/g' }, { status: 'ok', state: 'awaiting_review', checks: [] })]), T0 + 3 * MIN);
  assert.deepEqual(v.check, { label: 'Play check waiting for review', tone: 'active' });

  v = view(fold([init(), call('play_review', { buildId: BUILD }, { status: 'passed' })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Play check passed', tone: 'done' });

  v = view(fold([init(), call('play_gate', { gameDir: '/g' }, { status: 'unverified', reason: 'browser_unavailable' })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Play check could not run', tone: 'muted' });

  v = view(fold([init(), call('play_gate', { gameDir: '/g' }, { status: 'ok', state: 'skipped' })]), T0 + 2 * MIN);
  assert.deepEqual(v.check, { label: 'Not played on record', tone: 'muted' });

  const refused = fold([init(), blocked, call('play_gate', { gameDir: '/g' }, { status: 'refused', reason: 'bad_waiver' })]);
  assert.equal(refused.check.result, 'blocked', 'a refused call is not a new result');

  assert.equal(view(fold([init()]), T0).check, null, 'no play check yet: no line');
});

test('preview_start gives a local play link; a failed start or preview_stop takes it away', () => {
  const started = call('preview_start', { gameDir: '/g' }, { ok: true, url: 'http://localhost:5173/', pid: 42 });
  let v = view(fold([init(), started]), T0 + 2 * MIN);
  assert.deepEqual(v.links, [{ kind: 'local', url: 'http://localhost:5173/', label: 'Play here', note: 'works while this session runs' }]);

  v = view(fold([init(), started, call('preview_start', { gameDir: '/g' }, { ok: false, code: 'port_in_use' })]), T0 + 3 * MIN);
  assert.deepEqual(v.links, []);

  v = view(fold([init(), started, call('preview_stop', {}, { ok: true })]), T0 + 3 * MIN);
  assert.deepEqual(v.links, []);
});

test('a link must be an http or https address with no control characters', () => {
  const unsafe = [
    'javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', 42, null, `https://x.test/${'a'.repeat(2100)}`,
    'http://localhost:5173/\u001b]8;;https://evil.test\u0007', ' http://localhost:5173/', 'http://local\nhost:5173/', 'http://localhost:5173/\u009b',
  ];
  for (const url of unsafe) {
    const s = fold([init(), call('preview_start', { gameDir: '/g' }, { ok: true, url })]);
    assert.equal(s.preview, null, `${JSON.stringify(url)?.slice(0, 40)} must not become a link`);
  }
  const s = fold([init(), call('preview_start', { gameDir: '/g' }, { ok: true, url: 'HTTP://LocalHost:5173' })]);
  assert.equal(s.preview.url, 'http://localhost:5173/', 'the checked, normal form is what is drawn');
});

test('names drawn carry no control characters', () => {
  const v = view(fold([init('fizz\u001b[31mlab')]), T0);
  assert.equal(v.game, 'fizz[31mlab');
});

test('a published link shows only after publish.done', () => {
  const publish = call('publish_game', { gameId: 'fizzlab', files: [] }, { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/', signing: {} });
  const upload = call('publish_upload', { gameDir: '/g', publishId: 'p1' }, { uploaded: ['index.html'], failed: [], skipped: [] });
  const done = call('trace_emit', { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab', repo: 'none' } }, { recorded: true });

  assert.deepEqual(view(fold([init(), publish, upload]), T0 + 3 * MIN).links, [], 'uploaded but not verified live: no link');

  const v = view(fold([init(), publish, upload, done]), T0 + 4 * MIN);
  assert.deepEqual(v.links, [{ kind: 'online', url: 'https://play.ongame.test/fizzlab/', label: 'Play online', note: 'published 1 min ago' }]);

  const refused = call('publish_game', { gameId: 'fizzlab', files: [] }, { refused: true, reason: 'no_entry_point', publicUrl: 'https://x.test/' });
  assert.equal(fold([init(), refused, done]).published, null, 'a refused publish has no link');

  const otherGame = call('trace_emit', { buildId: BUILD, name: 'publish.done', payload: { gameId: 'another' } }, {});
  assert.equal(fold([init(), publish, otherGame]).published, null, 'publish.done of another game');
});

test('local and online links show together, local first', () => {
  const s = fold([
    init(),
    call('preview_start', { gameDir: '/g' }, { ok: true, url: 'http://127.0.0.1:4173/' }),
    call('publish_game', { gameId: 'fizzlab', files: [] }, { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }),
    call('trace_emit', { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab' } }, {}),
  ]);
  assert.deepEqual(view(s, T0 + 4 * MIN).links.map((l) => l.kind), ['local', 'online']);
});

test('a new build of the same game resets the build lines and keeps the links', () => {
  const s = fold([
    init(), advance('code', ['concept']),
    call('play_review', { buildId: BUILD }, { status: 'passed' }),
    call('preview_start', { gameDir: '/g' }, { ok: true, url: 'http://localhost:5173/' }),
    init('fizzlab', OTHER),
  ]);
  assert.equal(s.buildId, OTHER);
  assert.equal(s.currentPhase, null);
  assert.equal(s.check, null, 'the play check was for the earlier build');
  assert.equal(s.preview.url, 'http://localhost:5173/', 'the preview server still runs');
});

test('a different game resets everything', () => {
  const s = fold([init(), call('preview_start', { gameDir: '/g' }, { ok: true, url: 'http://localhost:5173/' }), init('other-game', OTHER)]);
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
    call('publish_game', { gameId: 'fizzlab', files: [] }, { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }),
    call('trace_emit', { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab' } }, {}),
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
