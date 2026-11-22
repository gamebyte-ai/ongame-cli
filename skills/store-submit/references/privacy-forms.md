# Privacy forms: App Privacy and Data safety match the store build

The forms describe the **store build**, not the web build: list every SDK the packaged app links (analytics, purchases,
ads, crash reporting) and what each sends. The onGame analytics answers are in `skills/analytics/store-labels.md`; add
the other SDKs' rows to them.

## Where the answers must agree

| place | what must agree with the forms |
|---|---|
| The privacy policy page | names this game and every SDK; both stores ask for its URL |
| iOS privacy manifest (`PrivacyInfo.xcprivacy`) | same data types and the same tracking answer as App Privacy |
| iOS `Info.plist` | no tracking-permission text when the form says no tracking |
| Android merged manifest | `AD_ID` present only when the advertising ID declaration says yes |
| Review notes and store text | never "no data is collected" when any row exists |

## Observed mismatches

- A review note said "No data is collected" while App Privacy declared five data types.
- The build bound to the version still had a tracking-permission string (`NSUserTrackingUsageDescription`) while the
  form said no tracking: App Store Connect showed a red App Tracking Transparency warning. Bind a build without it
  before publishing no-tracking answers.
- Play advertising ID declaration against the manifest, in both directions (`google-play.md`).
- An advertising ID declaration gave one purpose while Data safety gave three for the same data.

## Ads arriving in an update

App Privacy is per app, not per version: what is published applies to the live version too. When a later version adds
ads, change the form (advertising data, tracking, if the ads SDK needs it) right before that version is submitted —
not earlier, while the live build sends no such data, and not after.

## The privacy page

A shared page that lists several games fell behind: new store games and new SDKs were missing from the live page while
their submissions pointed at it. Update the page in the same change that adds a game or an SDK, and check the live URL,
not the source, before the owner submits.
