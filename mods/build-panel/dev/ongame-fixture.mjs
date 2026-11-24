#!/usr/bin/env node
// A stand-in ongame MCP server for trying the build panel in a real Claude Code session without an ongame
// account. It answers five ongame tools with the CLI's own answer shapes (the sources are named in
// ../hooks/state.ts) and touches nothing else: no network, no files. Its server name must hold "ongame" for the
// panel to read it, as the real servers' names do.
//
//   claude --plugin-dir . --mcp-config '{"mcpServers":{"ongame-fixture":
//     {"command":"node","args":["mods/build-panel/dev/ongame-fixture.mjs"]}}}'
//
// Run it from the repo root: the panel ships inside the ongame plugin (hooks/hooks.json "modules").
// Then ask Claude to call state_init, state_advance, play_gate (with the buildId state_init returned), play_review
// (with the runId play_gate returned) and preview_start.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const BUILD_ID = 'b_0123456789abcdef';
let plan = { phases: [] };
let step = -1;
/** The latest play_gate run. As in the CLI, play_review passes only for that run, in the folder it played. */
let run = null;

const state = () => ({
  currentPhase: step >= 0 && step < plan.phases.length ? plan.phases[step] : null,
  completed: plan.phases.slice(0, Math.max(0, step)),
  done: step >= plan.phases.length,
  plan,
});

const TOOLS = {
  state_init: {
    description: 'Register a build of a game: gameId and a plan with phases.',
    inputSchema: {
      type: 'object',
      properties: { gameId: { type: 'string' }, plan: { type: 'object', properties: { phases: { type: 'array', items: { type: 'string' } } } } },
      required: ['gameId', 'plan'],
    },
    run: (args) => {
      plan = { phases: Array.isArray(args.plan?.phases) ? args.plan.phases.map(String) : [] };
      step = -1;
      return { buildId: BUILD_ID, state: state() };
    },
  },
  state_advance: {
    description: "Open the build's next phase.",
    inputSchema: { type: 'object', properties: { buildId: { type: 'string' } }, required: ['buildId'] },
    run: () => {
      step += 1;
      return { buildId: BUILD_ID, state: state() };
    },
  },
  play_gate: {
    description: 'Play the built game on record. Pass gameDir and the buildId state_init returned. Returns { state, runId, checks }.',
    inputSchema: { type: 'object', properties: { gameDir: { type: 'string' }, buildId: { type: 'string' } }, required: ['gameDir'] },
    run: (args) => {
      run = { runId: randomUUID(), gameDir: String(args.gameDir) };
      return {
        status: 'ok', state: 'awaiting_review', runId: run.runId, checks: [{ id: 'reaches_goal', status: 'pass', detail: 'fixture' }],
        next: `Call play_review({gameDir, runId: "${run.runId}", review, moments}).`,
      };
    },
  },
  play_review: {
    description: 'Record the review of the play footage. Pass the same gameDir and the runId play_gate returned.',
    inputSchema: {
      type: 'object',
      properties: { gameDir: { type: 'string' }, runId: { type: 'string' }, review: { type: 'string' }, moments: { type: 'array', items: { type: 'object' } } },
      required: ['gameDir', 'runId', 'review', 'moments'],
    },
    run: (args) => {
      if (run === null || run.gameDir !== String(args.gameDir)) return { status: 'refused', reason: 'no_run', next: 'Call play_gate first.' };
      if (run.runId !== args.runId) return { status: 'refused', reason: 'stale_run', next: `The latest play_gate run is ${run.runId}. Review that one.` };
      return { status: 'passed' };
    },
  },
  preview_start: {
    description: 'Serve the game locally and return its address.',
    inputSchema: { type: 'object', properties: { gameDir: { type: 'string' } }, required: ['gameDir'] },
    run: () => ({ ok: true, url: 'http://localhost:5173/', pid: process.pid }),
  },
};

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // a notification
  switch (msg.method) {
    case 'initialize':
      return send({
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'ongame-fixture', version: '0.1.0' },
        },
      });
    case 'tools/list':
      return send({
        id: msg.id,
        result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) },
      });
    case 'tools/call': {
      const tool = TOOLS[msg.params?.name];
      if (!tool) return send({ id: msg.id, error: { code: -32602, message: `no tool ${msg.params?.name}` } });
      const answer = tool.run(msg.params?.arguments ?? {});
      return send({ id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(answer) }] } });
    }
    default:
      return send({ id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
  }
});
