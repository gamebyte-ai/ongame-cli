# Port traps that pass a clean build

Each of these compiled, ran and printed no error. Each was found by comparing the port against the old build.

## Geometry and materials (three.js → Unity)

- three.js ignores a geometry's groups when the mesh has one material; Unity draws one face per submesh. A box
  with six submeshes and one material rendered only one face (a missing table, a box with no lid).
- Mirrored meshes and reversed winding from importers and handedness changes: `pattern:unity-porting-content`
  §1-2. The symptom to look for: a shader with back-face culling made a whole road invisible while the ground
  below read as "road" in screenshots. Check `Cull` on every shader that draws converted meshes.
- three.js physical materials with an environment map take diffuse light from the environment too; URP's
  spherical-harmonics ambient alone left a back-lit car too dark.
- A `MaterialPropertyBlock` on a car body darkened its lighting about 4×; a material copy per car fixed it.
- Runtime-created Lit materials need their shader variants kept in the build. Stripped variants make colours
  wrong with no error (one port went from 8 to 56 ForwardLit variants). Assert the variants in your doctor
  check (`skills/unity/SKILL.md` §6).
- Ambient and tonemapping differ by default. Matching the old look took a studio-plus-hemisphere ambient and
  tonemapping off; measure colour on a known surface against the old build instead of tuning by eye.

## Textures and size

- A texture with mipmaps and a non-power-of-two size stays uncompressed RGBA32 on Android even with an ASTC
  override (one 1024×1200 texture was 4.6 MB). Round mipmapped textures to a power of two; do not mip screen
  images.
- glTFast imports GLB textures uncompressed; shrink oversized ones before import.
- For WebGL, the download size lever is Crunch compression, Brotli and High stripping; the high-quality
  compressed format already picks DXT1 for opaque textures.

## Input and text on WebGL

- Unity WebGL registers a touchscreen on desktop too. Detect touch with `matchMedia('(pointer: coarse)')` plus a
  real touch event.
- A TextMeshPro dynamic atlas broke letter spacing on the first label in WebGL. Fill the atlas in the editor and
  keep its data at build time.
- In a frozen tutorial step, a UI button's raycast swallowed the swipe, and a fast double tap fell between two
  frames. Read touches inside the input handler and count presses instead of watching a held edge.

## Android SDKs

- Google Mobile Ads 11.6+ depends on one dependency resolver (Unity's), Firebase 13/14 on another (Google's), and
  the two cannot coexist; pin versions that share one.
- The consent (UMP) callback never reached C# until `MobileAds.Initialize` had set up its event executor;
  initialise before asking for consent.
- An `androidlib` folder without `sourceSets` in its `build.gradle` merges an empty manifest and resources
  silently (an app id disappeared).

## Testing on an emulator

- A 3D game on a software-GPU emulator ANRs because of the emulator; the flags and the ANR trace to read are in
  `skills/store-build/references/build-and-smoke.md`. Frame rates on a headless software emulator mean nothing.
- If Unity crashes on the emulator's Vulkan, launch with `-force-gles`.
- A second emulator on the same AVD fails silently while a headless one is still running, and `adb` stays
  attached to the headless one. Kill the old one first.

## Iteration speed

Pick the cheapest loop that shows the change: an Editor batch play-and-capture took under a minute (no bloom
or HUD), a fast development WebGL build under two minutes warm, a full release build over ten. Keep full builds
for the phone and the release.
