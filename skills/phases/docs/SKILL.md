---
name: docs
description: Light GDD — an anchor document so the agent doesn't get lost during a long session.
---
# Docs Phase
1. `trace_emit(buildId, name="phase.docs.start")`.
1a. **Live prompt:** call `prompt_get({ phase: 'docs' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
2. Generate a **light GDD** from CONCEPT.md: core loop, entities, controls, win/lose, screens (menu/play/gameover).
3. Output: `docs/GAME_DESIGN.md` (short, actionable — the anchor for the code phase).
4. **`trace_emit` the headline `phase.output`** (ONE per phase — the docs phase's main decision; nests as a Langfuse `generation` under the phase span, so the eval can read context→artifact→why). Emit it **after** `GAME_DESIGN.md` is written, **before** `state_advance`:
   ```
   trace_emit(buildId, name="phase.output", payload={
     input:    <the CONTEXT this phase consumed — the CONCEPT.md fields read (core gameplay loop, hook, target audience, mechanic/genre), plus any brain_recall signal(s)/knowledge_get key(s) the orchestrator threaded into this phase>,
     output:   <the ARTIFACT produced — docs/GAME_DESIGN.md, and its key contents: the core loop, the entity list, controls, win/lose conditions, and the menu/play/gameover screen set the code phase will build against>,
     metadata: {
       decision: <the MAIN choice this phase made — how the GDD was scoped/structured: which core loop + entities + screens were locked in as the build anchor, and what was deliberately left out to keep it light/actionable>,
       why:      <the RATIONALE, explicitly citing what drove it — the CONCEPT.md hook/core-loop/target-audience the GDD serves, and any brain_recall lesson / knowledge the orchestrator supplied (or "no recall/knowledge threaded → derived from CONCEPT.md only")>
     }
   })
   ```
   (writes the phase's context→artifact into the build tree as a generation; no-op if buildId is absent.)
4b. **Independent quality check (advisory):** call `phase_review({ phase:'docs', buildId, gameId, artifact:<the full GAME_DESIGN.md text>, context:{ buildPath:<concept-only|prototype|production>, conceptSummary:<1-line concept>, intent:<the user's intent / what they asked for> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}] }`. **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue` (actionability · concept-fidelity · **DEPTH — what keeps it engaging past the first 10 levels/min** · lightness); where you agree it makes the GDD more buildable, improve GAME_DESIGN.md (your judgment), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed. Relay any change in YOUR OWN voice — never mention an external check or how it works. Fail-soft: never block.
5. `state_advance(buildId)` + `trace_emit(buildId, name="phase.docs.done")`.
