import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, heartbeat, releaseLock, gpuLockPath } from '../../scripts/agent/lib/lock.mjs';

let path;
beforeEach(() => { path = join(mkdtempSync(join(tmpdir(), 'lock-')), '.agent-lock'); });

const MIN = 60_000;

describe('lock', () => {
  it('first acquire succeeds, second fails with holder info', () => {
    expect(acquireLock(path, 1000).ok).toBe(true);
    const r = acquireLock(path, 2000);
    expect(r.ok).toBe(false);
    expect(r.holder).toMatchObject({ pid: process.pid, startedAt: 1000, heartbeat: 1000 });
  });

  it('heartbeat keeps the lock fresh', () => {
    acquireLock(path, 0);
    heartbeat(path, 29 * MIN);
    expect(acquireLock(path, 45 * MIN).ok).toBe(false);
  });

  it('acquire succeeds when the heartbeat is older than 30 minutes', () => {
    acquireLock(path, 0);
    expect(acquireLock(path, 31 * MIN).ok).toBe(true);
  });

  it('release removes the lock', () => {
    acquireLock(path, 0);
    releaseLock(path);
    expect(existsSync(path)).toBe(false);
  });

  describe('gpu lock (owned by an issue)', () => {
    it('refuses while held by another issue, records the owner', () => {
      expect(acquireLock(path, 0, 5).ok).toBe(true);
      const r = acquireLock(path, MIN, 6);
      expect(r.ok).toBe(false);
      expect(r.holder.owner).toBe(5);
    });

    it('takes over when stale', () => {
      acquireLock(path, 0, 5);
      expect(acquireLock(path, 31 * MIN, 6).ok).toBe(true);
      expect(acquireLock(path, 32 * MIN, 5).ok).toBe(false);
    });

    it('releases only by the holder', () => {
      acquireLock(path, 0, 5);
      expect(releaseLock(path, 6).ok).toBe(false);
      expect(existsSync(path)).toBe(true);
      expect(releaseLock(path, 5).ok).toBe(true);
      expect(existsSync(path)).toBe(false);
    });

    it('heartbeat only refreshes the holder', () => {
      acquireLock(path, 0, 5);
      heartbeat(path, 29 * MIN, 6);
      expect(acquireLock(path, 31 * MIN, 6).ok).toBe(true);
    });

    it('shares one path across worktrees via the git common dir', () => {
      const a = gpuLockPath(process.cwd());
      const b = gpuLockPath(join(process.cwd(), 'tests'));
      expect(a).toBe(b);
      expect(a.endsWith('agent-gpu.lock')).toBe(true);
    });
  });
});
