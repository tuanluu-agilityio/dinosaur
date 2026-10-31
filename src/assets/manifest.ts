import type { SpeciesId } from '../content/schema';
import { SPECIES_IDS } from '../content/schema';

export type License = 'CC0' | 'CC-BY-3.0' | 'CC-BY-4.0' | 'CC-BY-NC-3.0' | 'CC-BY-NC-4.0';
export type ClipName = 'idle' | 'walk' | 'eat' | 'roar' | 'run';
export type AssetStatus = 'candidate' | 'approved' | 'rejected';

export interface AssetEntry {
  species: SpeciesId;
  sourceUrl: string;
  author: string;
  license: License;
  modifications: string[];
  files: { high: string; low: string };
  clips: Partial<Record<ClipName, string>>;
  status: AssetStatus;
}

// ADR 0013: CC0, CC-BY and CC-BY-NC (3.0 / 4.0). Anything else (ND, SA, unclear) is rejected.
export const ALLOWED_LICENSES: readonly License[] = ['CC0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-NC-3.0', 'CC-BY-NC-4.0'];
const CLIPS: readonly string[] = ['idle', 'walk', 'eat', 'roar', 'run'];
const STATUSES: readonly string[] = ['candidate', 'approved', 'rejected'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function fail(path: string, msg: string): never {
  throw new Error(`manifest${path}: ${msg}`);
}

function validateEntry(e: unknown, i: number): AssetEntry {
  const p = `[${i}]`;
  if (!isObj(e)) return fail(p, 'must be an object');
  if (!SPECIES_IDS.includes(e.species as SpeciesId)) fail(`${p}.species`, `unknown species ${String(e.species)}`);
  if (!isStr(e.sourceUrl)) fail(`${p}.sourceUrl`, 'required');
  if (!isStr(e.author)) fail(`${p}.author`, 'required');
  if (!ALLOWED_LICENSES.includes(e.license as License)) fail(`${p}.license`, `${String(e.license)} not allowed (ADR 0013)`);
  if (!Array.isArray(e.modifications) || !e.modifications.every((m) => typeof m === 'string')) fail(`${p}.modifications`, 'must be string[]');
  const files = e.files;
  if (!isObj(files) || typeof files.high !== 'string' || (files.low !== undefined && typeof files.low !== 'string')) {
    return fail(`${p}.files`, 'needs high and low strings');
  }
  if (!isObj(e.clips)) return fail(`${p}.clips`, 'must be an object');
  for (const [k, v] of Object.entries(e.clips)) {
    if (!CLIPS.includes(k) || !isStr(v)) fail(`${p}.clips`, `bad clip mapping ${k}`);
  }
  if (!STATUSES.includes(e.status as string)) fail(`${p}.status`, `invalid status ${String(e.status)}`);
  if (e.status === 'approved') {
    if (!isStr(files.high)) fail(`${p}.files.high`, 'approved entry needs files.high');
    if (!isStr(files.low)) fail(`${p}.files.low`, 'approved entry needs files.low');
  }
  return { ...(e as unknown as AssetEntry), files: { high: files.high, low: (files.low as string | undefined) ?? '' } };
}

export function validateManifest(json: unknown): AssetEntry[] {
  if (!Array.isArray(json)) return fail('', 'must be an array of entries');
  return json.map(validateEntry);
}
