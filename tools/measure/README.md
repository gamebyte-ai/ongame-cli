# Reference measurement

Use these asynchronous helpers to measure reference evidence in an explicit game directory.
Install `ongame-cli` and run `ongame-cli login` first. Your account must have access to reference measurement.

```js
import { source, colour, runs, pitch, count_fills, scale, track, rate } from './measure.mjs';

const gameDir = '/absolute/path/to/game';
const frame = { id: 'frame-1', path: '.ref/frame.png' };
const result = await source(gameDir, frame);
console.log(result.measurement);
```

The single-frame helpers accept `(gameDir, frame, options = {}, client = {})`.
`track` accepts `(gameDir, frames, options = {}, client = {})`.
`rate` accepts `(gameDir, frames, options = {}, fit = {}, client = {})`.
`countFills` is an alias of `count_fills`.

A frame is a PNG, JPEG or WebP path inside `gameDir`, or `{ id, path }`. String paths receive IDs `frame-1`, `frame-2`,
and so on, in input order. IDs must be unique and contain at most 80 letters, digits, dots,
underscores or hyphens, starting with a letter or digit. Pass `{ overlay: true }` as `client` to request
overlay output. Successful responses contain `{ ok: true, measurement, overlays? }`; overlays carry
`evidence_id`, `media_type` and `data_base64`.

Each request supports at most 24 frames and 5 MiB of original file bytes in total. Project symlinks,
paths outside `gameDir`, `.git`, `node_modules` and `.env` files are refused. Options and fit values
are forwarded unchanged. For operation guidance, use the reference context supplied by your account.
Failures throw a `ReferenceError`; typed tool failures retain `result`, `reason`, `retryable`,
`gated` and `rateLimited` when those fields are supplied. No automatic retry is added.

Run the transport checks with:

```sh
node --test test/reference-client.test.mjs test/measurement-transport.test.mjs
```
