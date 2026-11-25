---
name: juice
description: Before adding feedback to a game — a snap, a pop, a score tick, particles, a sound cue, screen shake, a combo effect, a game-over beat — use these timings in milliseconds, measured frame by frame from 60 fps play video of a shipped grid puzzle game. Each number says what it is for, whether it was measured or inferred, and how to scale it from a small event to a big one.
---

**Feedback is a ladder, not a volume knob.** In the measured game a routine action gets a one-frame response and
nothing else. A reward adds layers, one per step of a combo. No layer grows as the combo grows: the banner keeps
its size, the shake keeps its size, the sound keeps its loudness. Only the pitch and the score number rise, and
new layers switch on.

Use this for a new game and for a change to a finished one. The numbers come from a grid puzzle; "Other genres"
below maps them onto any game.

## How to read the numbers

- **Source:** play video at 59.92 fps, three play sessions, 343 s of play. One frame is 16.7 ms.
- **The refused move and the pick-up sound** come from more play video of the same game: 2,198 s from the same
  uploader, at 58.98 to 59.92 fps (one frame is 16.7 to 17.0 ms), with 5 refused moves.
- **Error:** every measured time is within one frame: 17 ms at 60 fps. If you check your own game at 30 fps, your
  error is 33 ms.
- **Basis:** `M, n=…` is measured, with the number of events behind it. `I` is inferred: a starting value to
  tune, never a measured fact.
- **Zero point:** times count from the frame the event happens: the frame the piece lands, or the frame the
  cleared blocks vanish.
- **Sizes** are given for a 390 px wide screen, and as a share of the screen width or of one grid cell. Scale a
  size with the screen and keep each time as it is. That rule is inferred: one screen size was measured.
- **Ranges** in brackets are the smallest and largest value seen, unless the row says otherwise.
- **"What it is for"** is a reading of the design. It was not measured.
- **Sound delays** include the recording's own sound offset, which could not be measured. The difference between
  two events does not depend on it.
- **Limits:** one player, one phone, one game version. Start from these numbers, then tune by feel.

## Tier 0: the routine action

A piece is picked up and placed, with no line cleared. The player does this every second or two.

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| Pick-up scale | from 0.43x in the tray to 1.0x in 1 frame (17 ms) | M, n=1 | The piece is in the hand at once; no wind-up |
| Pick-up sound | peaks 50 to 100 ms after the piece leaves the tray | M, n=5 | The hand hears the piece taken before it is placed |
| Snap into place | 1 frame (17 ms), no bounce | M, n=37 | Cause and effect read as one moment |
| Shake, flash, particles | none; the largest screen offset was 0.03 px | M, n=17 | Routine stays quiet, so a reward stands out |
| Score count starts | 67 to 83 ms after the snap (one at 100) | M, n=23 | The eye sees the piece land first, then the gain |
| Score count speed | +1 point every 33 ms, one point per block | M, n=21 | A bigger piece ticks longer, with no extra rule |
| Sound | starts at 90 ms; its click peaks at 195 ms (184 to 210 for 8 in 10) | M, n=36 | Confirms the placement without masking the next one |

**Scale:** no layer here gets bigger for a bigger piece. A bigger piece only makes the score count longer: 4 blocks
tick for 130 ms, 9 blocks for 300 ms.

## Tier 1: the small reward

One line is cleared and no combo is running.

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| Preview, before release | the line that would clear glows in the piece's colour while the piece hovers on the spot; seen, not timed | M, n=4 | The player sees the reward before committing to it |
| Blocks vanish | 1 frame (17 ms), no fade | M, n=35 | The result is instant; the show comes after |
| Empty beat | 67 ms with nothing on the line; the game does not freeze | M, n=11 | A breath before the show; this replaces a hit-stop |
| Beam of light along the line | on at 83 to 117 ms, lasts 67 to 83 ms, 6 px wide (14% of a cell) | M, n=7 | Draws the eye along what was cleared |
| Flash | none: the top and bottom of the screen change by at most 1.5% in the 167 ms after a clear | M, n=57 | The beam is the only flash, and it stays on its line |
| Particles, first | 167 ms (100 to 183) | M, n=13 | They follow the beam; they never cover it |
| Particles, count | 3.4 per block: 27 on the fullest frame for a line of 8 (17 to 39, and one at 82) | M, n=13 | Enough to read as a burst, few enough to stay cheap |
| Particles, life | gone at 600 ms, so about 430 ms each | M, n=7 | The grid is clean before the next placement lands |
| Particles, spread | 95% stay within 0.73 cell (32 px) of the line | M, n=13 | The burst stays on its line and hides no neighbour |
| Sound | starts at 80 ms (61 to 111), together with the beam | M, n=18 | Ear and eye get the reward at the same moment |
| Sound shape | three notes at 0, 250 and 440 ms; lowest tone 261 Hz | M, n=18 | A short phrase, over before the next move |
| Score pop at the line | on at 517 ms (501 to 567); fades from 734 ms (718 to 784) | M, n=7 | Says what the clear was worth, after the burst |
| Shake | none; the largest screen offset was 0.07 px | M, n=18 | A single clear is not big enough to move the screen |

