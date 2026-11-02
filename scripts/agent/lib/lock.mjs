// Single-orchestrator lock file. A lock whose heartbeat is older than STALE_MS
// belongs to a dead session and may be taken over.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export const STALE_MS = 30 * 60_000;

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

export function acquireLock(path, now = Date.now(), owner) {
  const holder = read(path);
  const mine = holder && owner !== undefined && holder.owner === owner;
  if (holder && !mine && now - holder.heartbeat <= STALE_MS) return { ok: false, holder };
  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: now, heartbeat: now, ...(owner === undefined ? {} : { owner }) }));
  return { ok: true };
}

// With `owner`, only that owner's lock is refreshed / released.
export function heartbeat(path, now = Date.now(), owner) {
  const holder = read(path);
  if (holder && (owner === undefined || holder.owner === owner)) writeFileSync(path, JSON.stringify({ ...holder, heartbeat: now }));
}

export function releaseLock(path, owner) {
  const holder = read(path);
  if (owner !== undefined && holder && holder.owner !== owner) return { ok: false, holder };
  rmSync(path, { force: true });
  return { ok: true };
}

// GPU lock lives in the git common dir so every worktree shares one file.
export function gpuLockPath(cwd = process.cwd()) {
  const dir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim();
  return resolve(cwd, dir, 'agent-gpu.lock');
}
