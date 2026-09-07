# reference measurement V1

Four primitives that answer **how much** about a piece of reference evidence, and nothing else.

They exist because a reference package's numeric claims were being produced by an agent reading
pixels by eye and writing the result into a prose provenance line. Across three real packages, 43 of
64 quantity claims named no method at all and 33 embedded hand-read coordinates. The numbers were
often right — the problem is that a right number and an invented one looked identical.

## the split

| | who |
|---|---|
| **WHAT** — what is this, which property matters | the caller (LLM/VLM) |
| **WHERE** — an approximate region, and at roughly what scale | the caller |
| **AGAINST WHAT** — the keying rule: which colour defines the target | the caller chooses it, the code measures its value |
| **HOW MUCH** | these primitives |
| whether the number may be called MEASURED | the layer above |

Region is always given as **fractions**. Absolute pixels appear in output for debugging only.

## the primitives

```js
source(file)                                        // dimensions, codec, and the DERIVED tolerance
colour(file, { rect, key?, keyTol? })               // representative RGB + SOLID|GRADIENT|TEXTURED
runs(file,   { band, axis?, key?, base })           // objects along a band: widths, gaps, pitch, count
pitch(file,  { rect, axis?, key?, base, expect? })  // the period of a repeat
countFills(file, { rect })                          // how many distinct saturated fills (optional)
```

`base` is **declared**, never inferred from the axis. A y-axis pitch divided by `H` when the claim is
a fraction of `W` is how a correct 73 px reading came to look like a 2× package error, twice.

`expect: [minNorm, maxNorm]` bounds the period a `pitch` call means. A region holds repeats at several
scales at once: asked for the pitch of four settings buttons, autocorrelation answered 4 px at a
respectable strength — a real texture, and the wrong question. With the band it answers 142 px, which
is what the package says. Without it, an ambiguous field is refused rather than picked from.

## every measurement carries the value AND evidence the ruler was placed correctly

```
value · normalized · base_name · source{w,h,codec,lossless} · tolerance
match_fraction · selectivity{fill_x,fill_y,border_fraction} · plateau{lo,hi,width,n_ok}
regularity{width_cv,pitch_cv} · dispersion · validity · provenance{primitive,file,region,key,base,tool_version}
```

None of those fields is decoration. Each one exists because a measurement went wrong without it:

- **`match_fraction` is not evidence on its own.** A wrong keying rule scored 0.615 against the right
  rule's 0.373 and returned five clean runs that were fiction.
- **`regularity` is what separated them** — five identical widths versus six spanning 2.1×.
- **`selectivity`** catches a key that describes the ground rather than the object: the stitching
  canvas wood was the same wood as the page behind it, so the "object" grew to the whole region.
- **`plateau`** is the answer to "how rough may the region hint be". It is 0.12 H wide on one real
  claim and 0.005 H on another; the same primitive, two different trustworthiness levels.
- **`tolerance` is derived from the source**, not chosen: a lossless fill measures to the byte, and the
  same flat region on a 4:2:0 JPEG moved 5–9 per channel *while its variance fell*. Compression makes
  a wrong colour look more certain, so `exactness` says `FAMILY_ONLY` there.

## who owns what

```
Reference Compiler   WHAT SHOULD BE TRUE
this layer           WHAT CAN BE MEASURED FROM THIS EVIDENCE
a comparison layer   DOES THE MEASUREMENT MATCH THE EXPECTATION
```

This layer does not pass or fail a claim, does not declare a package wrong, does not reject an asset,
does not invent an expected value, and does not invent an object's identity. It produces a value, a
normalized value, a validity, the evidence that the selection was sound, the source and decode facts,
a derived tolerance, and a provenance record. Nothing else.

**Two numbers being deterministically measurable does not make them the same observable.** This is not
a philosophical caveat, it is a measured one: comparing an asset manifest's design-intent aspect ratio
against the PNG canvas ratio fails 12 of 31 accepted, shipped assets, and against a content bounding
box 11 of 31. So

```
design-intent aspect  !=  PNG canvas aspect  !=  alpha/content bbox aspect
```