**Scale:** give a bigger clear 3.4 particles per block it removes; that rate was measured on single lines, and its use
for bigger clears is inferred. A two-line clear kept these times; 3 or 4 lines change the picture (see Big clears).

## Tier 2 and up: the combo ladder

A combo step is the number of lines cleared in the current combo, minus 1 (M: it fits 56 of 57 clears). Each step
adds one thing. When a combo ends was not measured.

| Step | Adds | Shake | Lowest tone | Basis | What it is for |
|---|---|---|---|---|---|
| 0 | the Tier 1 show | none | 261 Hz | M, n=7 | The base everything else is heard against |
| 1 | a banner | none | 261 Hz | M, n=11 | Names the combo before anything gets louder |
| 2 | screen shake, pitch up 1 semitone | 190 ms, fading over its last 67 ms | 277 Hz | M, n=8 | The first step the player feels in the whole screen |
| 3 | a longer shake | 300 ms, no fade, hard stop | 293 Hz | M, n=9 | Same strength, held longer |
| 4 | a halo around the grid | 300 ms | 311 Hz | M, n=6 | The playfield itself lights up |
| 5 to 8 | pitch only | 300 ms | 349, 370, 392, 415 Hz | M, n=14 | The player hears the combo climb |
| 9 | the base tone with its octave on top | 300 ms | 262 and 523 Hz | M, n=2 | A clear top to reach |

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| Banner, size | the word is 37% of the screen width at rest | M, n=25 | Large enough to read in one glance |
| Banner, timing | on at 384 ms; grows to 1.33x in 83 ms; back to 1.0x in 50 ms; holds 400 ms; pops to 1.33x again in 50 ms; gone at 1000 ms | M, n=25 | It arrives after the burst and leaves within a second |
| Banner, growth | none: same size and timing at every step | M, n=25 | The number on it carries the growth, not its size |
| Score pop, with a banner | waits for the banner: on at 1152 ms (1135 to 1218); fades from 1335 ms (1318 to 1402) | M, n=16 | One message at a time in the same place |
| Score pop, value | grows by one base amount per step: 15, 30, 45, 60, 75 for steps 0 to 4 | M, n=8 | The reward number is what grows without limit |
| Shake, start | 33 ms after the blocks vanish (17 to 67) | M, n=39 | It hits during the empty beat, before the beam |
| Shake, motion | the whole screen moves, the HUD too; a new random offset every frame, on both axes | M, n=39 | Reads as an impact on the device, not a wobble of one object |
| Shake, size | peak 4.5 px (1.2% of the width); 37 of 39 clears peaked between 4.0 and 4.7 px, the other two at 5.1 and 5.4; a typical frame is 3.0 px (0.8%) | M, n=39 | Felt, but text stays readable |
| Shake, growth | size never grows; only the length grows, once, from 190 to 300 ms | M, n=39 | A longer shake reads as bigger without blurring the screen |
| Halo | the background 11 to 37 px under the grid frame gets 34% brighter on its brightest colour channel (31 to 36%); on at 350 ms, peak at 434 ms, off at 1060 ms; the top of the screen does not change | M, n=22 | One soft glow, the same at every step from 4 up |
| Pitch | semitones over the base, steps 0 to 9: 0, 0, 1, 2, 3, 5, 6, 7, 8, 12 | M, n=57 | A small rise at each step is heard as a climb |
| Loudness | the same at every step: all 56 clears are within 4 dB of each other | M, n=56 | A combo never becomes tiring to hear |
| Sound delay | median 4 to 19 ms at steps 2, 3, 4, 6 and 7; 47 to 111 ms at steps 0, 1, 5, 8 and 9 | M, n=57 | On 5 of the 8 steps from 2 up, the ear gets the hit with the result, before the shake |

