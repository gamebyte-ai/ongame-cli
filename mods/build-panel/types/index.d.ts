// The build panel's type contract: the values it keeps in `$.state`, and the shapes its state adapter
// (hooks/state.ts) passes around. `claude plugin validate` holds every `$.state` key the module names to it.

export type PlayCheckResult = 'passed' | 'blocked' | 'awaiting_review' | 'skipped' | 'unverified';

export type BuildState = {
  gameId: string | null;
  buildId: string | null;
  /** The phases the build registered, in order; empty when only the marker is known. */
  phases: string[];
  currentPhase: string | null;
  completed: string[];
  isDone: boolean;
  /** How the build ended when its `build.done` said it did not succeed; null while it runs, and when it succeeded. */
  outcome: 'failed' | 'abandoned' | null;
  /** When the build started (the marker's time, or when its state_init answered), ms since the epoch. */
  startedAt: number | null;
  /** This build's latest play check. `runId` and `gameDir` name the play_gate run it came from: a review counts
   *  only for that run. `runId` is null when no run was recorded (`unverified`). */
  check: { result: PlayCheckResult; failed: number; at: number; runId: string | null; gameDir: string | null } | null;
  /** A local preview server's address; it lives as long as the agent session that started it. */
  preview: { url: string; at: number } | null;
  /** The game's public address, once ongame recorded the publish as verified live. */
  published: { url: string; at: number } | null;
  /** A publish under way: its address is not live until `publish.done`. */
  pendingPublish: { url: string; gameId: string | null } | null;
  /** Calls still running after 45 s, at most one per kind: the newest. Their own answers come through call_wait. */
  waiting: Partial<Record<CallKind, WaitingCall>>;
  /** When any of the above last changed, ms since the epoch. */
  updatedAt: number | null;
};

/** The part of the panel a call's answer moves. A newer call of a kind makes an older one's late answer stale. */
export type CallKind = 'build' | 'check' | 'review' | 'preview' | 'publish';

/** A call that answered `call_pending`: the id call_wait takes, its full tool name, the input fields the adapter
 *  reads (never a play script or a file list), and when it answered pending, ms since the epoch. */
export type WaitingCall = { callId: string; tool: string; input: Record<string, unknown>; at: number };

/** What the panel keeps across sessions for one project folder: the game's last verified online link. */
export type PublishedRecord = { gameId: string; url: string; at: number };

/** One finished tool call as the adapter reads it: the full tool name, its input, its parsed answer. */
export type ToolCall = {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  isError: boolean;
};

export type Tone = 'active' | 'done' | 'failed' | 'muted';

export type PanelView = {
  game: string;
  state: { label: string; tone: Tone };
  /** `index` and `total` are 0 when the current phase is not in the registered plan. */
  phase: { name: string; index: number; total: number } | null;
  steps: { name: string; status: 'done' | 'current' | 'pending' }[];
  check: { label: string; tone: Tone } | null;
  links: { kind: 'local' | 'online'; url: string; label: string; note: string }[];
  updated: string | null;
};

declare module 'claude-code' {
  interface PluginState {
    'ongame-build-panel': {
      build: Shaped<BuildState>;
      /** Set when the maker closes the pane. The panel is then meant not to open by itself again this session
       *  until they ask; no test or real session has closed the pane by hand yet, so that is a guess. */
      isClosed: boolean;
      /** Moves on a timer (register.tsx TICK_MS) so "2 min ago" stays true while the pane is up. */
      tick: number;
    };
  }
}
