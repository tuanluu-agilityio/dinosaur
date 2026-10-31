import type { QualityTier } from './quality';

export interface Budget {
  ferns: number;
  cycads: number;
  conifers: number;
  particles: number;
  shadows: boolean;
  godrays: boolean;
  textureMax: 1024 | 2048 | 4096;
  verlet: boolean;
  dinoVariant: 'low' | 'high';
}

// Placeholder values; P2-T01 fills the measured numbers (ADR 0006).
export const BUDGETS: Record<QualityTier, Budget> = {
  high: { ferns: 6000, cycads: 800, conifers: 300, particles: 20000, shadows: true, godrays: true, textureMax: 4096, verlet: true, dinoVariant: 'high' },
  medium: { ferns: 3000, cycads: 400, conifers: 150, particles: 10000, shadows: false, godrays: false, textureMax: 2048, verlet: false, dinoVariant: 'low' },
  low: { ferns: 1500, cycads: 200, conifers: 75, particles: 5000, shadows: false, godrays: false, textureMax: 1024, verlet: false, dinoVariant: 'low' },
};
