#!/usr/bin/env node
// Pre-upload check for a Capacitor store build of a web game. Read-only, no dependencies.
//   node store-check.mjs <gameDir> [--json]
// Run it after the store build has been synced into the native projects (`npx cap sync`).
// Exit 0 = no FAIL (read the WARN lines). Exit 1 = at least one FAIL: do not upload.
// Exit 2 = nothing to check: no capacitor.config.* (the game has no native shell yet) or bad usage.
// It reads files only; it cannot prove the app launches, sells or survives the back key. That is the smoke run.
// The ads / purchase-mode checks trust the build's own record, `build-info.json` in the shipped web root (shape in
// store-build step 3); a record that is not JSON or lacks a valid `ads` / `iap` is a FAIL. Without the record they
// fall back to `.env.store` and text hints, and report WARN/INFO, not FAIL.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// exit 1 means findings; an unreadable file or any other surprise is "could not check", so exit 2
process.on('uncaughtException', (e) => {
  console.error(`store-check: could not check (${e?.code ? `${e.code} ` : ''}${e?.message ?? e})`);
  process.exit(2);
});

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir || !existsSync(dir)) {
  console.error('usage: node store-check.mjs <gameDir> [--json]');
  process.exit(2);
}
const p = (...s) => join(dir, ...s);
const read = (f) => (existsSync(f) && statSync(f).isFile() ? readFileSync(f, 'utf8') : '');
const md5 = (f) => (existsSync(f) ? createHash('md5').update(readFileSync(f)).digest('hex') : '');
function walk(d, out = [], skip = new Set(['node_modules', '.git'])) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const q = join(d, e.name);
    if (e.isDirectory()) walk(q, out, skip);
    else out.push(q);
  }
  return out;
}
/** Body of the release build type in an app build.gradle(.kts): `release {` or `getByName("release") {` under buildTypes. */
function releaseBlock(gradleText) {
  const g = gradleText.replace(/\/\/[^\n]*/g, '');
  const bt = g.search(/\bbuildTypes\s*\{/);
  if (bt < 0) return '';
  const m = /\b(?:release|getByName\(\s*["']release["']\s*\))\s*\{/.exec(g.slice(bt));
  if (!m) return '';
  const start = bt + m.index + m[0].length;
  let i = start;
  for (let depth = 1; i < g.length && depth; i++) depth += g[i] === '{' ? 1 : g[i] === '}' ? -1 : 0;
  return g.slice(start, i - 1);
}
/** PNG colour type from the IHDR chunk: 6 = RGBA, 4 = grey + alpha. */
const pngAlpha = (f) => { const b = readFileSync(f); return b.length > 25 && (b[25] === 6 || b[25] === 4); };

const configFile = ['capacitor.config.ts', 'capacitor.config.js', 'capacitor.config.json'].map((f) => p(f)).find(existsSync);
if (!configFile) {
  const msg = 'no capacitor.config.* in this checkout, so there is no store build to check. If the store build lives on another branch, check that out (game-verify, the latest line); otherwise store-build step 2 adds the shell.';
  if (asJson) console.log(JSON.stringify({ dir, results: [], error: msg }));
  else console.log(msg);
  process.exit(2);
}

const results = [];
const check = (level, name, ok, detail = '') => results.push({ level: ok ? 'PASS' : level, name, detail: String(detail ?? '') });
const info = (name, detail) => results.push({ level: 'INFO', name, detail });

const config = read(configFile);
const hasAndroid = existsSync(p('android'));
const hasIos = existsSync(p('ios'));
const gradle = read(p('android/app/build.gradle')) || read(p('android/app/build.gradle.kts'));
const variables = read(p('android/variables.gradle'));
const manifest = read(p('android/app/src/main/AndroidManifest.xml'));
const pbx = read(p('ios/App/App.xcodeproj/project.pbxproj'));
const plist = read(p('ios/App/App/Info.plist'));
const pkg = (() => { try { return JSON.parse(read(p('package.json')) || '{}'); } catch { return {}; } })();
const envStore = read(p('.env.store'));
const hasEnvStore = envStore !== '';
info('platforms', `${hasAndroid ? 'android' : '(no android/)'} ${hasIos ? 'ios' : '(no ios/)'}`);

// ---- identity: the bundle id cannot change after the first upload, and the three places must agree
const appId = config.match(/appId['"]?\s*:\s*['"]([^'"]+)['"]/)?.[1];
const androidId = gradle.match(/applicationId\s*=?\s*['"]([^'"]+)['"]/)?.[1];
const iosIds = [...new Set([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)].map((m) => m[1]))];
check('FAIL', 'bundle id identical in capacitor config, Android and iOS',
  !!appId && (!hasAndroid || androidId === appId) && (!hasIos || (iosIds.length > 0 && iosIds.every((i) => i === appId))),
  `config ${appId} · android ${hasAndroid ? androidId : '-'} · ios ${hasIos ? iosIds.join(',') : '-'}`);

// ---- versions: one release number everywhere the player or a console can see it
const versionName = gradle.match(/versionName\s*=?\s*['"]([^'"]+)['"]/)?.[1];
const marketing = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]))];
const versions = [pkg.version, hasAndroid ? versionName : null, ...(hasIos ? marketing : [])].filter(Boolean);
check('WARN', 'one version: package.json = Android versionName = iOS MARKETING_VERSION',
  versions.length > 1 && new Set(versions).size === 1,
  `package ${pkg.version ?? '-'} · android ${hasAndroid ? versionName ?? '-' : '-'} · ios ${hasIos ? marketing.join(',') || '-' : '-'}`);

