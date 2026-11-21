---
name: store-build
description: Turn a finished web game (Vite + Pixi/Three) into the native store package — Capacitor iOS and Android projects, native settings, an ad-free store build, the purchases path, legal pages, the store-check gate, the AAB / IPA and an emulator smoke run. Use when the user says "wrap it for iOS/Android", "build the AAB/IPA", "make the native app", or before store-submit. Not for listing text, screenshots or the store video (that is store-prep).
---

Use this once the game plays end to end on the web. It produces native projects and a signed-ready bundle; it does
not upload, sign with the owner's key, or submit. Listing text, screenshots, the store video and the in-app rating
prompt are `store-prep`. Review, the privacy forms and pacing are `store-submit`, which takes over when this skill's
gate passes. Source-level phone behaviour (Android back key, pause on background, haptics, safe area) is
`mobile-ready`; run its check first.

## 0. Find the right line

- **Build from the game's latest line**: `game-verify` section 5 (the line check) before anything else.
- **Store branches merge before they are checked.** Art work on one branch and store work on another are each
  incomplete; run the tests and the gate on the merged result.
- **The game is in git before anything changes,** so the native diff and the test count before/after can be read.
- **If the repo says it is generated from another repo,** ask which one to work in. Work done in the generated repo
  is lost on the next export; list the files that must be carried back.

## 1. Decide, or write the default down

| Decision | Default | Why |
|---|---|---|
| Bundle id | ask, and confirm | It cannot change after the first upload in either store. |
| Ads | off in the first store build | Advice from one release, not a store rule: an ad-free first release kept the tracking prompt and the ad declarations out of its first review, and passed. Ads come in an update (`store-submit` references/privacy-forms.md). |
| Purchases | real store purchases, or none | A purchase sheet that grants paid items without a store transaction is not a store build. |
| Devices | iPhone only, the game's orientation | An iPad target needs its own screenshot set. |
| Publisher name, contact email | **from the user, never invented** | They appear in the legal pages and in-game support lines. |

## 2. Native shell

Follow `references/native-shell.md`: Capacitor (8 as of 2026-11), the config that ships the game inside the app, the
native settings for each platform, icons and splash from the game's own art, and the `cap sync` traps.

## 3. Store build mode

- One build command, used everywhere in this skill: add `"build:store": "vite build --mode store"` to `package.json`
  (prefix the game's type check, e.g. `tsc && `, if its `build` script has one). Vite then reads `.env.store`, the
  place for the store build's settings (ads off, the public purchase key).
- **Write a build record.** Have the store build emit `build-info.json` into its output root (a small Vite plugin or a
  post-build script), so the gate reads what actually shipped, not what the env file says now:

  ```json
  { "mode": "store", "version": "1.0.0", "ads": "none", "iap": "store" }
  ```

  `ads`: `none` or the ad network; `iap`: `store` (real store), `none` (sells nothing) or `test` (a purchase sheet
  that grants without a store — web testing only). The gate FAILs when this record says `iap: test` or ads on with
  placeholder/sample ads. Without the record it reads `.env.store` and text hints, and those checks only WARN.
- **With ads off the store build shows no ad UI:** rewards are granted directly or their buttons hidden, a "watch a
  video" quest gets other wording and stays reachable. A linked ad SDK keeps its native app id even with ads off;
  removing it crashed the app at launch.
- The web deploy's analytics injection is not in the native package. What the app sends is what the store build
  bundles; the privacy page and forms describe that (`analytics`, `store-submit`).

## 4. Purchases

`references/purchases.md` owns the purchase key and the product list: package ids in code, offering packages in the
purchases service and store products must line up, prices come only from the store, a missing store means
"unavailable" (never a crash), every product has an effect the game reads, the save is written the moment a purchase
is granted, and Restore returns only entitlements.

## 5. Legal pages

- Start from the privacy page `analytics` writes; add the publisher's legal name and contact, and every SDK the store
  build carries (purchases, ads, crash reporting). The page must match the game: a template once claimed purchases in
  a game that sold nothing.
- Ship the pages inside the app (offline) and link Privacy (and Terms, when the game sells) from Settings. Opened in an
  iframe, the page takes keyboard focus: forward Escape from the frame to the game's back handler.
- Placeholders such as `[CONTACT EMAIL]` stay until the user fills them; the gate fails on them, in the pages and in
  game code.

## 6. Gate

```sh
node <this skill's dir>/store-check.mjs <gameDir>      # after npx cap sync; 0 = no FAIL
```

FAIL blocks the upload; WARN is an open item to decide and report. It runs the `credit` check on the page the app
ships. A finding is a hypothesis: confirm it in the code, and fix the check if it fired on a comment or the wrong
file. Exit 2 means no `capacitor.config.*`: there is no store build yet.

## 7. Build and smoke

`references/build-and-smoke.md`: toolchain, `bundleRelease` + a debug APK, `aapt2 dump badging`, and the emulator
smoke run (launch, tap, back key read from logcat, background and return, Settings → Privacy, the `-gpu host` rule
for 3D games, and how not to cause the ANRs being measured). iOS is not built without Xcode; say so. Emulator and
browser are not a real device: report device testing as **unverified** until someone has done it.

## Report

What changed (before/now), the gate counts (pass/warn/fail), AAB size and badging, what the smoke run showed, the
owner's steps (legal fields, upload key, signing in Xcode, consoles), risks, and what was not verified. Then hand off
to `store-prep` (listing pack) and `store-submit` (review).
