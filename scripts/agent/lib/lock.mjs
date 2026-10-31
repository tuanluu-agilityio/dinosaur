// Single-orchestrator lock file. A lock whose heartbeat is older than STALE_MS
// belongs to a dead session and may be taken over.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export const STALE_MS = 30 * 60_000;

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

export function acquireLock(path, now = Date.now()) {
  const holder = read(path);
  if (holder && now - holder.heartbeat <= STALE_MS) return { ok: false, holder };
  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: now, heartbeat: now }));
  return { ok: true };
}

export function heartbeat(path, now = Date.now()) {
  const holder = read(path);
  if (holder) writeFileSync(path, JSON.stringify({ ...holder, heartbeat: now }));
}

export function releaseLock(path) {
  rmSync(path, { force: true });
}
