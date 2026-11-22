# Purchases in the store build

This file is the one home for the purchase key and the product list; other skills point here.

The game's shop is written against the `src/purchases.ts` seam (`game-code`; the shop card's own rules are in
`knowledge_get({ key: 'pattern:shell-contract' })` §9): prices from `products()`, `buy` from a tap, grant on
`'bought'`, unlocks through `owns()`, "Restore purchases" in Settings. On the web without a purchases key the handle is absent and
the shop sells nothing. The store build's job is to install a real store behind that handle —
`globalThis.ongamePurchases` with `ready`, `products`, `buy`, `owns`, `restore` — and nothing else in the game changes.

## Wiring the store

1. Pick one native library and use it on both platforms: the RevenueCat Capacitor SDK, or `cordova-plugin-purchase`
   (StoreKit + Play Billing). As of 2026-11, `cordova-plugin-purchase` 13.18+ carries Play Billing Library 9, and Play
   requires PBL 8 or later for updates from 2026-08-31; check the current requirement before choosing a version.
2. In a store-only module (imported when `import.meta.env.MODE === 'store'`, or behind `Capacitor.isNativePlatform()`),
   build the handle from the library and assign it before the shop opens. Start the store at boot **without awaiting
   it**: the store answers late, and the game must not wait on it.
3. **The public SDK key goes in `.env.store`, and it must not be empty.** A release shipped with an empty purchase
   key: every price showed "...", purchases failed, review rejected it under 2.1 (Information Needed, with a request
   for a screen recording), and only a new build fixed it. The gate fails on an empty `VITE_*RC*KEY` /
   `*PURCHASE*KEY` / `*IAP*KEY` line; only the installed build proves the key works (`store-submit`).
4. **Three lists must line up.** With RevenueCat (the ongame scaffold's path), the ids in the game's code are
   RevenueCat **package** ids in the current offering (`coins_100`, `remove_ads`), not store product ids — a package
   id is the same on web, Android and iOS. In RevenueCat, each of those packages is in the current offering and has
   the App Store product and the Play product attached; in each store console, those products exist and are active.
   A package with no product attached for a platform shows no price there.
   With `cordova-plugin-purchase`, the code uses store product ids, registered per platform: code id → App Store
   product id and Play product id (keep them identical where you can), each active in its console.
   Write the table (code id → App Store product id → Play product id → entitlement) into the game's `store/` folder,
   and keep a test that compares the code's catalog with the shop's items, so a renamed item breaks a test, not a review.
5. **Do not sell "No Ads" in a build with no ads**: hide it, keep Restore.

## Rules that came from bugs

- **No store means "unavailable", never a crash and never a test sheet.** A store bundle opened in a browser (for
  screenshots) or on an emulator without Play threw at start-up and the game screen never built. A tap on an item whose
  price had not loaded was taken as "cancelled" and swallowed silently. The handle reports not ready, the shop says the
  store is unavailable, and a tap on an unloaded item tells the player. Check on an emulator image without Play
  (`BILLING_UNAVAILABLE`): the shop opens, a purchase shows a message, coins do not change.
- **Every product does something the game reads.** For each grant, find the line that writes the field and the line that
  reads it. A premium "craft speed-up" set a flag no rule read; the player would have paid for nothing. Connect it (with a
  unit test) or remove the product.
- **Save the moment a purchase is granted.** A game that saved only on `pagehide` loses a paid consumable if the app is
  killed between the store's confirmation and the save; the store does not deliver a consumable twice.
- **Restore returns entitlements only** ("no ads", a level pack), never the one-off contents of a bundle. Unit-test it.
- **No made-up reference prices** (a struck-through "was" price) in the store build, and no prices typed into the game.
- **A purchase sheet that grants without a store is a web-only tool.** The gate fails when the build record says
  `iap: test` (SKILL step 3).
- **A game that sells nothing** needs no purchases module, no Restore row, and a privacy page without a purchases section.
