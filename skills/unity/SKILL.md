---
name: unity
description: Unity setup and control — drive the Editor from the terminal with the Unity CLI (`unity status` / `unity cmd`), install the Editor per platform, and run headless builds and tests. Load this whenever the target engine is Unity, or when a Unity project is open and you have no way to see the Editor.
---

# Unity — getting the agent actually connected to the Editor

Read this when the engine is **unity** (intake judges that — see `skills/intake/SKILL.md` step 3b) or when you
are standing in a Unity project and have no Unity tools in your tool list.

**Everything below is from Unity's own documentation, not from a run we performed.** Vendor setup changes;
if a step does not match what the user sees, believe their screen over this file, say so, and work from what
is actually in front of you. Do not insist on a menu path that is not there.

---

## 0. The one thing that goes wrong most

**Writing scripts is not building a game.** If you cannot see the Editor you do not know whether the project
compiles, whether a scene contains what you think, whether a prefab bound, or whether anything renders. A
Unity build reported as working on the strength of files existing is a claim, not a fact.

**But the fix is a shell command, not a setup request.** You can drive the Editor from your terminal with the
Unity CLI — no package to approve, no dialog for the user to click. Start every Unity session with:

```bash
unity status     # connected Editors: port, project, version, PID, state
```

A row reading `ready` means you already have the Editor. Go to §3 and use it.

**Do not open by asking the user to install an MCP server.** That was the old route and Unity has deprecated
it (§3.5). Ask for hands only when you have tried the CLI and something it cannot do is genuinely in the way —
and then ask for the specific missing thing, at the moment you need it, not as an opening gate.

If you truly cannot see the Editor and cannot get the CLI working, keep going on what you *can* do and mark
the rest **unverified**, plainly, per §6. What you must never do is quietly produce a folder of C# and call it
a Unity game.

---

## 1. Is Unity even installed?

Check before offering anything, so you are not walking a user through a setup they already have.

```bash
unity editors            # cross-platform, structured; add --json to parse it
```

If `unity` is not on PATH it also lives at `~/.unity/bin/unity`. Only fall back to looking on disk when there
is no CLI at all:

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

**Prefer the `unity` CLI — one command, same on every platform, modules included:**

```bash
unity install 6000.0.28f1 -m ios -m android --cm -y --accept-eula
unity install-modules --help     # add modules to an Editor you already have
```

`-c/--changeset` is only needed for **archive** installs. `--cm` pulls child modules, `-y` takes the first
match without prompting, `--accept-eula` clears the module licence prompts — together that is a genuinely
non-interactive install.

**Only if there is no `unity` CLI**, drive the Hub directly. The Hub is a normal GUI app download from
unity.com/download, and the argument quirk below is the most common reason these commands appear broken:
**macOS and Windows need `-- --headless`, Linux needs a single `--headless`.**

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
  optional for archived versions and **you cannot invent it**. If you do not have it, ask, or install from the
  Hub GUI instead of guessing one.
- **Platform modules (Android, iOS, WebGL, IL2CPP) fail at BUILD time, not install time.** `unity install -m`
  takes them up front; on the Hub path they are a separate `install-modules` (alias `im`) step. Either way, a
  target the project needs but the Editor lacks looks fine right up until the build. If the delivery target is
  a mobile or desktop build, get the module in place **before** promising a build.
- `-- --headless help` lists the full command set.

---

## 3. The Unity CLI — how you actually control the Editor

`unity` is Unity's own terminal tool. It ships with Unity Hub and also installs standalone. It is what turns
"I wrote some C#" into "I opened the scene, checked the console, and pressed play" — **and you already have a
shell, so this is your route.** Unity's own guidance: `unity command` and `unity eval` drive the Editor
directly, without MCP in between; they are faster and use fewer tokens; use them if your agent can run shell
commands.

*(Measured 2026-08-22 on `unity` 1.0.0-beta.5 — the commands and output shapes below are from real runs, not
only from the docs.)*

**Look before you set anything up:**

