---
name: reference
description: Reference Compiler V1.1 — turn a reference seed (name/URL/store/video/image/text) into an evidence-backed reference_package the build phases can be measured against. Runs BEFORE the pipeline, only when the ask depends on an external reference.
---

# Reference Compiler V1

Your output is a **specification another agent will build from**, and that agent will never see your
evidence. State what a builder must know to reproduce the reference. If a fact would not change what
they build, leave it out.

> **This is V1.1 and it is deliberately frozen.** Every rule below earned its place in a measured
> A/B, EXCEPT the three marked `[V1.1, n=1]` — those come from a single end-to-end run against a
> human ground-truth record, so they are traceable but not yet measured at scale. Mechanisms that
> were tried and did NOT pay off are named at the bottom so nobody re-adds them from intuition.

## 0. When you run at all
Only when `reference_relation` is `match_reference` or `inspired_by_reference`. On
`create_from_idea` you do not run and nothing about the build changes.

- **`match_reference`** — fidelity is the bar. Reproducing observed behaviour correctly is success;
  inventing a mechanic the reference lacks is a FAILURE, not a bonus.
- **`inspired_by_reference`** — the user wants their own game informed by it. Your job is STILL to
  get the reference right. Their deviations go in `overrides`, never blended into the truth.

## 1. Seed → evidence (they are not the same thing)
A seed is what the user handed you: a name, a URL, a store URL, a video URL, an image, a recording,
a text description, or any mix. **A name is a seed, not evidence.** From the seed:
`identity resolve → source discovery → acquisition → analysis`. Do not require the user to supply
evidence you could have fetched.

Record per evidence item: `source_type`, `source_url`, **measured** dimensions and frame rate,
`orientation`, and `reliability_by_class`. Two rules that were paid for:
- **Never trust a container's claim.** Measure the effective content rate — a file declaring 60 fps
  was found delivering ~30 fps of distinct frames, with 30% of consecutive pairs identical.
- **Reliability is per requirement class, not per source.** A store screenshot can be HIGH for
  layout fractions and LOW for exact RGB at the same time.

## 2. Entities BEFORE requirements
Wrong entity classification corrupts every requirement downstream, so do this first. Classify each
distinct visible thing as exactly one of: `gameplay_entity` · `stateful_entity` · `environment` ·
`ui` · `decoration` · `vfx` · `feedback_representation` (a visual that ENCODES state — a counter, a
row of pips) · `asset_family`. Flag anything you are UNSURE of; those are the dangerous ones.

## 3. Requirements
```yaml
- id: B-03
  class: IDENTITY|ENTITY|BEHAVIORAL|STATE|CONTROL|SPATIAL|TEMPORAL|VISUAL|FEEDBACK|UI|PROGRESSION|AUDIO
  statement: "<one falsifiable sentence a builder can act on>"
  value: { number: 150, unit: s }        # omit entirely when non-numeric
  epistemic: DIRECTLY_OBSERVED | MEASURED | INFERRED | EXTERNALLY_REPORTED | ASSUMED | CONFLICTING
  provenance:
    evidence_ids: [E4]
    locator: "<file / frame range / pixel region — specific enough to re-derive>"
    reliability: high|medium|low          # for THIS class, from §1
  resolution:                             # REQUIRED whenever `value` is present
    valid: true|false
    explanation: "<show the arithmetic>"
    measurement_conditions: "<sampling interval / viewport / dpr the number was taken at>"
    counter_evidence_checked: "<which OTHER evidence you stepped looking for a refutation>"
  reconstruction_critical: true|false     # true => counter_evidence_checked is REQUIRED
  superseded_by: null                     # set when a later measurement retracts this one
```

### The rules that carry the most weight
- **Existence is not value.** *"a fire-rate parameter exists"* is observable; *"fire rate = 5/s"* is
  MEASURED only if you measured it. Two field failures came from exactly this gap.
- **Resolution.** Before writing MEASURED, do the arithmetic and record it. Frames 2 s apart cannot
  measure a 110 ms quantity. A 2 px claim off a 4 px feature is not resolved. A compressed or
  marketing-composited source does not resolve exact RGB. **An observed maximum is not a proven
  limit** — "5 slots seen full" needs an observed *refusal* at 5.
