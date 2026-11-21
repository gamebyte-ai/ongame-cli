---
name: unity-port
description: Before and during a port of a shipped web game (three.js, Pixi, a Capacitor store build) to Unity, and before releasing the port — set the parity gates that must block, carry the players' saves across, and avoid the rendering, Android and WebGL traps that pass a clean build. Load with skills/unity/SKILL.md when the user says "port it to Unity", "move it to Unity" or "rebuild it in Unity".
---

# Porting a shipped game to Unity

`skills/unity/SKILL.md` is how to drive Unity; read it first. Also read
`knowledge_get({ key: 'pattern:unity-porting-content' })`. This file is about the port as a release: a port is
a new game that players receive as an update of the old one, so every difference is a regression they see.
Publishing a Unity WebGL build is outside this skill; follow `/publish`.

## 1. Before writing code

- **Name the source line.** Port from the commit that is live in the stores, not from a local branch. A stale
  branch looks complete and silently drops the latest levels and fixes.
- **Write the parity gates first, with numbers, and make them block the release.** A port that shipped to every
  player in a day was "not the same game" on first play: the table was missing, colours were washed out and an
  animation was broken. Its parity definition covered winnability, flow, economy and analytics, but not looks;
  the shell probe only checked that each screen opened; the physics gate had failed (19 of 60 levels against
  a 51 of 60 noise floor) and it shipped anyway.
  - **Visual:** the same levels in the old build and the port, compared as `skills/game-verify/SKILL.md` §3
    says and shown to the user. Make it a number: a per-region colour difference (ΔE) or SSIM, with the noise
    floor measured first as old build against old build.
  - **Behaviour:** per level, the bot's win rate and median moves or shots against the old build's measured
    curve (for example within ±15%). Parity means the same outcomes, not identical trajectories; see §7 of
    `pattern:unity-porting-content`.
  - A failed gate means no release recommendation. Say "gate failed" to the user plainly, do not move it to a
    list of accepted differences on your own, and look at your own comparison image before saying done.
- **Tell the user what the engine's minimum OS drops.** Unity 6000.3 (as of 2026-11) supports Android API 25
  at the lowest ("Minimum supported Android API level is 25"); `AndroidApiLevel24` in a build script is only an
  obsolete-API warning. Devices on API 24 stop receiving updates; check the built bundle's `minSdk`.
- **On Android there is no way back.** A player who installs the port cannot be downgraded: a version code
  never goes down. The emergency path is re-releasing the old build with a higher version code; keep it
  buildable. Do not skip the closed-test step of a staged rollout.

## 2. Saves are a release gate

Players' progress and purchases live in the old build's storage. In a Capacitor build that is WebView
`localStorage` (origin `https://localhost`), holding paid coins and purchase records.

- No migration bridge, no production release.
- **Never lose a save on a slow first launch.** A first version dropped the old save for good when the first
  read timed out; keep it pending and import it late instead.
- **Test the real path:** install the store-signed old version from the store, play and make a test purchase,
  update through the store, then confirm the progress, coins and consent came across and nothing was granted
  twice. Copies installed on an emulator with a different signature cannot test this.

## 3. When 3D looks tilted, sunk or washed out

**Colour each face differently before forming theories.** Render every face of the suspect mesh in its own
flat colour and read which one faces the camera. Four lighting hypotheses (shadow acne, anisotropy, clearcoat,
reflections) cost several builds; one face-colour frame showed the far and bottom faces facing the camera:
every code-generated mesh was inside out. In Unity the front face is the one where `Cross(b - a, c - a)` points
at the viewer; test your winding once. After fixing geometry, re-measure lighting: it had been tuned to hide
the wrong faces. More porting traps that pass a clean build: `references/port-traps.md`.

## 4. After the move

Search the code for workarounds that exist because of the old platform (comments such as "because the
WebView…") and measure whether each constraint still holds. A workaround outlives its reason silently.
