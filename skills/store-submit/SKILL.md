---
name: store-submit
description: The step after store-build — before a packaged game goes to App Store Connect or Google Play Console review, and before its first release with in-app purchases: prove the reviewed build sells, check the privacy forms against what the game sends, check the store text and the pacing, then hand the account owner numbered console steps. Use when the user says "submit", "send for review", "release on the App Store / Google Play", or a review was rejected.
---

Use this once the store build exists (`store-build`, the step before this one) and the listing pack exists
(`store-prep`). It checks what review will see and writes the owner's console steps; it does not build, sign or make
listing graphics.

## The boundary

**The agent never writes to a store.** No upload, no submit or resubmit, no Resolution Center reply, no metadata or
form edit, no release, no record deleted — even with working credentials. Review history attaches to the owner's
account, and a repeated rejection puts the whole account at risk. The agent drafts (texts, form answers, review notes,
a checklist) and may read status. An earlier yes does not cover the next build.

If the user pastes a private key or secret into the chat, tell them to revoke it and make a new one.

onGame team: if `playbook catalog` lists `ongame-game-launch`, run `playbook skill ongame-game-launch` and read its
play-console and qa phases; the boundary above still holds.

## Before the owner submits

1. **Prove prices and a test purchase on the build that will be reviewed.** Install that exact build (TestFlight /
   internal track), open the shop: every product shows a store-loaded price and a test purchase goes through. The
   purchase key and the product list (code ↔ purchases service ↔ store products) are `store-build`
   references/purchases.md; this step proves them on the installed build.
2. **Ads and tracking in the first release** follow `store-build` step 1 (ads) and native-shell.md
   (`NSUserTrackingUsageDescription`); the form side is `references/privacy-forms.md`.
3. **The first in-app purchases go to review with the version.** The owner adds each product for review from its own
   page, then submits them with the version. The dialog also accepts the version alone; that happened once and the
   version had to be pulled from review. Steps: `references/app-store.md`.
4. **The privacy forms match every SDK in the store build.** A mismatch blocked a Play release twice; a "No data is
   collected" review note contradicted App Privacy. `references/privacy-forms.md`, `skills/analytics/store-labels.md`.
5. **Store text passes.** `node <this skill's dir>/check-text.mjs <gameDir> [--no-ads]` (exit 0 = no FAIL, 1 = a FAIL,
   2 = nothing readable) — see below.
6. **Similarity check before an iOS submission.** Compare the game's core loop and first screenshot with the game it
   resembles. Why: a declared replica and a game whose first screenshot nearly matched a well-known game were both
   rejected under 4.3(a) Spam. Never answer "original" for a replica; never resubmit unchanged.

## Pacing

Advice from one incident, not an Apple rule: five near-identical submissions on one day were followed by 4.3(a)
rejections on two of them. Keep one app in Apple review at a time, submit the next after the previous result, and
write each app's description and review notes on their own — a shared template makes apps look alike.

## Store text

`check-text.mjs` reads the listing, description, release-note, review-note and screenshot-caption files under
`store/` (or every text file in the paths you give after `<gameDir>`). No store text read is not a pass: it exits 2
("nothing readable") — pass the files as paths if they live elsewhere. It reports:

- **FAIL "no data is collected"** while the game ships an analytics, purchases, ads or crash SDK — found in
  `package.json` or in the native shell (Gradle files, Podfile/Podfile.lock, the Xcode project, `Package.resolved`,
  `AndroidManifest.xml`, `Info.plist`); the message names the file each SDK came from.
- **FAIL, with `--no-ads`: ad wording or a "No Ads" sale** in a build with ads off ("No ads." itself passes). When only
  one platform is ad-free, pass that platform's text files as paths.
- **WARN a level count** ("200 levels", "Level 3/120"). A count goes stale with every content update — a listing once
  said 200 while the game loaded 40, and a rule change moved the level numbers in captions. Keep it only if it is true
  for this build and you will update it. A WARN alone does not fail the run.

## Google Play

Test tracks, the first-release limits and the owner's Console steps: `references/google-play.md`.

## Asking the owner to act

Give numbered steps, one or two at a time: page, button, what to type, what to send back (usually a screenshot). Use
only menu names from these references or the owner's screenshot; an instruction once named a version-page section
that does not exist. After review, draft the reply and changes for the owner to send; a manual release waits for them.
