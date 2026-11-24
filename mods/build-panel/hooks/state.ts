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
//
// An answer counts only when it says the thing happened, for this build or this game. trace_emit answers `{ ok }`
// (core/src/trace.ts traceEmit): `ok: false` is an event ongame refused or a build it does not know. play_review
// names a folder and a run, never a build (cli/src/local-registry.ts). A call slower than 45 s answers
// `{ ok: false, reason: 'call_pending' }` first (cli/src/call-jobs.ts): that is "not known yet", never a result. Its
// own answer then comes through call_wait, which the panel does not read: what that call would have shown stays
// empty until a later answer fills it.

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
    outcome: null,
    startedAt: null,
    check: null,
    gameDir: null,
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
  if (isPending(out)) return s;
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
  const isDone = inner.done === true;
  return {
    ...next,
    phases,
    currentPhase: str(inner.currentPhase),
    completed: strings(inner.completed),
    isDone,
    // An outcome is how a build ended. A build that runs again (record_iteration re-opens it) has none.
    outcome: isDone ? next.outcome : null,
    updatedAt: now,
  };
}

/** What a call still running after 45 s answers first: nothing about its result. */
function isPending(out: Record<string, unknown>): boolean {
  return out.ok === false && out.reason === 'call_pending';
}

function takeCheck(s: BuildState, tool: string, input: Record<string, unknown>, out: Record<string, unknown>, now: number): BuildState {
  const gameDir = str(input.gameDir);
  if (tool === 'play_review') {
    // A review names a folder and a run. It passes this build's check only when it is the review of the run that
    // check came from: a review of another game's run, or of an earlier run, says nothing about this build.
    const check = s.check;
    if (out.status !== 'passed' || check === null || check.runId === null || gameDir === null) return s;
    if (str(input.runId) !== check.runId || gameDir !== check.gameDir) return s;
    return { ...s, check: { ...check, result: 'passed', failed: 0, at: now }, updatedAt: now };
  }
  // ongame counts a run for a build only when the run names that build (cli/src/play-gate.ts playGateStatus). A run
  // that names another build, or none, is not this build's check.
  if (s.buildId === null || str(input.buildId) !== s.buildId) return s;
  // A run that is still going has already deleted the last report (runPlayGate): the earlier result no longer stands.
  if (isPending(out)) return s.check === null ? s : { ...s, check: null, updatedAt: now };
  if (out.status === 'unverified') return { ...s, check: { result: 'unverified', failed: 0, at: now, runId: null, gameDir }, updatedAt: now };
  if (out.status !== 'ok') return s;
  const state = out.state;
  if (state !== 'blocked' && state !== 'awaiting_review' && state !== 'skipped' && state !== 'passed') return s;
  const failed = Array.isArray(out.checks) ? out.checks.filter((c) => asRecord(c)?.status === 'fail').length : 0;
  // ongame recorded this run for the build, and with it the build's game folder (writeReport, gameDirOfBuild). An
  // unverified or still running call records none, so only this answer tells the panel which folder is the build's.
  return { ...s, check: { result: state, failed, at: now, runId: str(out.runId), gameDir }, gameDir, updatedAt: now };
}

function takeTrace(s: BuildState, input: Record<string, unknown>, out: Record<string, unknown>, now: number): BuildState {
  // `ok: false` is an event ongame refused (publish.done: `game_id_mismatch`), a build it does not know, or a call
  // still running. None of them happened on ongame's record.
  if (out.ok !== true) return s;
  const buildId = str(input.buildId);
  const payload = asRecord(input.payload);
  if (input.name === 'build.done') {
    if (s.buildId === null || buildId !== s.buildId) return s;
    // The agent names `failed` or `abandoned` when the build did not succeed (core/src/registry.ts, trace_emit).
    const named = payload?.outcome;
    const outcome = named === 'failed' || named === 'abandoned' ? named : null;
    return { ...s, isDone: true, outcome, currentPhase: null, updatedAt: now };
  }
  if (input.name === 'publish.done') {
    // ongame accepts publish.done only when the payload names the build's own game, so an accepted one always names
    // the game whose address is now live. It promotes the held publish of that game, and only on this game's panel.
    const pending = s.pendingPublish;
    const gameId = str(payload?.gameId);
    if (pending === null || gameId === null || pending.gameId !== gameId) return s;
    if (s.gameId !== null && s.gameId !== gameId) return s;
    return { ...s, published: { url: pending.url, at: now }, pendingPublish: null, updatedAt: now };
  }
  return s;
}