unless a producer contract explicitly binds them — and proving that binding is the comparison layer's
job, never this one's. Nothing in this API carries an expected value, and a test asserts that no
primitive ever exposes a field that reads like one.

## validity — and there is no FAIL

| value | meaning |
|---|---|
| `VALID` | the ruler landed somewhere defensible; the number stands |
| `UNRESOLVED` | the evidence cannot resolve this quantity here |
| `INVALID_SELECTION` | the region or keying rule selected nothing, or something incoherent |
| `UNSUPPORTED_EVIDENCE` | this evidence kind cannot be read at all |

A measurement never judges a claim. Where a measurement and a claim disagree, that is reported as a
disagreement for the layer above to resolve — never as "the package is wrong". In the lab an automatic
verdict accused the package nine times and was right zero times.

## evidence formats

PNG is decoded here (8- and 16-bit, greyscale/RGB/RGBA/palette, non-interlaced) because that is where
an exact claim can live. Lossy evidence is transcoded with `sips` or `ffmpeg` if either is present;
when neither is, the caller gets `UNSUPPORTED_EVIDENCE` rather than a number.

## known limitations

**Semantic selection is not solved here, and one case shows exactly where the line falls.** Keying the
wooden canvas of a board game returns two clean, evenly-sized runs — and they are the bare wood strips
either side of the pattern, not the canvas. The selectivity guard does not catch it because the
selection never touches the band's edges.

It was tested whether bounding the region fixes this: crop the evidence to the containing rect (the
belt ring the canvas sits inside) and measure again. It does not, and the reason generalises —
**containment narrows the search space but cannot separate target from distractor when the distractor
lives inside the container and shares its colour.** Asking where the wood is inside the wood has no
answer. What that case needs is a different OBSERVABLE (the canvas edge against the belt's dark
track), which is bbox-shaped and deliberately out of scope below.

The same experiment produced one more boundary worth knowing: **a colour key is only applicable to a
SOLID region.** Keys sampled off a shaded ball and a glossy button came back `kind: TEXTURED`, and the
median of a shaded thing is a blend that matches almost nothing (match_fraction 0.006 and 0.07). Since
`colour` already reports `kind`, whether a key is usable at all is decidable before it is used.

**Alpha-bearing sources are declined for measurement.** Alpha is discarded here by design — every
primitive reads what is drawn and no caller composites — but a real generated game asset is a
transparent PNG whose SHAPE is carried by alpha. On one of those, "differs from the page background"
is not a question with an answer. Measured before this was closed: a shipped transparent asset
returned VALID with three runs and a width of 0.315 W, and its colour came back `#000000` from fully
transparent pixels. `colour`, `runs`, `pitch` and `countFills` now return `UNRESOLVED` there and say
why; `source` still answers, because it describes the file rather than its pixels, and it is where the
loss is announced. Cost on the reference corpus this was built for: none — 0 of 157 evidence files
carry alpha.

Also standing: `count_fills` disagreed with the package on all three census claims tried (off by one
each way), which is why it is marked optional rather than shipped as a peer of the other four.

## explicitly out of scope

semantic region discovery · `contained_in` · OCR / digit reading · temporal / frame differencing ·
standalone `bbox` and content bbox · alpha-aware subject segmentation · grid census · corner radius ·
stroke width · gradient endpoints · any screen/region taxonomy · **any automatic verdict on a
generated asset's fidelity** · **any semantic binding between a design intent and a rendered
observable**.

Each was either measured to be unnecessary (real claim incidence 0-1) or measured to fail: `bbox` 1/5
and temporal 0/2 in the lab replay that set this scope, and the design-intent binding 12/31 and 11/31
false positives on a real shipped asset set. These are capability boundaries, not a to-do list.

## running it

```
node test/measurement.test.mjs           # the contract, on fixtures the test paints itself
node test/measurement-replay.mjs         # against three real packages, if the corpus is present
node test/measurement-replay.mjs --gallery   # + a static page of overlays to check by eye
```

The gallery is the point of the overlay generator: two of the worst failures found so far produced
arithmetically clean numbers and were only visible as pictures.

This is not wired into the reference compiler yet, by intent — the measurement API is meant to stand
on its own evidence first.
