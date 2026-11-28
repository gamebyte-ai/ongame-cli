/**
 * hooks/hooks.json and the plugin manifest are what Claude Code reads on every maker's machine. A typo there does
 * not fail anything at install time: a hook whose command path is wrong, whose matcher is not a valid pattern, or
 * whose MCP tool prefix no longer matches the plugin's own server name simply never runs. This checks the shapes
 * and the cross-references that a reader of the diff cannot see:
 *
 *   - every hook command and MCP server command points at an executable that exists in this repo;
 *   - every matcher is a valid regular expression;
 *   - every `mcp__plugin_<plugin>_<server>__` prefix in a matcher names this plugin and one of its MCP servers.
 *
 * Run: node --test test/hooks-json.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLUGIN_ROOT_VAR = '${CLAUDE_PLUGIN_ROOT}/';
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const manifest = readJson('.claude-plugin/plugin.json');
const hooks = readJson('hooks/hooks.json');

/** Every { event, index, matcher, hook } in hooks.json, flattened. */
function entries() {
  const out = [];
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    groups.forEach((group, index) => {
      for (const hook of group.hooks) out.push({ event, index, matcher: group.matcher, hook });
    });
  }
  return out;
}

/** A `${CLAUDE_PLUGIN_ROOT}/...` command must name an executable file in this repo. */
function assertPluginExecutable(command, where) {
  assert.equal(typeof command, 'string', `${where}: command is not a string`);
  assert.ok(command.startsWith(PLUGIN_ROOT_VAR), `${where}: command ${command} is not under ${PLUGIN_ROOT_VAR}`);
  const file = path.join(ROOT, command.slice(PLUGIN_ROOT_VAR.length));
  assert.ok(fs.existsSync(file), `${where}: ${command} does not exist in the repo`);
  if (process.platform !== 'win32') {
    assert.ok(fs.statSync(file).mode & 0o111, `${where}: ${command} is not executable`);
  }
}

test('hooks.json has the shape Claude Code reads', () => {
  assert.ok(hooks && typeof hooks.hooks === 'object' && !Array.isArray(hooks.hooks), 'top level must be { "hooks": { ... } }');
  assert.ok(Object.keys(hooks.hooks).length > 0, 'no hook events at all');
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    assert.match(event, /^[A-Z][A-Za-z]+$/, `event name ${event} is not PascalCase`);
    assert.ok(Array.isArray(groups) && groups.length > 0, `${event}: must be a non-empty array`);
    groups.forEach((group, i) => {
      const where = `${event}[${i}]`;
      if ('matcher' in group) assert.equal(typeof group.matcher, 'string', `${where}: matcher is not a string`);
      assert.ok(Array.isArray(group.hooks) && group.hooks.length > 0, `${where}: hooks must be a non-empty array`);
      for (const hook of group.hooks) {
        assert.equal(hook.type, 'command', `${where}: only command hooks are used here, got ${hook.type}`);
        if ('args' in hook) {
          assert.ok(Array.isArray(hook.args) && hook.args.every((a) => typeof a === 'string'), `${where}: args must be strings`);
        }
        if ('timeout' in hook) {
          assert.ok(Number.isFinite(hook.timeout) && hook.timeout > 0, `${where}: timeout must be a positive number`);
        }
      }
    });
  }
});

test('every hook command is an executable in this repo', () => {
  for (const { event, index, hook } of entries()) assertPluginExecutable(hook.command, `${event}[${index}]`);
});

test('every MCP server command is an executable in this repo', () => {
  for (const [name, server] of Object.entries(manifest.mcpServers ?? {})) {
    assertPluginExecutable(server.command, `mcpServers.${name}`);
  }
});

test('every matcher is a valid regular expression', () => {
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    groups.forEach((group, i) => {
      if (group.matcher === undefined) return;
      assert.doesNotThrow(() => new RegExp(group.matcher), `${event}[${i}]: matcher ${group.matcher} is not a valid regex`);
    });
  }
});

test("every plugin MCP tool prefix in a matcher names this plugin and one of its servers", () => {
  const servers = Object.keys(manifest.mcpServers ?? {});
  const valid = servers.map((server) => `mcp__plugin_${manifest.name}_${server}__`);
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    groups.forEach((group, i) => {
      for (const [prefix] of (group.matcher ?? '').matchAll(/mcp__plugin_[A-Za-z0-9_-]*?__/g)) {
        assert.ok(valid.includes(prefix), `${event}[${i}]: ${prefix} is not one of ${valid.join(', ')}`);
      }
    });
  }
});

