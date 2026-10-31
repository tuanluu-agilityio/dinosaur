import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'content', 'asset'];
export const SCOPES = ['scene', 'dino', 'ui', 'i18n', 'audio', 'assets', 'perf', 'content', 'build', 'agent', 'docs'];
const MAX_SUBJECT = 72;

const HINT = [
  'Commit message must follow: <type>(<scope>): <subject>',
  `  types:  ${TYPES.join(' ')}`,
  `  scopes: ${SCOPES.join(' ')}`,
  `  subject: English, imperative, <= ${MAX_SUBJECT} chars`,
  '  example: feat(ui): add language toggle',
].join('\n');

export function checkCommitMsg(msg) {
  const lines = msg.split(/\r?\n/).filter((l) => !l.startsWith('#'));
  const header = (lines[0] ?? '').trim();

  if (header.startsWith('Merge ') || header.startsWith('Revert "')) return { ok: true };
  if (header.length > MAX_SUBJECT) {
    return { ok: false, error: `Header is ${header.length} chars (max ${MAX_SUBJECT}).\n${HINT}` };
  }

  const m = /^([a-z]+)\(([a-z0-9-]+)\)!?: \S.*$/.exec(header);
  if (!m) return { ok: false, error: HINT };
  if (!TYPES.includes(m[1])) return { ok: false, error: `Unknown type "${m[1]}".\n${HINT}` };
  if (!SCOPES.includes(m[2])) return { ok: false, error: `Unknown scope "${m[2]}".\n${HINT}` };
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkCommitMsg(readFileSync(process.argv[2], 'utf8'));
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
}
