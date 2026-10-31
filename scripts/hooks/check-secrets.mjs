import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PATTERNS = [
  /SKETCHFAB_API_TOKEN\s*[=:]\s*['"]?[A-Za-z0-9]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
];

// Fixtures that must contain secret-shaped strings to test this hook.
const SKIP_FILES = new Set(['tests/hooks/check-secrets.test.mjs']);

export function findSecrets(diffText) {
  const hits = [];
  let file = null;
  for (const l of diffText.split(/\r?\n/)) {
    if (l.startsWith('+++ ')) {
      file = l.replace(/^\+\+\+ (b\/)?/, '');
      continue;
    }
    if (!l.startsWith('+') || SKIP_FILES.has(file)) continue;
    if (PATTERNS.some((p) => p.test(l))) hits.push(l.slice(1, 81));
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hits = findSecrets(readFileSync(0, 'utf8'));
  if (hits.length) {
    console.error('Possible secret in staged changes (repo is public):');
    for (const h of hits) console.error(`  ${h.replace(/[A-Za-z0-9]{8,}/g, (s) => `${s.slice(0, 4)}…`)}`);
    process.exit(1);
  }
}
