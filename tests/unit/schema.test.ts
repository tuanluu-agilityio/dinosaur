import { describe, it, expect } from 'vitest';
import example from '../../content/species/_example.json';
import { validateSpecies, SchemaError } from '../../src/content/schema';

const clone = () => JSON.parse(JSON.stringify(example));

function pathOf(fn: () => unknown): string | undefined {
  try { fn(); } catch (e) { if (e instanceof SchemaError) return e.path; throw e; }
  return undefined;
}

describe('validateSpecies', () => {
  it('accepts _example.json', () => {
    expect(validateSpecies(example).id).toBe('tyrannosaurus');
  });
  it('reports missing sections.behavior.vi', () => {
    const j = clone(); delete j.sections.behavior.vi;
    expect(pathOf(() => validateSpecies(j))).toBe('sections.behavior.vi');
  });
  it('rejects min > max range', () => {
    const j = clone(); j.quickFacts.lengthM = [12, 8];
    expect(pathOf(() => validateSpecies(j))).toBe('quickFacts.lengthM');
  });
  it('rejects empty sources', () => {
    const j = clone(); j.sources = [];
    expect(pathOf(() => validateSpecies(j))).toBe('sources');
  });
  it('rejects unknown id and diet', () => {
    const a = clone(); a.id = 'raptor';
    expect(pathOf(() => validateSpecies(a))).toBe('id');
    const b = clone(); b.quickFacts.diet = 'plants';
    expect(pathOf(() => validateSpecies(b))).toBe('quickFacts.diet');
  });
  it('rejects non-object input', () => {
    expect(pathOf(() => validateSpecies(null))).toBe('');
  });
});