- **Look for the frame that refutes it. `[V1.1, n=1]`** `resolution` asks whether your evidence
  SUPPORTS a claim; nothing in it asks whether your other evidence CONTRADICTS it. Before publishing
  anything `reconstruction_critical: true`, step the other evidence files for a counter-example and
  record what you stepped in `counter_evidence_checked`. A field run published *"a block slides on
  one axis at a time"* as `DIRECTLY_OBSERVED` truth; in that same run's second evidence file a held
  piece travels diagonally inside a single 33 ms step. **A wrong truth costs more than a missing
  one**: the builder implemented the axis lock faithfully, asserted it in its own test suite, and
  capped its own fidelity — while the facts the package simply omitted were guessed at correctly.
- **Keep `valid: false`.** It is the only place a number that turned out wrong can be recorded. If
  a quantity cannot be resolved, prefer keeping it out of `requirements` entirely and registering it
  as an assumption — but when you do publish a number you later distrust, say so here or in
  `superseded_by`, do not silently drop it.
- **Never pool across aspects or layouts.** A comparison at a different aspect is not a comparison.
- **Scope every absence claim.** "absent from the run HUD across N frames" is supportable; "the game
  has no lives" is not. An absence is only observable if the evidence could have shown it.

## 4. Assumptions — and calibrate the severity honestly
```yaml
- id: A-05
  question: "<the open question>"
  epistemic: ASSUMED
  reason: "<why the evidence cannot answer it>"
  named_constant: GATE_REJECT_MODE
  recommended_evidence: "<the specific evidence that would settle it>"
  importance: critical|major|minor
  blocks_build: true|false                # can a builder write the rule and ship a solvable game?
  blocks_fidelity: true|false             # will the result READ and FEEL like the reference?
```
**`blocks_build` is a judgement per item, not a policy.** Set it true when a wrong guess changes the
genre or the core loop — a builder who cannot write the rule at all, or whose levels stop being
solvable, is blocked. A measured run in which *every* assumption came back `blocks_build: false`
turned out to be the cheapest-closure pattern, not calibration: severity had collapsed while the
prose still admitted a builder would ship a strictly simpler game. If nothing blocks, say why.

**Two gates, not one. `[V1.1, n=1]`** Feel and colour pass `blocks_build` every single time — you
can always ship a solvable game without them — so one flag silently drops the entire class. A field
run dismissed its animation timings with *"standard juice timings can be chosen freely without
changing the loop or level solvability"*: correct about rules, and it dropped SIX of the eleven
ground-truth facts that package missed. The same flag dropped the block palette in a game where
matching colour **is** the win condition, which is a rule-readability problem, not a taste problem.
So: if the axis is one the player sees or feels on every interaction — input-to-response latency,
the duration AND shape of a state-change animation, palette where colour carries meaning — set
`blocks_fidelity: true`. **A `blocks_fidelity: true` item rides in the digest's `blocking` list
exactly like a build-blocker**; a flag the builder never sees changes nothing. What the builder does
with it is the same as any other blocking item: pick a defensible default and NAME it.

**Abstention is a correct result.** `ASSUMED` costs nothing; a `MEASURED` that was never measured,
or a genre convention presented as observation, is the most expensive thing you can produce.

## 5. Conflicts — never silently pick one
Keep BOTH readings with their evidence, list the possible explanations, and leave
`resolution.status: unresolved` when the evidence does not settle it. **Re-verify a conflict's own
premise against the evidence before you let it block anything** — a field run lost four
requirements to a conflict whose premise was factually false in its own frames.

## 6. Anchor instance (one) — and every other instance you actually measured
Record ONE concrete reference state in enough detail to rebuild it: which screen/level, the entity
layout, the visible UI values, and the evidence it came from. One state in full detail, not a
catalogue of guesses. If the evidence cannot support any exact state, say so and register it as an
assumption instead of publishing a grid you had to guess at.

**Then promote the others. `[V1.1, n=1]`** A measured instance that never becomes buildable data is
a measurement you already paid for and then threw away. Every OTHER concrete state you measured
goes in `instances` with its locator and a `buildable: true|false`, at whatever detail you actually
have — dimensions alone are still worth carrying. The anchor is the one you owe full detail; the
rest are owed their measurements, and none of them are owed invention.

