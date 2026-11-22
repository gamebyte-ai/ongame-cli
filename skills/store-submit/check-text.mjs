#!/usr/bin/env node
// Store text check before a submission.
//   node check-text.mjs <gameDir> [--no-ads] [path ...]
// Reads the store text files under <gameDir>/store (listing, description, release notes, review notes, screenshot
// captions), or every text file in the paths you give, and reports:
//   FAIL "no data is collected" while package.json or a native dependency file (Gradle, Podfile, Xcode project,
//        Package.resolved, AndroidManifest, Info.plist) links an analytics, purchases, ads or crash SDK;
//   FAIL with --no-ads, any ad wording;
//   WARN a level count ("200 levels", "forty boards", "Level 3/120"): it goes stale with every content update.
// Exit 0 = no FAIL, 1 = a FAIL, 2 = bad arguments, no gameDir, or nothing readable (no store text file was read).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, resolve } from 'node:path';

process.on('uncaughtException', (e) => {
  console.error(`check-text: ${e.code ? `${e.code} ` : ''}${e.message}`);
  process.exit(2);
});

const args = process.argv.slice(2);
const noAds = args.includes('--no-ads');
const rest = args.filter((a) => a !== '--no-ads');
if (rest.length < 1) {
  console.error('usage: node check-text.mjs <gameDir> [--no-ads] [path ...]');
  process.exit(2);
}
const gameDir = resolve(rest[0]);
if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
  console.error(`no such game directory: ${gameDir}`);
  process.exit(2);
}
const explicit = rest.length > 1;
const targets = explicit ? rest.slice(1).map((p) => resolve(p)) : [join(gameDir, 'store')];
const nothingReadable = () => {
  console.error(explicit
    ? 'nothing readable: no text file in the paths given'
    : `nothing readable: no store text under ${join(gameDir, 'store')} (pass paths explicitly if it lives elsewhere)`);
  process.exit(2);
};
if (!explicit && !existsSync(targets[0])) nothingReadable();
for (const t of targets) {
  if (!existsSync(t)) {
    console.error(`no such path: ${t} (pass the store text files or folders explicitly)`);
    process.exit(2);
  }
}

const TEXT = new Set(['.md', '.txt', '.json', '.yml', '.yaml', '.csv', '.html', '']);
// Research notes quote competitors' pages; they are not this game's store text.
const SKIP_DIRS = new Set(['node_modules', '.git', 'research']);
// Without explicit paths, only files that hold text players or reviewers read. Console instructions, privacy pages
// and logs mention ads and data on purpose.
const STORE_TEXT = /listing|description|release[-_ ]?notes|(?:^|\/)notes[-_]|whats[-_]?new|caption|shots[^/]*\.json|review[-_]?notes|promo|subtitle|keywords/i;
const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) if (!SKIP_DIRS.has(name)) walk(join(p, name));
  } else if (TEXT.has(extname(p).toLowerCase()) && st.size < 2_000_000 && (explicit || STORE_TEXT.test(relative(gameDir, p)))) {
    files.push(p);
  }
};
targets.forEach(walk);
if (!files.length) nothingReadable();

const NUM = '(?:\\d{2,}\\+?|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?)';
const UNIT = '(?:levels|stages|puzzles|boards)';
// A count is a WARN: true and kept up to date it is a concrete fact; stale, it misleads (text said 200, the game loaded 40).
const COUNT_WHY = 'goes stale with every content update — keep it only if it is true for this build and you will update it';
const RULES = [
  { id: 'level-count', level: 'WARN', msg: `level count in store text: ${COUNT_WHY}`, re: new RegExp(`\\b${NUM}(?:\\s+of)?\\s+(?:[a-z-]+\\s+){0,2}${UNIT}\\b`, 'i') },
  { id: 'level-count', level: 'WARN', msg: `level counter (n/total) in store text: ${COUNT_WHY}`, re: /\blevel\s*\d+\s*(?:\/|of)\s*\d+/i },
];
if (noAds) {
  // "No ads." is a true claim in such a build; selling or describing ads is not.
  RULES.push({
    id: 'ads-wording',
    msg: 'ad wording in a build with ads off',
    re: /\b(?:ads|advert\w*|rewarded videos?|watch an ad|remove ads)\b/i,
    unless: (line, i) => /\bno[- ]$/i.test(line.slice(Math.max(0, i - 3), i)),
  });
  RULES.push({
    id: 'ads-wording',
    msg: '"No Ads" sold in a build with ads off',
    re: /\b(?:(?:buy|purchase|get|unlock)\s+(?:the\s+)?no[- ]ads|no[- ]ads\s+(?:pack|bundle|product|item|purchase|upgrade))\b/i,
  });
}

