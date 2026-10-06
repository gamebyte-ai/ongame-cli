---
name: mascot-video
description: Make a game's character perform on its menus and cards (a wave in the lobby, a cheer on the win card) with forge image-to-video from one idle still on a green screen, keyed and packed into WebP atlases the game plays. Use when a character on a non-gameplay screen should move, or the user asks for the mascot to be animated.
---

Players and the user read a video performance as alive where key poses and tweens read as a puppet: the whole body
moves together (crouch, jump, open mouth, cloth). It worked in four games (Loop Unlock, Castle Crash, Pixel Munch,
Outpost Clash). This is the procedure that shipped there, with what failed on the way.

**Use it** for a character on a screen that is not gameplay: the lobby, a win or fail card, a loading screen.
**Do not use it** for anything drawn over gameplay or a HUD at small size; a `sprite` clip (`spriteParams.mode:"clip"`)
is lighter there. A screen with no character needs none.

## Two ways, pick one

- **Green screen (default):** the still is the character alone on flat green; the clip is keyed to transparency and
  packed by `pack.py`. The same frames then sit on any screen, over any background, and can be moved or scaled.
- **Screen region:** forge's own `video` path. Crop the region of a drawn screen (character AND background) and the
  clip plays back into that same rectangle; nothing is keyed. Simpler, but the clip only fits that one screen, and
  the screen behind it must never change. Use it when the character appears in exactly one fixed place.

## The standard set

| Clip | Where | Programme |
|---|---|---|
| idle still | everywhere the character stands | held between clips |
| `wave` (greet) | lobby | wave, hold 2.5 s, signature move, hold 3.5 s, repeat; a tap cues `cheer` |
| `cheer` | win / level complete card | cheer at once, hold **0.4 s**, then the signature move |
| a signature move | lobby + win card | what this character does (fire a cannon, salute, think) |
| `oops` (optional) | fail card | once |

Keep the hold after the cheer short: in Castle Crash a 1.4 s hold meant the user pressed Continue and never saw the
second move. Three clips is the usual first set; each is billed per second, so add more only for a screen that needs it.

## 1. The still

Generate it from the character's existing art (`forge_request` `kind:"2d-static"`, `editOf` the reference), on flat
pure green RGB (0,177,64), in the idle pose, **small in the frame**: about 55% of the height, centred, with a lot of
empty space above the head and to both sides for a jump or a raised arm. A tight still is the most common failure: the
crown or the arm leaves the frame mid-jump and the clip is unusable. If the character itself has green in it, tell the
user; `pack.py` keys green and would cut those parts out.

Show the still to the user before spending on video. Upload it with `reference_upload` (or use the `meta.assetId`
forge returned); call `forge_reference` without `gameId` if the game has no open build, it refuses one with
`unknown_game`.

## 2. The video, one at a time

```
forge_request({ kind: "video", aspectRatio: <the still's>, editOf: <still assetId>, gameId,
  prompt, videoParams: { durationSec: 3, resolution: "480p", loop: true, audio: false, negativePrompt } })
```

- **prompt:** who + the action in beats + style + camera. E.g. "The chubby penguin king in the red cape: a small
  anticipation dip, then jumps with both wings up and the crown bouncing, then settles back exactly into its starting
  standing pose. Energetic, bouncy squash-and-stretch, premium 3D animated film performance. Camera completely static.
  The background stays perfectly flat solid green, unchanged." Energetic or cartoon wording moves; "natural" barely
  moved and the user picked none of those takes (Loop Unlock, three moves).
- **negativePrompt:** "camera movement, zoom, shadows on background, background change, extra characters, new objects,
  text, logo, morphing, flicker, green reflections on the character, changing outfit colours, character leaving frame".
- **480p, 3 s.** In Castle Crash a 720p wave timed out and never arrived; the same wave at 480p arrived in 3.5 min.
  Forge may return a larger frame than asked anyway (1440 px for 480p), and the pack is far smaller than either. A sad or quiet move needs a stronger prompt, not a longer clip.
- **One request at a time.** Three sent in parallel: in Outpost Clash all three timed out, in Castle Crash one did.
  The same three sent one after another each arrived in 90-110 s.

**When the call times out** (`/mcp request exceeded 240000ms`): the client gave up, forge did not. The clip often
lands in the library a few minutes later and is likely billed. Do not send it again. Wait 3-5 minutes, then
`asset_library_list({ gameId })`, and fetch it with `asset_library_get` if it is there. Only a response with
`spent:false` (`provider_auth`, `limitReached`) proves nothing was charged. If it is still missing after ~10 minutes,
tell the user and let them decide on a second attempt; do not loop. (`forge_generate_async` does not take `video`
yet, so there is no polled path.)

## 3. Check the takes

`pack.py` sits next to this file (python3 with numpy + Pillow, and ffmpeg):

```sh
python3 <this skill's dir>/pack.py --check cheer=assets/mascot/cheer.mp4 wave=assets/mascot/wave.mp4
```

Exit 1 names the take and why. Each check was calibrated on 8 takes the user kept and 2 that were thrown out:

- **"stand still":** more than 60% of frames barely change. Kept takes were 14-43%, the rejected sad take 71%.
  Regenerate with bigger beats in the prompt.
- **"frame edge":** the character touches the border in more than 5% of frames. Regenerate from a wider still.
- **"not a flat green screen":** the background did not key out (a screen-region clip, or the screen drifted).

Passing is not liking it. Show every take to the user (a page or a contact sheet with the clips on the game's real
background) and let them choose; in Loop Unlock they picked a different style per move.

## 4. Pack

```sh
python3 <this skill's dir>/pack.py --out public/assets/mascot --name hero --height 400 \
  cheer=assets/mascot/cheer.mp4 wave=assets/mascot/wave.mp4 fire=assets/mascot/fire.mp4
```

It keys every frame, crops all clips to one shared box (the feet never move), trims the idle lead-in and settle, and
writes `hero_idle.webp`, `hero_<clip>_<page>.webp` (2048 px pages) and `hero-clips.json`. The first clip supplies
the idle still, so list a clip that starts cleanly on the idle pose first. `--height` is about 1.5x the CSS height
the character is drawn at. It prints the GPU memory each clip takes while loaded; keep a clip under ~50 MB (lower
`--height` if not). Castle Crash's three clips came to 2.1 MB of WebP from 2-12 MB of video each. Keep the source
mp4s out of `public/`.

## 5. Play

`player.pixi.ts` next to this file is the player that shipped (Pixi v8). For another engine keep its rules:

- **The still sits under the video**, anchored at `(cx/fw, feet/fh)` and scaled by `height / (feet - top)`. The clip
  starts on the still's pose and the last 0.2 s fade the frame out over it, so nothing jumps or dims.
- **Frames run on the game clock** (paused game = paused character), a long frame skips at most one step.
- **One clip in memory.** Loading the next frees the last; stop drawing a clip before its pages are freed.
- **Preload** the win card's clip on the win, not when the card opens; the lobby's first clip at boot.
- `act` (seconds) is when the action is over: start coins, confetti or the next button on it, not on the clip's end.
- If a page fails to load, the still stays on screen and the game goes on.

## 6. Prove it

On the built page, not the dev server: screenshot the lobby and the win card while a clip plays (mid-action and after
it) and check the character's edges against the real background for a green fringe, the feet staying put, and 0
console errors. Report which clips shipped, which were thrown out and why, and any take still pending in the library.