A field run measured three boards (4x5, 3x7, 5x8), each with a pixel locator, promoted only the
anchor, and the build shipped that one board: six blocks each spanning the FULL width, so the game's
core — routing a block around obstructions to a matching exit — was never exercised at all. That
build's engine supported interior walls and non-rectangular outlines; its single level file used
neither. The evidence was in the package. The buildable payload was one degenerate board.

## 7. Overrides stay out of the truth
Anything the user asked to CHANGE about the reference goes in `overrides` as
`{ axis, from, to, source: user }` — never merged into `requirements`. On those axes the user
outranks the reference; everywhere else the reference still governs.

## 8. Coverage report
State which states you went looking for and what you found: `initial · first interaction · core
loop · invalid/rejected interaction · at-capacity · empty/exhausted · win · lose · transition ·
tutorial · reward · UI interaction`. **NOT-FOUND is a first-class result** — say what evidence would
have shown it. Public gameplay footage is selection-biased toward correct play, so the negative half
of a state machine is often structurally unavailable; record that rather than filling it in.

**Feel is a state you go looking for too. `[V1.1, n=1]`** Report what you measured of response and
motion: input-to-response latency, the duration and the shape (accelerating? settling?) of each
state-change animation, the beat between a completing action and its payoff panel, and the pace of a
normal solve (time to first action, total, headroom against any budget). These come off the same
frames you already stepped, so they are nearly free — and they are what makes a clone feel like the
thing. A package with no timing numbers caps fidelity however correct its rules are, and the builder
will fill the gap with unsourced constants that no test asserts.

## 9. Output
Write `{gameDir}/docs/reference_package.yaml` containing: `identity` (with `reference_relation`,
`observed_version`, `measurement_viewport`), `reference_seeds`, `evidence`, `entities`,
`requirements`, `assumptions`, `conflicts`, `anchor_instance`, `instances`, `overrides`,
`coverage_report`.
Keep the raw evidence under `{gameDir}/.ref/`.

Then hand the orchestrator the **digest** it passes to the phase runner (a package that only exists
on disk is the weakest channel there is): `relation`, `title`, `version`, `packagePath`, the
reconstruction-critical `truth` lines, the `blocking` assumptions (**build- AND fidelity-blocking**
— §4), `levels` (the buildable `instances` from §6, one line each), `notObserved`, and `overrides`.

---

## V1.1 — what changed and on what evidence
Three rules were added after a single 1x1 end-to-end run (`match_reference`, prototype path) whose
build was scored against an independent 20-item human ground-truth rubric, and whose PACKAGE was
scored separately against the same record (recall 30/45, precision 84%, 2 hard fabrications). The
treatment build won on fidelity (19.0 vs 17.0) — so these are fixes to a mechanism that WORKS, and
each one is traceable to a named line of code in the resulting game:

| Rule | The failure it fixes | What it cost in the run |
|---|---|---|
| §3 counter-evidence | A truth item falsified by the package's own second evidence file | The one bug that capped the treatment arm's ceiling |
| §4 `blocks_fidelity` | Feel and palette always pass the solvability gate | 6 of 11 missed ground-truth facts, plus an unsourced palette |
| §6 promote instances | Measured states never reach buildable data | A single degenerate board; the core mechanic unexercised |

**n = 1, and the builder is stochastic.** These earned their place by having a traced mechanism, not
by an effect size. Each is cheap and each is falsifiable: if `counter_evidence_checked` never once
retracts a claim, if `blocks_fidelity` never diverges from `blocks_build`, or if promoted instances
never reach a level file, delete the rule rather than keeping it out of habit.

## Tried, measured, NOT in V1 — do not re-add without new evidence
A controlled A/B on three games (98 pre-registered ground-truth items) moved recall by **exactly
zero** (70.5/98 → 70.5/98) at +31% tool calls. These were the mechanisms that did not pay:
- **A mandatory discharge pass as a recall mechanism.** Strong-mechanism recoveries: 0, 0 and ~1
  across three arms.
- **A hard `critical AND OPEN == 0` invariant.** It held — and was satisfiable by *demotion*:
  build-blocking assumptions went 7/39 → 0/50. Closure is not coverage.
- **A claim↔locator consistency sweep.** Did not fix the miss it was designed for and cost two
  items elsewhere.
- **A coarse dimension sweep to seed questions.** Its only two products in one arm were two of that
  arm's four hallucinations.
What DID pay, and is therefore above: measurement validity (+7.2pp), named-gap registration
(+15…+38pp), and the elimination of self-report inflation.
