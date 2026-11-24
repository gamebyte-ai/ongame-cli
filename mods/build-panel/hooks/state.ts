// The build panel's state adapter: ongame's own tool answers and build marker in, the panel's lines out.
//
// Pure functions with no engine import, so the engine (register.tsx) and Node's test runner
// (test/build-panel-state.test.mjs) load this same file. Only erasable TypeScript is used here, because Node runs
// it by stripping the types.
//
// The rule for every line: show what an ongame tool or file reported, or show nothing. The answer shapes come
// from the ongame CLI: the marker from cli/src/hooks/build-marker-write.ts, the build state from the state tools
// (core/src/registry.ts, read the same way as desktop/src/progress.ts), the play check from cli/src/play-gate.ts,
// the local link from cli/src/preview.ts and the online link from the publish steps in commands/publish.md.
// These are structured fields and exact event names, never words whose meaning is judged.

import type { BuildState, PanelView, PublishedRecord, ToolCall, Tone } from '../../../types';

export type { BuildState, PanelView, PublishedRecord, ToolCall, Tone };

/** The marker counts as abandoned after this long: the CLI's status line and inject hook use the same 36 h. */
export const MARKER_TTL_MS = 36 * 3600 * 1000;

/** The marker the CLI's build-marker-write hook keeps in the project folder while a build runs. */
export const MARKER_PATH = '.ongame/active-build.json';

const BUILD_ID = /^b_[0-9a-f]{16}$/;
const MAX_URL = 2048;

export function emptyState(): BuildState {
  return {
    gameId: null,
    buildId: null,
    phases: [],
    currentPhase: null,
    completed: [],
    isDone: false,
    startedAt: null,
    check: null,
    preview: null,
    published: null,
    pendingPublish: null,
    updatedAt: null,
  };
}

/** The ongame tools whose answers move the panel. */
export const WATCHED = new Set([
  'state_init',
  'state_advance',
  'state_get',
  'record_iteration',
  'approve_phase',
  'trace_emit',
  'play_gate',
  'play_review',
  'preview_start',
  'preview_stop',
  'publish_game',
]);

/**
 * The tool's bare name when an ongame MCP server answers it, else null. The server part is checked because bare
 * names are not ongame's alone. Measured names: `mcp__plugin_ongame_ongame__state_init` (the public plugin) and
 * `mcp__plugin_ongame-cli_ongame-local__preview_start` (the CLI repo's own plugin), as desktop/src/progress.ts has them.
 */
export function ongameTool(name: string): string | null {
  const prefix = 'mcp__';
  if (!name.startsWith(prefix)) return null;
  const i = name.lastIndexOf('__');
  if (i <= prefix.length) return null; // no server name between the prefix and the tool name
  const server = name.slice(prefix.length, i).toLowerCase();
  return server.includes('ongame') ? name.slice(i + 2) : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseRecord(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * An MCP answer reaches a hook as the text the model reads, or as the tool's record: an object, or text blocks
 * (`{ content: [{ type: 'text', text }] }` or the bare array). The first JSON object found wins; none is `{}`.
 */
export function readOutput(text: unknown, result: unknown): Record<string, unknown> {
  const fromText = parseRecord(text);
  if (fromText) return fromText;
  const blocks = Array.isArray(result) ? result : asRecord(result)?.content;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      const parsed = parseRecord(asRecord(block)?.text);
      if (parsed) return parsed;
    }
  }
  return asRecord(result) ?? {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** C0 and C1 control characters, DEL and whitespace are refused before the URL parser runs. Node 26's parser drops
 *  a newline or tab anywhere and control characters at either end (`http://local\nhost:5173/` parses as
 *  `http://localhost:5173/`), so the address it checked would not be the one given. */
const UNSAFE_URL = /[\u0000-\u0020\u007f-\u009f]/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** An address the panel may show: http or https, parseable, short enough for a terminal link. The parser's own
 *  form is returned, so what is drawn is what was checked. */
export function playUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > MAX_URL || UNSAFE_URL.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href.length > MAX_URL ? null : u.href;
  } catch {
    return null;
  }
}

/** A name to draw: control characters out, so a game id cannot steer the terminal. */
export function clean(v: string): string {
  return v.replace(CONTROL, '');
}

/** A new build: the build's own lines go, the links stay when it is the same game. */
function startBuild(s: BuildState, gameId: string | null, buildId: string, now: number): BuildState {
  const sameGame = gameId === null || s.gameId === null || gameId === s.gameId;
  return {
    ...emptyState(),
    gameId: gameId ?? s.gameId,
    buildId,
    preview: sameGame ? s.preview : null,
    published: sameGame ? s.published : null,
    pendingPublish: sameGame ? s.pendingPublish : null,
    updatedAt: now,
  };
}

