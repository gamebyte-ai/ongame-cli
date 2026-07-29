---
name: concept
description: Game concept — vision, core loop, target audience + visual placeholder.
---
# Concept Phase
1. `trace_emit(buildId, name="phase.concept.start")`.
1a. **Live prompt:** call `prompt_get({ phase: 'concept' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
2. Read RESEARCH.md and shape the concept to the **anti-slop + intent bar**:
   - **Originality — find the INEVITABLE version, not the obvious-first.** The concept needs a specific twist that
     breaks the "yet another `<genre>`" comparison. **Argue the opposite** before accepting your first idea: if a
     player could call it "a generic `<genre>`" without losing anything, push harder — name the comparison and break
     it. (The first idea that sounds coherent is rarely the strongest.)
   - **Fun-promise — name the specific recurring MOMENT** that is the reward (e.g. "the moment all six tiles link and
     one move clears the board"), not a category ("relaxing", "fast-paced"). The rest of the concept exists to deliver
     that moment reliably.
   - **PRIORITY RULE — the user's explicit request OUTRANKS research's angle.** Research's "out-of-the-box angle"
     is a SUGGESTION; the user's stated concept/materials are the BRIEF. When the user asked for something specific
     (e.g. "rebuild this game 1:1", a named mechanic set, shared materials), the concept's identity/name/hook must
     serve THAT — a research-suggested secondary system may only be woven in as flavor, never promoted into the core
     identity over the user's ask. The originality bar above applies WITHIN the user's brief, not against it: for a
     faithful-remake brief, "original" means execution quality, not swapping the core. **Non-goals discipline:** never
     scope out something the user explicitly asked for. A non-goals list may only contain exclusions the user stated
     or approved (via the gate / an AskUserQuestion); if you believe a requested mechanic should be cut, ASK — do not
     silently non-goal it. ("Do not scope out what the user did not scope out.")
   - **Intent-fit + ask-discipline.** The concept must serve the USER's actual intent (the build mode + what they
     shared). When a concept choice materially changes the outcome and intent is unclear, **ASK** — focused and
     decision-shaped: at most 1–2 `AskUserQuestion`s, each with 2–3 lettered options (A keep / B sharpen-this-way /
     C sharpen-that-way), one at a time, using "like Y in game X?" references (visual if it helps). **Bias toward
     silence:** catastrophic → ask; directional → one option set; taste → proceed. Don't over-ask (it kills activation).
   - Capture: the core gameplay loop, target audience, the specific fun-moment, and a 1-sentence hook.
3. **Visual SET — in-game truth, ONE visual language.** A single artistic "key art" is the WRONG output (it
   shows nothing of the actual game). Produce a small SET that shows the actual game:
   - **(a) a main-menu mock** (logo, PLAY button — how the menu will really look), and
   - **(b) 2-3 in-game KEY MOMENTS** — gameplay-camera frames **with the HUD visible**, in the game's real
     camera/scene language (they should read as screenshots of the finished game, not poster art).

   **Consistency chain (mandatory — set members must speak one language):**
   1. Generate the ANCHOR first — the most representative in-game moment:
      `forge_request(kind="2d-static", prompt="<ART-direction + that moment>", aspectRatio=<game orientation>)`.
      The returned asset's **`meta.assetId`** is the set's style anchor.
   2. Generate EVERY other set member in **ONE `forge_batch({ specs:[...] })` call**, each spec with
      `editOf = <that assetId>` and a prompt describing only the DIFFERENCE ("same game, same style — the main
      menu screen with the logo and a PLAY button"). The server parallelizes the set; never generate members as
      independent prompts (unrelated-looking images) and never spawn parallel agents for it.
   3. `assets_materialize(gameDir, assets)` [ongame] → `{paths}`; attach the materialized paths to the concept.

   **If the user SHARED an image** (a screenshot/artwork of the game they want): use IT as the style source instead
   of a generated anchor — copy it into `{gameDir}/assets/reference/`, call `forge_reference` (ongame) →
   `{uploadUrl, token}`, then `reference_upload(gameDir, path, uploadUrl, token)` (ongame) → `assetId`; use that
   as `editOf` for the whole set. **Intent decides fidelity (your judgment, not a rule):** if the user wants a 1:1
   remake of the shared game → derive visuals that MATCH the reference ("recreate this exact scene and style"); if
   they want their own game inspired by it → ADAPT ("in the style of the reference, but <our game's own identity>").
   Forge gated/unavailable → gray-box placeholder (flag it; never present gray-box as done).
4. Output: `docs/CONCEPT.md`.
5. **Observability — headline decision** (one emit, before `state_advance`): `trace_emit(buildId, name="phase.output", payload={ input:<context consumed: the `brain_recall` retention signal(s), any `knowledge_get` key(s), and the RESEARCH.md findings + user intent this phase used>, output:<artifact produced: `docs/CONCEPT.md` written + the key concept values — core loop, hook, target audience, key-art path>, metadata:{ decision:<the concept direction chosen — core loop / fantasy / hook>, why:<the rationale, explicitly citing what drove it: the `brain_recall` retention signal (e.g. "cascade match-3 retains D1=0.6"), the relevant knowledge, and the user's stated intent> } })` — becomes a Langfuse `generation` nested under the phase span (context→artifact→why; no-op if buildId is absent).
5b. **Independent quality check (advisory):** call `phase_review({ phase:'concept', buildId, gameId, artifact:<the full CONCEPT.md text>, context:{ intent:<the user's stated intent / what they asked for>, genre:<genre/mechanic>, recalledSignal:<the brain_recall retention signal you applied, if any> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}] }`. (The `context` lets the jury judge ORIGINALITY/INTENT-FIT for real, not by jargon-spotting.) **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue`; where you agree it makes the concept stronger, improve CONCEPT.md (your judgment), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed unchanged. Relay any change to the user in YOUR OWN voice ("let me sharpen the hook…") — never mention that an external check ran or how it works. Fail-soft: never block.
6. **Approval gate after this phase** (/make-game manages it). `state_advance(buildId)` + `trace_emit(buildId, name="phase.concept.done")`.

> **Correction-learning:** if this phase is re-running because the user **corrected** the concept (rejected/redirected
> the direction, not just clarified), call `friction_report(buildId, gameId, phase="concept", kind, agentDid,
> userWanted, evidence?)` (bare name via ToolSearch) with the DELTA — what you assumed vs what the user
> actually wanted. Report the user-correction delta, NOT a self-summary of the concept. Agentic (you judge if it's a
> real correction); fail-soft (never block). See `/make-game`'s correction-learning block.