```bash
unity status                 # every connected Editor: port, project, version, PID, state
```

```
Port  State  Project                          Version     PID
7800  ready  /Users/you/Development/MyGame    6000.7.0a4  53235
```

A `ready` row means the Editor is already yours to drive. Nothing to install, nobody to ask.

**If nothing is connected**, the project needs the Pipeline package — this is the piece that registers Editor
commands for `unity cmd`. It goes into the project:

```bash
unity auth login             # once per machine
unity pipeline install       # installs com.unity.pipeline into the current project
unity status                 # confirm a `ready` row appears
```

Requires Unity **6.0 or later**. The Editor recompiles after install; wait for it before the row goes `ready`.

**Then drive it:**

```bash
unity cmd                    # list every command the connected Editor exposes, with parameters
unity cmd <command> [--arg]  # run one
```

The exposed set is large and is the same ground MCP covered — reading the scene (`find_gameobjects`,
`get_selection`, `search`), changing it (`add_component`, `set_transform`, `set_component_properties`,
`save_prefab_contents`), project state (`package_add`, `recompile_status`, `get_tags_layers`), and actually
running things (`editor_play`, `list_tests`). **List them and read the real set** rather than guessing a name —
it varies with the project's packages and the Pipeline version.

**Headless, without a running Editor** — these spawn their own:

```bash
unity build [project]        # batch-mode build with CI-friendly flags
unity test  [project]        # EditMode/PlayMode tests, writes a results report
unity run   [project]        # batch mode, or run registered Editor commands headlessly
unity doctor                 # environment health snapshot
```

Useful flags everywhere: `--json` (structured output — parse this, do not scrape human text),
`--non-interactive` (CI), `--timeout <seconds>` and `--detach` on `cmd` for long jobs.

**Unity ships its own agent skill for this CLI.** If you are going to be living in a Unity project, install it
and read it — it is maintained by Unity and will be current after this file goes stale:

```bash
unity skill install --list          # supported clients + install status
unity skill install claude-code     # or: --local to write it into the project
```

**Two failure shapes worth knowing before you debug the wrong thing.**

*A listing flag that errors with "the connected Editor's com.unity.pipeline version does not support the
listing flags"* means the **package in that project is older than the CLI** — `unity pipeline install` updates
it. But that writes to the project, so on a project someone else is working in, say so on the bus before you
run it rather than upgrading a package under them.

*The Editor is running but never becomes `ready`* — on Windows, check for **Administrator** first.
*(Field-verified — see §5.)* An elevated session makes the Unity GUI stop on an **"Administrator Privileges
Detected"** modal before it finishes loading, so nothing ever registers. Batchmode is unaffected, which is the
confusing part: `unity build` keeps working while the Editor sits behind a dialog nobody has dismissed. Ask
whether the Editor is showing a modal, and whether the shell that launched it was elevated, before you go
rebuilding config.

---

## 3.5 MCP — deprecated for us, and not something to ask for

**Do not walk a user through installing a Unity MCP server.** Unity has **deprecated** the MCP server
component of the in-editor AI assistant package (`com.unity.ai.assistant`); the `unity mcp` command replaces
the in-Editor server. The old recipe — install the package, open *Edit > Project Settings > AI*, press
*Configure*, then get the user to press **Allow** on a pending connection — is the route this file used to
teach, and it now costs the user hands for something a shell command already does.

MCP mode itself is **not** deprecated: it exists for harnesses that cannot run arbitrary shell commands. We
can, so `unity cmd` is our route (§3). If you ever do need it:

```bash
unity mcp configure claude       # also: cursor, vscode, windsurf
```

