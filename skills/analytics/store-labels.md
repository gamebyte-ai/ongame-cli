# Store privacy labels for a game with onGame analytics

Use these answers when the game ships to the App Store or Google Play. They hold for a game whose
`.ongame/analytics.json` says `"audience": "general"`. A game with `"audience": "children"` sends no analytics:
declare no analytics data for it.

The game collects these events, and only these. `events.json` beside this file is the source; this list matches it.

| event | what it records |
|---|---|
| `session_start` | a play session started, and whether it is the first one |
| `session_end` | a play session ended, and how long it lasted |
| `engagement` | active play time, every 30 seconds while the game is visible |
| `screen_view` | which game screen opened, and the time spent on the previous one |
| `ui_tap` | which button or game object was tapped, by its name (never the tap position) |
| `level_start` | a level attempt started |
| `level_complete` | a level was won, with its score |
| `level_fail` | a level was lost, and how far the player got |
| `level_quit` | the player left a level before it ended |
| `level_abandoned` | a level was still open when the session ended |
| `economy` | in-game currency earned or spent, and where |
| `tutorial_step` | a tutorial step was shown or finished |
| `ad_break` | an ad was offered, shown or skipped |
| `purchase` | an in-game purchase was started, finished or cancelled |
| `feedback` | a rating or yes/no answer the player gave in the game |
| `consent` | the player turned analytics on or off |
| `design:<name>` | a game-specific event: at most 8 numbers, yes/no values or short codes |

Every event is linked to a random id the game makes on the device. The id is pseudonymous, not anonymous.

## Apple App Privacy

- Data type **Usage Data → Product Interaction**: collected.
- Data type **Usage Data → Other Usage Data**: collected.
- For both: **not linked to the user's identity**, **not used for tracking**. Purpose: **Analytics**.
- No App Tracking Transparency prompt is needed for analytics.
- A game that sells items keeps its existing **Purchases** entry from the purchases setup.

## Google Play Data safety

- **App activity → App interactions**: collected, **not shared**.
- Purpose: **Analytics**.
- Mark it **optional** when the game shows the consent prompt; otherwise **required**.
- Data is encrypted in transit. Where the game has the Analytics switch, the player can turn it off in settings.

## Privacy policy link

Both stores ask for a privacy policy URL. Use the published game's `/privacy.html`, which the analytics upgrade
writes to `public/privacy.html`.
