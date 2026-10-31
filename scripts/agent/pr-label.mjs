#!/usr/bin/env node
// Labels a PR agent-author / agent-assistant / agent-unused by the share of
// changed lines in AI-co-authored commits. Usage: node scripts/agent/pr-label.mjs <pr-number>
// Repo: $GITHUB_REPOSITORY (in Actions) or the current gh repo.

import { ghJson, ghText } from './lib/gh.mjs';
import { aiShare, labelFor, LABELS } from './lib/ai-share.mjs';

const LABEL_INFO = {
  'agent-author': { color: '6f42c1', description: 'AI wrote > 70% of changed lines' },
  'agent-assistant': { color: 'a371f7', description: 'AI wrote > 50% and <= 70% of changed lines' },
  'agent-unused': { color: 'd8b9ff', description: 'AI wrote <= 50% of changed lines' },
};

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

  for (const name of LABELS) {
    const { color, description } = LABEL_INFO[name];
    await ghText(['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force']);
  }
  const current = await ghJson(['pr', 'view', pr, '--repo', repo, '--json', 'labels', '--jq', '[.labels[].name]']);
  const stale = current.filter((l) => LABELS.includes(l) && l !== label);
  const args = ['pr', 'edit', pr, '--repo', repo, '--add-label', label];
  for (const l of stale) args.push('--remove-label', l);
  if (stale.length || !current.includes(label)) await ghText(args);

  console.log(JSON.stringify({ ok: true, pr: Number(pr), commits: commits.length, share: Number(share.toFixed(3)), label }));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
