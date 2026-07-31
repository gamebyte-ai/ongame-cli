---
name: account
description: Show your ongame plan, remaining usage this period, and the link to manage your plan / upgrade / set a spend cap.
---

# /account — plan, usage, and how to manage it

The user wants to see where they stand: their plan, what's left this period, and how to change it.
Do this now, concisely, and **surface the account console link** so they always know where to go.

1. Call **`billing_status`** and **`usage_status`** (both are `ongame` cloud tools — find them by bare
   name via ToolSearch if the short name isn't directly callable). If the cloud tools are missing from the
   tool list, the user isn't signed in — call the **`login`** tool first (it opens the browser sign-in),
   then retry.

2. Present a short, human summary — no raw JSON. Cover:
   - **Plan:** free / pro / team / scale (from `billing_status.tier`).
   - **Usage this period:** from `usage_status` — `usage.todayRemainingPct` / `weekRemainingPct` are
     PERCENTAGES of the included quota left (0-100; `null` = unlimited plan, `0` = no included quota, e.g.
     free). Say it plainly: *"~40% of this week's included usage left"* — never invent a dollar figure for
     included usage.
   - **Pay-as-you-go (only if relevant):** `headroom.extraRemainingUsd` (real $ they authorized) +
     `headroom.extraState` (`gated` = not offered on this plan → upgrade is the only door · `disabled` =
     available but off · `capped`/`unbounded` = active). Mention a spend cap (`set_spend_cap`) only if they
     ask or are close to a limit.
   - If a tool returns `unavailable` / null, say usage couldn't be read right now and just give the link.

3. **Always end with the manage link.** Call **`upgrade`** — it returns the account console URL
   (`account.ongame.ai`). Show it as the one place to **change plan, enter/manage a card, set a spend cap,
   and see billing**: *"Manage everything at https://account.ongame.ai — pick a plan, add a card, set a
   cap. Your plan unlocks automatically after checkout, no re-login."*

Keep it to a few lines. This command is the user's anchor for "how much do I have / how do I upgrade" — make
that answer easy to find every time.
