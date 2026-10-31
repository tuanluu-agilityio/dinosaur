#!/usr/bin/env node
// Usage: node --env-file=<root>/.env scripts/assets/fetch.mjs <species> [sketchfab-uid]
// Downloads the manifest's source model (Sketchfab download API) into assets/src/<species>/.
// The token (SKETCHFAB_API_TOKEN) is read from the environment and never logged.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const SPECIES = ['tyrannosaurus', 'triceratops', 'ankylosaurus', 'edmontosaurus', 'pachycephalosaurus'];
const API = 'https://api.sketchfab.com/v3';

export function uidFromUrl(url) {
  const m = /([0-9a-f]{32})(?:[/?#].*)?$/i.exec(url ?? '');
  return m ? m[1].toLowerCase() : null;
}

/** Replace every occurrence of the API token with *** so text can be logged safely. */
export function redact(text, token = process.env.SKETCHFAB_API_TOKEN) {
  let out = String(text);
  if (token) out = out.split(token).join('***');
  return out;
}

/** Write zip entries under destDir, refusing paths that escape it (zip-slip). Returns written paths. */
export function extractZip(bytes, destDir) {
  const root = resolve(destDir);
  const written = [];
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(bytes)))) {
    if (name.endsWith('/')) continue;
    const target = resolve(root, normalize(name));
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`unsafe path in archive: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written.push(target);
  }
  return written;
}

async function main() {
  const [species, uidArg] = process.argv.slice(2);
  if (!SPECIES.includes(species)) {
    console.error(`usage: fetch.mjs <${SPECIES.join('|')}> [uid]`);
    process.exit(2);
  }
  const token = process.env.SKETCHFAB_API_TOKEN;
  if (!token) {
    console.error('SKETCHFAB_API_TOKEN is not set (run with node --env-file=<root>/.env)');
    process.exit(2);
  }
  let uid = uidArg;
  if (!uid) {
    const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));
    const entry = manifest.find((e) => e.species === species);
    uid = uidFromUrl(entry?.sourceUrl);
    if (!uid) throw new Error(`no sourceUrl with a Sketchfab uid for ${species} in assets/manifest.json`);
  }
  const meta = await fetch(`${API}/models/${uid}/download`, { headers: { Authorization: `Token ${token}` } });
  if (!meta.ok) throw new Error(`download request failed: HTTP ${meta.status}`);
  const links = await meta.json();
  const pick = links.source ?? links.gltf ?? links.glb;
  if (!pick?.url) throw new Error(`no downloadable archive for ${uid} (keys: ${Object.keys(links).join(', ')})`);
  const res = await fetch(pick.url); // signed URL, no auth header
  if (!res.ok) throw new Error(`archive download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const dest = join('assets', 'src', species);
  mkdirSync(dest, { recursive: true });
  const files = pick.url.split('?')[0].endsWith('.zip') || bytes.subarray(0, 2).toString() === 'PK' ? extractZip(bytes, dest) : [];
  if (!files.length) {
    const f = join(dest, `${uid}.bin`);
    writeFileSync(f, bytes);
    files.push(resolve(f));
  }
  console.log(`fetched ${species} (${uid}) -> ${dest}: ${files.length} file(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(redact(e?.message ?? e));
    process.exit(1);
  });
}
