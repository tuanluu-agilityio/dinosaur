#!/usr/bin/env node
// Board CLI for agents. Prints one line of JSON (or readable text with --pretty).
// Every board-mutating command is idempotent.

import { parseArgs } from 'node:util';

const COMMANDS = {
  preflight: 'Check the machine and GitHub are ready for a run',
  setup: 'Create repo/Project/fields/labels if missing; write .agent/project.json',
  import: 'import <plan.md…>  Create or update one issue per plan task',
  ready: 'List task ids that may start now (and blocked ones)',
  claim: 'claim <issue> --agent <a> --model <m>  Move to In Progress, record assignment',
  checkpoint: 'checkpoint <issue> --done <text> --next <text>  Post progress checkpoint',
  move: 'move <issue> <Todo|In Progress|Review|Done>',
  fail: 'fail <issue> --reason <text>  Mark needs-human after too many attempts',
  resume: 'List In Progress/Review tasks with their last checkpoint and worktree state',
  pause: 'pause --reason <text>  Note a pause on running issues and Run status',
  status: 'Summary counts per status',
};

function usage() {
  return ['Usage: node scripts/agent/board.mjs <command> [args] [--pretty]', '', ...Object.entries(COMMANDS).map(([c, d]) => `  ${c.padEnd(11)} ${d}`)].join('\n');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || !COMMANDS[command]) {
    console.log(usage());
    process.exit(command && !['--help', '-h'].includes(command) ? 2 : 0);
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      agent: { type: 'string' }, model: { type: 'string' }, done: { type: 'string' },
      next: { type: 'string' }, reason: { type: 'string' }, pretty: { type: 'boolean' },
    },
  });
  const { commands } = await import('./lib/commands.mjs');
  const result = await commands[command]({ args: positionals, opts: values });
  console.log(values.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  if (result?.ok === false) process.exit(1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
