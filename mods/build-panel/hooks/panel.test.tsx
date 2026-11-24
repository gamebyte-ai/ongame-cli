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
    const answer = setup.answers?.[name.slice(name.lastIndexOf('__') + 2)];
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
      play_gate: { status: 'ok', state: 'blocked', checks: [{ id: 'layout_fits', status: 'fail' }] },
      preview_start: { ok: true, url: 'http://localhost:5173/', pid: 7 },
    },
  });
  await $.session.start(start);
  expect(seen.opened.length).toBe(0);

  const ran = await $.tool.call(callOf(ongame('state_init'), { gameId: 'fizzlab', plan: PLAN }));
  expect(seen.opened.length).toBe(1); // a new build opens it by itself
  expect(ran.text).toBe(JSON.stringify({ buildId: BUILD, state: { currentPhase: null, completed: [], done: false, plan: PLAN } }));
  await $.tool.call(callOf(ongame('state_advance'), { buildId: BUILD }));
  await $.tool.call(callOf(ongame('play_gate'), { gameDir: CWD }));
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
    answers: { publish_game: { publishId: 'p1', publicUrl: 'https://play.ongame.test/fizzlab/' }, trace_emit: { recorded: true } },
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
  const answer = { recorded: true };
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
