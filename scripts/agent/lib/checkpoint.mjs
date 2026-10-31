// Checkpoint comments: human-readable on GitHub, machine-readable via the marker.

const MARKER = '<!-- checkpoint -->';
const FIELDS = ['agent', 'model', 'attempt', 'done', 'next', 'branch', 'sha'];

export function formatCheckpoint(c) {
  return [
    MARKER,
    `**Checkpoint** · agent: \`${c.agent}\` · model: \`${c.model}\` · attempt: ${c.attempt}`,
    '',
    `- done: ${c.done}`,
    `- next: ${c.next}`,
    `- branch: \`${c.branch}\` · sha: \`${c.sha}\``,
    '',
    `<!-- checkpoint-data ${JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, c[f]])))} -->`,
  ].join('\n');
}

export function parseLastCheckpoint(comments) {
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const text = comments[i];
    if (!text.startsWith(MARKER)) continue;
    const m = /<!-- checkpoint-data (.*) -->/.exec(text);
    if (!m) continue;
    try {
      return JSON.parse(m[1]);
    } catch {
      // malformed data: fall back to an earlier checkpoint
    }
  }
  return null;
}
