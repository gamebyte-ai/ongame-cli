import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const TOOLS = new Set(['reference_evaluate', 'reference_measure']);
const PRIVATE_NAMES = new Set(['.git', 'node_modules']);
const ROOT_CACHES = new Set(['Library', 'Temp', 'Obj', 'obj', 'Logs', '.cache', '.next', '.vite']);
const isPrivate = (name) => PRIVATE_NAMES.has(name) || name === '.env' || name.startsWith('.env.');
export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export class ReferenceError extends Error {
  constructor(message, result) {
    super(message);
    this.name = 'ReferenceError';
    if (isObject(result)) {
      this.result = result;
      if (typeof result.reason === 'string') this.reason = result.reason;
      for (const key of ['gated', 'rateLimited', 'retryable', 'spent']) {
        if (typeof result[key] === 'boolean') this[key] = result[key];
      }
    }
  }
}
export const referenceErrorMessage = (error) => error instanceof ReferenceError
  ? error.message : 'Reference request could not be completed.';

const failed = (result) => isObject(result) && (result.ok === false || result.isError === true ||
  result.gated === true || result.rateLimited === true || Object.hasOwn(result, 'error'));
function resultError(result) {
  const messages = {
    gated: 'Reference request requires account access.',
    rate_limited: 'Reference request is rate limited. Try again later.',
    capacity: 'Reference request is at capacity. Try again later.',
    invalid_input: 'Reference request contains invalid input.',
    resource_limit: 'Reference request exceeds a resource limit.',
    time_limit: 'Reference request exceeded its time limit.',
    unsupported_evidence: 'Reference request contains unsupported evidence.',
  };
  const reason = result?.rateLimited === true ? 'rate_limited' : result?.gated === true ? 'gated' : result?.reason;
  const message = typeof reason === 'string' && Object.hasOwn(messages, reason) ? messages[reason] : 'Reference request failed.';
  return new ReferenceError(message, result);
}

function jsonText(value) {
  let text;
  try { text = JSON.stringify(value); } catch { throw new ReferenceError('Reference request must contain valid JSON.'); }
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_JSON_BYTES) {
    throw new ReferenceError('Reference request exceeds the 8 MiB JSON limit.');
  }
  return text;
}

export function referenceCliPath({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const installDir = env.ONGAME_INSTALL_DIR || join(home, '.ongame');
  return join(installDir, 'bin', platform === 'win32' ? 'ongame-cli.exe' : 'ongame-cli');
}

function installedTransport(tool, payload) {
  return new Promise((resolve, reject) => {
    // Longer than the command's two possible 240-second attempts and token refresh.
    const child = execFile(referenceCliPath(), ['tool-call', tool, '-'], {
      encoding: 'utf8', maxBuffer: MAX_JSON_BYTES, timeout: 600_000,
    }, (error, stdout) => {
      let result;
      try { result = JSON.parse(stdout); } catch { /* Report a fixed diagnostic below. */ }
      if (error) {
        reject(failed(result) ? resultError(result) : new ReferenceError(error.code === 'ENOENT'
          ? 'ongame-cli is required. Install it and run ongame-cli login.'
          : 'Reference request failed. Check ongame-cli login and try again.'));
        return;
      }
      if (result === undefined) reject(new ReferenceError('Reference request returned invalid JSON.'));
      else resolve(result);
    });
    child.stdin.on('error', () => {}); // Process failure is handled by the completion callback.
    child.stdin.end(payload);
  });
}

/** Send data through the installed command's authenticated connection. */
export async function callReferenceTool(tool, payload, { transport } = {}) {
  if (!TOOLS.has(tool)) throw new ReferenceError('Reference request names an unsupported tool.');
  const text = jsonText(payload);
  let result;
  try { result = transport ? await transport(tool, payload) : await installedTransport(tool, text); }
  catch (error) { throw error instanceof ReferenceError ? error : new ReferenceError(referenceErrorMessage(error)); }
  jsonText(result);
  if (!isObject(result) || result.ok !== true || failed(result)) throw resultError(result);
  return result;
}

export async function openGameDir(gameDir) {
  if (typeof gameDir !== 'string' || !path.isAbsolute(gameDir)) throw new ReferenceError('An explicit absolute gameDir is required.');
  try {
    const resolved = path.resolve(gameDir), stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
    return { directory: await fs.realpath(resolved), requestedDirectory: resolved };
  } catch { throw new ReferenceError('gameDir must be an existing directory without a symbolic link.'); }
}

export function logicalPath(root, file, platform = process.platform) {
  if (typeof file !== 'string' || !file) throw new ReferenceError('A reference input path is required.');
  const nativePath = platform === 'win32' ? path.win32 : path.posix;
  const normalize = (value) => platform === 'win32' ? value.replaceAll('\\', '/') : value;
  let relative = normalize(file);
  if (nativePath.isAbsolute(file)) {
    const requested = normalize(nativePath.relative(root.requestedDirectory, file));
    relative = requested !== '..' && !requested.startsWith('../') && !nativePath.isAbsolute(requested)
      ? requested : normalize(nativePath.relative(root.directory, file));
  }
  if (relative.length > 512 || /[\\:\u0000-\u001f\u007f]/.test(relative) ||
      relative.split('/').some((part) => !part || part === '.' || part === '..' || isPrivate(part))) {
    throw new ReferenceError('Reference input paths must stay inside gameDir and exclude private files.');
  }
  return relative;
}

/** Validate each component before opening a file; never follow a project symlink. */
export async function checkGamePath(root, file, { allowMissing = false } = {}) {
  const relative = logicalPath(root, file), parts = relative.split('/');
  let target = root.directory, stat;
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    try { stat = await fs.lstat(target); }
    catch (error) {
      if (allowMissing && error.code === 'ENOENT' && i === parts.length - 1) return { target, relative };
      throw new ReferenceError('Cannot access a reference input file.');
    }
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()) ||
        (stat.isFile() && stat.nlink !== 1)) {
      throw new ReferenceError('Reference files must not use symbolic or hard links.');
    }
  }
  if (await fs.realpath(target) !== target) throw new ReferenceError('Reference input paths must stay inside gameDir.');
  return { target, relative, stat };
}