// ---- the game ships inside the app; a server.url makes it a remote page that cannot open offline
const remoteUrl = config.match(/\burl['"]?\s*:\s*['"`](https?:[^'"`]+)/)?.[1];
check('FAIL', 'the app ships the game files (no server.url)', !remoteUrl, remoteUrl ?? 'bundled');

// ---- the web build inside the native projects
const webAndroid = p('android/app/src/main/assets/public');
const webIos = p('ios/App/App/public');
const shippedDirs = [hasAndroid && webAndroid, hasIos && webIos].filter(Boolean);
const missingSync = shippedDirs.filter((d) => !existsSync(join(d, 'index.html')));
check('FAIL', 'web build synced into every native project', shippedDirs.length > 0 && missingSync.length === 0,
  missingSync.length ? `missing ${missingSync.map((d) => relative(dir, d)).join(' ')} — build the store mode, then npx cap sync` : 'synced');
const roots = shippedDirs.filter((d) => existsSync(join(d, 'index.html')));
// cap sync writes cordova.js, cordova_plugins.js and plugins/ for each platform; every other file is the one web build
const webFiles = (root) => new Map(walk(root).map((f) => relative(root, f)).filter((r) => !/^(cordova(_plugins)?\.js$|plugins[/\\])/.test(r))
  .map((r) => [r, md5(join(root, r))]));
let sameBuild = true;
if (roots.length === 2) {
  const [a, b] = roots.map(webFiles);
  const differ = [...new Set([...a.keys(), ...b.keys()])].filter((r) => a.get(r) !== b.get(r)).sort();
  sameBuild = differ.length === 0;
  check('FAIL', 'Android and iOS carry the same web build', sameBuild,
    `${differ.length} file(s) differ: ${differ.slice(0, 5).join(' ')}${differ.length > 5 ? ' …' : ''} — one platform was synced from another build; sync both from the store build`);
}
// a source file newer than the synced page means the apps carry an older game than the one in src/
if (roots.length) {
  const syncedAt = Math.min(...roots.map((r) => statSync(join(r, 'index.html')).mtimeMs));
  const newer = walk(p('src')).filter((f) => statSync(f).mtimeMs > syncedAt + 1000).map((f) => relative(dir, f));
  check('WARN', 'synced web build is newer than every src/ file', newer.length === 0,
    newer.length ? `${newer.length} newer, e.g. ${newer.slice(0, 3).join(' ')} — rebuild the store mode and sync` : '');
}

// the build's own record of what it shipped (store-build step 3); optional, but without it the mode checks only warn
const IAP_MODES = ['store', 'none', 'test'];
function buildRecord(root) {
  const text = root ? read(join(root, 'build-info.json')) : '';
  if (!text) return { text };
  let rec;
  try { rec = JSON.parse(text); } catch (e) { return { text, problem: `not valid JSON (${e.message})` }; }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { text, problem: 'not a JSON object' };
  const bad = [];
  if (typeof rec.ads !== 'string' || !rec.ads.trim()) bad.push(`ads=${JSON.stringify(rec.ads)} (want "none" or the ad network)`);
  if (!IAP_MODES.includes(rec.iap)) bad.push(`iap=${JSON.stringify(rec.iap)} (want ${IAP_MODES.join(' | ')})`);
  return bad.length ? { text, problem: bad.join('; ') } : { text, ads: rec.ads, iap: rec.iap };
}

const SAMPLE_AD = 'ca-app-pub-3940256099942544';
const adsEnv = envStore.match(/^VITE_ADS=(\w*)/m)?.[1];
const iapEnv = envStore.match(/^VITE_IAP=(\w*)/m)?.[1];
const sampleNative = [...(hasAndroid ? [p('android/app/src/main/AndroidManifest.xml'), ...walk(p('android/app/src/main/res/values'))] : []),
  ...(hasIos ? [p('ios/App/App/Info.plist')] : [])].filter((f) => read(f).includes(SAMPLE_AD)).map((f) => relative(dir, f));
let anyAdsOn = false;
let adUnitLevel = 'WARN';
// when both platforms carry the same files, checking one checks both; otherwise each is checked and named
const bundles = sameBuild ? roots.slice(0, 1) : roots;
for (const root of bundles.length ? bundles : [null]) {
  const t = bundles.length > 1 ? ` [${root === webAndroid ? 'android' : 'ios'}]` : '';
  const files = root ? walk(root).filter((f) => /\.(js|html|json)$/.test(f)) : [];
  const allJs = files.filter((f) => f.endsWith('.js')).map((f) => read(f)).join('\n');
  const gameJs = files.filter((f) => f.endsWith('.js') && !relative(root, f).startsWith('plugins')).map((f) => read(f)).join('\n');
  const record = buildRecord(root);
  if (record.problem) check('FAIL', `build-info.json in the app is valid${t}`, false, `${record.problem} — the store build must write the shape in store-build step 3`);
  else if (record.text) info(`build-info.json in the app${t}`, record.text.replace(/\s+/g, ' ').trim());
  else if (root) info(`build-info.json in the app${t}`, 'absent: ads and purchase mode come from .env.store or text hints, so those checks only WARN (store-build step 3 has the shape)');

  // ---- ads: placeholders and Google's sample ids show in a store build as "demo" or unpaid test ads
  const adsMode = record.ads ?? adsEnv;
  const adsOn = !!adsMode && !/^(none|off|false|0)$/i.test(adsMode);
  anyAdsOn ||= adsOn;
  // only the build's own record may turn an ads finding into a FAIL
  const adsLevel = adsOn && record.ads ? 'FAIL' : 'WARN';
  if (adsLevel === 'FAIL') adUnitLevel = 'FAIL';
  info(`ads in the store build${t}`, adsMode ? `${adsMode} (from ${record.ads ? 'build-info.json in the app' : '.env.store'})` : 'unknown: no build-info.json in the app and no VITE_ADS in .env.store');
  if (root) check(adsLevel, `no ad placeholder screen text in the shipped game JS${t}`, !/AD DEMO|rewarded video plays here|ad network is connected/i.test(gameJs),
    'a stand-in ad sheet is reachable in the store build');
  const sampleIn = [...sampleNative, ...(allJs.includes(SAMPLE_AD) ? ['shipped JS'] : [])];
  // with ads off a linked ad SDK still needs an app id to start; the sample one is harmless until ads are turned on
  check(adsLevel, `no Google sample AdMob ids in the app (they show test ads that never pay)${t}`, sampleIn.length === 0,
    `${sampleIn.join(' ')}${adsOn ? '' : adsMode ? ' — ads are off; replace before turning them on' : ' — ads mode unknown; replace before ads are on'}`);

  // ---- purchases: a test sheet grants paid items for free
  // "iap" in build-info.json decides (FAIL on test); VITE_IAP in .env.store or test-sheet wording in the JS only warn,
  // because the env file can differ from what was built and a native build can carry a test sheet's strings unused.
  const iapMode = record.iap || iapEnv;
  if (record.iap && iapEnv && record.iap !== iapEnv)
    check('WARN', `synced build matches .env.store (VITE_IAP)${t}`, false, `app carries iap=${record.iap}, .env.store says ${iapEnv}: rebuild the store mode and sync`);
  if (iapMode) check(record.iap ? 'FAIL' : 'WARN', `purchases are not on a TEST sheet in the store build${t}`, !/^test$/i.test(iapMode),
    `iap=${iapMode} (from ${record.iap ? 'build-info.json in the app' : '.env.store'}): the store build grants paid items without a store transaction`);
  else if (root) check('WARN', `no TEST purchase sheet text in the shipped game JS${t}`, !/TEST PURCHASE|Nothing is charged|not connected to a store/i.test(gameJs),
    'test-sheet wording found; confirm the store build sells through the store');

  // ---- legal: a privacy page inside the app, with no placeholder left, reachable from the game
  // before the first sync, read the pages from public/ (what the build will copy) instead of the app
  const legalRoot = root ?? p('public');
  const legalPages = walk(legalRoot).filter((f) => /\.html$/.test(f) && /privacy|terms/i.test(relative(legalRoot, f)));
  const privacy = legalPages.filter((f) => /privacy/i.test(relative(legalRoot, f)));
  check('FAIL', `privacy page ${root ? 'shipped inside the app' : 'in public/ (not synced yet)'}${t}`, privacy.length > 0, privacy.map((f) => relative(legalRoot, f)).join(' ') || 'none found');
  const holes = legalPages.flatMap((f) => (read(f).match(/\[[A-Z][A-Z ]{3,}\]|\{\{[A-Z_]+\}\}/g) ?? []).map((h) => `${relative(legalRoot, f)}:${h}`));
  check('FAIL', `legal pages carry no [PLACEHOLDER] or {{HOLE}}${t}`, holes.length === 0, [...new Set(holes)].join(' '));
  if (!root) { info('shipped-bundle checks', 'skipped: nothing synced into the native projects yet'); continue; }
  check('WARN', `the game links its privacy page (players must reach it in the app)${t}`, /privacy/i.test(allJs), 'no "privacy" string in the shipped JS');

  // ---- remote hosts: the store build must open offline; each host here is a runtime dependency to justify
  const remote = [...new Set((allJs.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((u) => u.toLowerCase()))]
    .filter((u) => !/(w3\.org|localhost|127\.0\.0\.1|github\.com|pixijs|threejs\.org|mozilla\.org|khronos\.org|jcgt\.org|example\.com|reactjs\.org|apache\.org|jsperf\.com|wikipedia\.org|developer\.android\.com|developer\.apple\.com)/.test(u));
  check('WARN', `shipped JS references no remote hosts${t}`, remote.length === 0, remote.slice(0, 6).join(' '));

  // ---- the onGame launch card, checked by the credit skill's own check on the page the app ships
  const creditCheck = join(dirname(fileURLToPath(import.meta.url)), '..', 'credit', 'apply.mjs');
  if (existsSync(creditCheck)) {
    const r = spawnSync(process.execPath, [creditCheck, '--check', join(root, 'index.html')], { encoding: 'utf8' });
    check('FAIL', `onGame launch card in the shipped index.html (credit --check)${t}`, r.status === 0, (r.stdout + r.stderr).trim().split('\n').pop());
  }
}
const emptyAdUnits = anyAdsOn ? [...envStore.matchAll(/^(VITE_ADMOB_\w+)=\s*$/gm)].map((m) => m[1]) : [];
if (anyAdsOn && hasEnvStore) check(adUnitLevel, '.env.store: every ad unit set when ads are on', emptyAdUnits.length === 0, emptyAdUnits.join(' '));
// an empty purchase key leaves the shop with no prices; an empty key line is direct evidence wherever the record lives
const emptyKeys = [...new Set([...envStore.matchAll(/^(VITE_\w*(?:RC|REVENUECAT|PURCHASE|IAP)\w*KEY\w*)=\s*$/gim)].map((m) => m[1]))];
if (hasEnvStore) check('FAIL', '.env.store: no empty purchase key', emptyKeys.length === 0, emptyKeys.length ? `${emptyKeys.join(' ')} empty — the shop shows no prices` : '');
else info('purchase key', 'no .env.store: the empty-key check did not run; prove prices load on the installed build (store-build references/purchases.md)');
const codeHoles = walk(p('src')).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && /\[(CONTACT EMAIL|PUBLISHER LEGAL NAME)\]/.test(read(f))).map((f) => relative(dir, f));
check('FAIL', 'no [CONTACT EMAIL] / [PUBLISHER LEGAL NAME] left in game code', codeHoles.length === 0, codeHoles.join(' '));

// ---- placeholder icons: the hashes below are @capacitor/cli 8.5.3's template icons (as of 2026-11); the hashes of the
// templates in the game's own node_modules/@capacitor/cli are added, so another installed version is covered too.
// A placeholder from a version that is neither listed nor installed passes: look at the icon (references/native-shell.md).
const PLACEHOLDER = new Map([['9e029293ab1ae8e3a6a7b7d0b7177e46', '@capacitor/cli 8.5.3'], ['0ac741c9e1701ee14dd05ea131f7cfd8', '@capacitor/cli 8.5.3']]);
function templateIconHashes() {
  const cli = p('node_modules/@capacitor/cli');
  const ver = (() => { try { return JSON.parse(read(join(cli, 'package.json'))).version; } catch { return '?'; } })();
  for (const t of ['android-template.tar.gz', 'ios-spm-template.tar.gz', 'ios-pods-template.tar.gz']) {
    let b; try { b = gunzipSync(readFileSync(join(cli, 'assets', t))); } catch { continue; }
    for (let o = 0; o + 512 <= b.length; ) {
      const name = b.toString('utf8', o, o + 100).replace(/\0.*$/s, '');
      if (!name) break;
      const size = parseInt(b.toString('utf8', o + 124, o + 136).replace(/\0.*$/s, '').trim() || '0', 8);
      if (/(ic_launcher[^/]*|AppIcon[^/]*)\.png$/.test(name))
        PLACEHOLDER.set(createHash('md5').update(b.subarray(o + 512, o + 512 + size)).digest('hex'), `@capacitor/cli ${ver} (installed)`);
      o += 512 + Math.ceil(size / 512) * 512;
    }
  }
}
templateIconHashes();
const placeholderHits = (files) => files.map((f) => [f, PLACEHOLDER.get(md5(f))]).filter(([, v]) => v).map(([f, v]) => `${relative(dir, f)} = ${v} placeholder`);
const PLACEHOLDER_LIMIT = 'matched by hash against @capacitor/cli 8.5.3 and the installed CLI templates only; view the icon too';

// ---- Android
if (hasAndroid) {
  // Google Play: new apps and app updates must target API 36 (Android 16) from 2026-08-31 (as of 2026-11)
  const target = Number((variables.match(/targetSdkVersion\s*=\s*(\d+)/) ?? gradle.match(/targetSdk(?:Version)?\s*=?\s*(\d+)/) ?? [])[1]);
  check('FAIL', 'Android targetSdk >= 36 (Play requires it for new apps and updates, as of 2026-11)', target >= 36, `targetSdk ${target || 'not found'}`);
  const debuggable = /android:debuggable="true"/.test(manifest) || /android\s*:\s*\{[^}]*webContentsDebuggingEnabled\s*:\s*true/s.test(config);
  check('FAIL', 'Android release not debuggable', !debuggable, debuggable ? 'debuggable="true" or android.webContentsDebuggingEnabled: true' : '');
  const orient = manifest.match(/android:screenOrientation="([^"]+)"/)?.[1];
  check('WARN', 'orientation-locked activity is declared a game (appCategory="game")', !orient || /android:appCategory="game"/.test(manifest),
    `screenOrientation ${orient ?? 'free'} — Android 16 keeps the lock on large screens only for games`);
  check('WARN', 'minWebViewVersion set (older WebViews cannot parse the bundle)', /minWebViewVersion/.test(config), 'android.minWebViewVersion missing');
  // the signing config the release build type names; a release signed with the debug key cannot be uploaded
  const signWith = releaseBlock(gradle).match(/signingConfig\s*=?\s*signingConfigs\.(?:getByName\(\s*["'](\w+)["']\s*\)|(\w+))/)?.slice(1).find(Boolean);
  check('FAIL', 'release build type is not signed with the debug key', signWith !== 'debug', 'buildTypes.release uses signingConfigs.debug — use the upload key (references/native-shell.md)');
  const keyFile = existsSync(p('android/keystore.properties'));
  check('WARN', 'release signing configured', !!signWith && keyFile,
    signWith ? (keyFile ? '' : `signingConfigs.${signWith} named, android/keystore.properties missing → unsigned bundle unless CI signs it`)
      : 'no release signingConfig → unsigned bundle; fine only if CI signs it with the upload key');
  const gradlew = p('android/gradlew');
  const gradlewOk = existsSync(gradlew) && (process.platform === 'win32' || (statSync(gradlew).mode & 0o111) !== 0);
  check('FAIL', 'android/gradlew present and executable', gradlewOk,
    existsSync(gradlew) ? 'chmod +x android/gradlew and commit the mode' : 'android/gradlew missing — restore the Gradle wrapper (npx cap add android writes it)');
  const launchers = walk(p('android/app/src/main/res')).filter((f) => /mipmap-[^/\\]+[/\\]ic_launcher[^/\\]*\.png$/.test(f));
  const androidHits = placeholderHits(launchers);
  check('FAIL', 'Android launcher icon replaced (not the Capacitor placeholder)', androidHits.length === 0,
    `${androidHits.slice(0, 2).join(' · ')} — generate icons with @capacitor/assets --android (${PLACEHOLDER_LIMIT})`);
}

// ---- iOS
if (hasIos) {
  const iconDir = p('ios/App/App/Assets.xcassets/AppIcon.appiconset');
  const icons = walk(iconDir).filter((f) => f.endsWith('.png'));
  const iosHits = placeholderHits(icons);
  check('FAIL', 'iOS app icon replaced (not the Capacitor placeholder)', icons.length > 0 && iosHits.length === 0,
    icons.length ? `${iosHits.join(' · ')} — generate icons with @capacitor/assets --ios (${PLACEHOLDER_LIMIT})` : 'no AppIcon png');
  const alpha = icons.filter((f) => pngAlpha(f)).map((f) => relative(iconDir, f));
  check('FAIL', 'iOS app icon has no alpha channel', alpha.length === 0, alpha.join(' '));
  check('WARN', 'export compliance declared (ITSAppUsesNonExemptEncryption)', /ITSAppUsesNonExemptEncryption<\/key>/.test(plist), 'otherwise every build asks the question in App Store Connect');
  const family = [...new Set([...pbx.matchAll(/TARGETED_DEVICE_FAMILY = "?([^";]+)"?;/g)].map((m) => m[1]))];
  check('WARN', 'iPhone only, or iPad chosen on purpose (iPad needs its own screenshots and testing)', family.length > 0 && family.every((f) => f === '1'), `TARGETED_DEVICE_FAMILY ${family.join(',') || '?'}`);
  check('WARN', 'privacy manifest in the app target', existsSync(p('ios/App/App/PrivacyInfo.xcprivacy')) && pbx.includes('PrivacyInfo.xcprivacy in Resources'),
    existsSync(p('ios/App/App/PrivacyInfo.xcprivacy')) ? 'file exists but is not in the target Resources' : 'ios/App/App/PrivacyInfo.xcprivacy missing');
  if (/NSUserTrackingUsageDescription/.test(plist))
    check('WARN', 'tracking prompt declared: the app must really track, and App Privacy must say so', false, 'NSUserTrackingUsageDescription present');
  const iosPortrait = /UISupportedInterfaceOrientations<\/key>\s*<array>(?:\s*<string>UIInterfaceOrientationPortrait[^<]*<\/string>)+\s*<\/array>/.test(plist);
  const iosLandscape = /UISupportedInterfaceOrientations<\/key>\s*<array>(?:\s*<string>UIInterfaceOrientationLandscape[^<]*<\/string>)+\s*<\/array>/.test(plist);
  const androidOrient = manifest.match(/android:screenOrientation="([^"]+)"/)?.[1] ?? '';
  if (hasAndroid && androidOrient)
    check('WARN', 'iOS and Android lock the same orientation', (/portrait/i.test(androidOrient) && iosPortrait) || (/landscape/i.test(androidOrient) && iosLandscape),
      `android ${androidOrient} · ios ${iosPortrait ? 'portrait' : iosLandscape ? 'landscape' : 'mixed/free'}`);
}

// ---- native files must not carry this machine's paths (cap sync writes the real path of a symlinked node_modules)
const nativeGen = ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle', 'ios/App/CapApp-SPM/Package.swift', 'ios/App/Podfile'].map((f) => p(f));
const abs = nativeGen.filter((f) => /["'(](\/Users\/|\/home\/|[A-Z]:\\\\)/.test(read(f))).map((f) => relative(dir, f));
check('FAIL', 'native projects reference node_modules by relative path', abs.length === 0, abs.join(' '));

if (asJson) {
  console.log(JSON.stringify({ dir, results }, null, 2));
} else {
  const w = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.level.padEnd(4)}  ${r.name.padEnd(w)}  ${r.level === 'PASS' ? '' : r.detail}`.trimEnd());
}
const fails = results.filter((r) => r.level === 'FAIL').length;
const warns = results.filter((r) => r.level === 'WARN').length;
if (!asJson) console.log(`\n${results.filter((r) => r.level === 'PASS').length} pass · ${warns} warn · ${fails} fail`);
process.exit(fails ? 1 : 0);
