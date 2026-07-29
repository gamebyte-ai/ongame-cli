export const meta = {
  name: 'ongame-build',
  description:
    'Adaptive phase pipeline — runs the args.phases list segmented by the orchestrator in order',
  phases: [
    { title: 'Build', detail: 'runs the segment phases in order via the agent' },
  ],
};

// args = { plan: BuildPlan, phases: PhaseKey[], buildId: string, gameDir: string, pluginRoot: string, completed?: PhaseKey[], notes?: string }
// R9: Segment logic moved out of build.js (lives in the mcp segments service).
// The orchestrator filters the segment phases and passes the ALREADY-FILTERED phase list.
// build.js does NOT do any segment filtering here — it only iterates over args.phases.
// R10: completed phases (those unchanged on re-iterate) are skipped.
// The Workflow tool may pass `args` as a JSON-string (a documented pitfall) —
// defensive parse: if it's a string, parse it; if it's an object, use it as is.
const a = typeof args === 'string' ? JSON.parse(args) : (args ?? {});
const plan = a.plan;
const phases = a.phases;
const buildId = a.buildId; // cloud-side addressing — state_*/trace_emit/brain_* nesting (server-side phase span)
const gameDir = a.gameDir; // local-side addressing — filesystem write / preview / materialize
const pluginRoot = a.pluginRoot; // ${CLAUDE_PLUGIN_ROOT} — for the skill's absolute path
const completed = a.completed ?? [];
// Gate re-run channel: the orchestrator passes the user's corrections verbatim (free text — the agent composed it).
// Absent → today's behavior (first run / no feedback).
const notes = typeof a.notes === 'string' && a.notes.trim() ? a.notes : null;

if (!plan || !Array.isArray(phases)) {
  throw new Error('build.js: args.plan + args.phases required (received type: ' + typeof args + ')');
}

// The skill path must be ABSOLUTE — a workflow subagent cannot reliably resolve a relative path.
// If pluginRoot is not provided, fall back to the skill slash-command form (/ongame-cli:phases:<phase>).
const skillRef = (phaseKey) =>
  pluginRoot
    ? `Follow the instructions in the file ${pluginRoot}/skills/phases/${phaseKey}/SKILL.md`
    : `Follow the instructions in the /ongame-cli:phases:${phaseKey} skill`;

// Per-phase model overrides — DECIDED BY THE ORCHESTRATOR at invoke time (agentic principle: build.js is the
// mechanism, never the decision). Optional `a.models = { <phaseKey>: '<model>' }`; a phase absent from the map
// inherits the session model. The orchestrator composes it from phase weight, build mode, and the user's preference.
const models = (a.models && typeof a.models === 'object') ? a.models : {};

// Skip phases already completed (re-iterate only repeats what changed).
const toRun = phases.filter((p) => !completed.includes(p));
log(`Phases to run: ${toRun.join(' → ') || '(empty — all completed)'}`);

const results = [];
for (const phaseKey of toRun) {
  phase('Build');
  const out = await agent(
    `Run the ongame ${phaseKey} phase. Concept: "${plan.concept}". Path: ${plan.path}. ` +
      `buildId: ${buildId ?? '(orchestrator did not pass it — state ops will be flat)'}. ` +
      `gameDir: ${gameDir ?? '(orchestrator did not pass it — local file/preview tools need it)'}. ` +
      `${skillRef(phaseKey)}. Write the output files under gameDir. ` +
      `Use the ongame MCP tools (find them via ToolSearch by bare name). The split is by server: ` +
      `orchestration/cloud tools (knowledge_get/knowledge_list/forge_request/sound_request/` +
      `trace_emit/state_advance/brain_*) key on buildId=${buildId ?? '(absent)'}; ` +
      `local file/preview tools (assets_materialize/preview_*/telemetry_inject) take gameDir=${gameDir ?? '(absent)'}. ` +
      (gameDir
        ? `CHECKPOINT (rollback safety): once THIS phase's own SKILL verification passes (its tsc --noEmit clean, ` +
          `smoke, or file-write check — whatever this phase defines; do NOT wait on any later user-approval gate), ` +
          `commit the game project. Run git with the working directory SET TO gameDir (Bash cwd, or a single-quoted ` +
          `path) — do NOT string-concat gameDir into a 'cd' — e.g. Bash({command:'git add -A && git commit -m ` +
          `"phase(${phaseKey}): <one-line what you produced>"', cwd:'${gameDir}'}). Fail-soft: if git isn't set up, ` +
          `skip silently; never block on the commit. This is a per-phase rollback point so a later phase or a bad ` +
          `re-iterate can't clobber good earlier work. `
        : '') +
      `When done, return a single-line JSON summary: {"phase":"${phaseKey}","ok":true,"artifacts":[...]}.` +
      (notes
        ? ` This is a RE-RUN after user feedback (iteration). The user's corrections: "${notes}". ` +
          `Existing artifacts for this phase are the REJECTED version — regenerate them honoring the corrections; ` +
          `do not verify-and-skip.`
        : ''),
    { label: `phase:${phaseKey}`, phase: 'Build', ...(models[phaseKey] ? { model: models[phaseKey] } : {}) }
  );
  results.push({ phase: phaseKey, out });
}

return { ran: toRun, results };
