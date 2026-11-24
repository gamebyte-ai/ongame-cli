// The build panel, run by Claude Code's own test kit: `claude plugin test` from the repo root.
// Each hook a test registers stands for the engine beneath the panel; a call on `$` is answered `{ value }`.
import { expect, mock, test } from 'claude-code/testing';
import type { On, ToolCallArgs } from 'claude-code';

const T0 = Date.parse('2026-11-24T09:00:00Z');
const MIN = 60_000;
const BUILD = 'b_0123456789abcdef';
const CWD = '/games/fizzlab';
const PLAN = { phases: ['concept', 'assets', 'code', 'levels', 'polish'] };
const MARKER = JSON.stringify({ buildId: BUILD, gameId: 'fizzlab', startedAtEpoch: T0 / 1000 });
const RUN = '3f6c1a52-9d0e-4b7a-8c11-5e2f0a9d7b31';
const OTHER_RUN = '8b1d4e7f-2a35-4c69-9f02-6d7e1c3a5b48';
/** trace_emit's answer to an accepted publish.done (ongame core/src/trace.ts). */
const PUBLISHED = { ok: true, source: 'not_given', repo: 'not_given' };
const MOMENTS = [{ run: 'desktop', frame: 1, saw: 'the start screen' }, { run: 'phone', frame: 1, saw: 'the start screen' }];
const ongame = (name: string) => `mcp__plugin_ongame_ongame__${name}` as const;
const SURFACES = ['terminal', 'desktop'] as const;
/** A tool call by name. Which MCP tools the types know depends on the servers connected when the engine last laid
 *  them, so the input is given loosely. */
const callOf = (tool: string, args: Record<string, unknown>) => ({ tool, ...args }) as unknown as ToolCallArgs;

function pane(bodyColumns: number, placement: 'dock' | 'inline') {
  return {
    plugin: 'ongame',
    component: 'Pane',
    requestId: 'ongame-build',
    props: { title: 'ongame build', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  } as const;
}
const WIDE = pane(60, 'dock');
const NARROW = pane(40, 'inline');

/** The engine beneath the panel: a session in CWD, a clock at T0, a store, and ongame's answers by tool. */
type Setup = {
  marker?: string | null;
  store?: Record<string, unknown>;
  /** The store refuses every write, as `$.store.set` does once the store would pass 4 MiB of JSON. */
  isStoreFull?: boolean;
  /** ongame's answer by tool name: a value, or a function of the call's input when the answer depends on it. */
  answers?: Record<string, unknown>;
};

function engine(on: On, setup: Setup = {}) {
  const seen = { opened: [] as unknown[], closed: [] as string[], toasts: [] as string[], copied: [] as string[] };
  const clock = mock.clock(on, { now: T0 });
  // The store in memory, kept here so a test can read what the panel wrote.
  const store: Record<string, unknown> = { ...(setup.store ?? {}) };
  on('store.get', (_, e) => ({ value: store[e.key] }));
  on('store.set', (_, e) => {
    if (setup.isStoreFull) throw new Error('store full');
    store[e.key] = e.value;
    return { value: undefined };
  });
  on('store.delete', (_, e) => {
    delete store[e.key];
    return { value: undefined };
  });
  on('command.register', () => ({ value: { command: 'ongame-panel' } }));
  on('ui.open', (_, e) => {
    seen.opened.push(e);
    return { value: { isPlaced: true } };
  });
  on('ui.close', (_, e) => {
    seen.closed.push(e.id);
    return { value: undefined };
  });
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text);
    return { value: undefined };
  });
  on('ui.copy', (_, e) => {
    seen.copied.push(e.text);
    return { value: { isCopied: true } };
  });
  on('fs.read', () => {
    if (setup.marker == null) throw new Error('ENOENT: no such file');
    return { value: setup.marker };
  });
  on('session.cwd', () => ({ value: CWD }));
  on('session.start', (_, e) => ({ cwd: e.cwd }));
  on('tool.call', (_, e) => {
    const name = String(e.tool);
    const given = setup.answers?.[name.slice(name.lastIndexOf('__') + 2)];
    const answer = typeof given === 'function' ? (given as (input: unknown) => unknown)(e) : given;
    return { result: {}, text: JSON.stringify(answer ?? {}) };
  });
  return { seen, clock, store };
}

