import { callReferenceTool, isObject, openGameDir, readGameFile, ReferenceError,
  referenceErrorMessage } from '../reference-client.mjs';

const MAX_BYTES = 5 * 1024 * 1024;

async function request(operation, gameDir, frames, options, fit, client) {
  try {
    const root = await openGameDir(gameDir);
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 24) {
      throw new ReferenceError('Reference measurement requires 1 to 24 frames.');
    }
    const evidence = [], ids = new Set();
    let size = 0;
    for (let i = 0; i < frames.length; i++) {
      const frame = typeof frames[i] === 'string' ? { id: `frame-${i + 1}`, path: frames[i] } : frames[i];
      if (!isObject(frame) || typeof frame.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(frame.id) || ids.has(frame.id)) {
        throw new ReferenceError('Reference frames require unique short IDs.');
      }
      if (typeof frame.path !== 'string' || !/\.(png|jpe?g|webp)$/i.test(frame.path)) {
        throw new ReferenceError('Reference measurement requires PNG, JPEG or WebP image files.');
      }
      ids.add(frame.id);
      const bytes = await readGameFile(root, frame.path, MAX_BYTES - size);
      size += bytes.length;
      evidence.push({ id: frame.id, data_base64: bytes.toString('base64') });
    }
    const result = await callReferenceTool('reference_measure', { operation, evidence, options,
      ...(fit === undefined ? {} : { fit }), ...(client.overlay === undefined ? {} : { overlay: client.overlay }) }, client);
    if (!isObject(result.measurement)) throw new ReferenceError('Reference request returned an invalid measurement response.');
    return result;
  } catch (error) { throw error instanceof ReferenceError ? error : new ReferenceError(referenceErrorMessage(error)); }
}

export const source = (gameDir, file, options = {}, client = {}) => request('source', gameDir, [file], options, undefined, client);
export const colour = (gameDir, file, options = {}, client = {}) => request('colour', gameDir, [file], options, undefined, client);
export const runs = (gameDir, file, options = {}, client = {}) => request('runs', gameDir, [file], options, undefined, client);
export const pitch = (gameDir, file, options = {}, client = {}) => request('pitch', gameDir, [file], options, undefined, client);
export const count_fills = (gameDir, file, options = {}, client = {}) => request('count_fills', gameDir, [file], options, undefined, client);
export const countFills = count_fills;
export const scale = (gameDir, file, options = {}, client = {}) => request('scale', gameDir, [file], options, undefined, client);
export const track = (gameDir, frames, options = {}, client = {}) => request('track', gameDir, frames, options, undefined, client);
export const rate = (gameDir, frames, options = {}, fit = {}, client = {}) => request('rate', gameDir, frames, options, fit, client);
