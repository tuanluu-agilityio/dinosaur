import { describe, it, expect } from 'vitest';
import { formatCheckpoint, parseLastCheckpoint } from '../../scripts/agent/lib/checkpoint.mjs';

const cp = { agent: 'frontend-dev', model: 'sonnet', attempt: 1, done: 'Step 2: tests written', next: 'Step 3: implement', branch: 'task/12-panel', sha: 'abc1234' };

describe('checkpoint', () => {
  it('round-trips format → parse', () => {
    expect(parseLastCheckpoint([formatCheckpoint(cp)])).toEqual(cp);
  });

  it('returns the last checkpoint among several comments', () => {
    const later = { ...cp, done: 'Step 3: implemented', next: 'Step 4: run tests', sha: 'def5678' };
    expect(parseLastCheckpoint([formatCheckpoint(cp), 'random comment', formatCheckpoint(later)])).toEqual(later);
  });

  it('ignores comments without the marker', () => {
    expect(parseLastCheckpoint(['**Checkpoint** fake', 'hello'])).toBeNull();
  });

  it('formatted text starts with the hidden marker and is readable', () => {
    const s = formatCheckpoint(cp);
    expect(s.startsWith('<!-- checkpoint -->')).toBe(true);
    expect(s).toContain('Step 3: implement');
  });
});