const start = { cwd: CWD, surface: 'terminal', isInteractive: true } as const;
/** `/ongame-panel <args>` typed at a narrow terminal's prompt. */
const typed = (args: string) =>
  ({ command: 'ongame-panel', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 44 } }) as const;

test('a running build opens the panel by itself and shows the game, on every surface', async ($, on) => {
  const { seen } = engine(on, { marker: MARKER });
  await $.session.start(start);
  expect(seen.opened.length).toBe(1);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...WIDE, surface });
    expect((await ui.find({ type: 'Text', text: /fizzlab/ }))?.text).toContain('ongame');
    expect((await ui.find({ type: 'Text', text: /Building/ }))?.text).toContain('Building');
    expect((await ui.find({ type: 'Text', text: /Started/ }))?.text).toBe('Started just now');
    expect(await ui.find({ type: 'Button', key: 'copy' })).toBeUndefined();
    await ui.unmount();
  }
});

test('no build: the panel stays shut, and opened by hand it says there is none', async ($, on) => {
  const { seen } = engine(on);
  await $.session.start(start);
  expect(seen.opened.length).toBe(0);
  await $.command.run(typed(''));
  expect(seen.opened.length).toBe(1);
  const ui = await $.ui.mount({ ...NARROW, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /No ongame build/ }))?.text).toBe('No ongame build in this folder yet.');
  await ui.unmount();
});

test('ongame tool answers move the panel: phase, play check and play link', async ($, on) => {
  const { seen } = engine(on, {
    answers: {
      state_init: { buildId: BUILD, state: { currentPhase: null, completed: [], done: false, plan: PLAN } },
      state_advance: { buildId: BUILD, state: { currentPhase: 'code', completed: ['concept', 'assets'], done: false, plan: PLAN } },
      play_gate: { status: 'ok', state: 'blocked', runId: RUN, checks: [{ id: 'layout_fits', status: 'fail', detail: 'x' }] },
      preview_start: { ok: true, url: 'http://localhost:5173/', pid: 7 },
    },
  });
  await $.session.start(start);
  expect(seen.opened.length).toBe(0);

  const ran = await $.tool.call(callOf(ongame('state_init'), { gameId: 'fizzlab', plan: PLAN }));
  expect(seen.opened.length).toBe(1); // a new build opens it by itself
  expect(ran.text).toBe(JSON.stringify({ buildId: BUILD, state: { currentPhase: null, completed: [], done: false, plan: PLAN } }));
  await $.tool.call(callOf(ongame('state_advance'), { buildId: BUILD }));
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD, buildId: BUILD }));
  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD }));
  expect(seen.opened.length).toBe(1); // the same build does not open it again

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...WIDE, surface });
    expect((await ui.find({ type: 'Text', text: /Building/ }))?.text).toBe('● Building · code (3 of 5)');
    expect((await ui.find({ type: 'Text', text: /concept/ }))?.text).toBe('✓ concept  ✓ assets  ● code  ○ levels  ○ polish');
    expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('✗ Play check failed: 1 check');
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('http://localhost:5173/');
    await ui.press({ key: 'copy' });
    await ui.unmount();
  }
  expect(seen.copied).toEqual(['http://localhost:5173/', 'http://localhost:5173/']);
});

