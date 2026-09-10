#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callReferenceTool, checkGamePath, gameFiles, isObject, openGameDir, readGameFile,
  readGameJson, ReferenceError, referenceErrorMessage, writeGameJson } from '../../tools/reference-client.mjs';

const RESULT_FILE = 'docs/obligations.result.json';
const MAX_SOURCE_BYTES = 1024 * 1024;
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

async function collect(root, operation, dataFile) {
  const obligations = await readGameJson(root, 'docs/obligations.json');
  const collected = dataFile === undefined ? undefined : await readGameJson(root, dataFile);
  const sources = [], evidence = [], assets = [];
  let sourceBytes = 0;
  for await (const file of gameFiles(root)) {
    if ((file.startsWith('src/') && /\.(ts|tsx|js|mjs)$/.test(file)) || (file.startsWith('Assets/') && file.endsWith('.cs'))) {
      if (sources.length >= 256) throw new ReferenceError('Reference sources exceed the 256 file limit.');
      const bytes = await readGameFile(root, file, MAX_SOURCE_BYTES - sourceBytes);
      sourceBytes += bytes.length;
      sources.push({ path: file, text: bytes.toString('utf8') });
    } else if (MEDIA.test(file)) {
      const list = file.startsWith('.ref/') || file.startsWith('evidence/') ? evidence : assets;
      if (list.length >= 4096) throw new ReferenceError('Reference media exceeds the file limit.');
      list.push(file);
    }
  }
  sources.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  evidence.sort(); assets.sort();
  return { operation, obligations, ...(collected === undefined ? {} : { collected }), sources, evidence, assets };
}

/** Collect project files and print the authenticated tool's result. */
export async function runObligations(argv, client = {}) {
  const out = client.out ?? console.log, err = client.err ?? console.error;
  try {
    const [operation, gameDir, dataFile] = argv;
    if (argv.length < 2 || argv.length > 3 || !['probe', 'score'].includes(operation)) {
      throw new ReferenceError('Usage: node obligations.mjs probe|score gameDir [collected.json]');
    }
    const root = await openGameDir(gameDir);
    if (operation === 'score') await checkGamePath(root, RESULT_FILE, { allowMissing: true });
    const response = await callReferenceTool('reference_evaluate', await collect(root, operation, dataFile), client);
    if (operation === 'probe') {
      if (!Array.isArray(response.statesNeeded) || !isObject(response.pixelSamples) || typeof response.snippet !== 'string') {
        throw new ReferenceError('Reference request returned an invalid probe response.');
      }
      out(JSON.stringify({ statesNeeded: response.statesNeeded, pixelSamples: response.pixelSamples }, null, 1));
      out('// ---8<--- BEGIN PAGE SNIPPET');
      out(response.snippet);
      out('// ---8<--- END PAGE SNIPPET');
      return 0;
    }
    if (!['ACCEPT', 'REJECT'].includes(response.decision) || !Array.isArray(response.results)) {
      throw new ReferenceError('Reference request returned an invalid score response.');
    }
    const { ok, ...result } = response;
    await writeGameJson(root, RESULT_FILE, result);
    out(JSON.stringify(result));
    return result.decision === 'REJECT' ? 1 : 0;
  } catch (error) {
    err(referenceErrorMessage(error));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runObligations(process.argv.slice(2));
}
