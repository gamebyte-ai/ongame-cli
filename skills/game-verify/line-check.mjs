#!/usr/bin/env node
// Before a web publish or a store build: is the checked-out line the game's latest, or is newer work elsewhere?
//   node line-check.mjs <gameDir> [--fetch]
// Read-only by default: compares against local branches and the remote-tracking refs as last fetched. --fetch runs
// `git fetch --all --prune` first (network; its only write is updating and pruning remote-tracking refs); if that
// fetch fails, nothing is evaluated.
// Every other branch, local (refs/heads) or remote-tracking, counts only when it holds commits that neither HEAD nor
// the default branch has; branches with the same tip are listed once, and branches already merged into the default
// branch, or whose touched files already match it (squash merge), are collapsed into one summary line.
// Default branch: the remote's HEAD (or <remote>/main, <remote>/master), else local main/master, else HEAD itself.
// Exit: 0 = HEAD holds the default branch and no other line holds unique work;
//       1 = some branch holds work that neither HEAD nor the default branch has (read the list before building),
//           or HEAD is behind the default branch (a `BEHIND` line: pull first);
//       2 = not a git repository, the fetch failed, or git failed.
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
const why = (e) => e.stderr?.toString().trim() || e.message;

try {
  git('rev-parse', '--git-dir');
} catch {
  console.error(`${dir} is not a git repository: nothing to compare. Compare the live build instead (live-diff.mjs).`);
  process.exit(2);
}

try {
  const remotes = git('remote').split('\n').filter(Boolean);
  if (args.includes('--fetch') && remotes.length) {
    try { git('fetch', '--all', '--prune', '--quiet'); } catch (e) {
      console.error(`could not fetch; refs may be stale, nothing evaluated (${why(e)})`);
      process.exit(2);
    }
  } else if (remotes.length) {
    console.log('(no fetch: comparing against the last fetched state; pass --fetch to update remote refs first)');
  } else {
    console.log('(no git remote: comparing local branches only)');
  }

  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  const verify = (r) => tryGit('rev-parse', '--verify', '--quiet', `${r}^{commit}`);
  let def = (remote && (tryGit('symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`) ||
      ['main', 'master'].map((b) => `${remote}/${b}`).find(verify))) ||
    ['main', 'master'].find((b) => verify(`refs/heads/${b}`));
  if (!def) {
    console.log('(no default branch found: using HEAD as the baseline)');
    def = 'HEAD';
  }
  const defSha = git('rev-parse', `${def}^{commit}`);

  const head = git('rev-parse', '--short', 'HEAD');
  const headTime = Number(git('log', '-1', '--format=%ct', 'HEAD'));
  const headName = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
  console.log(`HEAD ${head} (${headName}) ${new Date(headTime * 1000).toISOString()}${dirty ? `, ${dirty} uncommitted files` : ''}`);
  const behind = Number(git('rev-list', '--count', `HEAD..${def}`));
  const aheadOfDef = Number(git('rev-list', '--count', `${def}..HEAD`));
  if (def !== 'HEAD') console.log(`default ${def}: HEAD is ${behind} behind, ${aheadOfDef} ahead`);

  // One entry per distinct tip: a local branch and its remote-tracking copy at the same commit are one line.
  const tips = new Map();
  for (const line of git('for-each-ref', '--sort=-committerdate',
    '--format=%(objectname) %(committerdate:unix) %(refname) %(refname:short)', 'refs/heads', 'refs/remotes').split('\n')) {
    const [sha, t, ref, name] = line.split(' ');
    if (!sha || ref.endsWith('/HEAD') || sha === defSha) continue;
    if (tips.has(sha)) tips.get(sha).names.push(name);
    else tips.set(sha, { sha, t, names: [name] });
  }
  const branches = [...tips.values()];
  if (!remotes.length && !branches.length) {
    console.log('# single line: no remote and no other branch, nothing else to lose. Compare the live build (live-diff.mjs).');
    process.exit(0);
  }

  let unique = 0;
  let merged = 0;
  let squashed = 0;
  for (const { sha, t, names } of branches) {
    const own = Number(git('rev-list', '--count', sha, '^HEAD', `^${def}`));
    if (!own) { merged++; continue; }
    // -z: unquoted paths. git quotes a non-ASCII name ("sahne-\304\237.js"); `git diff` matches no file for that text.
    const touched = [...new Set(git('log', '-z', '--name-only', '--format=', sha, '^HEAD', `^${def}`).split('\0').filter(Boolean))];
    // A squash or rebase merge leaves the commits unmerged but the content in the default branch.
    // `git log` prints paths from the repository root; `:(top)` makes `git diff` read them from there too, not from
    // <gameDir>, which may be a sub-folder of the repository.
    const differ = touched.length
      ? git('diff', '--name-only', def, sha, '--', ...touched.map((p) => `:(top)${p}`)).split('\n').filter(Boolean)
      : [];
    if (!differ.length) { squashed++; continue; }
    unique++;
    const newer = Number(t) > headTime;
    console.log(`${newer ? 'NEWER ' : 'older '} ${names.join(', ')}  ${new Date(Number(t) * 1000).toISOString()}  ` +
      `${own} commits in neither HEAD nor ${def}`);
    console.log(`         ${differ.length} of ${touched.length} touched files differ from ${def}: ` +
      `${differ.slice(0, 8).join(', ')}${differ.length > 8 ? ', ...' : ''}`);
  }
  console.log(`# ${merged} of ${branches.length} other branch tips are contained in HEAD or ${def}, ${squashed} more only carry content ${def} already has (squash-merged); not listed.`);
  if (behind) console.log(`BEHIND ${def} by ${behind}: pull it first.`);
  if (unique) console.log(`# ${unique} branches hold work neither HEAD nor ${def} has. Building from HEAD drops it; merge it or confirm it is abandoned.`);
  if (unique || behind) process.exit(1);
  console.log(`# HEAD holds ${def} and every other branch.`);
  process.exit(0);
} catch (e) {
  console.error(`git failed: ${why(e)}`);
  process.exit(2);
}