/** The build state inside a state tool's answer: `{ buildId, state }` or the state itself. */
function takeBuild(s: BuildState, tool: string, input: Record<string, unknown>, out: Record<string, unknown>, now: number): BuildState {
  const inner = asRecord(out.state) ?? out;
  const id = str(out.buildId) ?? str(inner.buildId) ?? str(input.buildId);
  let next = s;
  if (tool === 'state_init') {
    if (id === null || !BUILD_ID.test(id)) return s;
    const gameId = str(input.gameId) ?? str(inner.gameId);
    next = id === s.buildId ? { ...s, gameId: gameId ?? s.gameId } : { ...startBuild(s, gameId, id, now), startedAt: now };
  } else if (s.buildId === null || (id !== null && id !== s.buildId)) {
    // A state answer for no build the panel knows, or for another build: not this game's state.
    return s;
  }
  if (!('currentPhase' in inner) && !('completed' in inner) && !('done' in inner)) return { ...next, updatedAt: now };
  const plan = asRecord(inner.plan);
  const phases = plan && Array.isArray(plan.phases) ? strings(plan.phases) : next.phases;
  return {
    ...next,
    phases,
    currentPhase: str(inner.currentPhase),
    completed: strings(inner.completed),
    isDone: inner.done === true,
    updatedAt: now,
  };
}

function takeCheck(s: BuildState, tool: string, input: Record<string, unknown>, out: Record<string, unknown>, now: number): BuildState {
  // A check of another build is not this build's check.
  const buildId = str(input.buildId);
  if (buildId !== null && s.buildId !== null && buildId !== s.buildId) return s;
  if (tool === 'play_review') {
    return out.status === 'passed' ? { ...s, check: { result: 'passed', failed: 0, at: now }, updatedAt: now } : s;
  }
  if (out.status === 'unverified') return { ...s, check: { result: 'unverified', failed: 0, at: now }, updatedAt: now };
  if (out.status !== 'ok') return s;
  const state = out.state;
  if (state !== 'blocked' && state !== 'awaiting_review' && state !== 'skipped' && state !== 'passed') return s;
  const failed = Array.isArray(out.checks) ? out.checks.filter((c) => asRecord(c)?.status === 'fail').length : 0;
  return { ...s, check: { result: state, failed, at: now }, updatedAt: now };
}

function takeTrace(s: BuildState, input: Record<string, unknown>, now: number): BuildState {
  const buildId = str(input.buildId);
  if (input.name === 'build.done') {
    if (s.buildId === null || (buildId !== null && buildId !== s.buildId)) return s;
    return { ...s, isDone: true, currentPhase: null, updatedAt: now };
  }
  if (input.name === 'publish.done') {
    const pending = s.pendingPublish;
    const gameId = str(asRecord(input.payload)?.gameId);
    if (pending === null) return s;
    if (gameId !== null && pending.gameId !== null && gameId !== pending.gameId) return s;
    if (pending.gameId !== null && s.gameId !== null && pending.gameId !== s.gameId) return s;
    return { ...s, published: { url: pending.url, at: now }, pendingPublish: null, updatedAt: now };
  }
  return s;
}

/** Folds one finished tool call into the state. A call that is not ongame's, or that failed, changes nothing. */
export function observe(s: BuildState, call: ToolCall, now: number): BuildState {
  const tool = ongameTool(call.tool);
  if (tool === null || call.isError || !WATCHED.has(tool)) return s;
  const { input, output } = call;
  switch (tool) {
    case 'trace_emit':
      return takeTrace(s, input, now);
    case 'play_gate':
    case 'play_review':
      return takeCheck(s, tool, input, output, now);
    case 'preview_start': {
      // A new start stops the last preview server first (cli/src/preview.ts), so a failed start leaves no link.
      const url = output.ok === true ? playUrl(output.url) : null;
      return { ...s, preview: url ? { url, at: now } : null, updatedAt: now };
    }
    case 'preview_stop':
      return s.preview === null ? s : { ...s, preview: null, updatedAt: now };
    case 'publish_game': {
      // A publish of another game is not this game's link.
      const gameId = str(input.gameId);
      if (gameId !== null && s.gameId !== null && gameId !== s.gameId) return s;
      const url = output.refused === true ? null : playUrl(output.publicUrl);
      return url ? { ...s, pendingPublish: { url, gameId }, updatedAt: now } : s;
    }
    default:
      return takeBuild(s, tool, input, output, now);
  }
}

