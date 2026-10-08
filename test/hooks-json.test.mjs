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
