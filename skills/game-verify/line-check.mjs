#!/usr/bin/env node
// Before a web publish or a store build: is the checked-out line the game's latest, or is newer work elsewhere?
//   node line-check.mjs <gameDir> [--fetch]
// Read-only by default: compares against the remote-tracking refs as last fetched. --fetch runs
// `git fetch --all --prune` first (network; updates and prunes remote-tracking refs).
// A remote branch counts only when it holds commits that neither HEAD nor the remote's default branch has;
// branches already merged into the default branch, or whose touched files already match it (squash merge), are
// collapsed into one summary line.
// Exit: 0 = HEAD holds the default branch and no other line holds unique work;
//       1 = some branch holds work that neither HEAD nor the default branch has (read the list before building);
//       2 = not a git repository or git failed;
//       3 = only that HEAD is behind the default branch: pull it first.
// A folder with no remote prints a note and exits 0.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: node line-check.mjs <gameDir> [--fetch]');
  process.exit(2);
}
const git = (...a) => execFileSync('git', ['--no-optional-locks', '-C', dir, ...a],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };

try {
  git('rev-parse', '--git-dir');
} catch {
  console.error(`${dir} is not a git repository: nothing to compare. Compare the live build instead (live-diff.mjs).`);
  process.exit(2);
}
const remotes = git('remote').split('\n').filter(Boolean);
if (!remotes.length) {
  console.log('no git remote: other lines can only be local branches or the live build. Run `git branch -a` and live-diff.mjs.');
  process.exit(0);
}
if (args.includes('--fetch')) {
  try { git('fetch', '--all', '--prune', '--quiet'); } catch (e) {
    console.error(`git fetch failed (${e.stderr?.toString().trim() || e.message}); comparing against the last fetched state`);
  }
} else {
  console.log('(no fetch: comparing against the last fetched state; pass --fetch to update remote refs first)');
}

try {
  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  const def = tryGit('symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`) ||
    ['main', 'master'].map((b) => `${remote}/${b}`).find((r) => tryGit('rev-parse', '--verify', '--quiet', r));
  if (!def) throw new Error(`cannot find the default branch of ${remote} (set it: git remote set-head ${remote} -a)`);

  const head = git('rev-parse', '--short', 'HEAD');
  const headTime = Number(git('log', '-1', '--format=%ct', 'HEAD'));
  const headName = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
  console.log(`HEAD ${head} (${headName}) ${new Date(headTime * 1000).toISOString()}${dirty ? `, ${dirty} uncommitted files` : ''}`);
  const behind = Number(git('rev-list', '--count', `HEAD..${def}`));
  const aheadOfDef = Number(git('rev-list', '--count', `${def}..HEAD`));
  console.log(`default ${def}: HEAD is ${behind} behind, ${aheadOfDef} ahead`);

  const branches = git('for-each-ref', '--sort=-committerdate', '--format=%(refname:short) %(committerdate:unix)', 'refs/remotes')
    .split('\n').filter(Boolean).map((l) => l.split(' '))
    .filter(([name]) => name !== def && !name.endsWith('/HEAD') && name.includes('/'));

  let unique = 0;
  let merged = 0;
  let squashed = 0;
  for (const [name, t] of branches) {
    const own = Number(git('rev-list', '--count', name, '^HEAD', `^${def}`));
    if (!own) { merged++; continue; }
    const touched = [...new Set(git('log', '--name-only', '--format=', name, '^HEAD', `^${def}`).split('\n').filter(Boolean))];
    // A squash or rebase merge leaves the commits unmerged but the content in the default branch.
    const differ = touched.length ? git('diff', '--name-only', def, name, '--', ...touched).split('\n').filter(Boolean) : [];
    if (!differ.length) { squashed++; continue; }
    unique++;
    const newer = Number(t) > headTime;
    console.log(`${newer ? 'NEWER ' : 'older '} ${name}  ${new Date(Number(t) * 1000).toISOString()}  ` +
      `${own} commits in neither HEAD nor ${def}`);
    console.log(`         ${differ.length} of ${touched.length} touched files differ from ${def}: ` +
      `${differ.slice(0, 8).join(', ')}${differ.length > 8 ? ', ...' : ''}`);
  }
  console.log(`# ${merged} of ${branches.length} other remote branches are contained in HEAD or ${def}, ${squashed} more only carry content ${def} already has (squash-merged); not listed.`);
  if (unique) {
    console.log(`# ${unique} branches hold work neither HEAD nor ${def} has. Building from HEAD drops it; merge it or confirm it is abandoned.`);
    if (behind) console.log(`# Also: pull ${def} (HEAD is ${behind} commits behind it).`);
    process.exit(1);
  }
  if (behind) {
    console.log(`# pull ${def}: HEAD is ${behind} commits behind it; no other line holds unique work.`);
    process.exit(3);
  }
  console.log(`# HEAD holds ${def} and every other remote branch.`);
  process.exit(0);
} catch (e) {
  console.error(`git failed: ${e.stderr?.toString().trim() || e.message}`);
  process.exit(2);
}