// build-marker-write saves a build's jury credential from every tool result that registers an asset build
// (ongame cli/src/hooks/build-marker-write.ts). A tool missing from this matcher never gets its review. call_wait is
// here because a call slower than 45 s answers call_pending and delivers the real result through call_wait.
test('build-marker-write runs after every asset-registering tool', () => {
  const groups = hooks.hooks.PostToolUse.filter(
    (g) => g.matcher !== undefined && g.hooks.some((h) => h.args?.join(' ') === 'hook build-marker-write'),
  );
  const prefix = `mcp__plugin_${manifest.name}_ongame__`;
  for (const tool of ['forge_request', 'forge_batch', 'forge_generate_async', 'forge_rig', 'sound_request', 'call_wait', 'state_init']) {
    assert.ok(groups.some((g) => new RegExp(g.matcher).test(prefix + tool)), `no build-marker-write hook matches ${tool}`);
  }
  assert.ok(!groups.some((g) => new RegExp(g.matcher).test(`${prefix}forge_rig_status`)), 'matcher must be anchored');
});

// play-gate-finish refuses a build's finish calls until its game was played on record (ongame
// cli/src/hooks/play-gate-finish.ts, PR 916). It must hold exactly the two finish tools of the shipped server, and run
// before the call, or a build is recorded done without being played.
test('play-gate-finish runs before trace_emit and profile_record_build, through the launcher', () => {
  const groups = (hooks.hooks.PreToolUse ?? []).filter((g) => g.hooks.some((h) => h.args?.join(' ') === 'hook play-gate-finish'));
  assert.equal(groups.length, 1, 'expected one PreToolUse group for play-gate-finish');
  const [group] = groups;
  assert.equal(group.matcher, '^(mcp__plugin_ongame_ongame__|mcp__ongame__)(trace_emit|profile_record_build)$');
  for (const hook of group.hooks) assert.equal(hook.command, `${PLUGIN_ROOT_VAR}bin/ongame-launcher`);
  const prefix = `mcp__plugin_${manifest.name}_ongame__`;
  const re = new RegExp(group.matcher);
  for (const tool of ['trace_emit', 'profile_record_build']) assert.ok(re.test(prefix + tool), `${tool} is not held`);
  for (const tool of ['trace_emit_batch', 'state_init', 'publish_upload']) assert.ok(!re.test(prefix + tool), `${tool} must not be held`);
});

/**
 * Whether Claude Code runs a hook group for a tool, by its own rule (measured in Claude Code 2.1.332's hook matcher
 * code): a PreToolUse or PostToolUse matcher made only of letters, digits, `_`, `|`, `,`, space and `-` is a list of
 * exact tool names. Any other matcher is a regular expression, tested unanchored.
 */
function claudeRuns(matcher, tool) {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (/^[a-zA-Z0-9_|, -]+$/.test(matcher)) return matcher.split(/[|,]/).map((s) => s.trim()).filter(Boolean).includes(tool);
  return new RegExp(matcher).test(tool);
}

// One onGame server, two tool names. Installed as this plugin, its tools are mcp__plugin_ongame_ongame__<tool>. Wired
// directly as a server named `ongame` (claude --mcp-config, as every fleet game worker runs it), they are
// mcp__ongame__<tool>. On 2026-11-26, 22 fleet builds that expected a code review got none (measured on board item
// i_0gfbk16i): their state_init came as mcp__ongame__state_init, build-marker-write never ran, so no
// .ongame/jury.json was written and phase-jury skipped every code write. ongame cli/src/hooks/play-gate-finish.ts
// and desktop/src/chat.ts already take both names.
const SERVER = 'ongame';
const ourPrefixes = () => {
  assert.ok(SERVER in (manifest.mcpServers ?? {}), `plugin.json has no ${SERVER} server`);
  return [`mcp__plugin_${manifest.name}_${SERVER}__`, `mcp__${SERVER}__`];
};
const postGroupsOf = (args) => hooks.hooks.PostToolUse.filter((g) => g.hooks.some((h) => h.args?.join(' ') === args));

test("each review hook runs for both names of onGame's tools, and for no other server's", () => {
  const wanted = {
    'hook build-marker-write': ['forge_request', 'forge_batch', 'forge_generate_async', 'forge_rig', 'sound_request', 'call_wait', 'state_init'],
    'hook skill-integrity': ['state_init'],
    'hook build-marker-clear': ['trace_emit'],
  };
  for (const [args, tools] of Object.entries(wanted)) {
    const groups = postGroupsOf(args);
    assert.ok(groups.length > 0, `no PostToolUse group runs ${args}`);
    const runs = (name) => groups.some((g) => claudeRuns(g.matcher, name));
    for (const tool of tools) {
      for (const prefix of ourPrefixes()) assert.ok(runs(prefix + tool), `${args} does not run for ${prefix}${tool}`);
      // Another server's tool of the same name, and names that only contain ours.
      for (const name of [`mcp__other__${tool}`, `mcp__plugin_other_ongame__${tool}`, `mcp__ongame2__${tool}`, `mcp__x_mcp__ongame__${tool}`, `mcp__ongame__${tool}_status`, tool]) {
        assert.ok(!runs(name), `${args} must not run for ${name}`);
      }
    }
  }
});

