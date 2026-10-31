export type SpeciesId = 'tyrannosaurus' | 'triceratops' | 'ankylosaurus' | 'edmontosaurus' | 'pachycephalosaurus';
export type Lang = 'vi' | 'en';
export type Localized = Record<Lang, string>;
export interface SpeciesContent {
  id: SpeciesId; scientificName: string; commonName: Localized;
  quickFacts: { lengthM: [number, number]; massT: [number, number]; periodMa: [number, number]; diet: 'carnivore' | 'herbivore' | 'omnivore' };
  sections: { behavior: Localized; anatomy: Localized; huntingOrDefense: Localized; discovery: Localized };
  contested: Localized[]; sources: { title: string; url: string; year?: number }[];
}

export const SPECIES_IDS: readonly SpeciesId[] = ['tyrannosaurus', 'triceratops', 'ankylosaurus', 'edmontosaurus', 'pachycephalosaurus'];
const DIETS = ['carnivore', 'herbivore', 'omnivore'];
const SECTIONS = ['behavior', 'anatomy', 'huntingOrDefense', 'discovery'] as const;

export class SchemaError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path || '<root>'}: ${message}`);
    this.name = 'SchemaError';
    this.path = path;
  }
}

const join = (p: string, k: string | number) => (p ? `${p}.${k}` : String(k));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new SchemaError(path, 'expected non-empty string');
  return v;
}
function obj(v: unknown, path: string): Record<string, unknown> {
  if (!isObj(v)) throw new SchemaError(path, 'expected object');
  return v;
}
function localized(v: unknown, path: string): Localized {
  const o = obj(v, path);
  return { vi: str(o.vi, join(path, 'vi')), en: str(o.en, join(path, 'en')) };
}
function range(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n)))
    throw new SchemaError(path, 'expected [min, max] numbers');
  if (v[0] > v[1]) throw new SchemaError(path, 'min must be <= max');
  return [v[0], v[1]];
}

export function validateSpecies(json: unknown): SpeciesContent {
  const o = obj(json, '');
  if (typeof o.id !== 'string' || !SPECIES_IDS.includes(o.id as SpeciesId)) throw new SchemaError('id', 'unknown species id');
  const qf = obj(o.quickFacts, 'quickFacts');
  if (typeof qf.diet !== 'string' || !DIETS.includes(qf.diet)) throw new SchemaError('quickFacts.diet', 'invalid diet');
  const sec = obj(o.sections, 'sections');
  const sections = {} as SpeciesContent['sections'];
  for (const k of SECTIONS) sections[k] = localized(sec[k], join('sections', k));
  if (!Array.isArray(o.contested)) throw new SchemaError('contested', 'expected array');
  const contested = o.contested.map((c, i) => localized(c, join('contested', i)));
  if (!Array.isArray(o.sources) || o.sources.length === 0) throw new SchemaError('sources', 'at least one source required');
  const sources = o.sources.map((s, i) => {
    const p = join('sources', i);
    const so = obj(s, p);
    const out: SpeciesContent['sources'][number] = { title: str(so.title, join(p, 'title')), url: str(so.url, join(p, 'url')) };
    if (so.year !== undefined) {
      if (typeof so.year !== 'number' || !Number.isInteger(so.year)) throw new SchemaError(join(p, 'year'), 'expected integer');
      out.year = so.year;
    }
    return out;
  });
  return {
    id: o.id as SpeciesId,
    scientificName: str(o.scientificName, 'scientificName'),
    commonName: localized(o.commonName, 'commonName'),
    quickFacts: {
      lengthM: range(qf.lengthM, 'quickFacts.lengthM'),
      massT: range(qf.massT, 'quickFacts.massT'),
      periodMa: range(qf.periodMa, 'quickFacts.periodMa'),
      diet: qf.diet as SpeciesContent['quickFacts']['diet'],
    },
    sections, contested, sources,
  };
}
