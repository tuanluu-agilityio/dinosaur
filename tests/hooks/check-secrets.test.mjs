import { describe, it, expect } from 'vitest';
import { findSecrets } from '../../scripts/hooks/check-secrets.mjs';

const added = (line) => `diff --git a/x b/x\n+++ b/x\n+${line}\n`;

describe('findSecrets', () => {
  it('flags a Sketchfab token with a real value', () => {
    expect(findSecrets(added('SKETCHFAB_API_TOKEN=abcd1234abcd1234abcd1234'))).toHaveLength(1);
  });

  it('flags GitHub tokens', () => {
    expect(findSecrets(added(`token: ghp_${'a'.repeat(36)}`))).toHaveLength(1);
    expect(findSecrets(added(`gho_${'B'.repeat(36)}`))).toHaveLength(1);
  });

  it('flags private keys', () => {
    expect(findSecrets(added('-----BEGIN PRIVATE KEY-----'))).toHaveLength(1);
  });

  it('does not flag an empty example variable', () => {
    expect(findSecrets(added('SKETCHFAB_API_TOKEN='))).toEqual([]);
  });

  it('does not flag the word token in prose', () => {
    expect(findSecrets(added('Set your token in .env before running.'))).toEqual([]);
  });

  it("skips the hook's own test fixtures", () => {
    const diff = 'diff --git a/tests/hooks/check-secrets.test.mjs b/tests/hooks/check-secrets.test.mjs\n+++ b/tests/hooks/check-secrets.test.mjs\n+-----BEGIN PRIVATE KEY-----\n';
    expect(findSecrets(diff)).toEqual([]);
  });

  it('ignores removed lines', () => {
    expect(findSecrets('-SKETCHFAB_API_TOKEN=abcd1234abcd1234abcd1234\n')).toEqual([]);
  });
});