/**
 * Folds the build marker in: `text` is the file's content, null when there is none. A missing, broken or stale
 * marker says nothing, so the state stays as it was. A marker of another build starts that build.
 */
export function fromMarker(s: BuildState, text: string | null, now: number): BuildState {
  const marker = parseRecord(text);
  if (!marker) return s;
  const buildId = str(marker.buildId);
  if (buildId === null || !BUILD_ID.test(buildId)) return s;
  const epoch = marker.startedAtEpoch;
  const startedAt = typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0 ? Math.floor(epoch) * 1000 : null;
  if (startedAt !== null && now - startedAt > MARKER_TTL_MS) return s;
  const gameId = str(marker.gameId);
  if (buildId === s.buildId) {
    return { ...s, gameId: s.gameId ?? gameId, startedAt: s.startedAt ?? startedAt };
  }
  // The marker names another build. It is the newer one only when it started after the build the panel holds: a
  // marker the CLI could not replace (cli/src/hooks/build-marker-write.ts, MARKER_FAILED) still names the old build.
  if (s.buildId !== null && (startedAt === null || s.startedAt === null || startedAt <= s.startedAt)) return s;
  return { ...startBuild(s, gameId, buildId, startedAt ?? now), startedAt };
}

/** The record to keep across sessions once a link is verified live, or null when there is none. */
export function publishedRecord(s: BuildState): PublishedRecord | null {
  return s.gameId !== null && s.published !== null ? { gameId: s.gameId, url: s.published.url, at: s.published.at } : null;
}

/** Folds a record kept by an earlier session in: the game and its last verified online link. Another game's
 *  record, a broken one, or one older than the link already held changes nothing. */
export function withPublished(s: BuildState, record: unknown): BuildState {
  const r = asRecord(record);
  const gameId = r ? str(r.gameId) : null;
  const url = r ? playUrl(r.url) : null;
  const at = r && typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : null;
  if (gameId === null || url === null || at === null) return s;
  if (s.gameId !== null && s.gameId !== gameId) return s;
  if (s.published !== null && s.published.at >= at) return s;
  return { ...s, gameId, published: { url, at }, updatedAt: s.updatedAt ?? at };
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". A record ahead of the clock reads "just now". */
export function ago(then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function checkLine(check: NonNullable<BuildState['check']>): { label: string; tone: Tone } {
  switch (check.result) {
    case 'passed':
      return { label: 'Play check passed', tone: 'done' };
    case 'blocked':
      return {
        label: check.failed > 0 ? `Play check failed: ${check.failed} ${check.failed === 1 ? 'check' : 'checks'}` : 'Play check failed',
        tone: 'failed',
      };
    case 'awaiting_review':
      return { label: 'Play check waiting for review', tone: 'active' };
    case 'skipped':
      return { label: 'Not played on record', tone: 'muted' };
    case 'unverified':
      return { label: 'Play check could not run', tone: 'muted' };
  }
}

/** What the panel draws, or null when no ongame game is known here. */
export function view(s: BuildState, now: number): PanelView | null {
  if (s.gameId === null) return null;
  const state: PanelView['state'] = s.isDone
    ? { label: 'Build finished', tone: 'done' }
    : s.buildId !== null
      ? { label: 'Building', tone: 'active' }
      : { label: 'No build running', tone: 'muted' };
  const index = s.currentPhase === null ? -1 : s.phases.indexOf(s.currentPhase);
  const phase = s.isDone || s.currentPhase === null
    ? null
    : { name: clean(s.currentPhase), index: index + 1, total: index >= 0 ? s.phases.length : 0 };
  const steps = s.phases.map((name) => ({
    name: clean(name),
    status: s.isDone || s.completed.includes(name) ? ('done' as const) : name === s.currentPhase ? ('current' as const) : ('pending' as const),
  }));
  const links: PanelView['links'] = [];
  if (s.preview) links.push({ kind: 'local', url: s.preview.url, label: 'Play here', note: 'works while this session runs' });
  if (s.published) links.push({ kind: 'online', url: s.published.url, label: 'Play online', note: `published ${ago(s.published.at, now)}` });
  const updated = s.updatedAt !== null
    ? s.startedAt !== null && s.updatedAt === s.startedAt
      ? `Started ${ago(s.startedAt, now)}`
      : `Updated ${ago(s.updatedAt, now)}`
    : null;
  return { game: clean(s.gameId), state, phase, steps, check: s.check ? checkLine(s.check) : null, links, updated };
}
