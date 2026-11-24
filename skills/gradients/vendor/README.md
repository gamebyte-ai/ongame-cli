# Vendored parser

`babel-parser.cjs` is `lib/index.js` of `@babel/parser` 7.29.14, copied byte for byte. `../check.mjs` uses it to
read a game's code as a syntax tree. It requires no other module, so the check runs with Node alone. It is MIT
licensed; `LICENSE` here is the package's own.

| | |
|---|---|
| package | `@babel/parser@7.29.14`, from https://registry.npmjs.org/ |
| released | 2026-11-11 |
| tarball integrity | `sha512-VL220vXuyO2z3rNIQwY7ftj9UwpqOt+33sH+sBWkOekbsSR2g7EEMnOx24ZlCH0xOA3DM/33SifVFGbnJD8r/w==` |
| `babel-parser.cjs` sha256 | `21ccb0b91cdb0e0425379cb08f13296b710ac619d717b3b25652e18339ff8591` |
| `LICENSE` sha256 | `2e97627cb278aa7556fb9e8817368302301a595b6c7582512b8d74c57b773652` |

To check it: `npm pack @babel/parser@7.29.14`, unpack it, and compare `package/lib/index.js` with
`babel-parser.cjs`. The `.cjs` name keeps it CommonJS even under a folder whose `package.json` says
`"type": "module"`. Its last line names a source map that is not copied; Node never needs it.
