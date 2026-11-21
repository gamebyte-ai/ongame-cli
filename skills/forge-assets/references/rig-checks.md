# Rig checks for generated 3D characters

The rig step assumes a T-posed humanoid. It finds the neck, shoulders and arms from the mesh's silhouette and
binds vertices to bones placed where T-pose limbs would be. When the input breaks that assumption the job still
reports success, the bind pose still looks perfect, and the damage appears only once a clip plays.
The failures below were observed as of 2026-11; they may be fixed server-side later, but the checks are cheap, so
run them on every character.

## Before `forge_rig`: the static mesh

- **Width against height.** `poseMode: "t-pose"` plus "T-pose" in the prompt was ignored by 1 of 8 characters:
  it came back arms-down, 0.57 wide for 1.90 tall, where the good ones were 1.5-1.9 wide. Its rig baked every
  clip, and playing them blew arms, shoulders and hair into spikes; legs were fine. Read `measurement.size.x`
  from the finished job; if it is far under the height (under about 0.6 × height), do not rig. Regenerate with
  the pose stated first: "strict T-pose: both arms stretched straight out sideways, horizontal at shoulder
  height".
- **Arm angle and neck.** Render the static mesh from the front and the side. Upper arms more than about 15°
  below horizontal, or no visible neck, means do not rig. A character 49° down in an A-pose, prompted with "head
  sunk between the shoulders", got its neck at chest height and its collarbones half a metre inside the body;
  the upper arms were skinned to the torso and stretched like a curtain in every clip. Weight fixes did not
  save it. Write "clear neck, arms straight out horizontally"; never "hunched" or "head sunk".

## After `forge_rig`: the skeleton

- **Arm joints one segment out ("zombie arm").** In many rigs "Shoulder" sat mid upper arm, "Arm" at the elbow
  and "ForeArm" at the wrist, so every clip, idle and walk included, held the upper arm level with a bent elbow.
  Measure at rest `|LeftShoulder→LeftArm| / |LeftArm→LeftForeArm|`: across 16 models shifted rigs measured
  1.14-1.85 and correct ones 0.35-0.87, so the threshold is 1.0 (a first guess of 1.5 missed nine models).
  Fix at runtime without touching the asset: move each arm clip track one bone up the chain (Arm→Shoulder,
  ForeArm→Arm, Hand→ForeArm) relative to the receiving bone's rest, `q_dst = rest_dst · rest_src⁻¹ · q_src`.
- **Hips at knee height.** The same rigs often placed Hips at 0.24-0.40 of the height instead of about 0.55, so
  a hand-posed sit lifts only the shin. Ask for the library's sitting clips at rig time
  (`Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Exit`); they read correctly even on these rigs.
- **Clip choice.** The library's "Interact" clip spreads both arms wide regardless of the rig; for picking
  things up at a counter a table pick-up clip reads correctly.
- **Look before shipping:** a grid page with every cast member against idle, walk and the game's action clip.
  The arm-ratio threshold was only settled by looking at that grid.

## Retargeting forge clips onto a Mixamo-rigged character

Forge clips can drive a skeleton the user rigged in Mixamo. Three things break it:

1. **Bone names.** Mixamo bones carry a `mixamorig:` prefix, which three.js `GLTFLoader` collapses to
   `mixamorigHead`. Strip the prefix before export.
2. **Different rest poses.** Use the world-space rotation delta `Rs · Rs_rest⁻¹ · Rt_rest`. When the target is
   A-posed and the source T-posed, first swing each target rest frame onto the source bone direction (the
   vector to the child joint); otherwise every pose inherits the ~45° rest difference.
3. **No translation in forge clips.** They are rotation-only, and the forge skeleton's hips are very low (0.48 m
   on a 1.95 m mesh). On a proper rig, death and knockdown poses float. Add a ground lock: each frame, move the
   root so the lowest joint sits at its bind-pose height, with about 0.12 m clearance for torso joints. Scale
   hip travel by the ratio of bone-space hip heights, not mesh heights.

Validate with an old-against-new pose grid: five clips at four times each, side by side.
