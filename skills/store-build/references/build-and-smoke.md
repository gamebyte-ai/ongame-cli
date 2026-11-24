# Build the AAB and smoke-test it on an emulator

This file is the home of the emulator rules (`-gpu host` for 3D games, and a harness that does not cause the ANRs it
measures); other skills point here.

## Toolchain without Android Studio

JDK 21 and the Android command-line tools are enough: `sdkmanager "platform-tools" "platforms;android-36"
"build-tools;36.0.0"`, plus `"emulator" "system-images;android-36;google_apis;arm64-v8a"` for the smoke run (about
1.5 GB more). Install them into a user cache directory, not system-wide, and reuse them across games. Point the
project at the SDK with `android/local.properties` (`sdk.dir=…`, not committed).

Worktree and sandbox guards often refuse `export X=$(…)` and commands with variables in the program position: use
literal paths, one command per call (`env JAVA_HOME=<jdk>/Contents/Home ./android/gradlew -p android …`).

## Build

```sh
npm run build:store && npx cap sync
env JAVA_HOME=<jdk> ./android/gradlew -p android bundleRelease assembleDebug
<sdk>/build-tools/36.0.0/aapt2 dump badging android/app/build/outputs/apk/debug/app-debug.apk | head
```

Read the badging: package = the bundle id, `versionName`, `targetSdkVersion`, and the permissions — each permission is a
privacy-form answer. Report the AAB size. Without `keystore.properties` the release bundle is unsigned: say so, the
upload key is the owner's.

iOS needs Xcode on a Mac to archive. Without it, say "iOS not built"; `plutil -lint` checks only the plist syntax.
When an IPA is built (locally or in CI), unzip it and look at the icon and at `Info.plist` before calling it done.

## Emulator smoke run

```sh
emulator -avd <avd> -no-window -no-audio -no-boot-anim -gpu host -no-snapshot
adb install -r app-debug.apk && adb shell am start -W -S <bundle id>/.MainActivity
adb exec-out screencap -p > shot.png          # a screenshot after every step
adb shell input tap <x> <y>
adb shell input keyevent KEYCODE_BACK
adb logcat | grep Capacitor/Console
```

Walk: launch → card → first screen; play a level; Settings → Privacy opens and the back key closes it; popup → back
closes it; back at the root sends the app to the background (it does not quit mid-game); return from the background
resumes with sound; the shop shows prices or "unavailable".

- **3D games: `-gpu host`.** On the default software renderer a three.js game took ~30 s to its home screen and taps
  gave ANRs. The trace (`/data/anr/`, needs `adb root`) showed the main thread waiting in
  `ThreadedRenderer.syncAndDrawFrame` (GPU, not JS), with system_server and SystemUI also not responding in the same
  minute. With `-gpu host` the same APK reached its home screen in ≤12 s with no ANR. When you see an ANR, read the
  trace's main thread first, then the 3D layer's pixel ratio (`mobile-ready`).
- **Read state changes from logcat, not only from screenshots.** A WebView layer removed from the DOM stayed in the
  emulator's screenshot for a while (a privacy page still visible 1 s after the back key, gone at 3 s). Log the state
  change, wait about a second, and capture again before rewriting working code.
- **A back press sent while the app is coming to the foreground is swallowed.** Capture after each press.
- **Do not load the device you are measuring.** A harness that ran `dumpsys window` every 100 ms and fired dozens of
  parallel `adb input` commands choked system_server and produced ANRs the game did not cause. Drive the device with
  one loop and no polling.
- **Old WebView:** an API 27 image (WebView 61) shows the update page from `errorPath`; see `native-shell.md`.
- **Cold start** for the report: `adb shell am start -W -S <pkg>/.MainActivity` five times, median. Android counts a
  cold start of 5 s or more as excessive; the first native frame Android measures is earlier than "game ready", so log
  a first-screen marker to logcat and time to that.

## What the smoke run does not prove

An emulator image is not a low-end phone, and a desktop browser is not a WebView. Report real-device testing as
**unverified** until someone has installed the build on a phone (an internal test track or TestFlight).
