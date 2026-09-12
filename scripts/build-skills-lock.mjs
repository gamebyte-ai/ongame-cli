#!/usr/bin/env node
/**
 * Pin the phase skills' content AT PACKAGING TIME.
 *
 * The problem this closes: the plugin is installed once and then sits still, while the repo's skills move with
 * every commit. Nothing compared the two, so an agent could load an instruction several versions behind and no
 * one would know — which is exactly what happened: the installed code-phase skill was measured 4 lines behind,
 * missing the corrected empty-result and `integrationVerified` rules, and the run obeyed the OLD text.
 *
 * The check this file feeds must not be able to pass by accident, so the expected hash is NOT recomputed from the
 * installed file at check time (that compares a file with itself and always passes). It is frozen here, in the
 * release, and SHIPS BESIDE the skills. At runtime the installed skill is compared against the expectation that
 * travelled with it — not against the development branch, which the installed copy has no reason to match.
 *
 *   node scripts/build-skills-lock.mjs          # write skills/SKILLS.lock.json
 *   node scripts/build-skills-lock.mjs --check  # verify the lock matches the working tree (CI)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS = `${ROOT}skills`;
const LOCK = `${SKILLS}/SKILLS.lock.json`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readObject(file) {
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error(`${file}: cannot read valid JSON`); }
  if (!isObject(value)) throw new Error(`${file}: expected a JSON object`);
  return value;
}

/** Every SKILL.md under skills/, keyed by its path relative to skills/. */
function collect(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const file = `${dir}/${name}`;
    if (statSync(file).isDirectory()) out.push(...collect(file, rel ? `${rel}/${name}` : name));
    else if (name === 'SKILL.md') out.push([rel, readFileSync(file)]);
  }
  return out;
}

function main() {
  const pluginPath = `${ROOT}.claude-plugin/plugin.json`;
  const pluginVersion = readObject(pluginPath).version;
  if (typeof pluginVersion !== 'string' || !pluginVersion.trim()) {
    throw new Error(`${pluginPath}: missing or invalid version`);
  }
  const skills = Object.fromEntries(collect(SKILLS).map(([rel, buf]) => [rel, {
    sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, lines: buf.toString('utf8').split('\n').length,
  }]));
  if (Object.keys(skills).length === 0) throw new Error('No SKILL.md files found; refusing an empty inventory');

  if (process.argv.includes('--check')) {
    const on = readObject(LOCK);
    if (typeof on.pluginVersion !== 'string' || !on.pluginVersion.trim()) {
      throw new Error(`${LOCK}: missing or invalid pluginVersion`);
    }
    if (!isObject(on.skills) || Object.keys(on.skills).length === 0) {
      throw new Error(`${LOCK}: missing, empty or invalid skill inventory`);
    }
    const drift = [];
    if (on.pluginVersion !== pluginVersion) {
      drift.push(`plugin version mismatch: lock ${on.pluginVersion}, manifest ${pluginVersion}`);
    }
    for (const [key, value] of Object.entries(skills)) {
      if (!Object.hasOwn(on.skills, key)) { drift.push(`${key}: missing from the lock inventory`); continue; }
      const entry = on.skills[key];
      if (!isObject(entry) || typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        drift.push(`${key}: invalid lock sha256 (expected 64 lowercase hex characters)`);
      } else if (entry.sha256 !== value.sha256) {
        drift.push(`${key}: content mismatch (lock ${entry.sha256.slice(0, 12)}, tree ${value.sha256.slice(0, 12)})`);
      }
    }
    for (const key of Object.keys(on.skills)) {
      if (!Object.hasOwn(skills, key)) drift.push(`${key}: locked skill missing from the working tree`);
    }
    if (drift.length) throw new Error(`Lock does not match the release (${drift.length}):\n${drift.map((line) => `  ${line}`).join('\n')}`);
    console.log(`Skill lock verified: ${Object.keys(skills).length} skills, plugin ${pluginVersion}`);
  } else {
    const lock = { pluginVersion, generatedAt: new Date().toISOString().slice(0, 10), skills };
    writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
    console.log(`Wrote skills/SKILLS.lock.json: plugin ${pluginVersion}, ${Object.keys(skills).length} skills`);
  }
}

try { main(); }
catch (error) {
  console.error(`Skill lock validation failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('After reviewing skill or version changes, regenerate with: node scripts/build-skills-lock.mjs');
  process.exitCode = 1;
}