**Scale:** take the pitch for a step from the row above: it holds at step 1, rises one or two semitones (x1.0595
each) per step from step 2 to step 8, and jumps to one octave (x2) at step 9. Raise the score number by the same
amount each step. Switch layers on by step: banner at 1, shake at 2, halo at 4. Do not enlarge a layer that is already on.

## Big clears: two or more lines at once

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| Two lines | each line gets its own beam and burst, at the Tier 1 times | M, n=1 | One rhythm for every clear, so the player learns it |
| Ladder jump | the clear adds its line count to the combo step | M, n=21 | A big clear feels big because it skips steps |
| Shake | set by the combo step, never by the line count; 5 two-line clears at step 1 had none | M, n=5 | One rule decides when the screen moves |
| Sound, 3 or 4 lines | about 1.5 dB louder | M, n=9 | The only loudness change in the game |
| Wind-up, 3 or 4 lines | the blocks turn into beams of light for 1 to 2 frames (17 to 33 ms) before they vanish; 3 of 12 two-line clears had it too | M, n=9 | A beat of anticipation only the big clear gets |
| Colour sweep, 3 or 4 lines | replaces the empty beat and the beam: starts at 50 ms (17 to 83), covers the lines by 133 ms (100 to 150), fades from about 250 ms, gone at 317 to 417 ms | M, n=9 | A different picture for the rarest clear |

**Scale:** a bigger clear does not get a bigger version of each layer. It jumps the ladder: three lines from a
cold start land on step 2, so the shake arrives with them.

## The end: game over

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| "No space" label | 80 to 550 ms after the last move (83, 417 and 551 ms); it does not wait for a clear's show to end | M, n=3 | The player sees the last move land first |
| Sound | starts with the label, within 60 ms | M, n=2 | One clear signal that play has stopped |
| Grid fill | starts 0 to 67 ms after the label; every empty cell is filled within 330 to 430 ms | M, n=3 | Shows why the game ended: nothing fits |
| Hold | 1.9 to 2.0 s after the fill, then the result screen | M, n=3 | Time to take in the final grid |

**Scale:** the fill takes the same 330 to 430 ms for 18, 21 or 35 empty cells. Fix the length and let the speed per
cell change.

## A refused move

A piece dropped where it does not fit goes back to its tray slot. Measured on 5 refused moves: 1 dropped over the
grid on filled cells, 4 dropped below the grid. All 5 got the same response.

| Layer | Value | Basis | What it is for |
|---|---|---|---|
| Piece returns to where it came from | 1 frame (17 ms): on the next frame it rests in its tray slot at tray size; no flight, no shrink, no bounce | M, n=5 | The refusal reads at once, and the piece is ready for the next try |
| Shake, flash, particles | none: the screen moved at most 0.047 px, its brightness changed by at most 0.63%, and nothing else moved | M, n=5 | A refusal stays below the smallest reward |
| Sound | none at the release: silence until the next touch; the only sound of the move is the one its pick-up made | M, n=5 | Silence tells a refusal apart from a placement by ear |
| Input | nothing to wait for: the piece is at rest on the next frame; twice the next piece was lifted 234 and 254 ms later | M, n=5 | The player can try again at once |

**Scale:** nothing grows. Where the piece was dropped did not change the response. No two refusals came in a row, so
the same response for a repeat is inferred.

## Rules

1. **Respond in one frame.** The snap and the vanish take 1 frame. A delay belongs to the show, never to the
   response.
2. **Order the show.** Result at 0 ms, shake at 33 ms, beam from 83 ms, particles at 167 ms, banner at 384 ms,
   score pop last. The sound's start depends on the combo step. At steps 0 and 1 it starts at 80 ms, with the beam.
   At steps 2, 3, 4, 6 and 7 its median start is 4 to 19 ms, before the shake. At steps 5, 8 and 9 it came late
   again: the medians of steps 0, 1, 5, 8 and 9 are 47 to 111 ms.
3. **Add a layer; do not enlarge one.** Growth comes from switching layers on, from pitch and from the score number.
4. **Shake has one size.** Keep the peak at 1.2% of the screen width. Change only the length: none, 190 ms, 300 ms.
5. **Pitch climbs, loudness holds.** From step 2 to step 8 the pitch rises one or two semitones per step; step 9 is
   the octave.
6. **End the show in about a second.** The banner is gone at 1000 ms and the halo at 1060 ms. Only the score pop
   comes later, and it fades from 1335 ms.
7. **Keep the routine quiet.** If every placement shakes the screen, a combo has nowhere to go.
8. **Effects never hold input.** On 3 clears the player was seen dragging the next piece while the banner was still
   up (M, n=3).

## Starting constants

