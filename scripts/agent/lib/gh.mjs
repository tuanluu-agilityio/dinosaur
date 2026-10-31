// Thin wrapper over the gh CLI. No logic lives here.

import { execFile } from 'node:child_process';

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('gh', args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

export async function ghJson(args) {
  const out = await run(args);
  return out.trim() ? JSON.parse(out) : null;
}

export async function ghText(args) {
  return (await run(args)).trim();
}

export async function ghGraphql(query, variables = {}) {
  const out = await run(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables }));
  const res = JSON.parse(out);
  if (res.errors?.length) throw new Error(`GraphQL: ${res.errors.map((e) => e.message).join('; ')}`);
  return res.data;
}