// SDKs that send data from a packaged game. Any of them makes "no data is collected" false.
const SDK = /revenuecat|purchases-capacitor|cordova-plugin-purchase|gameanalytics|admob|firebase|posthog|sentry|facebook|appsflyer|adjust|unity-ads|applovin/i;
const sdks = [];
const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`cannot parse ${relative(gameDir, p)}: ${e.message}`); }
};
const pkgPath = join(gameDir, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = readJson(pkgPath);
  for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) if (SDK.test(d)) sdks.push(`${d} (package.json)`);
}
const analyticsPath = join(gameDir, '.ongame', 'analytics.json');
if (existsSync(analyticsPath) && readJson(analyticsPath).audience === 'general') sdks.push('onGame analytics (audience general)');
// The native shells link SDKs too, sometimes with nothing in package.json (a Pod, a Gradle line, a plist key).
// Names are specific enough not to hit Android words like adjustResize.
const NATIVE_SDK = [
  ['AdMob', /admob|play-services-ads|Google-Mobile-Ads-SDK|GoogleMobileAds|GADApplicationIdentifier|com\.google\.android\.gms\.ads/i],
  ['Firebase', /firebase/i],
  ['GameAnalytics', /gameanalytics/i],
  ['RevenueCat', /revenuecat/i],
  ['Facebook', /com\.facebook|FBSDK|FacebookAppID/],
  ['AppsFlyer', /appsflyer/i],
  ['Adjust', /com\.adjust\.sdk|AdjustSdk|['"]Adjust['"]/],
  ['AppLovin', /applovin/i],
  ['Unity Ads', /unity-ads|UnityAds|com\.unity3d\.ads/i],
  ['Sentry', /sentry/i],
  ['PostHog', /posthog/i],
];
const NATIVE_FILES = [
  'android/app/build.gradle', 'android/app/build.gradle.kts', 'android/app/capacitor.build.gradle',
  'android/build.gradle', 'android/build.gradle.kts', 'android/app/src/main/AndroidManifest.xml',
  'ios/App/Podfile', 'ios/App/Podfile.lock', 'ios/App/App.xcodeproj/project.pbxproj', 'ios/App/App/Info.plist',
  'ios/App/CapApp-SPM/Package.swift',
];
const resolvedFiles = [];
(function findResolved(d, depth) {
  if (depth > 5 || !existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!['Pods', 'build', 'DerivedData', 'node_modules'].includes(e.name)) findResolved(join(d, e.name), depth + 1); }
    else if (e.name === 'Package.resolved') resolvedFiles.push(relative(gameDir, join(d, e.name)));
  }
})(join(gameDir, 'ios', 'App'), 0);
for (const rel of [...NATIVE_FILES, ...resolvedFiles]) {
  const p = join(gameDir, rel);
  if (!existsSync(p)) continue;
  // Comment lines name SDKs that were removed; only live lines count.
  const live = readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(?:\/\/|#|\/\*|\*|<!--)/.test(l)).join('\n');
  for (const [name, re] of NATIVE_SDK) if (re.test(live)) sdks.push(`${name} (${rel})`);
}
if (sdks.length) {
  RULES.push({
    id: 'no-data-claim',
    msg: `"no data collected" claim, but the game links: ${sdks.join(', ')}`,
    re: /\b(?:no data (?:is |will be )?collected|(?:does not|doesn't|do not|don't) collect (?:any )?(?:personal )?data|collects no data)\b/i,
  });
}

let fails = 0;
let warns = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const r of RULES) {
      const m = line.match(r.re);
      if (!m || (r.unless && r.unless(line, m.index))) continue;
      const level = r.level ?? 'FAIL';
      if (level === 'FAIL') fails++; else warns++;
      const at = Math.max(0, m.index - 30);
      console.log(`${level} ${r.id} ${relative(process.cwd(), f)}:${i + 1}: ${r.msg} — "${line.slice(at, m.index + m[0].length + 30).trim()}"`);
    }
  });
}
console.log(`${files.length} file(s) read, ${fails} fail · ${warns} warn${noAds ? ', ads off' : ''}${sdks.length ? `, SDKs: ${sdks.length}` : ''}`);
process.exit(fails ? 1 : 0);
