---
name: research
description: Market/genre analysis — find an out-of-the-box, potentially trending angle for the concept.
---
# Research Phase
1. `trace_emit({buildId, name: "phase.research.start", payload: {}})` (find via ToolSearch by bare name `trace_emit`).
1a. **Live prompt:** call `prompt_get({ phase: 'research' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
2. Analyze the concept's genre/mechanic: similar popular games, tired patterns, **differentiation angle**. (v1: web search optional; if unavailable, use reasoning.)
3. Output: `docs/RESEARCH.md` — 1 page: genre, competitor patterns, recommended out-of-the-box angle, risks.
4. **`trace_emit({buildId, name: "phase.output", payload: {...}})`** (ongame) — BEFORE `state_advance`. ONE high-signal emit capturing the phase's headline decision (context→artifact→why; core maps `phase.output`→a `generation` nested under the phase span for prompt-level replay; no-op if `buildId` is absent). Fill it tailored to research:
   - `input`: the CONTEXT this phase consumed — the concept/genre + user intent (concept-only/prototype/production), and any market/trend signal used (web-search findings if available, else the reasoning basis). If you called `brain_recall`/`knowledge_get`, name the signal(s)/key(s) returned.
   - `output`: the ARTIFACT produced — `docs/RESEARCH.md` + the key values: genre, the tired patterns identified, the recommended out-of-the-box angle, top risks.
   - `metadata`: `{ decision: <the differentiation angle chosen for the concept>, why: <the RATIONALE — explicitly cite what drove it: the trending/market signal or competitor-pattern gap that makes this angle "out-of-the-box", and the user-intent scope it serves> }`.
4b. **Independent quality check (advisory):** call `phase_review({ phase:'research', buildId, gameId, artifact:<the full RESEARCH.md text>, context:{ genre:<genre/mechanic>, intent:<the user's intent / build mode> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}] }`. **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue` (differentiation grounded in a real signal · the genre's do-not-ship-without-it depth drivers · scope-fit); where you agree it sharpens the angle, improve RESEARCH.md (your judgment), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed. Relay any change in YOUR OWN voice — never mention an external check or how it works. Fail-soft: never block.
5. `state_advance({buildId})` + `trace_emit({buildId, name: "phase.research.done", payload: {}})` (ongame).
