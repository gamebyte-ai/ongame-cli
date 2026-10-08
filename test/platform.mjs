// What a test host can do. Each value is a node:test `skip` option: false runs the test, a string skips it and says why.
// Every skip here is Windows-only, so Linux and macOS CI still run each of these tests in full.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function symlinkRefused() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-probe-'));
  try {
    await fs.symlink(path.join(dir, 'target'), path.join(dir, 'link'));
    return false;
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    return 'this host refuses symlinks (Windows without Developer Mode or admin rights)';
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const noSymlinks = await symlinkRefused();

// The fake ongame-cli these tests write is a `#!node` script. Windows runs only `bin\ongame-cli.exe`, a real executable.
export const noScriptCli = process.platform === 'win32' && 'the fake ongame-cli is a #! script, and Windows runs only a real .exe';
