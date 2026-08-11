---
name: audio
description: Audio phase — extract the sound manifest from GAME_DESIGN, generate via the sound_request tool, wire into the gamelabs.js AudioService.
---
# Audio Phase (vision phase 6 — production)

Goal: complete the game's **feel** with sound. UI clicks, match/cascade pops, win/lose
stingers, and looped music. Sound is an **optional layer**: if forge is absent or a piece
cannot be generated, the game stays **silent but fully playable** (gray-box parity — the same
discipline as the assets phase). The sound toggle in Settings controls only the audio output,
not the gameplay.

1. `trace_emit({buildId, name:"phase.audio.start"})` [ongame] (find via ToolSearch by the
   bare name `trace_emit`). The `buildId` was captured from `state_init`'s return and is threaded by
   the orchestrator; phase-span nesting is server-side.

   **Live prompt:** call `prompt_get({ phase: 'audio' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
> **An override never authorises substituting for a tool that did not run.** Whatever the live prompt says, if an
> ongame tool this phase depends on is ABSENT, erroring, or unreachable — as opposed to answering `gated`, which is
> the product working as designed and is not a fault — do NOT quietly do that part yourself from general knowledge.
> Stop, say plainly which tool failed and that you are blocked, and let the user decide whether to continue without
> ongame. A silent substitution produces something that looks like an ongame output and is not one; the user then
> judges the product by it and no one can explain the result, because nothing recorded that the capability was never
> in the room. Report the gap up to the orchestrator so the final summary names it. See the refusal rule in
> `/make-game` for the full reasoning.


## 2. Sound manifest (from GAME_DESIGN.md)
Read `docs/GAME_DESIGN.md`, generate the **sound manifest** based on the game's core loop. Manifest =
an array of `{ id, role, kind, text, durationSeconds?, loop }` (write to `audio/manifest.json` — the anchor for the
code phase and tests). Each row carries an `id` (kebab-case, becomes the file name) and a `text`
(the English sound-description prompt that goes to forge).

Canonical roles — skip if not in the design, add if present (this list is a baseline; extend based on the design genre):

| id | role | kind | loop | example text |
|----|------|------|------|------------|
| `ui-click` | UI button click | sfx | no | "short crisp UI button click, soft tactile tick" |
| `ui-hover` | UI hover/focus | sfx | no | "very subtle UI hover blip, light and quiet" |
| `select` | piece/cell selection | sfx | no | "gentle bubble select pop" |
| `match` | match/clear | sfx | no | "satisfying match pop with a sparkle tail" |
| `cascade` | chain/combo (rising pitch) | sfx | no | "rising chained chime, ascending pitch combo" |
| `win` | win stinger | sfx | no | "triumphant short win stinger, bright fanfare" |
| `lose` | lose stinger | sfx | no | "soft descending lose stinger, gentle fail tone" |
| `music` | background music / ambient | music | **yes** | "calm loopable background music bed, seamless loop" |

- **UI**: at minimum `ui-click`; if the design has hover/focus feedback, `ui-hover`.
- **Gameplay**: map to the design's core verb — `select`, `match`, `cascade`, and
  `win`/`lose` stinger for the win/lose screens. (In a non-match-3 genre, `match`→
  the game's "score/reward" moment, `cascade`→corresponds to the combo; the role name is fixed, the text per genre.)
- **Ambient/music**: a full `music` piece, **`loop: true`**. `durationSeconds` ≈ 8–12
  (keep it short for a seamless loop; 0.5–22 is the valid range).
- SFX are short (`durationSeconds` ≈ 0.4–1.5) — a long SFX delays the feel.

## 3. Generation via the `sound_request` tool
The client has **no `FORGE_URL` and no token** — sound is generated through the **`sound_request`** tool
[ongame] (find via ToolSearch by the bare name `sound_request`). It mirrors the hybrid two-step:
`sound_request` returns the finished **bytes manifest** (no path, no disk write), then `assets_materialize`
[ongame] writes them to disk.

- Call **`sound_request({ text, durationSeconds?, loop?, description?, gameId? })`** per manifest row (`text` =
  the row's `text` field — the sound-description prompt; simple, sequential — batch reliability is the server's
  job). `description?` is an optional short library label (else `text` is used). `gameId?` tags this sound for
  the current game — pass it so it's later findable in one call via `asset_library_list({ gameId })`, same field
  as `forge_request`/`forge_batch` in the assets phase.
- It returns a **small ref manifest plus a `download` slot**: `{ assets:[{ kind, fileRef | bytesBase64, ... }],
  download:{ url, token } }` — ref entries carry a sealed `fileRef` instead of bytes (context stays tiny; the
  URL/key never reaches the client). Pass BOTH (`assets` + `download`) to `assets_materialize` — the download
  token lives **15 min**, so materialize promptly (when collecting several calls first, pass the FRESHEST
  `download` slot; one valid slot resolves all of the same tenant's refs).

**Fallback — if the tool is absent / a piece cannot be generated (gray-box parity):** if the
`sound_request` call errors or returns no asset, mark that piece as a **silent placeholder** and **skip**
it — in the manifest `silent: true`, do not write a file. When the game calls this id with
`playSfx`/`playMusic`, AssetManager cannot load that id → `playSfx` returns a no-op (does not play empty
sound, does not throw). Result: even if generation is unavailable, the game is **silent but fully
playable**. Track the generated/skipped counts to report in the `phase.audio.done` trace (Step 6).

## 4. Materialize + wiring the gamelabs.js AudioService
Collect the per-piece `assets` in **manifest order** (skipping the silent ones — keep a parallel list of
the same non-silent `id`s) and call **`assets_materialize(gameDir, assets, download)`** [ongame] (find via
ToolSearch by the bare name `assets_materialize`; `download` = the freshest sound_request's slot, needed to pull
`fileRef` entries) — it decodes/pulls the bytes and writes each sound under
`gameDir/assets/forge/` (named `sound-<hash>.mp3`), returning **`{ paths }` in the same input order**.
**Zip** the returned `paths` back to your non-silent `id` list (index-by-index) to build the
`id → assetPath` map, and use **those returned paths** when wiring load — do NOT assume a path named
after the `id`. Write the manifest (with the silent flags + the resolved `path` per piece) to
`gameDir/audio/manifest.json`.

Wire the game to sound — with gamelabs.js's **real AudioService** API (no fabrication):

- **Load** — in the App's `loadAssets()` override, every **non-silent** piece in the manifest, using the
  `id → path` map from materialize (the path is `assets/forge/sound-<hash>.mp3`, NOT `audio/<id>.mp3`):
  ```ts
  protected override loadAssets(): void {
    // assetId stays the manifest id; the file path is the materialized path from the id→path map
    this.assetManager.load(AssetTypes.Audio, 'match', 'assets/forge/sound-1a2b3c.mp3');
    this.assetManager.load(AssetTypes.Audio, 'ui-click', 'assets/forge/sound-4d5e6f.mp3');
    // ... all non-silent ids, each with its resolved materialized path
  }
  ```
- **Play SFX** — in the controller at the event moment (fire-and-forget): on match
  `this.audioService.playSfx('match')`, on cascade `playSfx('cascade')`, on selection
  `playSfx('select')`. **On buttons** bind to the UI event: `playSfx('ui-click')` (if hover exists,
  `playSfx('ui-hover')`).
- **Music loop** — when entering the play state `this.audioService.playMusic('music', { loop: true,
  fadeInMs: 400 })`; when returning to gameover/menu `this.audioService.stopMusic({ fadeOutMs: 300 })`.
- **win/lose stinger** — at the state machine's **gameover transition**: if won
  `playSfx('win')`, if lost `playSfx('lose')` — and `stopMusic` first (so the stinger does not
  ride on top of the music).
- **Autoplay policy** — the browser keeps the `AudioContext` `suspended` until the first user gesture.
  On the first real input (the first click/touch) call `this.audioService.resume()`; otherwise
  the music queued at boot stays silent. (The Settings audioFields bridge also calls `resume()` on
  every change — Step 5.)
- `playSfx`/`playMusic` takes the **assetId** as a parameter; an unloaded (silent/skipped) id is a no-op
  → fully compatible with the fallback, no extra null-check needed.

## 5. Settings sound toggle compatibility
Sound must be controllable via the toggles in the Settings popup. gamelabs.js's **SettingsBinding**
`audioFields: true` option registers the standard field set (`sfx`, `music`, `sfxVolume`, `musicVolume`)
and sets up the **AudioService bridge**: `sfx` toggle → `setSfxMute(!v)`, `music` toggle
→ `setMusicMute(!v)`, the volume sliders → `setSfxVolume`/`setMusicVolume`, and on every change
`audio.resume()`. In the App modules:

```ts
this.addModule(new SettingsBinding({ audioFields: true }));
```

This way sound is fully **opt-in/opt-out**: when the toggle is off, `playSfx`/`playMusic` calls
pass through a mute gain (the code is still called, no sound comes out). If Settings is not yet in the game, it stays
compatible with the polish/code phase — but the audioFields bridge is this phase's **contract**, and if it is set up the sound
toggle works. The toggle state is persistent via `storageService` (SettingsBinding default).

## 6. Verify & close
- `npx tsc --noEmit` clean (leave no audio wiring type error).
- The manifest (`audio/manifest.json`) is written, and every non-silent id resolves to a real
  materialized `.mp3` under `assets/forge/` (via `assets_materialize`'s returned `{ paths }`); the
  `load()` calls reference those resolved paths, not a guessed `audio/<id>.mp3`.
- Even when sound generation is unavailable, the game opens and plays (silent) — gray-box parity.
- **`trace_emit` the headline `phase.output`** (ONE per phase — the audio phase's main decision; nests as a Langfuse `generation` under the phase span, so the eval can read context→artifact→why). Emit it **after** the build is tsc-clean + the manifest is written, **before** `state_advance`:
  ```
  trace_emit(buildId, name="phase.output", payload={
    input:    <the CONTEXT this phase consumed — the GAME_DESIGN.md core loop / genre / core verb that the sound manifest was derived from, plus the prior-phase inputs used (the game's interactive verbs + win/lose screens that the roles map to, and whether forge/sound_request was reachable)>,
    output:   <the ARTIFACT produced — audio/manifest.json (the role list with each piece's id/role/kind/loop + silent flags + resolved assets/forge/sound-<hash>.mp3 path), the AudioService wiring written into the App (load/playSfx/playMusic/resume), generated vs skipped(silent) counts, and the tsc-clean result>,
    metadata: {
      decision: <the MAIN choice this phase made — which sound roles were included vs skipped and how they were mapped to this genre (e.g. match→score/reward moment, cascade→combo), the music loop choice, and per-piece durationSeconds (short SFX vs ~8-12s seamless music loop)>,
      why:      <the RATIONALE, explicitly citing what drove it — name the GAME_DESIGN.md core loop / core verb / genre that selected this role set (the user-intent driver), and note where gray-box fallback forced a silent skip (sound_request absent / a piece failed) so the choice was "stay silent but playable">
    }
  })
  ```
  (prompt-level replay; no-op if buildId is absent.)
- `state_advance({buildId})` [ongame] + `trace_emit({buildId, name:"phase.audio.done",
  payload:{generated:<count>, skipped:<count>}})` — fold the generated/skipped counts into the build
  trace (there is no separate telemetry call in this phase).
