---
name: assets
description: Asset generation phase — full asset manifest from GAME_DESIGN.md, consistent art direction, real forge generation (not gray-box), and integration into game code.
---
# Assets Phase (production)

This phase generates the game's **visual identity**: in a single consistent art direction, it
prints ALL the visuals required by GAME_DESIGN.md with **real forge** and wires them into the
game code. Output: a game that renders with real textures instead of gray-box and speaks a
single language.

> You are an **asset-direction** expert. The task is not to print individual visuals one by
> one; it is to establish a **consistent art-direction**, bring all assets into that language,
> and wire them in code with real paths.

> **GRAYBOX-FIRST — you run AFTER `code`.** By the time this phase starts, the `code`
> phase has produced a fully-PLAYABLE graybox game (placeholder `PIXI.Graphics`/`PIXI.Text`). You are the **"dress"**
> step: you author `src/assets.ts`, generate the real art in one art-direction, and SWAP the gray-box shapes for real
> sprites WITHOUT changing the mechanic. The game already plays — you make it look published.

> **Automatic visual review (best-effort, not guaranteed):** an `assets_materialize` call is normally reviewed by the
> quality jury against the generated image(s) themselves (visual quality / style coherence / readability) — no extra
> call needed on your part. If it surfaces something, you'll see it as context after the call; verify each point
> (valid + on-context) before regenerating, and relay both what's working and what to fix to the user in your own
> voice. **But silence is NOT a pass.** The review only runs when the build is entitled to it AND the images actually
> landed where the reviewer reads — the directory you materialized into. It stays silent (never an error) when the
> tier isn't entitled, when nothing image-shaped was written, or on any transport failure. So if you get no jury
> context back, treat these assets as **unreviewed**, judge them yourself, and say so plainly — never report them as
> jury-approved.

---

## 0. Start

