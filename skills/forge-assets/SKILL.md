---
name: forge-assets
description: After forge_request, forge_batch, sound_request, forge_generate_async or forge_rig returns and before the file goes into the game — measure what came back. Catches a background painted instead of transparent, a sound that ignored its length, a 3D character not in T-pose and a rig with shifted arm joints; also how to cut 6-12 sprites from one grid sheet.
---

# Forge assets: measure what came back

A generation that reports success is a claim about the file, not a fact. The request parameters themselves are in
`skills/phases/assets/SKILL.md` §3; anchoring is `skills/asset-anchor/SKILL.md`; mascot clips are
`skills/mascot-video/SKILL.md`. This file is what to measure afterwards.

## 1. Transparency

- **Never write "transparent background" in the prompt; use `transparent: true`.** Asked for in words, 4 of 4
  images came back fully opaque with a grey-and-white checkerboard painted as pixels, which looks cut out until
  you read the alpha.
- **Check every cut-out before using it:** `node <this skill's dir>/chroma-key.mjs check <file.png>`. Exit 1
  means too little real alpha (under 5% clear, or a mostly opaque border): the background is paint.
- **When you key it yourself** (no alpha came back, or a halo you cannot keep), regenerate on a flat magenta
  plate: "solid flat #FF00FF background, one tone, no gradient, no texture, no checkerboard, no shadow on the
  background, no magenta in the subject". Then
  `node <this skill's dir>/chroma-key.mjs key <in.png> <out.png>`.
- **Key on `score = min(r, b) - g`, not on distance to magenta.** Only magenta is high in both red and blue
  and low in green: magenta scores 255, a red glint `#E85B5B` 0, a dark purple `#3A2B3F` 15, brass negative. A
  colour-distance threshold eats the reds and purples. Score ≥ 70 is transparent, ≤ 20 is kept, between is a
  soft edge, so light lavender (score 30-50) goes half-transparent: keep it out of a magenta-plated subject.
- **Despill only the magenta excess:** in kept pixels with `score > 0`, set `r = min(r, g + 20)` and
  `b = min(b, g + 20)`. Without it a dotted pink fringe stays around the subject; clipping red in every pixel
  instead turned an orange character khaki while the alpha gate still passed 26 of 26 parts.
- **Look at the keyed result on a flat colour**, not only at its alpha. Alpha checks cannot see a colour error.
- **Restate the asset's prohibitions when you move from a scene frame to separate parts.** A rule fixed once
  on the anchor ("no face", "lantern not in front") came back in the parts; name it as "this rule was broken
  once" in the part prompts.

## 2. Many sprites in one generation

When the allowance is tight, one request can carry 6-12 sprites: `transparent: true` and a prompt asking for
"a clean 3x2 grid, wide empty space between items, nothing touching". Slice per cell: mask alpha > 40, label
connected components, keep the largest component plus every component of at least 6% of its area (a detached
chain or handle stays, specks go), then grow the box by 2 px. Ten sheets gave sixty usable sprites. Fix a
colour that drifted by mapping it to the palette token, not by regenerating.

Do not trust a grid's metadata over its picture. In a review of eleven sprite atlases the common fault was a
frame grid that did not match the drawn layout (frames cut through the character, or the plate left in), not
frame jitter. Measure where the drawings are before cutting.

## 3. Sound length

`sound_request` may return a clip longer (or shorter) than `durationSeconds`: observed as of 2026-11, a 0.35 s pop
came back 8 s long with the pop repeated nine times. Check every clip: measure the returned length (`ffprobe`, and
`ffmpeg -af silencedetect=noise=-45dB:d=0.05` for where the sound really ends) before wiring it. Trimming,
levelling and loops belong to the audio phase (`skills/phases/audio`).

## 4. Video

A video request that times out at the client is often still running and billed. Follow
`skills/mascot-video/SKILL.md` ("When the call times out"): no resend, wait, then `asset_library_list`.

## 5. 3D characters and rigs

A 3D character normally arrives rigged (`skills/phases/assets/SKILL.md` §3.5). When you call `forge_rig`, or
when a delivered rig plays badly, run the checks in `references/rig-checks.md`:

Observed as of 2026-11 and not yet fixed on the server, so check every character, every time:

- **Before rigging:** width against height (`measurement.size.x` well under the height means the arms are
  down despite `poseMode: "t-pose"`), arm angle and a visible neck. A mesh out of T-pose rigs "successfully" and
  only breaks when a clip plays.
- **After rigging:** the shoulder-to-arm bone ratio, which flags arm joints placed one segment out.
- **Retargeting forge clips onto a Mixamo-rigged character:** bone names, rest-pose difference, ground lock.

Look at every rig on a bare page before blaming game code: every cast member against three clips side by side.