test('on a narrow screen the link gets its own row and a long step list is left out', async ($, on) => {
  engine(on, {
    answers: {
      state_init: { buildId: BUILD, state: { currentPhase: 'polish', completed: ['concept', 'assets', 'code', 'levels'], done: false, plan: PLAN } },
      preview_start: { ok: true, url: 'http://localhost:5173/' },
    },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('state_init'), { gameId: 'fizzlab', plan: PLAN }));
  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD }));
  const ui = await $.ui.mount({ ...NARROW, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Building/ }))?.text).toBe('● Building · polish (5 of 5)');
  expect(await ui.find({ type: 'Text', text: /levels/ })).toBeUndefined();
  expect((await ui.find({ type: 'Text', text: /Play here/ }))?.text).toBe('▶ Play here');
  expect((await ui.find({ type: 'Text', text: /works while/ }))?.text).toBe('works while this session runs');
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('http://localhost:5173/');
  await ui.unmount();
});

test('a non-ongame tool call changes nothing and its result goes back as it came', async ($, on) => {
  const answer = { buildId: BUILD, state: { currentPhase: 'code', completed: [], plan: PLAN } };
  engine(on, { answers: { state_init: answer } });
  await $.session.start(start);
  // Another server's tool with ongame's tool name: not ongame's build.
  const other = await $.tool.call(callOf('mcp__other__state_init', { gameId: 'not-ours' }));
  expect(other.text).toBe(JSON.stringify(answer));
  const ui = await $.ui.mount({ ...WIDE, surface: 'desktop' });
  expect((await ui.find({ type: 'Text', text: /No ongame build/ }))?.text).toBe('No ongame build in this folder yet.');
  await ui.unmount();
});

test('/ongame-panel off keeps it shut for good; on brings it back', async ($, on) => {
  const { seen, store } = engine(on, { marker: MARKER, store: { isOff: true } });
  await $.session.start(start);
  expect(seen.opened.length).toBe(0); // off: a running build does not open it

  const off = await $.command.run(typed('off'));
  expect(store.isOff).toBe(true);
  expect(off.text).toBe('The ongame panel is off. /ongame-panel on turns it back on.');
  expect(seen.closed).toEqual(['ongame-build']);

  await $.command.run(typed(''));
  expect(seen.opened.length).toBe(1); // asked by hand, it opens even while off

  const back = await $.command.run(typed('on'));
  expect(back.text).toBe('The ongame panel is on. It opens by itself while an ongame build runs.');
  expect(store.isOff).toBeUndefined();
  expect(seen.opened.length).toBe(2);

  const wrong = await $.command.run(typed('maybe'));
  expect(wrong.text).toBe('Use /ongame-panel to show the panel, or /ongame-panel off or on.');
});

test('the Turn off button turns it off and says how to turn it on', async ($, on) => {
  const { seen } = engine(on, { marker: MARKER });
  await $.session.start(start);
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  await ui.press({ key: 'off' });
  await ui.unmount();
  expect(seen.closed).toEqual(['ongame-build']);
  expect(seen.toasts).toEqual(['The ongame panel is off. /ongame-panel on turns it back on.']);
});

test('a verified online link is kept for the next session in this folder', async ($, on) => {
  const kept = { gameId: 'fizzlab', url: 'https://play.ongame.test/fizzlab/', at: T0 - 2 * 24 * 3600_000 };
  const { seen } = engine(on, { store: { [`published:${CWD}`]: kept } });
  await $.session.start(start);
  expect(seen.opened.length).toBe(0); // no build runs, so it waits to be asked
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /No build running/ }))?.text).toBe('No build running');
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://play.ongame.test/fizzlab/');
  expect((await ui.find({ type: 'Text', text: /published/ }))?.text).toBe('  published 2 days ago');
  await ui.unmount();
});

