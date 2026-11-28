# Phone check for the menu-icons skill

`menu-icons-phone.mjs` plays a built game's bottom menu on a 390x844 touch screen and checks that its icons move
part by part. It is not in `node --test test/*.test.mjs`: it needs a built game and a browser.

## Make the fixture game

The fixture is a fresh game from the onGame CLI with the template's bottom menu:

1. `scaffold_materialize({ gameDir, gameName: "Petal Market", engine: "gamelabs", dimension: "2d" })`, then
   `deps_install({ gameDir })`.
2. `template_get({ key: "template:shell-bottom-nav" })`. Save its two TypeScript blocks as
   `src/shell/BottomTabs.ts` and `src/shell/BottomNav.ts`.
3. Before: copy `menu-icons-fixture/before/src/` over the game's `src/`. Run `npm run build` and keep `dist/`.
   Its three icons are one plain shape each.
4. After: run `node skills/menu-icons/apply.mjs <gameDir>`. Copy `menu-icons-fixture/after/src/` over the game's
   `src/`. `node skills/menu-icons/check.mjs <gameDir>` must exit 0. Run `npm run build` and keep `dist/`.
   The after files were written by an agent that read only `skills/menu-icons/SKILL.md`.

## Run it

```sh
NODE_PATH=<folder holding playwright> node test/browser/menu-icons-phone.mjs <before dist> <out> --before
NODE_PATH=<folder holding playwright> node test/browser/menu-icons-phone.mjs <after dist> <out>
```

Set `CHROME` to a Chrome binary when Playwright's own build is not installed.

The `--before` run checks one thing: a one-piece icon at rest draws the same pixels 0.7 s apart. That is the
control for the after run's first check. The after run checks:

- the selected icon idles part by part, at full strength, and the others at 35 %;
- a press moves the pressed icon's parts while the finger is still down, and picks nothing;
- the tap picks the tab and plays a part sequence of at most 0.8 s of game time;
- Calm keeps every part still, through a tap and a pick;
- moving every part costs under 0.1 ms per frame.

It records each input's effect from before the input lands, so a slow host cannot hide a press. Both runs record
`before.webm` or `after.webm`: every icon idling, then Shop, Settings and Home tapped in turn.