/**
 * preview_start failures that leave the running preview alone. `no_npm_project` and `no_dist` are checked before
 * anything is stopped. `superseded` is a call a newer one overtook: the newer call's own answer says what runs now.
 * Every other failure comes after the last preview server was stopped (cli/src/preview.ts previewStart).
 */
const PREVIEW_UNTOUCHED = new Set(['no_npm_project', 'no_dist', 'superseded']);

/** Folds one finished tool call into the state. A call that is not ongame's, or that failed, changes nothing. */
export function observe(s: BuildState, call: ToolCall, now: number): BuildState {
  const tool = ongameTool(call.tool);
  if (tool === null || call.isError || !WATCHED.has(tool)) return s;
  const { input, output } = call;
  switch (tool) {
    case 'trace_emit':
      return takeTrace(s, input, output, now);
    case 'play_gate':
    case 'play_review':
      return takeCheck(s, tool, input, output, now);
    case 'preview_start': {
      if (output.ok !== true && typeof output.code === 'string' && PREVIEW_UNTOUCHED.has(output.code)) return s;
      // A start that got past its checks stopped the last preview server first, so a failed one leaves no link.
      const url = output.ok === true ? playUrl(output.url) : null;
      return { ...s, preview: url ? { url, at: now, gameDir: str(input.gameDir) } : null, updatedAt: now };
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
    ? s.outcome === 'failed'
      ? { label: 'Build failed', tone: 'failed' }
      : s.outcome === 'abandoned'
        ? { label: 'Build abandoned', tone: 'muted' }
        : { label: 'Build finished', tone: 'done' }
    : s.buildId !== null
      ? { label: 'Building', tone: 'active' }
      : { label: 'No build running', tone: 'muted' };
  // A build that did not succeed gets no success marks: only the steps ongame reported complete are done.
  const isSuccess = s.isDone && s.outcome === null;
  const index = s.currentPhase === null ? -1 : s.phases.indexOf(s.currentPhase);
  const phase = s.isDone || s.currentPhase === null
    ? null
    : { name: clean(s.currentPhase), index: index + 1, total: index >= 0 ? s.phases.length : 0 };
  const steps = s.phases.map((name) => ({
    name: clean(name),
    status: isSuccess || s.completed.includes(name) ? ('done' as const) : name === s.currentPhase ? ('current' as const) : ('pending' as const),
  }));
  const links: PanelView['links'] = [];
  // A preview names a folder, never a game: it is this game's link only when it serves the folder this build's
  // play_gate played. A preview of any other folder, or before that folder is known, may be another game's.
  if (s.preview && s.preview.gameDir !== null && s.preview.gameDir === s.gameDir) {
    links.push({ kind: 'local', url: s.preview.url, label: 'Play here', note: 'works while this session runs' });
  }
  if (s.published) links.push({ kind: 'online', url: s.published.url, label: 'Play online', note: `published ${ago(s.published.at, now)}` });
  const updated = s.updatedAt !== null
    ? s.startedAt !== null && s.updatedAt === s.startedAt
      ? `Started ${ago(s.startedAt, now)}`
      : `Updated ${ago(s.updatedAt, now)}`
    : null;
  return { game: clean(s.gameId), state, phase, steps, check: s.check ? checkLine(s.check) : null, links, updated };
}
