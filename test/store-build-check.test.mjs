/**
 * skills/store-build/store-check.mjs on throwaway Capacitor projects: a minimal store build passes, and each
 * upload blocker it exists for (missing Gradle wrapper, release signed with the debug key, a bad build record,
 * a test purchase sheet, an old targetSdk, Android and iOS carrying different web builds) is a FAIL line.
 *
 * Run: node --test test/store-build-check.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHECK = path.join(ROOT, 'skills/store-build/store-check.mjs');
const CREDIT = path.join(ROOT, 'skills/credit/apply.mjs');
const ID = 'com.example.fixture';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const put = (dir, rel, text, mode) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (mode) fs.chmodSync(f, mode);
};

// The web build both platforms ship: index.html with the launch card, a game script that links privacy, the
// privacy page and the build record.
function webBuild(dir, buildInfo) {
  const web = path.join(dir, 'dist');
  put(web, 'index.html', '<!DOCTYPE html>\n<html>\n<head><title>g</title></head>\n<body>\n  <script type="module" src="./assets/game.js"></script>\n</body>\n</html>\n');
  fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(web, 'index.html')));
  execFileSync(process.execPath, [CREDIT, dir]);
  fs.copyFileSync(path.join(dir, 'index.html'), path.join(web, 'index.html'));
  put(web, 'assets/game.js', 'export const links = { privacy: "legal/privacy.html" };\n');
  put(web, 'legal/privacy.html', '<html><body>Privacy policy of Example Games.</body></html>\n');
  put(web, 'build-info.json', buildInfo);
  return web;
}

/** A Capacitor project the gate accepts with no FAIL; `opts` breaks one thing at a time. */
function fixture(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-check-'));
  made.push(dir);
  put(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  put(dir, 'capacitor.config.json', JSON.stringify({ appId: ID, appName: 'Fixture', webDir: 'dist', android: { minWebViewVersion: 107 } }));
  const web = webBuild(dir, opts.buildInfo ?? JSON.stringify({ mode: 'store', version: '1.0.0', ads: 'none', iap: 'store' }));
  fs.cpSync(web, path.join(dir, 'android/app/src/main/assets/public'), { recursive: true });
  put(dir, 'android/variables.gradle', `ext {\n    minSdkVersion = 24\n    targetSdkVersion = ${opts.targetSdk ?? 36}\n}\n`);
  put(dir, 'android/app/build.gradle', `android {
    defaultConfig {
        applicationId "${ID}"
        versionName "1.0.0"
    }
    signingConfigs {
        release { storeFile file("upload.jks") }
    }
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.${opts.signWith ?? 'release'}
        }
    }
}
`);
  put(dir, 'android/keystore.properties', 'storeFile=upload.jks\n');
  put(dir, 'android/app/src/main/AndroidManifest.xml', '<manifest><application android:appCategory="game"><activity android:screenOrientation="portrait"/></application></manifest>\n');
  if (!opts.noGradlew) put(dir, 'android/gradlew', '#!/bin/sh\n', 0o755);
  if (opts.ios) {
    fs.cpSync(web, path.join(dir, 'ios/App/App/public'), { recursive: true });
    put(dir, 'ios/App/App.xcodeproj/project.pbxproj', `PRODUCT_BUNDLE_IDENTIFIER = ${ID};\nMARKETING_VERSION = 1.0.0;\nTARGETED_DEVICE_FAMILY = 1;\n`);
    put(dir, 'ios/App/App/Info.plist', '<plist><dict><key>ITSAppUsesNonExemptEncryption</key><false/></dict></plist>\n');
  }
  return dir;
}

const check = (...args) => spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8' });
const lines = (r, level) => r.stdout.split('\n').filter((l) => l.startsWith(level));
const failLine = (r, re) => lines(r, 'FAIL').find((l) => re.test(l));

test('no arguments prints usage and exits 2', () => {
  const r = check();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});

test('a minimal Capacitor store build has no FAIL and exits 0', () => {
  const r = check(fixture());
  assert.deepEqual(lines(r, 'FAIL'), [], r.stdout);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PASS {2}Android targetSdk >= 36/);
  assert.match(r.stdout, /PASS {2}android\/gradlew present and executable/);
});

test('a missing Gradle wrapper fails', () => {
  const r = check(fixture({ noGradlew: true }));
  assert.equal(r.status, 1);
  assert.match(failLine(r, /gradlew/) ?? '', /android\/gradlew missing/);
});

test('a release build type signed with the debug key fails', () => {
  const r = check(fixture({ signWith: 'debug' }));
  assert.equal(r.status, 1);
  assert.ok(failLine(r, /not signed with the debug key/), r.stdout);
});

test('a build-info.json that is not JSON fails', () => {
  const r = check(fixture({ buildInfo: '{ "ads": "none", "iap": "store", }' }));
  assert.equal(r.status, 1);
  assert.match(failLine(r, /build-info\.json in the app is valid/) ?? '', /not valid JSON/);
});

test('a build record with iap out of its enum fails', () => {
  const r = check(fixture({ buildInfo: JSON.stringify({ ads: 'none', iap: 'sandbox' }) }));
  assert.equal(r.status, 1);
  assert.match(failLine(r, /build-info\.json in the app is valid/) ?? '', /iap="sandbox"/);
});

test('a build record that says iap: test fails', () => {
  const r = check(fixture({ buildInfo: JSON.stringify({ ads: 'none', iap: 'test' }) }));
  assert.equal(r.status, 1);
  assert.match(failLine(r, /TEST sheet/) ?? '', /iap=test \(from build-info\.json/);
});

test('a targetSdk below the Play requirement fails', () => {
  const r = check(fixture({ targetSdk: 35 }));
  assert.equal(r.status, 1);
  assert.match(failLine(r, /targetSdk >= 36/) ?? '', /targetSdk 35/);
});

test('Android and iOS shipping different web builds fails and names the file', () => {
  const dir = fixture({ ios: true });
  const same = check(dir);
  assert.equal(failLine(same, /same web build/), undefined, same.stdout);
  put(dir, 'ios/App/App/public/assets/game.js', 'export const links = { privacy: "legal/privacy.html", v: 2 };\n');
  // Capacitor's per-platform cordova shims are not part of the comparison
  put(dir, 'ios/App/App/public/cordova_plugins.js', 'module.exports = [];\n');
  const r = check(dir);
  assert.equal(r.status, 1);
  const line = failLine(r, /same web build/) ?? '';
  assert.match(line, /1 file\(s\) differ: assets[/\\]game\.js/);
  assert.doesNotMatch(line, /cordova_plugins/);
});

test('an unreadable input is "could not check" (exit 2), not a finding', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const dir = fixture();
  const gradle = path.join(dir, 'android/app/build.gradle');
  fs.chmodSync(gradle, 0o000);
  try {
    const r = check(dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /could not check/);
  } finally {
    fs.chmodSync(gradle, 0o644);
  }
});
