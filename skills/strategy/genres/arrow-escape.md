---
kind: genre
id: arrow-escape
title: Arrow escape puzzles
summary: Tap a piece and it leaves the board in the direction it points, if its path is clear; clear the board to win. Ad-driven download giants, turned into in-app purchase earners by adding a fail state.
match: [arrow puzzle, arrows, arrow escape, tap away, unpuzzle, unblock, slide out, rope out, maze escape, Maze Out, Arrows, Arrows Go, Arrow Puzzle]
studios: [grand-games]
sources:
  - "Two and a Half Gamers podcast, episode reviewing Maze Out by Grand Games (November 2026): lessons rewritten in our own words"
  - "Our own teardown of the Maze Out Android build (version 909, November 2026): what the game's files show, in our own words"
updated: 2026-11-20
---

# Arrow escape puzzles

**The play.** Each piece (an arrow, a rope, a block) points one way. Tap it: when every cell between its head
and the board edge is empty, it slides out; when another piece is in the way, it refuses. Clearing pieces
opens paths for others. The board is cleared when every piece has left.

**Where the genre stands.** *Estimated by the source:* the leading games in this family reach over 100 million
downloads each, mostly on ad revenue, because the play is quick to learn and cheap to advertise. A late entrant
earned far more from in-app purchases than the genre usually does by changing the rules below, not the core
action. Copying the core action is the easy part; the lessons here are what made the difference.

## Mechanics

**arrow-escape/1 — Give the game a way to lose.** A pure logic puzzle where the player can always find the
next move has nothing to sell: no lives to refill, no time to buy. Add a fail state so purchases have a
reason. The reviewed game has two: a time limit per level, and a set of lives. *Observed:* 5 lives, each
refilled after 30 minutes. The source counted 3; in the build, 3 is the mistake limit of the daily level. *Check:*
can a player fail a level? Name what fails it and what a purchase or a rewarded ad gives back.

**arrow-escape/2 — Use two fail conditions that pull in different directions.** A timer punishes slow
scanning; lives punish careless taps. Together they stop the player from beating the timer by tapping at
random. *Observed:* the game counts mistakes (its daily level allows 3). *Our inference:* a mistake is a tap
on a piece whose path is blocked; the teardown did not read the code that sets its cost. *Our inference:* a
level is also lost when no piece can move. *Check:* a test taps a blocked piece and sees a mistake counted; a
test lets the clock run out and sees the fail screen.

**arrow-escape/3 — A fail state opens new level design.** Once a level can be lost, blockers and timing
pieces become fair, and levels can be tighter. Plan the mechanics and the fail state together, not one after
the other. *Check:* the mechanics list says, for each one, how it interacts with the timer and the lives.

## Level design

**arrow-escape/4 — Reveal the board in sections.** Show one section of a large level first, with the rest
hidden or covered. Clearing that section unlocks the next. The player scans fewer places at once, a hard
level feels doable, and each unlock is a progress beat inside the level. *Check:* a level with more than
about 20 pieces opens in sections; locked sections are hidden or covered, and their pieces cannot be tapped.

**arrow-escape/5 — A piece that cannot be tapped looks it.** Covered, dimmed or locked pieces never accept a
tap, and the player can tell before tapping. A tap that is refused for a hidden reason feels like a bug.
*Check:* each piece state has its own look (see `skills/game-design` rule 2).

**arrow-escape/6 — Label difficulty, and keep "hard" relative.** Levels marked hard or very hard set the
player's expectation and make the fail fair. A "hard" level is still clearable in the time given by a player
who scans well. *Observed:* every block of 10 levels has one hard level (the 4th) and one very hard level (the
9th), each with about twice the pieces of its neighbours. *Check:* the level plan marks hard levels, and the odds model says what share of players
clear each one in time.

## Difficulty and mechanic curve

**arrow-escape/7 — Add a new mechanic about every 20 levels.** The reviewed game had about four mechanics by
level 80: plain arrows, then spots that must be emptied, pipes that route a piece, and walls that bounce it.
The reviewers judged that light. *Observed:* the build teaches six obstacles, at levels 7, 20, 35, 50, 70
and 100: a band, a curtain opened by a key, a pipe, a box, a corner and an elevator. Five are in play by
level 80, and the gaps grow from 13 to 30 levels. *Estimated by the source:* about 15 mechanics by level 300 to 500. Each new
mechanic brings new level shapes, new ad hooks and new kinds of difficulty. *Check:* the level plan names the
level where each mechanic first appears, with a short teaching level for it.

**arrow-escape/8 — Learning is the fun; schedule it.** Players stay while they are learning something. When
the mechanics stop arriving, the levels only get bigger, and that reads as repetition. *Check:* no stretch
of more than about 30 levels goes without a new mechanic or a new twist on one. *Our inference from the
build's tutorial list:* the reviewed game teaches no new obstacle between level 100 and level 300; its later
levels only grow. That is the stretch the reviewers called light.

