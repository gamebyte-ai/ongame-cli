import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A Windows account without Developer Mode or elevation gets EPERM from symlinkSync. Probe the
// capability instead of the platform, so a Windows box that can create symlinks still runs these proofs.
export const CAN_SYMLINK = (() => {
  const probe = mkdtempSync(join(tmpdir(), 'ongame-cli-symlink-probe-'));
  try {
    writeFileSync(join(probe, 'target'), 'x');
    symlinkSync(join(probe, 'target'), join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

export const NO_SYMLINK = !CAN_SYMLINK && 'this account cannot create symlinks (EPERM)';

// The tests' fake ongame-cli is a POSIX script with a shebang. On Windows the client runs ongame-cli.exe.
export const NO_POSIX_FAKE_CLI = process.platform === 'win32' && 'the fake ongame-cli is a POSIX script; Windows runs ongame-cli.exe';
