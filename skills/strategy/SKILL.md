---
name: strategy
description: Before deciding what a new game is, or changing its mechanics, levels, difficulty, retention, money, live ops or launch ads — read the genre and studio strategy files that match the game, decide which lessons this game applies, and write the decisions to docs/STRATEGY.md.
---

**On by default.** `/make-game` applies this to every new game, and to every change that touches a game's
mechanics, levels, difficulty curve, retention, money, live ops or launch ads. It is a working artifact, not a
phase or an approval gate. Skip it only for a change that touches none of those, such as a sound or a typo.

The strategy layer is a set of lesson files next to this one. Each file holds what made successful games
work, in a genre or at a studio, written as lessons a game can apply. Read them before `skills/game-design`:
the strategy decides WHAT the game must have (a fail state, a schedule of new mechanics, late interstitials);
game design then decides the numbers and rules.

## 1. Find the files that match the game

List the files in `genres/` and `studios/` next to this file. Read each file's front matter only: `title`,
`match` and `summary`. Skip `TEMPLATE.md`.

- A **genre file** matches when the game's core action or a reference game it names is in that file's `match`
  list, or is the same kind of play in other words. A game can match more than one genre file.
- A **studio file** matches when the user names that studio, names a game the studio made, or asks to work
  "the way" that studio does. Read a studio file also when a matching genre file names the studio under
  `studios`.
- Always read `principles.md`: the lessons that hold for every genre.

When no genre file matches, say so in `docs/STRATEGY.md`, apply `principles.md` alone, and name the closest
genre file you read instead.

## 2. Decide each lesson for this game

Read every matching file in full. Each lesson has an id, such as `arrow-escape/3`. For each lesson, decide one
of:

- **apply**: the game does it as written. Say where: the rule, the level range, the config value or the screen.
- **adapt**: the game does a changed version. Say what changed and why.
- **not used**: the lesson does not fit. Give the reason, for example "the user asked for a no-fail relaxing
  game", or "no ads in this build".

The order of authority, highest first:
1. What the user asked for. A lesson never overrides the user's request; write the clash down instead.
2. What this game measured: its play tests, its odds model, its own numbers.
3. The genre file.
4. The studio file.
5. `principles.md`.

A lesson's numbers (a level count, a share, a timing, a size) come from three places, and each one carries a
label that says which:

- *Observed:* the source saw it in the reviewed game.
- *Estimated by the source:* the source estimated or advised it, but did not see it in the game.
- *Our inference:* we derived it while writing the lesson. The source does not give it.

A number with no label is our inference. Every *Check:* line is our test, not the source's. Copy each number's
label, word for word, into `docs/STRATEGY.md` and `docs/GAME_DESIGN.md`, next to the number. Never turn our
inference into a source fact, and never turn an estimate into an observation. Treat every lesson number as a
starting point with a range, never as measured for this game.

## 3. Write `docs/STRATEGY.md`

Write it in the game directory before `docs/GAME_DESIGN.md`, and carry both into later work and re-runs. It
holds:

1. **Files read:** each strategy file, and why it matched.
2. **Decisions:** one table, a row per lesson: lesson id, apply / adapt / not used, and where it lives in this
   game or the reason. A row that uses a lesson number names it with its label.
3. **What changes the plan:** the three to five decisions that change the game the most, in plain words. Show
   these to the user with the build summary.
4. **Open questions:** a lesson that needs the user's call, such as adding a fail state to a game sold as
   relaxing. Ask it the way `/make-game` says to ask, once, only when the answer changes the game.

Then feed the decisions into the work that follows: `skills/game-design/SKILL.md` gets the rules and
containers, `skills/level-design/SKILL.md` gets the mechanic schedule and the curve, and the store and ad work
gets the launch lessons.

## 4. Check an existing game against the strategy

When the user asks how an existing game compares, or before a large change to it: read the game's code and
docs, then fill the same decisions table with a fourth state, **missing**: the lesson applies and the game does
not do it yet. List the missing lessons first, most valuable first, each with the file and line that shows the
gap. Do not edit the game in a check unless the user asks for the change.

## 5. Add a new source

A new talk, article, teardown or review becomes lessons, never a copy of the source.

1. Copy `TEMPLATE.md` to `genres/<genre-id>.md` or `studios/<studio-id>.md`. When the file exists, add the
   new lessons to it and add the source to its `sources` list.
2. Write each lesson in your own words: what to do, why it works, and how to check a game for it. No quotes,
   no transcript passages, no speaker names.
3. Give each lesson the next free id in that file. Never renumber or reuse an id: games cite them.
4. Label each number with where it came from: *Observed:*, *Estimated by the source:* or *Our inference:*
   (section 2). A threshold or a level you chose yourself is our inference, even when the source's point is
   behind it.
5. Keep a lesson that holds for every genre in `principles.md`, not in a genre file.
6. Leave out anything private: people, private companies' internal data, contact details, unreleased plans.
   Public games and public studios may be named.

## Done

`docs/STRATEGY.md` names the files read and decides every lesson in them, and its decisions show up in
`docs/GAME_DESIGN.md`, the level plan or the code. A strategy that changes nothing in the game is not done.
