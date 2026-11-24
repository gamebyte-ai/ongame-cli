---
name: game-design
description: Before writing the rules, levels, layout or economy of a game, or changing them — set the capacity of every container, when a piece waits or is blocked, the caps on pieces in play, the odds model and difficulty curve, on-screen sizes for phones, and what rival games show about looks, sizes and economy.
---

**On by default.** `/make-game` applies this to every new game, and to every change that touches a game's
rules, levels, layout or economy. It is a working artifact, not a phase or an approval gate. Skip it only for
a change that touches none of those, such as a sound, a credit or a typo.

Write the answers to `docs/GAME_DESIGN.md` in the game directory before the first level or game-rule code.
Each number in it says where it came from: measured, set by the user, or a guess with a range. Carry the file
into later work and re-runs, and update it when a rule changes. Show the user its summary with the build.

## 1. Every container has a capacity

A container is anything that holds pieces: a jar, a tube, a slot, a tray, a board cell, a queue, a hand.

- Write each container's capacity as a number: the most pieces it can hold at once.
- Say what happens when a piece arrives at a full container: refused with feedback, sent to a waiting area,
  or a fail.
- Show the capacity on screen: empty slots, marks or a counter. The player never learns it by losing.
- The game code reads the capacity from one config value, and a test checks that a full container refuses
  the next piece.

## 2. When a piece waits or is blocked

- List every state a piece can be in, for example: in the supply, in play, waiting, blocked, cleared.
- For each state, write the exact condition that moves a piece into it and out of it.
- A waiting area has its own capacity (rule 1). Say what happens when it is full.
- A blocked piece looks blocked: dimmed, locked or covered. Say what unblocks it.
- A test drives each move between states once.

## 3. Caps on what is in play

- Write the most pieces in play at once, the most containers open at once, and the most pieces sent per
  turn or per second.
- Say what the game does at each cap: it stops dealing, it queues, or the player loses.
- Check the caps at the phone size (rule 5): at the cap, every piece is still readable and none overlaps.

## 4. An odds model before the levels

Before any level is generated or authored, frame the game as a math problem.

- Name the random parts: the deal, the spawn order, the draw.
- Write the chance that matters for each: the chance a deal can be solved, the chance of a dead end after N
  moves, the expected number of moves to win, the chance of a fail at each cap.
- Compute those chances, or estimate them from a seeded simulation with the run count and the spread.
- Build the difficulty curve from them: give each level a target fail chance, a rest level after each hard
  stretch, and an easy, rewarding first level.
- Generate the levels to hit the targets. Then check each shipped level against its target and keep that
  check as an automated test.

Tuning levels by trial alone, with no model, is not enough. For a level-based game, `skills/level-design/SKILL.md`
then decides the curve's hard levels, rest levels and booster points from this model.

## 5. Sizes and readability on phones

Design for a 360x640 screen first, then check 390x844 and 414x896.

- Write the on-screen size of each piece and container in CSS px at 360x640.
- Defaults: a piece the player taps or drags is at least 44x44 px. A piece the player only reads is at
  least 28 px across. Text is at least 14 px. Change a default only with the reason written down.
- Two kinds of piece differ by more than colour: shape, icon or pattern too, so a colour-blind player can
  tell them apart.
- At the caps of rule 3, take a phone-size screenshot and check each size with a numeric probe, not by eye.

## 6. Study rival games, then apply what they show

Before the first art and the first economy numbers, study at least three popular games in the same genre.
If the genre has none, write what was searched and skip to the next rule.

- Look: palette, material, lighting, how the board and pieces are drawn.
- Sizes: each rival's piece and container size as a share of the screen width, measured from a phone
  screenshot.
- Economy: currencies, what each costs and earns, lives, boosters, where ads and offers appear.
- Write one table: rival, look, sizes, economy, with the source of each value (a screenshot, a store page,
  a reference file).
- Write what this game takes from each column and where it is in the game. A study that changes nothing in
  the game is not done.

Use the reference tools when they are available (`skills/reference/SKILL.md`). When nothing can be
inspected, say the study is not done; do not fill the table from memory.

## 7. Enjoy several days before coins run short

Default: no needed-item coin shortage before **12 completed sessions AND 3 full elapsed days**. The planning
assumption is four 5–6 minute sessions a day: 12 sessions are roughly 66 minutes at the midpoint. Days are elapsed
time, never play minutes divided by a daily budget. Read [economy.md](economy.md) for the source/sink plan and
run `economy-check.mjs` on the game simulation's individual runs, with purchases and rewarded ads declined.
Wire its assertion into the game's normal economy tests; an early shortage or an untested horizon fails.
Games without coins mark this rule not used. This rule applies before the economy is planned and whenever it changes.

## Done

`docs/GAME_DESIGN.md` answers rules 1-7, and the tests named in rules 1, 2, 4 and 7 pass. A rule that does not
fit this game is marked "not used" with the reason.
