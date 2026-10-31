import { validateSpecies, type SpeciesContent, type SpeciesId } from './schema';

export async function loadSpecies(id: SpeciesId): Promise<SpeciesContent> {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const res = await fetch(`${base}content/species/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load species ${id}: HTTP ${res.status}`);
  return validateSpecies(await res.json());
}
