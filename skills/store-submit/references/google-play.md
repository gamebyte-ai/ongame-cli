# Google Play Console: tracks, first release and the owner's steps

Section names below are as seen in Play Console as of 2026-11; where a step names no exact menu path, ask the owner
for a screenshot of where they are rather than guessing one.

## What only the account owner can do

| step | why it is theirs |
|---|---|
| Create the app | Play has no API to create an app; it is a Console step. |
| Payments profile | Creating priced one-time products failed (price conversion refused) until the account had a payments profile. |
| Grant access to any tool or person | Per-app permissions; a tool with a partial grant could upload a release but not the store listing. |
| App content declarations (Data safety, advertising ID, content rating, target audience) | They are the owner's statements. |
| The first send to review | On an app that was never published, a release could not be rolled out through the API ("Only releases with status draft may be created on draft app"); it went from the Console. |
| Production releases | Each one on the owner's explicit request. |

## Test tracks

- **A real purchase cannot be tested on an emulator without Google Play** — billing reports unavailable. Use the
  internal track with license testers on a device or a Play-enabled emulator.
- When the owner approves an upload, putting the same build on internal, closed and open testing together keeps
  testers on the release candidate. This is a preference, not a Play rule.
- Raise the version code for every upload.

## Declarations that blocked a release

- **Advertising ID must match the manifest.** Declared "Yes" with no `AD_ID` permission in the manifest: the release
  preview showed an error. Declared "No" while an ads SDK put `AD_ID` in the manifest: blocked. Read the merged
  manifest of the signed bundle before answering, and give the same purposes as in Data safety.
- **Data safety needs the privacy policy URL first**; the form could not be saved without it.
- If the answers go in as a CSV, use the current question set: an older sample CSV lacked the account-creation and
  data-deletion questions and was refused.

## First production release, step by step

Give these one or two at a time and wait for the screenshot.

1. **Create the app** in Play Console: name, default language, game, free or paid, the declarations it asks for.
2. **Payments profile** (if the game sells anything), then the in-app products page: create each product with the
   ids from the product table (`store-build` references/purchases.md) and activate it.
3. **App content**: privacy policy URL first, then Data safety (`privacy-forms.md`), the advertising ID declaration,
   content rating, target audience.
4. **Store listing and settings**: text and graphics from `store-prep`, category, contact details.
5. **Internal testing**: upload the signed bundle, add testers and license testers, make a test purchase.
6. **Production**: countries and regions, create the release with the same bundle and release notes.
7. **Publishing overview**: check the list of changes, then **Send changes for review**. With managed publishing off,
   an approved release goes live by itself; with it on, the owner publishes it.
8. **After approval**, open the public store page to confirm. A release marked completed in the API was not yet live
   while managed publishing held it.