test('publish.done turns the publish address into a play link and keeps it', async ($, on) => {
  const { clock, store } = engine(on, {
    marker: MARKER,
    answers: { publish_game: { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }, trace_emit: PUBLISHED },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('publish_game'), { gameId: 'fizzlab', files: [] }));
  let ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect(await ui.find({ type: 'Link' })).toBeUndefined(); // not verified live yet
  await ui.unmount();

  await clock.advance(MIN);
  await $.tool.call(callOf(ongame('trace_emit'), { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab' } }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://play.ongame.test/fizzlab/');
  await ui.unmount();
  expect(store[`published:${CWD}`]).toEqual({ gameId: 'fizzlab', url: 'https://play.ongame.test/fizzlab/', at: T0 + MIN });
});

test('a store that refuses a write leaves the tool result and the panel as they were', async ($, on) => {
  const answer = PUBLISHED;
  engine(on, {
    marker: MARKER,
    isStoreFull: true,
    answers: { publish_game: { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }, trace_emit: answer },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('publish_game'), { gameId: 'fizzlab', files: [] }));
  const ran = await $.tool.call(callOf(ongame('trace_emit'), { buildId: BUILD, name: 'publish.done', payload: { gameId: 'fizzlab' } }));
  expect(ran.text).toBe(JSON.stringify(answer));
  expect(ran.isError).toBeUndefined();
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://play.ongame.test/fizzlab/');
  await ui.unmount();
});

test('a publish.done that ongame refused shows no link and keeps none', async ($, on) => {
  // ongame refuses a publish.done whose payload does not name the build's game (core/src/trace.ts).
  const refusal = { ok: false, reason: 'game_id_mismatch' };
  const { store } = engine(on, {
    marker: MARKER,
    answers: { publish_game: { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }, trace_emit: refusal },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('publish_game'), { gameId: 'fizzlab', files: [] }));
  const ran = await $.tool.call(callOf(ongame('trace_emit'), { buildId: BUILD, name: 'publish.done', payload: {} }));
  expect(ran.text).toBe(JSON.stringify(refusal));
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect(await ui.find({ type: 'Link' })).toBeUndefined();
  expect(await ui.find({ type: 'Button', key: 'copy' })).toBeUndefined();
  await ui.unmount();
  expect(store[`published:${CWD}`]).toBeUndefined();
});

test('the play check passes only on the review of its own run', async ($, on) => {
  // play_review names a folder and a run, never a build (cli/src/local-registry.ts). This build's run is blocked;
  // another game's run is reviewed and passes.
  let mine: Record<string, unknown> = { status: 'ok', state: 'blocked', runId: RUN, checks: [{ id: 'layout_fits', status: 'fail', detail: 'x' }] };
  engine(on, {
    marker: MARKER,
    answers: {
      play_gate: (input: { buildId?: string }) => (input.buildId === BUILD ? mine : { status: 'ok', state: 'awaiting_review', runId: OTHER_RUN, checks: [] }),
      play_review: { status: 'passed' },
    },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD, buildId: BUILD }));
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: '/games/another', buildId: 'b_fedcba9876543210' }));
  await $.tool.call(callOf(ongame('play_review'), { gameDir: '/games/another', runId: OTHER_RUN, review: 'It plays right.', moments: MOMENTS }));
  let ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('✗ Play check failed: 1 check');
  await ui.unmount();

  // Fixed and played again: the review of that run passes it.
  mine = { status: 'ok', state: 'awaiting_review', runId: RUN, checks: [{ id: 'layout_fits', status: 'pass', detail: 'x' }] };
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD, buildId: BUILD }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('· Play check waiting for review');
  await ui.unmount();
  await $.tool.call(callOf(ongame('play_review'), { gameDir: CWD, runId: RUN, review: 'It plays right.', moments: MOMENTS }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('✓ Play check passed');
  await ui.unmount();
});

