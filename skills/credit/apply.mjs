#!/usr/bin/env node
/**
 * The "Built with onGame" credit: one self-contained block in a game's index.html.
 *
 *   node apply.mjs <gameDir> [--badge bottom|top|off] [--wait load|ready]   # add or update the block (idempotent)
 *   node apply.mjs --check <html>        # exit 0 when <html> carries the current block, 1 otherwise
 *
 * --badge moves the first-screen pill off the game's own UI. --wait ready keeps the card up until the game calls
 * window.ongameCredit.ready() (for a game that draws its first screen well after the page load event). Both
 * choices are kept in the block, so a later run without the flags (the one publish makes) keeps them.
 *
 * What the block does, with no hook into the game's code, so it fits any engine:
 * - a dark card with the onGame mark shows from the first paint: the pixels pulse in a wave towards the play
 *   mark, a light passes through it, and the wordmark eases in (~2.2 s);
 * - the card leaves once the page has loaded and the motion has played (2.4 s), on a tap after load, or at 6 s at
 *   the latest, so a slow or broken boot is never hidden behind it (a CSS-only exit at 6.5 s covers a page whose
 *   scripts never run: a blocking CSP, a syntax error);
 * - a small "BUILT WITH onGame" pill then sits over the game's first screen and leaves on the player's first tap;
 * - inside a Capacitor app it hides the native launch splash itself and starts the motion when the card is seen.
 *
 * The block is fenced by markers and versioned; edit it here, never inside a game.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = 1;
const OPEN = `<!-- ongame:brand-credit v${VERSION} -->`;
const CLOSE = '<!-- /ongame:brand-credit -->';
const FENCE = /<!-- ongame:brand-credit v\d+ -->[\s\S]*?<!-- \/ongame:brand-credit -->\n?/;

const SVG = "<svg class=\"ogc-logo\" role=\"img\" aria-label=\"onGame\" viewBox=\"0 0 1174 250\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"ogc-grad\" x1=\"12\" y1=\"125\" x2=\"234\" y2=\"125\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#E0A24A\"/><stop offset=\"1\" stop-color=\"#CB8732\"/></linearGradient><linearGradient id=\"ogc-shine\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\".75\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient><clipPath id=\"ogc-clip\"><path d=\"M12 118.643C12 113.377 16.256 109.109 21.506 109.109H34.1807C39.4308 109.109 43.6868 113.377 43.6868 118.643V131.355C43.6868 136.621 39.4308 140.889 34.1807 140.889H21.506C16.256 140.889 12 136.621 12 131.355V118.643Z\"/><path d=\"M50.0241 86.8626C50.0241 81.5975 54.2801 77.3289 59.5302 77.3289H72.205C77.455 77.3289 81.711 81.5975 81.711 86.8626V99.5756C81.711 104.841 77.455 109.11 72.205 109.11H59.5302C54.2801 109.11 50.0241 104.841 50.0241 99.5756V86.8626Z\"/><path d=\"M50.0241 150.424C50.0241 145.159 54.2801 140.89 59.5302 140.89H72.205C77.455 140.89 81.711 145.159 81.711 150.424V163.137C81.711 168.402 77.455 172.671 72.205 172.671H59.5302C54.2801 172.671 50.0241 168.402 50.0241 163.137V150.424Z\"/><path d=\"M112.91 27.8523C102.402 20.5562 88.049 28.0992 88.048 40.9171V64.6165C88.048 71.6373 93.723 77.3287 100.723 77.3287H107.06C114.06 77.3287 119.735 83.0202 119.735 90.0405V96.3965C119.735 96.3965 119.735 109.109 107.06 109.109L97.554 109.109C92.304 109.109 88.048 113.377 88.048 118.643V131.355C88.048 136.621 92.304 140.889 97.554 140.889H110.229C115.479 140.889 119.735 136.621 119.735 131.355L119.735 121.821C119.735 121.821 119.735 109.11 132.41 109.11H138.747C145.747 109.11 151.422 114.801 151.422 121.822V128.178C151.422 135.199 145.747 140.89 138.747 140.89H132.41C125.41 140.89 119.735 146.582 119.735 153.602V159.959C119.735 166.979 114.06 172.671 107.06 172.671H100.723C93.723 172.671 88.048 178.362 88.048 185.383V209.082C88.048 221.9 102.402 229.443 112.91 222.147L234.004 138.065C243.104 131.746 243.104 118.254 234.004 111.935L112.91 27.8523Z\"/></clipPath></defs><path class=\"ogc-px\" style=\"--d:0ms\" d=\"M12 118.643C12 113.377 16.256 109.109 21.506 109.109H34.1807C39.4308 109.109 43.6868 113.377 43.6868 118.643V131.355C43.6868 136.621 39.4308 140.889 34.1807 140.889H21.506C16.256 140.889 12 136.621 12 131.355V118.643Z\" fill=\"url(#ogc-grad)\"/><path class=\"ogc-px\" style=\"--d:160ms\" d=\"M50.0241 86.8626C50.0241 81.5975 54.2801 77.3289 59.5302 77.3289H72.205C77.455 77.3289 81.711 81.5975 81.711 86.8626V99.5756C81.711 104.841 77.455 109.11 72.205 109.11H59.5302C54.2801 109.11 50.0241 104.841 50.0241 99.5756V86.8626Z\" fill=\"url(#ogc-grad)\"/><path class=\"ogc-px\" style=\"--d:160ms\" d=\"M50.0241 150.424C50.0241 145.159 54.2801 140.89 59.5302 140.89H72.205C77.455 140.89 81.711 145.159 81.711 150.424V163.137C81.711 168.402 77.455 172.671 72.205 172.671H59.5302C54.2801 172.671 50.0241 168.402 50.0241 163.137V150.424Z\" fill=\"url(#ogc-grad)\"/><path class=\"ogc-tri\" d=\"M112.91 27.8523C102.402 20.5562 88.049 28.0992 88.048 40.9171V64.6165C88.048 71.6373 93.723 77.3287 100.723 77.3287H107.06C114.06 77.3287 119.735 83.0202 119.735 90.0405V96.3965C119.735 96.3965 119.735 109.109 107.06 109.109L97.554 109.109C92.304 109.109 88.048 113.377 88.048 118.643V131.355C88.048 136.621 92.304 140.889 97.554 140.889H110.229C115.479 140.889 119.735 136.621 119.735 131.355L119.735 121.821C119.735 121.821 119.735 109.11 132.41 109.11H138.747C145.747 109.11 151.422 114.801 151.422 121.822V128.178C151.422 135.199 145.747 140.89 138.747 140.89H132.41C125.41 140.89 119.735 146.582 119.735 153.602V159.959C119.735 166.979 114.06 172.671 107.06 172.671H100.723C93.723 172.671 88.048 178.362 88.048 185.383V209.082C88.048 221.9 102.402 229.443 112.91 222.147L234.004 138.065C243.104 131.746 243.104 118.254 234.004 111.935L112.91 27.8523Z\" fill=\"url(#ogc-grad)\"/><g clip-path=\"url(#ogc-clip)\"><rect class=\"ogc-shine\" x=\"-260\" y=\"0\" width=\"180\" height=\"250\" fill=\"url(#ogc-shine)\"/></g><path class=\"ogc-word\" d=\"M333.965 204.82C296.6 204.82 265.345 175.68 265.345 141.135C265.345 106.59 296.6 77.685 333.965 77.685C371.095 77.685 402.35 106.59 402.35 141.135C402.35 175.68 371.095 204.82 333.965 204.82ZM333.965 167.22C348.065 167.22 360.05 155.235 360.05 141.135C360.05 127.035 348.065 115.285 333.965 115.285C319.63 115.285 307.645 127.035 307.645 141.135C307.645 155.235 319.63 167.22 333.965 167.22ZM485.949 77.685C512.034 77.685 530.599 97.19 530.599 124.685V202H487.359V135.26C487.359 123.51 479.839 115.285 469.029 115.285C458.924 115.285 451.639 123.04 451.639 133.85V202H406.284V80.505H451.639V92.725C459.159 83.325 471.379 77.685 485.949 77.685ZM615.888 141.135V107.53H691.558V176.15C674.873 194.245 650.198 204.82 624.818 204.82C576.408 204.82 535.753 166.515 535.753 121.16C535.753 75.805 576.408 37.735 624.818 37.735C650.198 37.735 674.873 48.31 691.558 66.17L657.953 95.545C649.963 85.205 637.743 79.095 624.818 79.095C602.023 79.095 582.753 98.365 582.753 121.16C582.753 144.19 602.023 163.46 624.818 163.46C632.808 163.46 640.563 161.11 647.378 156.88V141.135H615.888ZM758.582 77.685C789.367 77.685 814.747 97.19 814.747 130.325V202H771.272V193.305C763.047 200.825 751.532 204.82 740.017 204.82C713.932 204.82 693.252 188.84 693.252 166.045C693.252 142.31 716.282 125.625 745.657 125.625C753.647 125.625 762.577 127.505 771.272 131.03V130.325C771.272 118.34 760.462 111.29 746.362 111.29C734.847 111.29 727.092 114.345 716.987 119.515L703.122 92.02C720.042 83.56 738.137 77.685 758.582 77.685ZM751.062 178.03C761.872 178.03 770.332 173.095 771.272 166.045V154.53C767.042 152.415 759.052 150.77 752.002 150.77C742.837 150.77 736.257 156.645 736.257 164.87C736.257 172.625 742.367 178.03 751.062 178.03ZM978.052 77.685C1003.43 77.685 1024.11 97.19 1024.11 124.685V202.235H980.872V132.91C980.872 122.57 973.822 115.285 963.717 115.285C953.612 115.285 946.562 122.1 946.562 131.5V202.235H903.322V132.91C903.322 122.57 896.272 115.285 886.167 115.285C876.062 115.285 869.012 122.1 869.012 131.5V202H823.657V80.505H869.012V95.31C874.887 84.5 886.167 77.685 900.502 77.685C916.247 77.685 930.347 85.205 938.572 97.66C945.622 85.44 960.192 77.685 978.052 77.685ZM1091.83 170.98C1100.99 170.98 1110.86 167.22 1118.85 160.875L1143.76 186.02C1132.95 197.065 1112.27 204.82 1093.71 204.82C1054.93 204.82 1027.67 178.265 1027.67 140.9C1027.67 103.77 1054.23 77.685 1091.83 77.685C1130.84 77.685 1153.87 105.18 1153.87 151.945H1067.86C1071.38 163.46 1080.31 170.98 1091.83 170.98ZM1091.83 111.525C1081.02 111.525 1072.56 118.105 1068.56 128.21H1112.74C1109.45 118.105 1101.7 111.525 1091.83 111.525Z\" fill=\"#fff\"/></svg>";

const BLOCK_TEMPLATE = `${OPEN}
<style>
  #ogc-card { position: fixed; inset: 0; z-index: 2147483000; background: #0e121b; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 2.2vh; transition: opacity .45s ease; }
  #ogc-card.ogc-done { opacity: 0; pointer-events: none; }
  #ogc-card { animation: ogc-bail 0s 6.5s forwards; }
  @keyframes ogc-bail { to { opacity: 0; visibility: hidden; pointer-events: none; } }
  #ogc-card .ogc-logo { width: min(64vw, 330px); }
  .ogc-cap { font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: .42em;
    margin-left: .42em; color: #8d96a8; text-transform: uppercase; }
  .ogc-logo { height: auto; overflow: visible; }
  .ogc-logo * { transform-box: fill-box; transform-origin: center; }
  .ogc-shine { opacity: 0; }
  .ogc-play .ogc-px, .ogc-pulse .ogc-px { animation: ogc-px .9s var(--d) ease-in-out 2 both; }
  .ogc-play .ogc-tri, .ogc-pulse .ogc-tri { animation: ogc-tri .9s .3s 2 both; }
  .ogc-play .ogc-shine, .ogc-pulse .ogc-shine { animation: ogc-shine .9s .42s ease-in-out 2 both; }
  .ogc-play .ogc-word { animation: ogc-word .6s .15s cubic-bezier(.2,.8,.2,1) both; }
  #ogc-card.ogc-play .ogc-cap { animation: ogc-fade .4s both; }
  @keyframes ogc-px { 0% { transform: none; opacity: .35; } 30% { transform: scale(1.35); opacity: 1; } 100% { transform: none; opacity: 1; } }
  @keyframes ogc-tri { 0% { opacity: .75; } 40%, 100% { opacity: 1; } }
  @keyframes ogc-shine { 0% { opacity: 1; transform: none; } 100% { opacity: 1; transform: translateX(560px); } }
  @keyframes ogc-word { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
  @keyframes ogc-fade { from { opacity: 0; } to { opacity: 1; } }
  #ogc-badge { position: fixed; z-index: 2147482999; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
    background: rgba(0, 0, 0, .34); pointer-events: none; overflow: hidden; }
  #ogc-badge[data-pos="top"] { bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 12px); }
  #ogc-badge[hidden], #ogc-badge[data-pos="off"] { display: none; }
  #ogc-badge .ogc-cap { font-size: 10px; letter-spacing: .24em; margin-left: 0; color: #e6ecf7; }
  #ogc-badge .ogc-logo { width: 84px; }
  @media (prefers-reduced-motion: reduce) { #ogc-card *, #ogc-badge * { animation: none !important; } }
</style>
<div id="ogc-card" class="ogc-play" data-wait="__WAIT__" aria-label="Built with onGame"><div class="ogc-cap">Built with</div>${SVG}</div>
<div id="ogc-badge" data-pos="__POS__" hidden aria-label="Built with onGame"><div class="ogc-cap">Built with</div></div>
<script>
(function () {
  var MIN = 2400, MAX = 6000, FADE = 450, PULSE = 7000;
  var card = document.getElementById('ogc-card'), badge = document.getElementById('ogc-badge');
  if (!card || !badge) return;
  var logo = card.querySelector('.ogc-logo').cloneNode(true);
  // The pill's copy of the mark needs its own gradient/clip ids; the card (and its ids) is removed later.
  logo.querySelectorAll('[id]').forEach(function (n) {
    var from = 'url(#' + n.id + ')', to = 'url(#' + n.id + '-b)';
    n.id += '-b';
    logo.querySelectorAll('[fill="' + from + '"], [clip-path="' + from + '"]').forEach(function (u) {
      if (u.getAttribute('fill') === from) u.setAttribute('fill', to);
      if (u.getAttribute('clip-path') === from) u.setAttribute('clip-path', to);
    });
  });
  badge.appendChild(logo);
  function replay(el, cls) { el.classList.remove('ogc-play', 'ogc-pulse'); void el.offsetWidth; el.classList.add(cls); }
  var loaded = document.readyState === 'complete', gone = false;
  // data-wait="ready": the game says when its first screen is drawn; "load" (default): the page load event is enough.
  var ready = card.getAttribute('data-wait') !== 'ready';
  var cap = window.Capacitor, splash = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.SplashScreen;
  // When the motion started. In an app the page paints under the launch splash, so the clock starts only once the
  // splash is gone and the motion replays from the top; on the web it is the first paint.
  var started = splash ? Infinity : 0;
  if (splash) {
    Promise.resolve(splash.hide({ fadeOutDuration: 150 })).catch(function () {}).then(function () { started = performance.now(); replay(card, 'ogc-play'); });
  }
  window.addEventListener('load', function () { loaded = true; });
  function showBadge() {
    badge.hidden = false;
    replay(badge, 'ogc-play');
    var iv = setInterval(function () { replay(badge, 'ogc-pulse'); }, PULSE);
    window.addEventListener('pointerdown', function hide() {
      badge.hidden = true;
      clearInterval(iv);
      window.removeEventListener('pointerdown', hide, true);
    }, true);
  }
  function dismiss() {
    if (gone) return;
    gone = true;
    card.classList.add('ogc-done');
    setTimeout(function () { card.remove(); showBadge(); }, FADE);
  }
  card.addEventListener('pointerdown', function () { if (loaded && ready) dismiss(); });
  var poll = setInterval(function () {
    var now = performance.now(), t = now - started;
    // MAX is the ceiling either way: from the motion start, or from navigation if the splash never answered.
    if ((loaded && ready && t >= MIN) || t >= MAX || (started === Infinity && now >= MAX)) { clearInterval(poll); dismiss(); }
  }, 100);
  window.ongameCredit = { dismiss: dismiss, ready: function () { ready = true; } };
})();
</script>
${CLOSE}
`;

function fail(msg, code = 2) {
  console.error(`credit: ${msg}`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const file = args[1];
  if (!file || !existsSync(file)) fail(`--check needs an existing html file, got ${file ?? 'nothing'}`);
  const html = readFileSync(file, 'utf8');
  const ok = html.includes(OPEN) && html.includes('id="ogc-card"') && html.includes(CLOSE);
  console.log(ok ? `brand-credit v${VERSION}: present in ${file}` : `brand-credit v${VERSION}: MISSING from ${file}`);
  process.exit(ok ? 0 : 1);
}

const gameDir = args[0];
if (!gameDir || gameDir.startsWith('--')) fail('usage: apply.mjs <gameDir> [--badge bottom|top|off] [--wait load|ready] | apply.mjs --check <html>');
/** A --flag value, validated; undefined when the flag is absent. */
function option(name, allowed) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!allowed.includes(value)) fail(`${name} takes ${allowed.join(', ').replace(/, ([^,]*)$/, ' or $1')}, got ${value ?? 'nothing'}`);
  return value;
}
const asked = option('--badge', ['bottom', 'top', 'off']);
const askedWait = option('--wait', ['load', 'ready']);
const index = join(gameDir, 'index.html');
if (!existsSync(index)) fail(`${index} not found — the credit goes into the game's own index.html`);
const html = readFileSync(index, 'utf8');

const old = html.match(FENCE)?.[0] ?? '';
const kept = old.match(/id="ogc-badge" data-pos="(bottom|top|off)"/)?.[1];
const keptWait = old.match(/id="ogc-card" class="ogc-play" data-wait="(load|ready)"/)?.[1];
const BLOCK = BLOCK_TEMPLATE.replace('__POS__', asked ?? kept ?? 'bottom').replace('__WAIT__', askedWait ?? keptWait ?? 'load');
let next;
if (FENCE.test(html)) {
  next = html.replace(FENCE, BLOCK);
} else {
  const body = html.match(/<body[^>]*>\n?/i);
  if (!body) fail(`${index} has no <body> tag`);
  const at = body.index + body[0].length;
  next = html.slice(0, at) + BLOCK + html.slice(at);
}
if (next === html) {
  console.log(`brand-credit v${VERSION}: already current in ${index}`);
} else {
  writeFileSync(index, next);
  console.log(`brand-credit v${VERSION}: written to ${index}`);
}
