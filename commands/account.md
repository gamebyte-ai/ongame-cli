---
name: account
description: Show your ongame plan, remaining usage this period (and when it resets), and the link to manage your plan / upgrade / set a spend cap.
---

# /account — plan, usage, and how to manage it

The user wants a `/usage`-style at-a-glance view: plan, what's left, WHEN it resets, and where to manage
it. Render it in the **fixed, standard layout below** (deterministic — same shape every time), then add at
most ONE short comment line underneath. This is the user's anchor for "how much do I have / how do I
upgrade" — make it consistent and easy to read, not chatty.

1. Call **`billing_status`** and **`usage_status`** (both `ongame` cloud tools — find by bare name via
   ToolSearch if needed). If the cloud tools are missing, the user isn't signed in → call the **`login`**
   tool first, then retry.

2. **Render exactly this block** (fill the values; keep the labels + order fixed; omit a row only if truly
   N/A). Use a code block so it aligns:

   ```
   ongame · account
   Plan          <Free | Pro | Team | Scale>
   This week     <~NN% of included usage left | unlimited | none on Free>  · resets Mon 00:00 UTC
   Today         <~NN% left | unlimited | none on Free>                    · resets 00:00 UTC
   Pay-as-you-go <off | on, $X of $Y left this month | not available on this plan>  · cycle resets 1st 00:00 UTC
   Manage        https://account.ongame.ai
   ```

   Value rules (from `usage_status`):
   - `usage.weekRemainingPct` / `usage.todayRemainingPct` are PERCENTAGES of the INCLUDED quota left
     (0-100). `null` = unlimited plan → write `unlimited`. `0` on Free = no included quota → write
     `none on Free`. Never invent a dollar figure for INCLUDED usage.
   - **Reset times are fixed UTC windows — always state them** (this is the "when does it reset" the user
     wants): daily quota resets at the next **00:00 UTC**, weekly quota on the next **Monday 00:00 UTC**,
     the pay-as-you-go / spend-cap cycle on the **1st of the month 00:00 UTC**. You may add the user's local
     equivalent in parentheses if you know their timezone, but UTC is the source of truth.
   - Pay-as-you-go row from `headroom`: `extraState` `gated` → `not available on this plan` · `disabled` →
     `off` · `capped`/`unbounded` → `on, $<extraRemainingUsd> left this month`. `overageCycleUsd` /
     `spendCapUsd` are real dollars if you want to show the "of $Y".
   - If `usage_status` is `unavailable`/null, still render the block with the plan + `Manage` line and put
     `—` in the usage rows.

3. **One short comment line below the block** — a single honest sentence, e.g. *"You're on Free; upgrade or
   set a pay-as-you-go cap anytime at the link above."* or, if near a limit, a brief heads-up. No pitch, no
   multi-paragraph explainer.

Note: this is a plugin command, so it runs through the agent (it can't open a native panel like the
built-in `/usage`). Keep the rendered block tight and standard so it still reads like a status view.