## Retention

**arrow-escape/9 — Keep the first levels free of interruptions.** Live-ops features unlock gradually after
the first levels, and full-screen ads come late. *Estimated by the source:* no interstitial ad before about
level 26. *Check:* the feature and ad unlock levels are written in the level plan.

**arrow-escape/10 — Make each level short.** One section, one scan, one unlock: the loop runs in seconds.
Levels with a timer of two to three minutes keep sessions dense. *Observed:* the time limit is 180 s at
level 1 and averages 127 s over levels 201 to 300. *Check:* the median clear time of each level in
play tests sits under its timer with room to spare.

## Money

**arrow-escape/11 — Sell what the fail state takes away.** The purchases and rewarded ads restore what the
player loses: lives and time. *Observed:* a rewarded ad for lives is offered from early on; the shop opens
without ads. *Check:* every fail screen offers a way to continue (a rewarded ad or coins) and a way to retry.

**arrow-escape/12 — Earn from both purchases and ads, and stage the ads.** Rewarded ads come first, then more
rewarded placements by player group, then interstitials late. *Estimated by the source:* the reviewed game
earns about 30 to 40% of its revenue from purchases, far above the genre's ad-led norm. *Check:* the economy
table lists each ad placement and purchase with the level it unlocks.

## Live ops

**arrow-escape/13 — Bring the standard live-ops set, unlocked by progress.** Events, collections and
challenges arrive after the core is learned, one by one. The source treats this as the expected baseline for
the genre, not a differentiator, and does not detail it. *Check:* the plan lists each live-ops feature and its
unlock level; the first one unlocks after the first mechanic change.

## Launch ads and growth

**arrow-escape/14 — Advertise the frustration, then the gameplay.** The strongest gameplay ad shows a player
who cannot free one colour ("I can't reach the green"). Short attention-grabbing hooks open many ads, often
generated scenes or characters, before the real board appears. *Check:* the ad brief has at least one "cannot
reach X" board and at least one non-gameplay hook.

**arrow-escape/15 — Make many ads from a few ideas.** The reviewed game ran about eight ad concepts, each cut
into many sizes, lengths and formats (video into playable, image into playable): about 1,400 ads in all.
Clicks are cheap in this genre, but the ads tire fast. *Check:* the ad plan names the concepts first, then
the variants of each.

**arrow-escape/16 — Do not rely on one ad network.** The reviewed game split spend roughly evenly across two
networks. One network carrying everything is fragile. *Check:* the launch plan names at least two networks.

**arrow-escape/17 — Defend your name in store search.** Rival games buy ads on your game's name in store
search, so a player who searches for you sees them first. Bid on your own name once the game is live.
*Check:* the launch plan has a store-search line for the game's own name.

## Seen in the reviewed game's build

**arrow-escape/18 — Grow the board as the clock shrinks.** Difficulty comes from more pieces and less time,
moved together. *Observed:* level 1 has 3 pieces on a 3 by 4 grid; levels 201 to 300 average 78 pieces on a
26 by 35 grid, with less time per level (see `arrow-escape/10`). *Check:* the level plan lists the piece
count, grid size and time limit of every level, and the time per piece falls as the levels go on.

**arrow-escape/19 — Give each booster a fail state to answer.** *Observed:* four boosters: one freezes the
timer for 10 s, one gives a hint, one shows the grid's paths, and one clears 3 pieces. A new player gets 3
of each. *Our inference from their names:* the hint and the path view answer a stuck board. Time, a stuck board and a crowded board each have an answer. *Check:* the economy table names what
each booster answers and how many a new player starts with.

**arrow-escape/20 — Raise the price of each continue in a level.** *Observed:* a player starts with 1,000
coins. A won level pays 20, 60 or 100 coins (*our inference:* by difficulty). Continuing a failed level costs
900, then 1,900, then 2,900 coins. The starting coins buy one continue; after that the price outgrows what
levels pay. *Check:* the economy table lists the start coins, the pay per level and each continue price.

**arrow-escape/21 — Reward quick clears.** *Observed:* clears within 1.25 s of each other count as a combo.
*Our inference:* it pays a player who has read the board ahead. The teardown did not read what a combo gives. *Check:* the game names its combo window in seconds and shows the combo when it
happens.

**arrow-escape/22 — Plan what comes after the last level.** *Observed:* the build ships 300 main levels,
then a set of 200 levels that repeats, and it can receive more levels from the server. A player who finishes
never meets an empty screen. *Check:* the level plan says what plays after the last hand-made level.

**arrow-escape/23 — Give the daily level its own rules.** *Observed:* the daily level allows 360 s and 3
mistakes, twice the time of an early main level and a different fail rule. A daily level that only reuses a
main level gives no reason to return. *Check:* the daily level's time and fail rule are written down and
differ from the main levels.
