// The build panel's type contract: the values it keeps in `$.state`, and the shapes its state adapter
// (mods/build-panel/hooks/state.ts) passes around. `claude plugin validate` holds every `$.state` key the module
// names to it.
//
// This file sits at the plugin root because Claude Code reads types/index.d.ts there without a "types" key in
// plugin.json. Claude Code 2.0.15 to 2.1.75 refuse to load a plugin whose plugin.json has a key they do not know.

export type PlayCheckResult = 'passed' | 'blocked' | 'awaiting_review' | 'skipped' | 'unverified';

export type BuildState = {
  gameId: string | null;
  buildId: string | null;
  /** The phases the build registered, in order; empty when only the marker is known. */
  phases: string[];
  currentPhase: string | null;
  completed: string[];
  isDone: boolean;
  /** When the build started (the marker's time, or when its state_init answered), ms since the epoch. */
  startedAt: number | null;
  check: { result: PlayCheckResult; failed: number; at: number } | null;
  /** A local preview server's address; it lives as long as the agent session that started it. */
  preview: { url: string; at: number } | null;
  /** The game's public address, once ongame recorded the publish as verified live. */
  published: { url: string; at: number } | null;
  /** A publish under way: its address is not live until `publish.done`. */
  pendingPublish: { url: string; gameId: string | null } | null;
  /** When any of the above last changed, ms since the epoch. */
  updatedAt: number | null;
};

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
    ongame: {
      build: Shaped<BuildState>;
      /** The maker closed the pane this session: it does not open by itself again until they ask. */
      isClosed: boolean;
      /** Moves on a timer (register.tsx TICK_MS) so "2 min ago" stays true while the pane is up. */
      tick: number;
    };
  }
}
