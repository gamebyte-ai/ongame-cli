# Native shell: Capacitor iOS + Android

## Install

```sh
npm i @capacitor/core@8 @capacitor/ios@8 @capacitor/android@8 @capacitor/app @capacitor/splash-screen @capacitor/haptics
npm i @capacitor-community/in-app-review@8
npm i -D @capacitor/cli@8 @capacitor/assets
npm run build:store && npx cap add android && npx cap add ios
```

- **Capacitor 8 (as of 2026-11).** `cap add ios` on Capacitor 8 makes a Swift Package Manager project
  (`ios/App/CapApp-SPM/Package.swift`, no `Podfile`); Capacitor 7 stopped when CocoaPods was not installed. Use the
  current major and match every `@capacitor/*` package to it.
- **`@capacitor-community/in-app-review`** is installed here so the native projects carry it; `store-prep` decides
  where the rating prompt is called. Installed after `cap add`, it needs another `npx cap sync`.
- **In a worktree, install `node_modules` (`npm ci`), do not symlink it.** `cap sync` writes the symlink's real,
  absolute path into `android/capacitor.settings.gradle` and `ios/App/CapApp-SPM/Package.swift`; the project then
  builds only on that machine and the other checkout is changed too. The gate fails on absolute paths there.
- `package.json` `version` is the one release number: Android `versionName`, iOS `MARKETING_VERSION` and the version
  label in Settings all come from it. Raise Android `versionCode` on every upload.

## capacitor.config.ts

```ts
const config: CapacitorConfig = {
  appId: '<bundle id the user confirmed>',   // permanent after the first upload
  appName: '<name>',
  webDir: 'dist',                            // the game ships inside the app; no server.url
  backgroundColor: '<the game's first-screen colour>',
  ios: { contentInset: 'never', allowsLinkPreview: false, scrollEnabled: false },
  server: { errorPath: 'webview-update.html' },
  android: {
    minWebViewVersion: 107,                  // see "Old WebViews"
    loggingBehavior: 'production',           // console.* reaches logcat in release builds too
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover', hidden: true },
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0e121b', showSpinner: false },
  },
};
```

- **No `server.url`.** A wrapper that loads the game from a web address does not open offline.
- **`insetsHandling: 'css'`** makes Capacitor write `--safe-area-inset-*` CSS variables. As of 2026-11, Android
  WebViews older than 140 read `env(safe-area-inset-*)` as 0 inside the app, so they need them. The game reads `var(--safe-area-inset-top,
  env(safe-area-inset-top))` (`mobile-ready`).
- **Splash:** the `credit` skill's card hides the native splash itself; set the splash colours and Android's
  `windowSplashScreenBackground` as `credit` says, so launch, card and game read as one dark frame.

## Old WebViews

Vite's default build target needs Chrome 107+. A phone on Android 8.1 with its factory WebView (61) cannot parse the
bundle: the module script never runs and the launch card waits forever, with no error. Emulator images and desktop
browsers do not show it. `minWebViewVersion: 107` sends such phones to `errorPath`, a small page that asks for a WebView
update (a link to the WebView's store page) and hides the splash itself. Check that every `src` in that page exists
in `public/` — a page copied from another game kept that game's image path. Verify on an API 27 emulator image
(WebView 61): the update page shows; on a current image the game opens.

## Native settings, after `cap add`

Do these once per project, then re-run the gate. They are edits to generated files, so read each file first.

**iOS (`ios/App/App/Info.plist`, `project.pbxproj`)**
- `UISupportedInterfaceOrientations` (and `~ipad`) = the game's orientation only.
- `TARGETED_DEVICE_FAMILY = 1` for iPhone only; `2` adds iPad and an iPad screenshot set.
- `ITSAppUsesNonExemptEncryption` = `false` when the app uses only HTTPS/OS crypto; otherwise App Store Connect asks
  on every build.
- `UIRequiredDeviceCapabilities` = `arm64` (the template still lists `armv7`).
- `PrivacyInfo.xcprivacy` in `ios/App/App/` **and in the App target's Resources** — a file in the folder but not in
  the target is not shipped. Its declarations match the App Privacy answers (`store-submit`).
- No `NSUserTrackingUsageDescription` unless the app really shows the tracking prompt; App Store Connect flagged one in
  a build that did not track.

**Android**
- `AndroidManifest.xml`: the activity's `android:screenOrientation`, and `android:appCategory="game"` on the
  application — Android 16 ignores orientation locks on large screens except for games.
- Drop `android.permission.INTERNET` only if the game is fully offline (no ads, purchases, analytics or online play).
- `variables.gradle`: `targetSdkVersion` 35 or higher.
- `app/build.gradle`: a release `signingConfig` read from `android/keystore.properties`; keep that file and the
  `.jks` out of git. Without it `bundleRelease` gives an unsigned bundle. The upload key is the owner's.
- `styles.xml`: if the window shows a band of another colour in the cutout on old WebViews, set
  `android:windowBackground` to the HUD's top colour.
- `android/gradlew` must stay executable; an export dropped the bit once (`Permission denied`). Commit the mode.

## Icons and splash

```sh
npx capacitor-assets generate --ios --android --iconBackgroundColor '<bg>' --splashBackgroundColor '<bg>'
```

- `cap add` leaves Capacitor's placeholder icon and splash. Pass `--ios --android`: without them the tool runs in PWA
  mode, rewrites `public/manifest.json` and adds icons under `public/` — revert those.
- Look at the result, not only its presence: extract the built app's 60pt@2x icon and view it. A store build once
  carried the placeholder. The gate fails on Capacitor's placeholder icon by hash — the @capacitor/cli 8.5.3 template
  and whatever CLI version is installed in the game — so a placeholder from another version can still pass it.
- The App Store icon has no alpha channel.

## After every web change

`npm run build:store && npx cap sync`, then the gate. The gate warns when a `src/` file is newer than the synced page,
or when Android and iOS carry different builds.
