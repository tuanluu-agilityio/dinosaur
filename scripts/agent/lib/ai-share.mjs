// Share of a PR's changed lines written by AI (spec §16). A commit is AI-written
// when a Co-Authored-By trailer names Claude; the measure is per commit, not per line.

export const LABELS = ['agent-author', 'agent-assistant', 'agent-unused'];

export function isAiCommit(message) {
  return /^co-authored-by:\s*claude\b/im.test(message);
}

export function aiShare(commits) {
  let total = 0;
  let ai = 0;
  for (const c of commits) {
    const lines = c.additions + c.deletions;
    total += lines;
    if (isAiCommit(c.message)) ai += lines;
  }
  return total === 0 ? 0 : ai / total;
}

export function labelFor(share) {
  if (share > 0.7) return 'agent-author';
  if (share > 0.5) return 'agent-assistant';
  return 'agent-unused';
}