export async function readGameFile(root, file, maxBytes) {
  const checked = await checkGamePath(root, file);
  if (!checked.stat.isFile()) throw new ReferenceError('Reference inputs must be regular files.');
  let handle;
  try {
    handle = await fs.open(checked.target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev) {
      throw new ReferenceError('Reference input changed while it was being opened.');
    }
    if (stat.size > maxBytes) throw new ReferenceError('Reference input exceeds the byte limit.');
    const chunks = []; let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > maxBytes) throw new ReferenceError('Reference input exceeds the byte limit.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    throw new ReferenceError(error instanceof ReferenceError ? error.message : 'Cannot read a reference input file.');
  } finally { await handle?.close(); }
}

export async function readGameJson(root, file) {
  const bytes = await readGameFile(root, file, MAX_JSON_BYTES);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new ReferenceError('Reference input must contain valid JSON.'); }
}

/** Inventory names only. Callers choose the permitted source and media file types. */
export async function* gameFiles(root) {
  let entries = 0;
  async function* walk(directory, prefix, depth) {
    if (depth > 32) throw new ReferenceError('Reference input directory exceeds the depth limit.');
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (isPrivate(item.name) || item.name === 'dist') continue;
      if ((!prefix && ROOT_CACHES.has(item.name)) ||
          (prefix === '.ongame' && ['buildlogs', 'cache'].includes(item.name))) continue;
      if (++entries > 20_000) throw new ReferenceError('Reference input directory exceeds the file limit.');
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const checked = await checkGamePath(root, relative);
      if (checked.stat.isDirectory()) yield* walk(checked.target, relative, depth + 1);
      else if (checked.stat.isFile()) yield relative;
    }
  }
  yield* walk(root.directory, '', 0);
}

export async function writeGameJson(root, file, value) {
  const checked = await checkGamePath(root, file, { allowMissing: true });
  if (checked.stat && !checked.stat.isFile()) throw new ReferenceError('Reference output must be a regular file.');
  const temporary = path.join(path.dirname(checked.target), `.reference-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 1)}\n`, { flag: 'wx', mode: 0o600 });
    await checkGamePath(root, file, { allowMissing: true });
    await fs.rename(temporary, checked.target);
  } catch { throw new ReferenceError('Cannot write the reference result file.'); }
  finally { await fs.rm(temporary, { force: true }); }
}
