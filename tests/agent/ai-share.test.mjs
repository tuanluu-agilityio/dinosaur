import { describe, it, expect } from 'vitest';
import { isAiCommit, aiShare, labelFor } from '../../scripts/agent/lib/ai-share.mjs';

const AI = 'feat(ui): x\n\nRefs #1\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
const HUMAN = 'fix(ui): y\n\nCo-Authored-By: Alice <a@x>';

describe('isAiCommit', () => {
  it('detects a Claude Co-Authored-By trailer', () => {
    expect(isAiCommit(AI)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAiCommit('chore(build): z\n\nco-authored-by: claude sonnet 5.5 <noreply@anthropic.com>')).toBe(true);
  });

  it('ignores human co-authors', () => {
    expect(isAiCommit(HUMAN)).toBe(false);
  });

  it('ignores "Claude" in the subject only', () => {
    expect(isAiCommit('docs(docs): explain how Claude agents work')).toBe(false);
  });
});

describe('aiShare', () => {
  it('weights commits by changed lines', () => {
    expect(aiShare([
      { message: AI, additions: 80, deletions: 0 },
      { message: HUMAN, additions: 20, deletions: 0 },
    ])).toBe(0.8);
  });

  it('counts deletions as changed lines', () => {
    expect(aiShare([
      { message: AI, additions: 10, deletions: 30 },
      { message: HUMAN, additions: 60, deletions: 0 },
    ])).toBe(0.4);
  });

  it('is 0 for no commits or no changed lines', () => {
    expect(aiShare([])).toBe(0);
    expect(aiShare([{ message: AI, additions: 0, deletions: 0 }])).toBe(0);
  });
});

describe('labelFor', () => {
  it('maps shares to labels with the agreed boundaries', () => {
    expect(labelFor(0.71)).toBe('agent-author');
    expect(labelFor(1)).toBe('agent-author');
    expect(labelFor(0.70)).toBe('agent-assistant');
    expect(labelFor(0.51)).toBe('agent-assistant');
    expect(labelFor(0.50)).toBe('agent-unused');
    expect(labelFor(0)).toBe('agent-unused');
  });
});
