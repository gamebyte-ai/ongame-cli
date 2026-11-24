// The ongame build panel: a pane beside the chat with the game's build state and play link.
//
// What it shows comes only from the state adapter (./state.ts), which reads ongame's own tool answers and build
// marker. This module wires the adapter to Claude Code's mod API: it watches ongame tool calls, keeps the state in
// `$.state`, and draws the pane. It never changes a tool call, a prompt or the model's context.
//
// Placement is Claude Code's: docked beside a wide fullscreen terminal, inline above the prompt otherwise. A pane
// the panel opens by itself is placed only from 144 columns (110 once the maker opened it); below that it waits
// until the maker types /ongame-panel, which places it inline above the prompt at any width.
import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { PanelView, Tone } from '../types';
import {
  MARKER_PATH,
  WATCHED,
  emptyState,
  fromMarker,
  observe,
  ongameTool,
  publishedRecord,
  readOutput,
  view,
  withPublished,
} from './state';

const PANE = 'ongame-build';
const TITLE = 'ongame build';
/** `$.store` key: true once the maker turned the panel off; it then never opens by itself. */
const OFF = 'isOff';
/** `$.store` key prefix: the last verified online link, per project folder. */
const PUBLISHED = 'published:';
/** The body rows the pane asks for when it sits inline above the prompt. */
const INLINE_ROWS = 9;
/** Below this many body columns a link gets its own row. */
const NARROW_COLUMNS = 48;
/** How often "2 min ago" is redrawn. */
const TICK_MS = 30_000;
const OFF_TEXT = 'The ongame panel is off. /ongame-panel on turns it back on.';

// The palette of ongame's own site (docs/index.html): amber for the name, teal for a running build.
const AMBER = '#f7ae5f';
const TEAL = '#40b9b9';

// Change the shape tag when BuildState's fields change: a value an earlier version stored outlives a reload.
const build = atom({ plugin: 'ongame-build-panel', key: 'build' } as const, emptyState(), { shape: 'build-1' });
const isClosed = atom({ plugin: 'ongame-build-panel', key: 'isClosed' } as const, false);
const tick = atom({ plugin: 'ongame-build-panel', key: 'tick' } as const, 0);

type $ = EngineInterface;

async function readMarker($: $): Promise<string | null> {
  try {
    return await $.fs.read(MARKER_PATH); // relative: the session's working directory, where the CLI writes it
  } catch {
    return null;
  }
}

/** Folds the build marker in again (session start, Refresh, /ongame-panel). */
async function refresh($: $): Promise<void> {
  const text = await readMarker($);
  const now = await $.clock.now();
  await update($, build, (s) => fromMarker(s, text, now));
}

async function isOff($: $): Promise<boolean> {
  return (await $.store.get(OFF)) === true;
}

/** Opens the pane unasked, only while a build runs, the maker has not turned it off, nor closed it this session. */
async function openByItself($: $): Promise<void> {
  if ((await isOff($)) || (await read($, isClosed))) return;
  const s = await read($, build);
  if (s.buildId === null || s.isDone) return;
  await $.ui.open({ id: PANE, title: TITLE, rows: INLINE_ROWS });
}

/** Turns the panel off for this and every later session: it never opens by itself again until `/ongame-panel on`. */
async function turnOff($: $): Promise<void> {
  await $.store.set(OFF, true);
  await $.ui.close({ id: PANE });
}

const MARK: Record<'done' | 'current' | 'pending', string> = { done: '✓', current: '●', pending: '○' };
const STATE_MARK: Record<Tone, string> = { active: '● ', done: '✓ ', failed: '✗ ', muted: '' };
const CHECK_MARK: Record<Tone, string> = { active: '· ', done: '✓ ', failed: '✗ ', muted: '· ' };

function toneColor(tone: Tone): string | undefined {
  switch (tone) {
    case 'active':
      return TEAL;
    case 'done':
      return 'success';
    case 'failed':
      return 'error';
    case 'muted':
      return undefined;
  }
}

