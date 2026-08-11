---
name: unity
description: Unity setup and control — install the Editor per platform, connect the Unity MCP so the agent can drive the Editor, and use the Unity CLI for headless builds. Load this whenever the target engine is Unity, or when a Unity project is open and the Unity tools are missing.
---

# Unity — getting the agent actually connected to the Editor

Read this when the engine is **unity** (intake judges that — see `skills/intake/SKILL.md` step 3b) or when you
are standing in a Unity project and have no Unity tools in your tool list.

**Everything below is from Unity's own documentation, not from a run we performed.** Vendor setup changes;
if a step does not match what the user sees, believe their screen over this file, say so, and work from what
is actually in front of you. Do not insist on a menu path that is not there.

---

## 0. The one thing that goes wrong most

Without a Unity MCP connection you cannot see the Editor at all. You can still write C# files to disk — and
that is exactly the trap: **writing scripts is not building a game.** You will not know whether the project
compiles, whether a scene contains what you think, whether a prefab bound, or whether anything renders. A
Unity build reported as working on the strength of files existing is a claim, not a fact.

So: if the Unity tools are absent, that is a **fault**, not a detail to route around. Follow the refusal rule
in `/make-game` — stop, say plainly that you cannot see the Editor, offer to set it up, and let the user
decide. Do not quietly produce a folder of C# and call it a Unity game.

---

## 1. Is Unity even installed?

Check before offering anything, so you are not walking a user through a setup they already have.

```bash
# Editors installed via the Hub (macOS / Linux)
ls ~/Applications/Unity/Hub/Editor 2>/dev/null || ls /Applications/Unity/Hub/Editor 2>/dev/null
# Windows (PowerShell)
Get-ChildItem "$env:PROGRAMFILES\Unity\Hub\Editor" -ErrorAction SilentlyContinue
```

A project's required version is pinned in `ProjectSettings/ProjectVersion.txt` — read it and match it. Opening
a project with a different Editor version triggers an upgrade the user may not want, so never pick a version
for them when the file names one.

---

## 2. Installing Unity — per platform

The Hub is the installer for Editors; it is a normal GUI app download from unity.com/download. Once the Hub
exists, Editors can be installed **headlessly from the CLI**, which is what you should prefer.

Note the argument quirk, because it is the most common reason these commands appear broken: **macOS and
Windows need `-- --headless`, Linux needs a single `--headless`.**

```bash
# macOS
/Applications/Unity\ Hub.app/Contents/MacOS/Unity\ Hub -- --headless install \
  --version 6000.0.28f1 --changeset <changeset>

# Linux
~/Applications/Unity\ Hub.AppImage --headless install \
  --version 6000.0.28f1 --changeset <changeset>
```

```powershell
# Windows
& "C:\Program Files\Unity Hub\Unity Hub.exe" -- --headless install `
  --version 6000.0.28f1 --changeset <changeset>
```

- The **changeset** is version-specific and comes from Unity's release page for that exact version; it is not
  optional for archived versions and you cannot invent it. If you do not have it, ask, or install from the Hub
  GUI instead of guessing one.
- Platform modules (Android, iOS, WebGL, IL2CPP) are a **separate** step — `install-modules` (alias `im`) —
  and a build target the project needs but the Editor lacks fails at build time, not install time. If the
  delivery target is a mobile or desktop build, get the module in place before promising a build.
- `-- --headless help` lists the full command set.

---

## 3. Unity MCP — how you actually get to control the Editor

This is Unity's **official** integration, shipped in the AI Assistant package. It is what turns "I wrote some
C#" into "I opened the scene, checked the console, and pressed play".

**Requirements:** Unity **6 (6000.0) or later**, with the **`com.unity.ai.assistant`** package installed in the
project (Window > Package Manager).

**Setup, in order:**

1. **Start the bridge.** In Unity: **Edit > Project Settings > AI > Unity MCP Server**. The **Unity Bridge**
   should read *Running* (green). If it is stopped, press **Start**. It starts automatically when the Editor
   loads; the relay binary installs itself to `~/.unity/relay/` on startup.
2. **Configure the client.** In that same settings page, open **Integrations**, pick **Claude Code**, and
   press **Configure**. This writes the client config for the user — prefer it over hand-editing anything.
   The same section has an **Example Configuration** block to paste manually if auto-configure is unavailable.
3. **Approve the connection.** The first time an external client connects, Unity shows a **Pending Connection**
   and the user must press **Allow** in the same settings page. Until they do, your tools will not work and
   nothing will explain why — so if the connection looks dead, this is the first thing to check, and it needs
   the user's hands, not yours.
4. **Verify by using it, not by assuming it.** Confirm the client appears under **Connected Clients** and that
   Unity tools are in your tool list, then actually call one — reading the Editor console is the cheapest
   proof and immediately useful: *"read the Unity console and summarize any warnings or errors."*

**Manual relay paths**, if a config has to be written by hand — pass the `--mcp` flag:

| Platform | Relay binary |
|---|---|
| macOS (Apple Silicon) | `~/.unity/relay/relay_mac_arm64.app/Contents/MacOS/relay_mac_arm64` |
| macOS (Intel) | `~/.unity/relay/relay_mac_x64.app/Contents/MacOS/relay_mac_x64` |
| Windows | `%USERPROFILE%\.unity\relay\relay_win.exe` |
| Linux | `~/.unity/relay/relay_linux` |

**A note on which Unity MCP you are talking to.** There are third-party Unity MCP servers in wide use
(CoplayDev's `unity-mcp` is the common one) and their tool names differ from the official package's
(`Unity_ManageScene`, `Unity_ManageGameObject`, …). **Read your own tool list rather than assuming a naming
scheme** — calling a tool that does not exist reads to the user as ongame being broken. If the user already
has a working third-party bridge, use it; do not talk them into replacing something that works.

---

## 4. The Unity CLI — headless builds and verification

The Editor binary itself is the CLI. This is how a build gets produced without a human clicking anything.

```bash
<editor> -batchmode -nographics -quit \
  -projectPath "<absolute project path>" \
  -executeMethod <Class>.<StaticMethod> \
  -buildTarget <win64|linux64|android|ios|webgl> \
  -logFile "<path>/build.log"
```

- `-executeMethod` runs a **static** method as soon as the project opens — the build entry point has to exist
  in the project (an `Editor/` script). If the project has no build method, writing one is part of the work,
  not an assumption you can skip past.
- **Exit code is the verdict, and the log is the explanation.** A failure exits **1**; a script can exit with
  its own non-zero code via `EditorApplication.Exit()`. Always pass `-logFile` and READ it — batchmode failures
  print nothing useful to stdout, so "the command returned" tells you nothing on its own.
- `-nographics` is right for CI and wrong for anything that must render; do not use it to make a rendering
  problem quiet.

---

## 5. What "verified" means on Unity

The bar does not drop because the engine changed. Compiling is not running, and a scene loading is not a game
playing. On Unity, the honest evidence chain is: the **console is clean** (read it through the MCP, do not
infer it), the **scene contains what you claim** (query it), and something **actually ran** — enter play mode,
or produce a build and say which target it produced.

If you could not get that evidence, say the build is **unverified** and say why. That is worth more than a
confident summary, and it is the same rule the web path already holds itself to.
