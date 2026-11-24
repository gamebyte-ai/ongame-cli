# New-player coin runway

The requested default is no needed-item coin shortage until a player has completed 12 sessions and at least
3 full days have elapsed since their first session. Twelve comes from a planning assumption of four 5–6 minute
sessions a day: 3 × 4 = 12, about 66 minutes at the midpoint. These are defaults, not measured behavior in a game.
Session count and elapsed days are independent: a first-day binge cannot satisfy the days condition.

The existing CLI has game-design rules, strategy principles, and difficulty/verification skills, but no shared
economy simulator. Add a small dependency-free numeric checker beside game-design and require new or changed
game economy simulations to call it. It consumes individual simulated runs, never prose or aggregate medians.
An early shortage or a short simulation horizon fails. Invalid or missing data fails separately. Check average
and light player profiles without coin purchases or rewarded ads; count shortage before any rescue.

Data flow: game runtime prices and rewards → seeded game simulation → structured runs → shared checker → test exit.
The checker has a CLI for planning reports and an exported function for economy tests. A runnable miniature
simulation proves both a passing plan and an early-shortage plan. Existing games must integrate it when their
economy is next changed; this PR does not claim to retroactively change their CI.

Keep the detailed contract in game-design/economy.md. Brief links in /make-game, the light design doc, strategy,
difficulty checks and final verification make it reachable in direct work and retained phases. No new phase gate.
Do not change Flowfill. Measure its pinned simulation separately and distinguish modeled time from telemetry.

Alternatives: prose alone cannot fail a plan; a generic replacement economy simulator would duplicate game rules.
The shared report check reuses each game's own simulator and is the smallest executable policy boundary.

Validation: exact threshold, one session/day too early, a first-day binge, late and absent shortages, short horizon,
malformed numbers/data, every sample checked, and CLI failure exits. Run the actual example simulator as the
consumer, plus the existing affected instruction and packaging checks. No network, service, schema migration,
retries or dependencies are added. Sequential implementation; one checker and its consumers.

Independent design review found that days must not be derived from minutes and that Flowfill's median shortage
level is not its median shortage time. Both distinctions are part of this design and its tests/report.