function phaseText(v: PanelView): string {
  if (v.phase === null) return '';
  return v.phase.total > 0 ? ` · ${v.phase.name} (${v.phase.index} of ${v.phase.total})` : ` · ${v.phase.name}`;
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e);
    await $.command.register({
      name: 'ongame-panel',
      description: "Show your ongame game's build state and play link",
      argumentHint: '[on|off]',
      immediate: true,
    });
    const kept = await $.store.get(PUBLISHED + e.cwd);
    await update($, build, (s) => withPublished(s, kept));
    await refresh($);
    // "2 min ago" stays true while the pane is up: the tick is all the pane re-reads.
    $.clock.every(TICK_MS, () => {
      void update($, tick, (n) => n + 1);
    });
    if (e.isInteractive) await openByItself($);
    return started;
  });

  on('tool.call', async ($, e, next) => {
    const ran = await next(e);
    const name = String(e.tool);
    const tool = ongameTool(name);
    if (tool === null || !WATCHED.has(tool) || ran.deny !== undefined) return ran;
    // The panel only watches: whatever happens below, the tool's own result goes back unchanged.
    try {
      const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as Record<string, unknown>;
      const now = await $.clock.now();
      const before = await read($, build);
      const call = { tool: name, input, output: readOutput(ran.text, ran.result), isError: ran.isError === true };
      await update($, build, (s) => observe(s, call, now));
      const after = await read($, build);
      const record = publishedRecord(after);
      if (record !== null && after.published !== before.published) {
        await $.store.set(PUBLISHED + (await $.session.cwd()), record);
      }
      if (after.buildId !== null && after.buildId !== before.buildId) await openByItself($);
    } catch {
      // A panel that cannot update shows the last state it had; it never fails the tool.
    }
    return ran;
  }).catch(($, e, next) => next(e));

  on('command.run', { command: 'ongame-panel' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (arg === 'off') {
      await turnOff($);
      return { text: OFF_TEXT, isTextDisplayOnly: true };
    }
    if (arg !== '' && arg !== 'on') {
      return { text: 'Use /ongame-panel to show the panel, or /ongame-panel off or on.', isTextDisplayOnly: true };
    }
    if (arg === 'on') await $.store.delete(OFF);
    await update($, isClosed, () => false);
    await refresh($);
    // Asked by the maker, so Claude Code places it at any width: inline above the prompt on a narrow terminal.
    await $.ui.open({ id: PANE, title: TITLE, rows: INLINE_ROWS });
    return arg === 'on'
      ? { text: 'The ongame panel is on. It opens by itself while an ongame build runs.', isTextDisplayOnly: true }
      : {};
  });

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await update($, isClosed, () => true);
    return next(e);
  }).catch(($, e, next) => next(e));

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e);
    const s = await read($, build);
    await read($, tick);
    const v = view(s, await $.clock.now());
    const width = e.props.bodyColumns;

    if (v === null) {
      return (
        <Box flexDirection="column">
          <Text bold color={AMBER}>
            ongame
          </Text>
          <Text dimColor>No ongame build in this folder yet.</Text>
        </Box>
      );
    }

    const steps = v.steps.map((step) => `${MARK[step.status]} ${step.name}`).join('  ');
    const copyUrl = v.links[0]?.url;
    const isNarrow = width < NARROW_COLUMNS;

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold color={AMBER}>
            ongame
          </Text>
          {'  '}
          <Text bold>{v.game}</Text>
        </Text>
        <Text wrap="truncate-end">
          <Text color={toneColor(v.state.tone)} dimColor={v.state.tone === 'muted'}>
            {STATE_MARK[v.state.tone]}
            {v.state.label}
          </Text>
          {phaseText(v)}
        </Text>
        {steps !== '' && steps.length <= width && <Text dimColor>{steps}</Text>}
        {v.check !== null && (
          <Text color={toneColor(v.check.tone)} dimColor={v.check.tone === 'muted'} wrap="truncate-end">
            {CHECK_MARK[v.check.tone]}
            {v.check.label}
          </Text>
        )}
        {v.links.map((link) =>
          isNarrow ? (
            <Box key={`link-${link.kind}`} flexDirection="column">
              <Text>▶ {link.label}</Text>
              <Link href={link.url} />
              <Text dimColor>{link.note}</Text>
            </Box>
          ) : (
            <Box key={`link-${link.kind}`} flexDirection="column">
              <Text>
                ▶ {link.label}: <Link href={link.url} />
              </Text>
              <Text dimColor>{'  '}{link.note}</Text>
            </Box>
          ),
        )}
        {v.updated !== null && <Text dimColor>{v.updated}</Text>}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {copyUrl !== undefined && (
            <Button
              key="copy"
              label="Copy link"
              hotkey="c"
              onPress={async (press) => {
                const copied = await $.ui.copy({ text: copyUrl, surface: press.surface });
                $.ui.toast(copied.isCopied ? 'Link copied' : 'The link could not be copied');
              }}
            />
          )}
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
          <Button
            key="off"
            label="Turn off"
            onPress={async () => {
              await turnOff($);
              $.ui.toast(OFF_TEXT);
            }}
          />
        </Box>
      </Box>
    );
  });
};
