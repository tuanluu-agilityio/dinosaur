import type { QualityTier } from './quality';

export interface Budget {
  ferns: number;
  cycads: number;
  conifers: number;
  shrubs: number;
  particles: number;
  shadows: boolean;
  godrays: boolean;
  textureMax: 1024 | 2048 | 4096;
  verlet: boolean;
  dinoVariant: 'low' | 'high';
}

// Measured by the P2-T01 spike (docs/perf/spike-results.md, ADR 0010). ferns/particles/shadows/textureMax/
// dinoVariant are measured; cycads, conifers, shrubs, godrays and verlet are not in the spike yet and stay provisional
// until their own tasks measure them with tests/e2e/perf.spec.ts.
export const BUDGETS: Record<QualityTier, Budget> = {
  high: { ferns: 6000, cycads: 800, conifers: 300, shrubs: 600, particles: 20000, shadows: true, godrays: true, textureMax: 2048, verlet: true, dinoVariant: 'high' },
  medium: { ferns: 3000, cycads: 400, conifers: 150, shrubs: 300, particles: 10000, shadows: false, godrays: false, textureMax: 1024, verlet: false, dinoVariant: 'low' },
  low: { ferns: 1500, cycads: 200, conifers: 75, shrubs: 150, particles: 5000, shadows: false, godrays: false, textureMax: 1024, verlet: false, dinoVariant: 'low' },
};