test('a build that ended failed shows as failed, with no success marks', async ($, on) => {
  const { clock } = engine(on, {
    answers: {
      state_init: { buildId: BUILD, state: { currentPhase: 'code', completed: ['concept', 'assets'], done: false, plan: PLAN } },
      trace_emit: (input: { payload?: { outcome?: string } }) => (input.payload?.outcome === 'refused-by-test' ? { ok: false } : { ok: true }),
    },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('state_init'), { gameId: 'fizzlab', plan: PLAN }));

  // A build.done ongame did not accept leaves the build running.
  await $.tool.call(callOf(ongame('trace_emit'), { buildId: BUILD, name: 'build.done', payload: { outcome: 'refused-by-test' } }));
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Building/ }))?.text).toBe('● Building · code (3 of 5)');
  await ui.unmount();

  await clock.advance(MIN);
  await $.tool.call(callOf(ongame('trace_emit'), { buildId: BUILD, name: 'build.done', payload: { outcome: 'failed' } }));
  for (const surface of SURFACES) {
    const shown = await $.ui.mount({ ...WIDE, surface });
    expect((await shown.find({ type: 'Text', text: /Build failed/ }))?.text).toBe('✗ Build failed');
    expect(await shown.find({ type: 'Text', text: /Build finished/ })).toBeUndefined();
    expect((await shown.find({ type: 'Text', text: /concept/ }))?.text).toBe('✓ concept  ✓ assets  ○ code  ○ levels  ○ polish');
    await shown.unmount();
  }
});

test('a preview_start refused before it stopped anything keeps the play link', async ($, on) => {
  // built=true before dist/index.html exists: the CLI answers no_dist and the running preview stays up.
  engine(on, {
    marker: MARKER,
    answers: {
      preview_start: (input: { built?: boolean }) =>
        input.built === true ? { ok: false, code: 'no_dist', reason: 'no_dist', fix: 'x' } : { ok: true, url: 'http://localhost:5173/', pid: 7 },
    },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD }));
  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD, built: true }));
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('http://localhost:5173/');
  await ui.unmount();
});

test('a slow play_gate shows its play check once call_wait brings it', async ($, on) => {
  // The CLI answers call_pending first (cli/src/call-jobs.ts); the run's own answer comes later through call_wait.
  let answer: Record<string, unknown> = { status: 'ok', state: 'blocked', runId: RUN, checks: [{ id: 'layout_fits', status: 'fail', detail: 'x' }] };
  engine(on, {
    marker: MARKER,
    answers: {
      play_gate: () => answer,
      call_wait: { status: 'ok', state: 'awaiting_review', runId: OTHER_RUN, checks: [] },
      play_review: { status: 'passed' },
    },
  });
  await $.session.start(start);
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD, buildId: BUILD }));
  let ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('✗ Play check failed: 1 check');
  await ui.unmount();

  answer = { ok: false, reason: 'call_pending', retryable: true, callId: 'c-1', tool: 'play_gate', fix: 'x' };
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD, buildId: BUILD }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /Play check/ })).toBeUndefined(); // not known yet: no line
  await ui.unmount();

  await $.tool.call(callOf(ongame('call_wait'), { callId: 'c-1' }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('· Play check waiting for review');
  await ui.unmount();

  await $.tool.call(callOf(ongame('play_review'), { gameDir: CWD, runId: OTHER_RUN, review: 'It plays right.', moments: MOMENTS }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Text', text: /Play check/ }))?.text).toBe('✓ Play check passed');
  await ui.unmount();
});

test('a preview_stop after a slow preview_start keeps the stopped server off the panel', async ($, on) => {
  // The order the Codex review found on PR 153: the late answer of the start comes after the stop.
  engine(on, {
    marker: MARKER,
    answers: {
      preview_start: { ok: false, reason: 'call_pending', retryable: true, callId: 'c-2', tool: 'preview_start', fix: 'x' },
      preview_stop: { ok: true },
      call_wait: { ok: true, url: 'http://localhost:5174/', pid: 7 },
    },
  });
  await $.session.start(start);
  // The control: with no stop in between, the late answer's link shows.
  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD }));
  await $.tool.call(callOf(ongame('call_wait'), { callId: 'c-2' }));
  let ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect((await ui.find({ type: 'Link' }))?.props.href).toBe('http://localhost:5174/');
  await ui.unmount();

  await $.tool.call(callOf(ongame('preview_start'), { gameDir: CWD }));
  await $.tool.call(callOf(ongame('preview_stop'), {}));
  await $.tool.call(callOf(ongame('call_wait'), { callId: 'c-2' }));
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' });
  expect(await ui.find({ type: 'Link' })).toBeUndefined();
  await ui.unmount();
});