**If the user already has a working Unity MCP — use it, do not replace it.** Third-party servers are in wide
use (CoplayDev's `unity-mcp` is the common one) and are unaffected by Unity's deprecation. Their tool names
differ from the official package's (`Unity_ManageScene`, `Unity_ManageGameObject`, …), so **read your own tool
list rather than assuming a naming scheme** — calling a tool that does not exist reads to the user as ongame
being broken. A working setup is worth more than a tidy one.

---

## 4. Raw batchmode — driving the Editor binary directly

Separate from the `unity` CLI in §3: this is invoking the **Editor binary itself**, the long-standing way to
produce a build with nobody clicking anything. `unity build` / `unity test` wrap this and are usually the
better call. Reach for the raw form when you need an entry point of your own — a custom `-executeMethod` — or
when you are on a machine with no `unity` CLI. Our own iOS station runs this form
(`MacIosBuilder.BuildIOS` under `-batchmode -executeMethod`), so it is a proven path, not a legacy one.

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
- **On Windows, make the shell actually wait.** *(Field-verified — see §5.)* `Unity.exe` is a GUI-subsystem
  binary, so PowerShell's `&` call operator returns the moment it is launched rather than when the build ends.
  You then read `build.log` while Unity is still writing it, see no errors because the errors have not been
  printed yet, and report a success that never happened. Use `Start-Process -Wait` (or `-PassThru` plus
  `WaitForExit()` if you want the exit code) so the log you read is the finished log:

  ```powershell
  $p = Start-Process -FilePath $editor -ArgumentList $args -Wait -PassThru
  $p.ExitCode   # now meaningful
  ```

---

## 5. Seven field-verified failures the docs never mention

**Provenance matters here, so read it before you weigh these.** Everything else in this file comes from Unity's
documentation and was not run by us. The six below are the opposite: they were hit in the field by an agent
(`fusekick`) building a real Unity 6 / URP game on Windows. They are not warnings someone anticipated — they are
things that already cost a build. Trust them accordingly, and if one of them no longer reproduces on the user's
version, say so rather than quietly assuming it still holds.

**What binds them: every one passes a clean compile and leaves a clean console.** That is precisely why this
file already refuses to treat a clean console as evidence. None of these announce themselves. Each produces a
build that is silently missing something — or, in the last case, a confident report of a problem that does not
exist — and an agent that stops at "it compiled, nothing is red" will ship it.

Two of them are wired into the sections they belong to — **Administrator stopping the Editor from ever
connecting** in §3, and
**PowerShell not waiting for `Unity.exe`** in §4 — because that is where you will be standing when they bite.
The rest:

**Shader stripping kills a code-built world.** If every material is created at runtime through `Shader.Find`,
then no scene asset references the URP shader, the build pipeline sees nothing referencing it and strips it out.
`Shader.Find` returns `null` in the player, materials get no shader, and the world is never drawn. It works
perfectly in the Editor, because the Editor does not strip — so an Editor play-mode test proves nothing about
this class of bug. Add the shader to the always-included list in **Project Settings > Graphics** so it survives
the build, and then **assert it at startup** rather than trusting the setting stayed put:

```csharp
var shader = Shader.Find("Universal Render Pipeline/Lit");
if (shader == null) throw new System.Exception("URP shader stripped from build");
```

**glTFast silently refuses WebP-carrying GLBs.** A GLB that lists `EXT_texture_webp` in `extensionsRequired`
will be rejected outright by glTFast when no WebP decoder is present — and *rejected* means **0 meshes imported
with no error raised**. You get an empty result and a clean console, so the natural reading is "the model has no
geometry" and you go debugging the wrong thing. Check `extensionsRequired` in the GLB before you believe an
empty import.

That the extension is the *whole* cause is measured, not inferred: the same forge models, transcoded out of WebP
and re-imported, came back `models=7/7 missing=0 noMesh=0` with real triangle counts on every one. Geometry and
hierarchy were intact the entire time — nothing was wrong with the models. Only the textures are lost by
stripping, which is free if you assign your own materials and expensive if you wanted forge's. forge now
discloses the requirement in `warnings`; until it delivers an importable file, transcode before importing.

**Reading the wrong render-pipeline property reports "Built-in" on a URP project.**
`GraphicsSettings.defaultRenderPipeline` is **null** in Unity's own URP template — the asset lives on the
quality-level override instead — so an audit that reads it concludes the project is Built-in and sends you
chasing a pipeline migration that was never needed. Read `GraphicsSettings.currentRenderPipeline`. This one is
the inverse of the others: not a silent failure but a **false alarm**, and it costs exactly as much time.

**`GameObject.CreatePrimitive` always adds a Collider.** Always — you cannot ask it not to. If the scene has no
physics, the build strips the Physics module, and every one of those calls then logs *"Can't add component"* and
you are left with primitives that may or may not be what you wanted. Build the mesh yourself instead, which
costs one extra line and depends on nothing:

```csharp
var go = new GameObject("cube");
go.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
go.AddComponent<MeshRenderer>();
```

**The sneakiest one: auditing the intent instead of the artefact.** If your verification reads a *source of
intent* — a colour constant in `Palette.cs`, a value in a config, the line of code that was supposed to set
something — while the game actually renders from a **baked artefact** such as a material that was dirtied at
edit time, the two can disagree completely and your audit will never notice. In the field this produced 1233
checks passing green while not one pixel on screen changed. The rule is blunt: **assert the baked artefact, not
the intent.** Read the material's serialized colour, the built asset, the thing the renderer will actually
consume. A constant proves what someone meant; only the artefact proves what will be drawn.

---

### UI: four more that pass a clean console

Reported after placing 34 cut assets into a real Unity UI. Every one of them renders without an error.

**`Image.preserveAspect` does not change the RectTransform — only the drawn quad.** The rect keeps its original
size, so anything anchored *inside* that rect is positioned against a box the player cannot see and drifts off the
art. Use an **`AspectRatioFitter`** when the layout has to follow the image, and reach for `preserveAspect` only
when nothing is anchored to it.

**`RawImage` has no `preserveAspect` at all.** A render texture assigned to one is silently stretched to whatever
the rect happens to be. There is no warning and no visual cue in the inspector — you find it by looking at the
game.

**`ScreenCapture` grabs at the END of the frame.** Change a UI element in the same frame you capture and the
capture contains the change, not the state you meant to record. Any "before" shot has to be taken a frame earlier,
which matters directly for the visual-verification chain in §6: a screenshot that quietly captured the wrong frame
is evidence of nothing.

**Anything drawn over an Overlay canvas must itself be overlay UI.** A `ParticleSystem` placed "on top of" an
overlay card renders *under* it — Screen Space Overlay is composited last, so world-space effects cannot reach
above it regardless of sort order or Z.

---

## 5.5 Before you build the layer around the game — read what shipped builds already learned

The failures above are the ones you hit in an afternoon. The expensive ones live one level up: how the opening
sequence is wired, when each HUD element first appears, where the tutorial runs, what a save may contain, what
draws in front of what, and how to prove any of it is true on a real phone.

That material is not in this file — it is retrievable, and it is specific enough to change what you write:

- `knowledge_get({ key: 'pattern:unity-ui-layout' })` — before placing a single element. Design width is a
  function of the device ratio, safe area is measured rather than derived, and a title box is solved from its art.
- `knowledge_get({ key: 'pattern:unity-ui-layers' })` — before adding a canvas, a popup or an effect over UI.
- `knowledge_get({ key: 'pattern:unity-meta-systems' })` — before building splash, staged HUD reveal, tutorial,
  bottom menu, shop, ads or save, on a build that is production-bound or ad-shaped; on a prototype this layer is
  deliberately off and building it is wasted work, and the read tells you which parts each path wants. Also names
  what must stay per-game, so you do not standardise a design decision.
- `knowledge_get({ key: 'pattern:unity-generated-scene' })` — when a build has more than a couple of screens, or
  more than one person will touch the UI.
- `knowledge_get({ key: 'pattern:unity-3d-assets' })` — before bringing a generated model, character or rig into
  the scene. Covers what to ask for so no per-model scale hack is ever needed, and the import that reports success
  with zero meshes.
- `knowledge_get({ key: 'pattern:unity-text' })` — before the *second* label. Type, colour and treatment drift
  silently because nothing ever fails, and the fix is cheap up front: one producer, a written default treatment,
  and the four properties that no screenshot can check.
- `knowledge_get({ key: 'pattern:unity-look' })` — when the game has to look like something specific rather than
  merely look nice: the URP lighting and post-processing that decide it, the performance budget to write down
  before the art, and the three gates that let you call a visual task done.
- `knowledge_get({ key: 'pattern:unity-action-combat' })` — when enemies telegraph, the hero auto-targets, or
  upgrades stack. Mostly about legibility: a game that is mechanically fair but reads as unfair draws the same
  complaints as one that is actually unfair.
- `knowledge_get({ key: 'pattern:unity-porting-content' })` — when content authored elsewhere has to run in Unity
  (another engine's project, an exported scene, someone's prototype). The import succeeds, nothing errors, and it
  is subtly a different game; this is the list of ways that happens.
- `knowledge_get({ key: 'pattern:unity-verification' })` — before reporting anything as working.

**And do not hand-write the parts nobody should be re-deriving.** `template_list('unity')` returns small C# pieces
you can pull and adapt — safe-area band placement, a layer-order guard that refuses two canvases on the same order,
a save slot that versions its key and merges rather than overwrites, the two-flag first-run gate, and the staged
HUD reveal authority. They are frames, not prescriptions: the rationale comments explain what must survive your
edits, and everything else is yours to change. Pull one with `template_get({ key: 'template:<name>' })`.

Call `knowledge_list()` if you want the current set; these keys are the Unity ones. A `gated` answer means the
account is not entitled to that read — that is the product working as designed, not a fault, and you continue
without it. An ABSENT or erroring tool is a different thing entirely: say so rather than quietly writing the
guidance yourself from general knowledge.

## 6. What "verified" means on Unity

The bar does not drop because the engine changed. Compiling is not running, and a scene loading is not a game
playing. On Unity, the honest evidence chain is: the **console is clean** (read it, do not infer it), the
**scene contains what you claim** (query it — `unity cmd find_gameobjects`, `unity cmd get_selection`), and
something **actually ran** — enter play mode (`unity cmd editor_play`), run the tests (`unity test`), or
produce a build and say which target it produced.

If you could not get that evidence, say the build is **unverified** and say why. That is worth more than a
confident summary, and it is the same rule the web path already holds itself to.

### A doctor check, run before every build

Every failure in §5 is the same shape: **the tool reported success without ever looking at what the player would
see.** You cannot catch that class by being careful, because being careful is what produces the clean console.
You catch it by asserting each one explicitly, every time, before the build — a *doctor*.

The field build runs one (`Assets/Editor/BomberCI.cs`, a single static method, ~22s under
`-batchmode -executeMethod`). What it asserts, and why each line exists:

| Assertion | Why it is there |
|---|---|
| Unity version, quality level, colour space | Cheap provenance — a report is worthless without knowing which Editor produced it |
| **Active build target** | Building against the wrong target is silent lost time, not an error |
| **`currentRenderPipeline`** | Reads the property that is actually populated (see §5) |
| **glTF importer type present** (found by reflection) | Its absence is exactly the 0-mesh/no-error import |
| **Scenes in build settings** | Forgetting to add the scene is the classic, and it fails quietly |

Two details are what make it usable rather than decorative. Every field prints as **a single line with a
sentinel**, so grepping the log distinguishes *"the method genuinely ran"* from *"Unity exited 0 and did
nothing"* — an empty log otherwise reads as a pass. And it ends with a **`DOCTOR-OK` sentinel**, so the absence
of the verdict is itself a failure signal rather than a gap you have to notice.

Worth adding on Unity: is the always-included shader list empty, is the active target's module actually
installed, is the licence valid.

**The pattern generalises past Unity.** Every engine has a "the tool said fine, the player saw nothing" class,
and the members differ per engine while the shape does not. When you work on an engine this file does not
cover, write its doctor from its own failures — one method, one sentinel per assertion, run before every build.