`trace_emit(buildId, name="phase.assets.start")` (ongame). Thread the **`buildId`** (captured
from `state_init`'s return) into all orchestration/secret tool calls on **ongame**
(`forge_request`, `sound_request`, `telemetry_provision`, `brain_*`, `trace_emit`, `state_*`). The
**ongame** tools that write to disk (`assets_materialize`, `telemetry_inject`, `preview_*`)
take an **explicit `gameDir`** (no ambient cwd).

**Live prompt:** call `prompt_get({ phase: 'assets' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.

---

## 1. Extract the FULL asset manifest (GAME_DESIGN.md anchor)

Read `docs/GAME_DESIGN.md`. Write down EVERY visual the game needs. Manifest = a single table;
each row is an asset. **Do not skip any visual** — screens, HUD, entities, menu.

Scan the categories (drop the ones that do not apply based on the game's genre):

| Layer | Typical assets |
| --- | --- |
| **UI** | button (idle/hover/pressed/disabled variants), panel/dialog frame, icon (sound/settings/pause/restart/close), badge, progress fill |
| **HUD** | score/health/timer frames, multiplier badge, coin/token icon, heart/life icon |
| **Gameplay** | tile/gem types (each type separate), character/char sprites, enemy, collectible item, effect visual |
| **Background (bg)** | play-area floor, parallax layers, board frame |
| **Menu visuals** | title/logo, main-menu background, splash, gameover panel, button tray |

Each row should carry these columns: **`id`** (stable, kebab-case — `btn-play`, `tile-gem-red`,
`bg-board`), **layer**, **role/meaning**, **`kind`** (see below), **desired ratio** (conceptual:
square/horizontal/vertical), **variant group** (if any — e.g. `btn-*`, 3-4 buttons in the same
language).

> **Manifest = approval-gate point.** Before starting generation, show the user a brief summary
> of the manifest (how many assets, which groups). The approved manifest determines the forge
> budget; do not do unnecessary generation (Pareto: generate the visuals the game actually
> renders).

> **Building the manifest from a CONCEPT IMAGE instead of text?** (a user-supplied reference, a
> concept-phase visual, a screenshot to match.) Splitting a picture has two failure modes that cost
> real money and are easy to walk into: **one asset per visible object** (twenty-six soldiers become
> twenty-six assets rather than three types plus a placement table), and **a shared frame baked into
> every item** (six inventory cards instead of one reusable frame plus six icons — so a seventh item
> needs a whole new card). If either shape is in the picture, call
> `knowledge_get({ key: 'pattern:concept-deconstruction' })` and follow it: it carries the
> type/instance manifest shape, when to redraw an asset versus cut it out, the deterministic check
> that catches a silently-bad extraction, and the rule that the model decides *what* while code
> measures *where*.

---

## 2. CONSISTENT art direction — shared art-direction prefix

The main lever for consistency is **prompt engineering**: establish a SINGLE **art-direction
prefix prompt** and append it **verbatim** to the prompt of EVERY asset in the manifest. Forge
v1 generates stateless (each call independent) — this shared prefix is the guarantee of a
single language.

Derive the prefix from GAME_DESIGN's tone and freeze it. It MUST include these three axes:

- **Style:** art direction (e.g. "flat vector, soft rounded shapes, thick clean outline, mobile
  casual game UI" / "pixel-art 32px" / "hand-painted storybook"). A single style — do not mix.
- **Palette:** a limited, named color palette (e.g. "palette: warm coral #FF6B6B, teal #4ECDC4,
  cream #FFF3E0, deep navy #1A2238"). The same colors should recur in every asset.
- **Light:** light/shadow language (e.g. "soft top-down light, subtle long drop shadow, no harsh
  speculars, flat ambient").

Also a consistency-discipline: a single background rule ("transparent background, single centered
subject, no text, no border padding"), a single perspective, a single line-weight. Write this
prefix at the top of the manifest as **`ART_PREFIX`**; each `prompt` = `ART_PREFIX + ", " +
asset-specific description`.

---

## 3. REAL forge generation for each asset

Generation is a **two-step HYBRID** (the secret stays server-side; the bytes come back in the
return, the client writes them to disk):

1. **`forge_request(spec)`** (ongame, OAuth) — if the forge service is up, it returns a **small ref
   manifest plus a `download` slot**: `{ assets: [{ kind, fileRef | bytesBase64, model, meta:{ assetId, ... },
   placeholder: false, ... }], download: { url, token } }`. Ref entries carry a sealed `fileRef` instead of
   bytes — the manifest stays ~1-2KB in context; **NO `path`, NO disk write**. If forge is unreachable, it
   automatically falls back to **gray-box fallback** (`placeholder: true`); in that case **notify**
   the user and flag it in the phase output — do not say "done" with gray-box.
2. **`assets_materialize(gameDir, assets, download)`** (ongame, token-less) — hand it the `assets`
   array AND the `download` slot from step 1 (the slot's token lives **15 min** — materialize promptly; it is
   required to pull `fileRef` entries, inline-only manifests need none). It writes the bytes to disk and
   **returns `{ paths }`** (ref fetch failures land in `errors` — that file is skipped, you decide: regenerate
   or accept). Use those `paths` everywhere this skill says "path/outputPath" — they are the real on-disk locations.

`spec` fields (plugin AssetSpec): `{ kind, prompt, batch?, editOf?, transparent?, maxDim?, threeDParams?, spriteParams?, description?, gameId? }`
(no `gameDir` — `forge_request` does not touch disk).

> **`gameId` (optional) — tag this generation for later game-scoped recall.** Pass the current game's slug
> (the same identifier used elsewhere for this build) so the asset is later findable in ONE call via
> `asset_library_list({ gameId })` — "what did I make/use for this game" instead of listing the whole tenant
> library and filtering yourself. Same field on `sound_request`; for the async path (`forge_generate_async`/
> `forge_rig`) pass it to `asset_job_status` when you POLL, not at submit — you already know the game at poll
> time, and forge itself never needs to carry it. Purely a correlation key; omit it if there's no game context
> yet (e.g. a standalone reference generation).

> **Size/weight (automatic + optional):** forge automatically web-optimizes EVERY raster output
> (PNG palette quantization + compression — 70-85% reduction in game art, visual quality preserved).
> You do NOT need to do anything for this. **`maxDim?`** (px) is optional and is an agent judgment: it
> crops the asset's maximum edge (NEVER enlarges). Small icon/gem → ~256, button/UI/logo → ~512-1024,
> **full-screen background → DO NOT pass** (keep full resolution). Defends against 4K fal output + crops
> the unnecessarily large asset. If not passed, size is preserved and only the palette is optimized.
> Ignored for 3D/char.

- **`kind`** — YOU judge which kind:
  - **`2d-static`** — flat 2D visual (UI/HUD/tile/bg/menu). Most assets are this.
  - **`sprite`** — animated sprite-sheet (walk/attack loop). `spriteParams` + grid prompt (below).
  - **`3d-static`** — image→GLB 3D model (prop/object, Trellis, ~1-3 min). Meaningful **ONLY in 3D games**
    (Three.js world3d); do not use in a pure 2D game. `threeDParams` + single-object prompt (or
    `editOf`=ready clean visual). Sync `forge_request` usually completes within the MCP client's own request
    timeout, but is NOT guaranteed on a slow run — the **async path (§3.5) is the recommended default**,
    especially for a production build where a silent timeout is expensive; sync stays available for a quick
    prototype-mode prop where the residual risk is acceptable. Never blind-retry a sync timeout — fall back
    to a `2d-static` placeholder for that row and flag it.
  - **`3d-char`** — a STATIC humanoid 3D character mesh (Meshy). **Rigging/animation are NOT part of this
    kind** — generate the static mesh here, then rig it as a SEPARATE step (§3.5). This kind is
    **async-only**: `forge_request`/`forge_batch` reject it with a 422 (character generation takes far too long
    for a sync call — a silent timeout would waste real spend).
    Submit via `forge_generate_async` and poll via `asset_job_status` (§3.5); never call `forge_request` for
    `3d-char`.
- **`prompt`** — `ART_PREFIX + asset description` (Step 2). English, concrete, single subject.
- **`aspectRatio?`** — `'1:1'|'16:9'|'9:16'|'4:3'|'3:4'`. Pass for non-square assets (banner 16:9,
  splash/vertical 9:16); otherwise forge falls back to 1:1. (Now a parameter — no verbal description needed in the prompt.)
- **`transparent?`** — transparent background. If true, forge applies remove-bg after generation →
  PNG with alpha. **YOU as the agent judge this** (not a rule): if an object like a logo/icon/button/UI/tile/
  sprite/character sits on top of something else in the scene → `transparent: true`.
  If you are generating a full-screen **background/scene** → `transparent: false`/empty (it should already be filled).
  Instead of saying "white background" in the prompt, use this parameter — it gives real transparency.
- **`spriteParams?`** (sprite) — `{ motion, framesPerRow, rows, fps }`. In the prompt, describe an
  **evenly-spaced NxN grid** + a **consistent character** ("4x4 sprite sheet walk cycle, 16 evenly spaced cells,
  consistent character across all frames, side view"). Put the `framesPerRow×rows` layout here
  (forge computes JSON frame coordinates from this — no physical slice). `motion`=animation name
  (walk/idle/attack), `fps`=playback speed hint. Sprites are usually `transparent: true`. **batch=1
  is mandatory** (forge rejects batch>1 sprites with an explicit error; if you want variants, make a separate
  call with a separate prompt). `editOf` is **not used** in sprite — the sheet is always generated from the prompt
  (a reference-consistent sheet is a later slice).
  > **Transparency cleanliness:** if `transparent:true`, request a **FLAT SINGLE-COLOR background** in the prompt (e.g.
  > "on a solid flat magenta background, no gradients"). remove-bg processes the whole sheet; a variable/gradient
  > background leaves fringe (halo) between cells — a flat single color gives cleaner alpha. (A per-frame
  > remove-bg pipeline is an advanced sprite-quality slice.)
- **`threeDParams?`** (3d-static) — `{ resolution, decimationTarget, textureSize, remesh, seed }`.
  Web/mobile defaults are safe (decimation ~30k); increase for a hero/close-up object. The prompt should
  describe a **single object + clean/simple background** (Trellis first generates a 2D base, then converts to GLB).
  If you have a ready clean visual on hand, make it directly the 3D source with `editOf=<path>` (skips 2D base generation).
- **`normalize?`** (every 3D kind — **use it**) — `{ class, targetHeightMeters? }`. Without it a generated GLB
  arrives in whatever space its source model happened to use (a cm-scaled, Z-up armature is common), and the game
  ends up carrying per-model `scale.set(0.01)` / `position.y` hacks — the exact debt this exists to remove. With it
  the asset comes back **canonical: 1u=1m, base resting on y=0, centered on XZ**, so scene code can place it with no
  correction. **`class`** is your judgment about what the thing IS: `character` / `creature` scale to
  **`targetHeightMeters`**, which YOU supply from the game's own scale profile in GAME_DESIGN.md (a hero is not
  universally 1.7m — an ARPG hero, a chess piece and a kaiju are all `character`); `prop` / `structure` /
  `attachment` are **never rescaled** (at 1u=1m their real size is already the answer) and are only grounded +
  centered. Same field, same meaning on the async path — but you pass it to **`asset_job_status` when you POLL**
  (normalization happens at delivery), not at submit. Fail-soft: a model that cannot be measured confidently ships
  **untouched with a `warnings` entry** rather than being scaled by a number nobody trusts — read the warnings.
- **`charParams?`** (3d-char, STATIC MESH ONLY) — `{ targetPolycount, pbr, poseMode, enableSafetyChecker }`.
  Rigging/animation are NOT here — they're `forge_rig`'s params (§3.5). `poseMode: 't-pose'` still
  matters at generate time (cleaner base mesh for the rig step to work from): in the prompt, **exact T-pose**
  (arms straight out to the sides), **isolated single humanoid, no floor/no shadow** + **`transparent: true`**.
  `enableSafetyChecker: false` may be set when you judge the content filter to be a false positive on
  legitimate game content (e.g. zombies/monsters/villains); use judgment, don't flip it as a blanket default.

### 3.5 Async 3D + rigging — `forge_generate_async` → `asset_job_status` → (optional) `forge_rig` → `asset_job_status`

Both 3D kinds are submit-only through this path — nothing blocks, nothing bills until a poll actually delivers
the asset (a job you never poll again costs nothing, per the tool's own contract):

1. **Submit generation:** `forge_generate_async({ kind: '3d-static'|'3d-char', prompt, gameId: <slug>, ... })` →
   `{ jobRef, status:'queued', kind }` immediately. Pass `gameId` at SUBMIT too — it is sealed into the jobRef so
   the spend is attributed to this game when the completing poll meters it (build-record telemetry).
2. **Poll:** `asset_job_status({ jobRef, gameId? })` → `{status:'queued'}` or `{status:'in_progress'}` (check back
   later, your judgment on cadence — there's no fixed interval enforced) or, once done, `{status:'completed',
   assets:[...], download}` (hand straight to `assets_materialize`, same as `forge_request`'s success shape) or
   `{status:'failed', reason, spent:false, retryable, detail?}`. Do NOT poll a `jobRef` again after a
   `completed`/`failed` response — both are terminal. Pass `gameId` at the poll TOO — the poll-time value tags
   the delivered asset for game-scoped `asset_library_list` recall (the submit-time value covers spend
   attribution; they serve different sinks) — see §3's gameId note.
3. **Rigging (3d-char only, optional):** once the static mesh's `asset_job_status` call reports `completed`,
   take that asset's `meta.assetId` and call `forge_rig({ modelRef: <that assetId>, heightMeters? })` →
   another `{jobRef, status:'queued'}` — poll it the SAME way via `asset_job_status`. Rigging is a separate job
   from generation, not a flag on step 1.
   - **Rig-only** — no animation is produced; there is no `animation`/`animationActionId` param.
     `heightMeters` is optional metadata only.
   - The rig pipeline assumes a **T-pose HUMANOID input** (matching `charParams.poseMode:'t-pose'` above) — a
     non-humanoid or non-T-pose mesh will make the rig job fail (check `asset_job_status`'s failure `detail`).
   - There is no `enableSafetyChecker` on `forge_rig`; the generation-time one on `charParams` above is
     unrelated and unchanged.
4. **Never blind-retry a `retryable:false` job** — same discipline as every other forge tool's labelled
   response.

Flow — **parallelism belongs to the `forge_batch` tool, NEVER to parallel agents** (one writer per gameDir):

1. Generate the ANCHOR row first with a single `forge_request` (§4) → its `meta.assetId`.
2. Put the manifest's remaining **2d-static/sprite** rows into **ONE `forge_batch({ specs:[...] })` call**
   (up to 16 specs; each spec = `ART_PREFIX + row description` + `editOf=<anchor assetId>` where the row belongs
   to the anchored language). The server fans the slice out in parallel — one call, whole manifest slice.
3. `forge_batch` returns `{ results:[{ok, kind, assets?|error}], download }` aligned with your specs order:
   flatten the `ok` assets → `assets_materialize(gameDir, assets, download)` → map paths back to rows as
   **`outputPath`**. For `ok:false` slots, read the `error`, fix that spec (prompt/params) and re-request JUST
   those rows (another small `forge_batch` or single `forge_request`) — never regenerate the whole slice.
4. **3D rows are NOT batchable** (`forge_batch` rejects both `3d-static`/`3d-char` — even Trellis's ~3 min run
   would blow the batch's own time budget) → request each singly, sequentially. `3d-static` may go via sync
   `forge_request` (accepting the residual risk) or the async path (§3.5, recommended). `3d-char` is
   **async-only** (§3.5) — `forge_request`/`forge_batch` reject it with a 422; submit via `forge_generate_async`
   and poll via `asset_job_status`, then `forge_rig` for rigging.

Flag rows whose asset returns `placeholder: true` separately (forge was absent / kind out of v1 scope).

---

## 4. Consistency — the `editOf` chain (**assetId**, DEFAULT for every related set)

Consistency is enforced **structurally**, not only by prompt: every related visual is **DERIVED from an anchor**,
never generated as an independent prompt (independent prompts yield unrelated-looking images).

1. Generate the group's **anchor** first (its most representative member, e.g. `btn-play`) —
   `forge_request` → the returned asset's **`meta.assetId`** (an opaque `asset:...` handle) is the group's style anchor.
   (Materialize as usual; the assetId comes from the `forge_request` return, not from disk.)
2. Request every other member with **`spec.editOf = <that assetId>`**; in the prompt describe only the **difference**
   ("same button frame and palette as the reference, replace glyph with a pause icon").
3. Apply this within a variant group (`btn-*`, `tile-gem-*`) AND across the whole manifest when the game has one
   dominant look (anchor = the most representative gameplay visual).

> **What `editOf` accepts:** an **`assetId`** from a previous `forge_request` result or a `reference_upload`
> (**works with REMOTE forge — this is the product path, always prefer it**), a public http(s) URL, or a
> forge-server-local file path (dev-only convenience — a customer's forge cannot read their disk).
> assetIds are tenant-bound and expire (~24h): mint what you need in-session, don't hoard them across days.
> The shared **`ART_PREFIX`** (§2) still goes into every prompt — chain + prefix together give the single language.
> **Check outputs by eye**; for a member that deviates, tighten the difference-prompt and reprint.

> **Multi-reference combine (`editOf` as an ARRAY):** `editOf` also takes an array of up to **14** references
> (the edit model's documented limit — exceeding it is a loud schema error, nothing is silently dropped;
> order is preserved and each entry may be any accepted form above, mixed freely). Use it when the result must
> genuinely COMBINE sources — "this character in this scene's palette", "merge these two props into one" — and
> say in the prompt what each reference contributes. A single-anchor chain (one assetId) is still the DEFAULT
> for ordinary set-consistency; reach for multi-reference when one anchor cannot express the ask. **3D kinds
> take exactly ONE reference** (image-to-3d has a single source) — to drive 3D from several references, combine
> them with a 2D edit first, then pass THAT result's assetId as the 3D `editOf`.

> **EXTRACTION/ISOLATION silently returns MORE than you asked — count, don't eyeball.** When you use `editOf` to
> pull ONE element out of a busy image ("isolate only the barrel, remove every other object"), the model can hand
> back the WHOLE SCENE re-laid-out as a tidy asset sheet — flat backdrop, clean silhouettes, nothing in the
> response saying "I gave you everything". Measured on a real deconstruction run: **3 of 6** parts came back as
> full sheets, and all three *looked* perfect; the error was invisible until the pixels were counted. Do not accept
> an isolate on appearance:
> - **Measure the separated foreground regions, and treat the number as a TRIGGER — not a verdict.** After
>   materializing: transparent output → connected regions of the alpha mask; opaque output → flood inward from the
>   border through pixels that MATCH THE BACKDROP COLOUR (only those — flooding everything border-connected would
>   erase an unwanted object that happens to touch the frame), and the foreground is what the flood cannot reach.
>   Make the measurement reproducible by stating what you used: sample the backdrop from the four corners and
>   require them to agree (if they don't, the backdrop isn't flat — see below); compare with **max per-channel
>   absolute difference in sRGB** against a tolerance you name (~8-12/255 covers JPEG ringing without swallowing
>   art); and ignore regions under a named minimum size (a few percent of the image) so antialiasing fringes are
>   not counted. **More regions than you expected does NOT by itself prove a leak** — go LOOK at the image. The
>   leak has a distinctive signature: the extra regions are recognisably OTHER NAMED ELEMENTS of the source scene,
>   laid out side by side like a catalogue page. That is what you reject. If you want a hard accept/reject gate
>   rather than a trigger, then declare an expected **region** count or range up front — never compare a declared
>   *subject* count against a measured *region* count and call the difference a failure.
> - **Do NOT infer the expectation from the picture.** Two regions warrants a LOOK when you asked for "the barrel"
>   and warrants nothing at all when you asked for "the pillars" — the expectation lives in YOUR request, not in
>   the image, so the image can never supply it. (Measured: `pillars` really is a legitimate two-region element.)
>   Same rule as 3D normalization: state the expectation, then measure against it; never guess it back out of the
>   output — and where you have not stated one, the measurement is a prompt to inspect, not a result.
> - **Know exactly what this is and is not.** A region count APPROXIMATES a subject count; it is not the same
>   thing, and it fails in both directions: (a) touching or overlapping subjects merge into ONE region, so a leak
>   glued to the wanted object still counts as 1; (b) a single legitimate subject can be several regions — a
>   floating shield, sparks, a detached shadow — which is the other reason you DECLARE the expected count instead
>   of assuming 1. And the opaque path needs a genuinely flat backdrop: over a textured or gradient background the
>   flood stops immediately and the whole frame reads as one region, which proves nothing. When the backdrop is not
>   flat, or the count disagrees with what you can plainly see, report the asset as **unmeasured** — never as
>   verified. A clean count is evidence of "no *separated* extras", not proof of a single subject.

**User-shared reference image:** if the user shared a screenshot/artwork the game's look should follow, make IT the
anchor: copy it into `{gameDir}/assets/reference/` → `forge_reference` (ongame, mints `{uploadUrl, token}`) →
`reference_upload(gameDir, path, uploadUrl, token)` → `assetId` → use as `editOf` for the set.
**Intent decides fidelity (your judgment):** a 1:1 remake of the shared game → derive assets that MATCH the reference
exactly; otherwise → ADAPT the reference to our game's own style.

---

## 5. Batch generation — `forge_batch` (many specs) and `spec.batch` (N of one prompt)

**Many DIFFERENT assets in parallel → `forge_batch`** (§3 flow — the default for every manifest slice).
**N candidates of the SAME prompt → `spec.batch = N`** (works inside both `forge_request` and a `forge_batch` spec).

> **How it works:** forge **actually processes** `batch` — it generates N parallel visuals in a single call;
> the returned manifest's `assets` array holds **all N** entries. Pass that array (plus the `download` slot) to
> `assets_materialize(gameDir, assets, download)` → its `paths` give you each candidate on disk. Review the
> candidates, pick the most suitable or use all of them. (If forge is unreachable, the gray-box
> fallback returns a single placeholder asset.)

> **`gameId` on `forge_batch`:** each `specs[]` entry accepts its own `gameId` (§3's note) — set it on every spec
> in the slice, not just the `forge_request` anchor, or most of the manifest (generated via `forge_batch`, the
> default path) ends up untagged for `asset_library_list({gameId})` lookup.

---

## 6. Integrate the generated assets into the game code

Generating assets is not enough — **replace the gray-box refs with real paths** and make the code
load real textures. Otherwise the game still renders line-art/placeholder.

1. **Move to the serve directory:** `assets_materialize` writes to `gameDir/assets/forge/...` (its
   returned `paths`); Vite serves `public/` from the root URL. **Copy** each materialized file to
   `gameDir/public/assets/<id>.<ext>` (stable, name it with the manifest `id` → predictable URL in
   code: `/assets/<id>.png`). `public/assets/` already exists in the template.
2. **Manifest → code constant:** write the `id → '/assets/<id>.<ext>'` mapping into a single
   `src/assets.ts` map (single source; views do not embed string URLs).
3. **PixiJS v8 texture load:** load assets before drawing —
   `await PIXI.Assets.load(url)` returns a `Texture`; place it on screen with `new PIXI.Sprite(texture)`.
   If a screen has many assets, load them all at once with `PIXI.Assets.load([...urls])` (once at boot),
   then get them with `PIXI.Assets.get(url)`. In gamelabs.js views (`ScreenView`)
   `addChild` the `Sprite`; **replace** the existing `PIXI.Graphics`/`PIXI.Text` gray-box drawings with these
   sprites.
4. **Gray-box cleanup:** replace the remaining placeholder drawings in code (colored rectangle/circle) and
   `assets/placeholder`/`assets/forge` references with real `/assets/...` URLs;
   leave no dead code (no tech-debt).
5. **Sprite (atlas) load:** for the sprite kind, the forge manifest returns a multi-file asset (the
   atlas PNG + the JSON) and `assets_materialize` writes both → its `paths` include the **JSON** and
   the sibling PNG. **Keep both in the same directory (sibling)** when you copy to `public/assets/` —
   the JSON's `meta.image` field references the PNG by file-name; if you put them in separate directories it breaks
   (write them with the same names). Load: `await PIXI.Assets.load('/assets/<sheet>.json')` (automatically pulls the PNG)
   → `const sheet = new PIXI.Spritesheet(tex, data); await sheet.parse();`
   → `const anim = new PIXI.AnimatedSprite(sheet.animations['<motion>']); anim.animationSpeed = fps/60; anim.play();`.
6. **3D (GLB) load — ONLY 3D game:** 3d-static/3d-char `path` = **`.glb`**. gamelabs `AssetManager.load(
   AssetTypes.GLTF, id, url)` → `GLTFLoader.loadAsync` → `{ scene, animations }`; `world.add(getAsset(id).scene)`
   (into the Three.js world3d scene). Do not use GLB in a pure 2D game (do not generate 3d-static/char in the first place).
   - **3d-char animation:** the GLB carries `.animations[]` → `const mixer = new THREE.AnimationMixer(scene);
     mixer.clipAction(animations[0]).play();` and `mixer.update(dt)` every frame. (gamelabs has no ready anim helper
     — Three.js AnimationMixer by hand.)
   - **Read `measurements` before placing — do not scale/position a GLB blind.** `assets_materialize`'s result carries
     `measurements`, an array INDEX-ALIGNED with its `paths` (undefined for a non-GLB entry) — for GLB assets
     (3d-static/3d-char/rig) each is `{bbox, size, groundOffsetY, centerXZ, meshCount, rigged, confidence}`, computed
     server-side from the mesh geometry (MESH-ONLY bounds — a rigged model's bone/joint nodes are deliberately
     excluded, so it reflects the visible mesh, not an inflated skeleton box). Read `measurements[i]` for `paths[i]`
     (a batch>1 3D request yields one per model, not just the first) instead of guessing a `scale`/position:
     - `size` tells you the model's real dimensions (in its own units) — pick a scale factor from the game's actual
       unit scale (e.g. "this character should read as ~1.8 world-units tall") instead of a blind `setScalar(N)`.
     - `groundOffsetY` is the Y offset that rests the model's own bbox on `y=0` — add it (times your chosen scale)
       to a placed instance's Y so it sits ON the ground/floor instead of floating or sinking into it.
     - `centerXZ` lets you center the model under its own origin on the X/Z plane, if its authored origin is off-center.
     - **`confidence:"low"`** (no mesh found / degenerate bounds — rare, but check `note`) means treat the numbers as
       a hint, not ground truth — fall back to judging placement by eye in the browser check (§7) instead.

> **DO NOT DELETE** the `#stage .layer` (world3d/hud2d) overlay CSS in `index.html` — black-screen
> bug.

---

## 7. Verify

- `npx tsc --noEmit` **clean** (leave no integration TS error).
- `preview_start(gameDir)` → confirm by eye in the browser whether the real textures appear and whether there are missing/404 assets
  (console). Evidence → claim; look yourself before saying "done".
- For a missing/deviating asset, fix the prompt and reprint; each row's `outputPath` in the manifest
  should be either real (`placeholder: false`) or deliberately flagged "out-of-v1 / forge was absent".
- **Deterministic sub-score (`assets_ok`):** right after materialize + verify, emit the objective result —
  `brain_score(gameId=<slug>, phase="assets", name="assets_ok", value=<1 if every requested asset is written (each manifest row has a real outputPath) AND tsc is clean else 0>, buildId=<buildId>, comment="<N written / M requested, tsc result>")`
  (ongame). Judge-independent backbone, distinct from the gate's self-judged `phase_quality`. Fail-soft: a failed
  `brain_score` NEVER blocks the build; no-op if `buildId`/brain is absent.

---

## 8. Finish

First emit the **phase-output generation** (context→artifact replay; nests as a `kind:generation`
under the phase span — in Langfuse one reads, per phase, "what context went in → what came out →
what was decided and WHY"). ONE high-signal emit (the phase's headline decision), BEFORE `state_advance`:

```
trace_emit(buildId, name="phase.output", payload={
  input:  <the CONTEXT this phase consumed: the brain_recall art/asset signal(s) used, the
           knowledge_get key(s) (e.g. forge/asset-direction patterns), and the GAME_DESIGN.md
           tone + the approved asset manifest (count + variant groups) that anchored generation>,
  output: <the ARTIFACT produced: assets generated for real (count) vs gray-box fallback (count),
           the files written (public/assets/<id>.* + src/assets.ts map), and the tsc-clean +
           preview verification result>,
  metadata: {
    decision: <the MAIN choice: the ART_PREFIX (style + palette + light axes) and per-asset
               kind judgments (2d-static / sprite / 3d-static / 3d-char)>,
    why:      <the RATIONALE, explicitly citing what drove it: the brain_recall retention/style
               signal, the knowledge asset-direction patterns, and the GAME_DESIGN tone + user
               intent that selected this single art language and these kinds>
  }
}) (no-op if buildId is absent).
```

Then `state_advance(buildId)` + `trace_emit(buildId, name="phase.assets.done")` (both ongame; in the
payload: number of real assets generated, number that fell back to gray-box, art-direction prefix
summary).

> **Correction-learning:** if this phase is re-running because the user **corrected** the art (rejected the
> style/palette, asked to regenerate "again", redirected the art direction, or hand-swapped an asset), call
> `friction_report(buildId, gameId, phase="assets", kind, agentDid, userWanted, evidence?)` (bare name via
> ToolSearch) with the DELTA — what art direction you assumed vs what the user actually wanted (e.g. "assumed bright flat
> vector → user wanted muted hand-painted"). Report the user-correction delta, NOT a self-summary of the assets you
> generated. Agentic (you judge if it's a real correction); fail-soft (never block). See `/make-game`'s
> correction-learning block.
