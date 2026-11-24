# Fade check on a syntax tree

`skills/gradients/check.mjs` finds fades faked with stacked shapes. It read game code as text with regular
expressions. In its first 13 hours on main it took 34 fixes. At least 8 of them only taught it another way to write
the same code: a space before a bracket, comments, code without semicolons, bracket writes, typed or destructured
declarations, prefix updates, a key named `alpha`. Each spelling was a new regex branch.

The change: parse each file into a syntax tree and read the rules from its nodes. The rules stay as they are. The
fixtures in `test/fixtures/gradients` and the cases in `test/gradients-rule.test.mjs` are the pass bar, unchanged.

## Parser

The check must run with Node alone: makers run it from the plugin folder, with no `npm install`. Three options:

| option | TS and TSX | runs with Node alone | cost |
|---|---|---|---|
| `typescript` from the game's `node_modules` | yes | no: absent in a game without TypeScript and in this repo's CI | a second path when it is missing |
| `acorn` plus Node's `stripTypeScriptTypes` | TS only: TSX throws on Node 26 | Node 22.13 or later (a guess from Node's docs, not run) | two tools, a Node floor |
| `@babel/parser`, vendored | yes | yes; its package asks for Node 6 or later | one 530 kB file |

Chosen: `@babel/parser` 7.29.14 (MIT), copied byte for byte from the npm tarball into
`skills/gradients/vendor/babel-parser.cjs`. Its `lib/index.js` requires nothing at run time. The 7.x package asks
for Node 6 or later, below the Node 18 the README names; 8.x asks for Node 22.18 or later and is ESM only. 7.29.14 was 12 days old on 2026-11-24, past the 7-day rule. The tarball
integrity and the file's sha256 sit in `vendor/README.md`, so anyone can re-download and compare. NOTICE lists it.

## Reading rules from nodes

Every helper that walked text now reads nodes:

- loops: `for`, `while`, `do ... while`, `for ... of`, `for ... in` statements; a counter loop is a `for` with three
  clauses, or a `while` whose test names a variable its body steps.
- calls: `CallExpression` with a member or name callee, `g.circle` or `g['circle']`. A call's object path stops at the
  first call in its chain, as before.
- Canvas styles: assignments to `fillStyle`, `globalAlpha` and `strokeStyle`, written with a dot or a string key.
- what a value reads: identifiers that are references, not property names or object keys.
- translucency: alpha and colour values judged by literal nodes (numbers, strings, template literals).
- styles set before the loop: a set is sure when it is a plain statement in a block that holds the loop. Anything
  in another block, a callback, a condition or another switch case is not sure, as before. A sequence
  `a = x, b = y` is now read in order instead of being treated as unknown.

Positions: a call's position is where its callee ends, so `g.circle(...).fill(...)` orders the shape before its fill.

## Failure paths

- A file the parser cannot read is named on stderr and not checked. The run then exits 2 unless it found a fade
  (exit 1). A file that is not checked is never a pass.
- The parser is tried as TypeScript first (`.ts`), with JSX (`.tsx`, `.jsx`, `.js`), with error recovery on.

## Tests

The current test file and fixtures stay unchanged and must pass. New cases cover the spellings the text check had to
learn one at a time, written in other ways it never learned, so they prove the tree does the work.