```json
{
  "frameMs": 16.7,
  "place": { "trayScale": 0.43, "snapMs": 17, "scoreStartMs": 67, "scoreTickMs": 33, "soundStartMs": 90, "soundPeakMs": 195 },
  "clear": {
    "vanishMs": 17, "emptyBeatMs": 67, "beamOnMs": 83, "beamLastsMs": 67, "beamWidthOfCell": 0.14,
    "particlesOnMs": 167, "particlesPerBlock": 3.4, "particlesGoneMs": 600, "particleSpreadCells": 0.73,
    "soundOnMs": 80, "noteOffsetsMs": [0, 250, 440], "scorePopOnMs": 517, "scorePopFadeFromMs": 734
  },
  "banner": {
    "fromStep": 1, "widthShareOfScreen": 0.37, "onMs": 384, "overshoot": 1.33, "growMs": 83, "settleMs": 50,
    "holdMs": 400, "goneMs": 1000, "scorePopOnMs": 1152, "scorePopFadeFromMs": 1335
  },
  "shake": {
    "fromStep": 2, "startMs": 33, "peakShareOfWidth": 0.0115, "typicalShareOfWidth": 0.0077,
    "lengthMsByStep": { "2": 190, "3": 300 }, "newOffsetEveryMs": 17
  },
  "halo": { "fromStep": 4, "brighter": 0.34, "onMs": 350, "peakMs": 434, "offMs": 1060 },
  "bigClear": {
    "fromLines": 3, "windUpMs": [17, 33], "sweepOnMs": 50, "sweepFullMs": 133, "sweepFadeFromMs": 250,
    "sweepGoneMs": 325, "louderDb": 1.5
  },
  "pitch": { "baseHz": 261, "ratioPerSemitone": 1.0595, "semitonesByStep": [0, 0, 1, 2, 3, 5, 6, 7, 8, 12] },
  "comboSound": {
    "onMsByStep": [80, 80, 17, 17, 17, 80, 17, 17, 80, 80],
    "earlySteps": [2, 3, 4, 6, 7], "earlyMedianRangeMs": [4, 19],
    "lateSteps": [0, 1, 5, 8, 9], "lateMedianRangeMs": [47, 111]
  },
  "gameOver": { "labelAfterMs": [80, 550], "fillStartsAfterLabelMs": [0, 67], "fillMs": [330, 430], "holdMs": [1900, 2000] },
  "refusedMove": { "returnMs": 17, "shake": false, "flash": false, "particles": false, "sound": false }
}
```

Shake offset in pixels is `peakShareOfWidth` times the screen width: 4.5 px on a 390 px screen as measured, and by
the inferred size rule 8.8 px on a 768 px one. Pitch for a step is `baseHz * ratioPerSemitone ** semitonesByStep[step]`.
No step past 9 was seen; staying on the octave there is inferred.

A clear's sound starts at `comboSound.onMsByStep[step]`. Its 80 ms at steps 0 and 1 is the measured Tier 1 median.
The other values are chosen inside the measured median ranges: 17 ms (one frame) inside 4 to 19 ms, and 80 ms
inside 47 to 111 ms. The two ranges are measured; this skill does not give each step's own median. Past step 9,
keeping step 9's value is inferred.

## Other genres

These mappings are inferred. The tiers come from a grid puzzle; the ladder holds for any game with a repeated
action and a combo.

- **Tier 0** is the action the player repeats most: a tap, a move, a shot, a swap. One frame, a quiet sound, no shake.
- **Tier 1** is the smallest success: a match, a hit, a pickup. A vanish, a short beat, a burst, a phrase of sound.
- **The ladder** is whatever chains: a combo, a cascade, a run of kills. One new layer per step, and the pitch from
  the ladder's row.
- **A big clear** is one action that scores several times. It jumps the ladder by what it scored.
- **The end** is a fail or a finish: show the cause, hold about 2 s, then change the screen.

## Check it in the built game

1. Step the game's clock one frame at a time, or record it at 60 fps, and count frames from the event.
2. Each time in the tables must be within one frame of your count: 17 ms at 60 fps, 33 ms at 30 fps.
3. Outside its window the shake offset is 0: the measured game never moved more than 0.07 px there. Inside it,
   no frame exceeds 1.4% of the screen width, the largest offset measured.
4. Place ten pieces with no clear: the screen never moves and no particle appears.
5. Run a combo to step 4: the banner has the same size at every step, and the pitch rises at steps 2, 3 and 4.
6. Say which numbers you changed after tuning, and why. A changed number is no longer measured.
