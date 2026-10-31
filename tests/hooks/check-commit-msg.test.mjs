import { describe, it, expect } from 'vitest';
import { checkCommitMsg } from '../../scripts/hooks/check-commit-msg.mjs';

describe('checkCommitMsg', () => {
  it('accepts a conventional commit with scope', () => {
    expect(checkCommitMsg('feat(ui): add language toggle').ok).toBe(true);
  });

  it('accepts a body and Refs footer', () => {
    expect(checkCommitMsg('fix(scene): clamp fog density\n\nRefs #12').ok).toBe(true);
  });

  it('rejects free-form messages with a format hint and example', () => {
    const r = checkCommitMsg('update stuff');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('<type>(<scope>): <subject>');
    expect(r.error).toContain('feat(ui): add language toggle');
  });

  it('rejects unknown type', () => {
    expect(checkCommitMsg('feature(ui): x').ok).toBe(false);
  });

  it('rejects unknown scope', () => {
    expect(checkCommitMsg('feat(foo): x').ok).toBe(false);
  });

  it('rejects subject line longer than 72 chars', () => {
    expect(checkCommitMsg(`feat(ui): ${'a'.repeat(70)}`).ok).toBe(false);
  });

  it('accepts merge and revert commits', () => {
    expect(checkCommitMsg("Merge branch 'task/3-x'").ok).toBe(true);
    expect(checkCommitMsg('Revert "feat(ui): add language toggle"').ok).toBe(true);
  });

  it('ignores git comment lines', () => {
    expect(checkCommitMsg('docs(docs): add runbook\n# Please enter the commit message').ok).toBe(true);
  });
});

describe('checkCommitMsg language', () => {
  it('rejects a Vietnamese subject with the format hint', () => {
    const r = checkCommitMsg('feat(ui): thêm nút chuyển ngôn ngữ');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/English/);
  });
});