// The finish gate holds both names too. Until 1.7.107 it held only the plugin's names, and a test pinned that on
// purpose (main c_xpql10m3, right-hand c_y50bcg5y on board item i_o8yu5nq2; cairn HZ2AG2): the gate looks for the
// build's play record under the agent's own home, and a fleet worker that played on another host through
// fleet-remote-play had none there. 6 of 45 measured fleet finish calls on 2026-11-28 would have been refused, all
// from remote plays. Board item i_h7g6c1zy makes a remote play leave its record on the worker's host, so board item
// i_b64qek6r widened this matcher and replaced that pin with this test.
test("play-gate-finish holds the finish calls under both names of onGame's tools, and no other tool", () => {
  const groups = (hooks.hooks.PreToolUse ?? []).filter((g) => g.hooks.some((h) => h.args?.join(' ') === 'hook play-gate-finish'));
  assert.equal(groups.length, 1, 'expected one PreToolUse group for play-gate-finish');
  const holds = (name) => claudeRuns(groups[0].matcher, name);
  for (const prefix of ourPrefixes()) {
    for (const tool of ['trace_emit', 'profile_record_build']) assert.ok(holds(prefix + tool), `${prefix}${tool} is not held`);
    for (const tool of ['trace_emit_batch', 'state_init', 'publish_upload', 'profile_record_build_status']) {
      assert.ok(!holds(prefix + tool), `${prefix}${tool} must not be held`);
    }
  }
  // Another server's finish tool of the same name, and names that only contain ours.
  for (const tool of ['trace_emit', 'profile_record_build']) {
    for (const name of [`mcp__other__${tool}`, `mcp__plugin_other_ongame__${tool}`, `mcp__ongame2__${tool}`, `mcp__x_mcp__ongame__${tool}`, tool]) {
      assert.ok(!holds(name), `play-gate-finish must not hold ${name}`);
    }
  }
});

// The build panel ships inside this plugin (docs/plans/2026-11-24-build-panel-design.md, "Release"). Claude Code loads
// the one hooks module that `modules` names, by a path relative to hooks/hooks.json. A client without mods ignores it.
test('the hooks module path names a file inside the plugin', () => {
  assert.ok(Array.isArray(hooks.modules) && hooks.modules.length === 1, 'modules must list exactly one path');
  const [rel] = hooks.modules;
  assert.ok(/^\.\.?\//.test(rel), `${rel}: a module path starts with ./ or ../ (relative to hooks/hooks.json)`);
  const file = path.resolve(ROOT, 'hooks', rel);
  assert.ok(file.startsWith(ROOT + path.sep), `${rel} points outside the plugin`);
  assert.ok(fs.existsSync(file), `${rel} does not exist`);
});

// A mod's `$.state` values belong to the plugin that loads it. A value named for another plugin is refused at runtime
// ("state.set: denied"). Claude Code only logs that and skips the hook, so the session still looks fine.
// types/index.d.ts declares the values; Claude Code reads it at the plugin root without a manifest key.
test("the hooks module keeps its state under this plugin's name, and types/index.d.ts declares it", () => {
  const source = fs.readFileSync(path.resolve(ROOT, 'hooks', hooks.modules[0]), 'utf8');
  const owners = [...source.matchAll(/\bplugin:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(owners.length > 0, 'no $.state atom found in the hooks module');
  for (const owner of owners) assert.equal(owner, manifest.name, `a $.state value belongs to ${owner}, not to ${manifest.name}`);
  const types = fs.readFileSync(path.join(ROOT, 'types/index.d.ts'), 'utf8');
  const declared = new RegExp(`interface PluginState \\{\\s*(?:'${manifest.name}'|${manifest.name}): \\{`);
  assert.match(types, declared, `types/index.d.ts declares no PluginState for ${manifest.name}`);
});

// Claude Code 2.0.15 to 2.1.75 refuse a plugin whose plugin.json has a key they do not know, and then load none of its
// MCP servers, skills or commands. Measured on 2.1.50 with "types" on 2026-11-24 (board item i_q2xe7ru5).
test('plugin.json uses only keys that old Claude Code clients accept', () => {
  const accepted = ['name', 'description', 'version', 'author', 'mcpServers'];
  for (const key of Object.keys(manifest)) {
    assert.ok(
      accepted.includes(key),
      `plugin.json key "${key}": Claude Code 2.0.15 to 2.1.75 refuse the whole plugin for a key they do not know. ` +
        'Run the plugin on such a client (for example 2.1.50) before adding the key to this list.',
    );
  }
});
