#!/usr/bin/env node
// Labels a PR agent-author / agent-assistant / agent-unused by the share of
// changed lines in AI-co-authored commits. Usage: node scripts/agent/pr-label.mjs <pr-number>
// Repo: $GITHUB_REPOSITORY (in Actions) or the current gh repo.

import { ghJson, ghText } from './lib/gh.mjs';
import { aiShare, labelFor, AI_LABELS } from './lib/ai-share.mjs';
import { LABELS } from './lib/github.mjs';

async function main() {
  const pr = process.argv[2];
  if (!/^\d+$/.test(pr ?? '')) throw new Error('usage: pr-label.mjs <pr-number>');
  const repo = process.env.GITHUB_REPOSITORY || (await ghText(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']));

  // One JSON object per line, so pagination concatenates cleanly.
  const lines = await ghText(['api', `repos/${repo}/pulls/${pr}/commits?per_page=100`, '--paginate', '--jq', '.[] | {sha, message: .commit.message, parents: (.parents | length)}']);
  const list = lines.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const commits = [];
  for (const c of list.filter((x) => x.parents < 2)) {
    const stats = await ghJson(['api', `repos/${repo}/commits/${c.sha}`, '--jq', '.stats']);
    commits.push({ message: c.message, additions: stats.additions, deletions: stats.deletions });
  }

  const share = aiShare(commits);
  const label = labelFor(share);

  // setup creates these labels; recreate here too so a fresh fork/repo works (needs issues: write).
  for (const { name, color, description } of LABELS.filter((l) => AI_LABELS.includes(l.name))) {
    await ghText(['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force']);
  }
  const current = await ghJson(['pr', 'view', pr, '--repo', repo, '--json', 'labels', '--jq', '[.labels[].name]']);
  const stale = current.filter((l) => AI_LABELS.includes(l) && l !== label);
  const args = ['pr', 'edit', pr, '--repo', repo, '--add-label', label];
  for (const l of stale) args.push('--remove-label', l);
  if (stale.length || !current.includes(label)) await ghText(args);

  console.log(JSON.stringify({ ok: true, pr: Number(pr), commits: commits.length, share: Number(share.toFixed(3)), label }));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
