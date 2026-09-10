---
name: reference
description: Prepare a game build that depends on an external reference.
---

Use this when a requested game depends on an external example. Keep the user's source material and
requested changes available, and use the existing absolute `gameDir`.

1. Call `knowledge_get({ key: "pattern:reference-workflow" })` and follow the returned instructions.
2. Fetch the named teaching with `knowledge_get`; use the available reference tools when instructed.
3. Keep the successful `reference_context` response's `context` as `referenceContext`. Pass it unchanged
   to every phase role, segment and re-run. Re-prepare it when the user changes the reference request.

The file clients use the current `ongame-cli` login. They require CLI 0.2.13 or newer:
`node <pluginRoot>/skills/reference/obligations.mjs probe|score <gameDir> [collected.json]`.
For other supported agents, the same file is beside this skill; resolve `<pluginRoot>` paths to the
installed shared skills and tools directories. Use `tools/measure/measure.mjs` only if installed;
otherwise report measurement as unavailable.

If a tool is unavailable, gated or fails, preserve that result and explain what remains unverified.
Do not substitute a successful reference check. A request without an external reference uses the normal flow.
