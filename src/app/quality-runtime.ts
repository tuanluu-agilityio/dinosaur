// Live quality governor (ADR 0006, ADR 0010). Feeds frame times to FpsGovernor and, when the frame
// rate stays low, applies the next lower tier to the running scene without a reload:
// - vegetation counts and atmosphere (particles, godrays, shadows) switch in place and cross-fade;
// - flora keeps receiving shadows until the sun-shadow fade has finished, so the forest floor and the
//   plants lose their shadows together instead of the plants popping first (KI-12);
// - the dinosaur model variant is swapped only while the camera is not on a dinosaur (not 'flying' or
//   'closeup'); a pending swap waits for the return to the forest.
// The governor never upgrades. It ignores frames during start-up and while a switch is fading, so the
// cost of one switch cannot trigger the next one.
// Without WebGPU (WebGL2 fallback) compute effects (GPU Verlet) are off whatever the tier says.
import type { WebGPURenderer } from 'three/webgpu';
import { BUDGETS, type Budget } from '../core/budgets';
import { FpsGovernor, type QualityTier } from '../core/quality';
import { vegetationCounts, type Species } from '../world/vegetation';
import type { DirectorState } from '../camera/director';

const TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface VegetationTarget { readonly counts?: Record<Species, number>; setTier(tier: QualityTier, want?: Record<Species, number>): void }
export interface AtmosphereTarget { setTier(tier: QualityTier): void; stats(): { transitioning: boolean } }

export interface QualityRuntimeOptions {
  renderer: WebGPURenderer;
  isWebGPU: boolean;
  /** Tier the scene was built with. */
  tier: QualityTier;
  vegetation?: VegetationTarget;
  atmosphere?: AtmosphereTarget;
  /** Camera state: dinosaur variants are not swapped while it is 'flying' or 'closeup'. */
  director?: { readonly state: DirectorState };
  /** Reload every dinosaur with the given model variant (app-owned: it knows the manifest and the DinoWorld). */
  swapDinoVariant?: (variant: Budget['dinoVariant']) => Promise<void>;
  /** FpsGovernor options, or false to never downgrade (perf measurements at a fixed tier). */
  governor?: { downgradeBelow?: number; windowSec?: number } | false;
  /** Seconds after start before frames count (pipeline compiles, streaming). Default 2. */
  warmupSec?: number;
  /** Seconds after a switch has finished fading before frames count again. Default 1.5. */
  settleSec?: number;
}

export interface TierChange { from: QualityTier; to: QualityTier; reason: 'governor' | 'forced'; atSec: number }

/** URL overrides: `?tier=low|medium|high` fixes the start tier, `?governor=0` disables downgrades. */
export function qualityParams(search: string): { tier: QualityTier | null; governor: boolean } {
  const q = new URLSearchParams(search);
  const t = q.get('tier');
  return { tier: TIERS.includes(t as QualityTier) ? (t as QualityTier) : null, governor: q.get('governor') !== '0' };
}

/** BUDGETS[tier] as the running backend can honour it: compute effects need WebGPU. */
export function effectiveBudget(tier: QualityTier, isWebGPU: boolean): Budget {
  const b = BUDGETS[tier];
  return isWebGPU ? b : { ...b, verlet: false };
}

export class QualityRuntime {
  readonly isWebGPU: boolean;
  /** Every tier switch since start, oldest first. */
  readonly history: TierChange[] = [];
  private _tier: QualityTier;
  private _budget: Budget;
  private governor: FpsGovernor | null;
  private readonly govOpts: { downgradeBelow?: number; windowSec?: number } | null;
  private readonly settleSec: number;
  private clock = 0;
  /** Frames before this clock time are not sampled. */
  private sampleFrom: number;
  /** Tier whose shadows the flora still shows (until the sun-shadow fade ends). */
  private floraShadowTier: QualityTier | null = null;
  /** A switch was applied and the atmosphere may still be fading (stats() allocates, so it is polled only then). */
  private watchFade = false;
  private dinoVariant: Budget['dinoVariant'];
  private swapping = false;
  private listeners: ((c: TierChange) => void)[] = [];

  constructor(private readonly opts: QualityRuntimeOptions) {
    this.isWebGPU = opts.isWebGPU;
    this._tier = opts.tier;
    this._budget = effectiveBudget(opts.tier, opts.isWebGPU);
    this.dinoVariant = this._budget.dinoVariant;
    this.govOpts = opts.governor === false ? null : (opts.governor ?? {});
    this.governor = this.newGovernor();
    this.settleSec = opts.settleSec ?? 1.5;
    this.sampleFrom = opts.warmupSec ?? 2;
  }

  get tier(): QualityTier { return this._tier; }
  /** Budget in force (compute effects off on WebGL2). */
  get budget(): Budget { return this._budget; }
  /** Compute passes (GPU Verlet) may run. */
  get computeEnabled(): boolean { return this._budget.verlet; }
  /** A dinosaur variant swap is waiting for the camera to leave a dinosaur, or is loading. */
  get dinoSwapPending(): boolean {
    return this.swapping || (this.opts.swapDinoVariant !== undefined && this.dinoVariant !== this._budget.dinoVariant);
  }

  onChange(cb: (c: TierChange) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  /** Call once per frame with the frame's dt. No allocation outside the fade after a switch. */
  update(dtSec: number): void {
    this.clock += dtSec;
    if (this.watchFade && !this.atmosphereFading) this.watchFade = false;
    const busy = this.watchFade || this.floraShadowTier !== null || this.swapping;
    if (busy) this.sampleFrom = this.clock + this.settleSec;
    if (this.floraShadowTier && !this.watchFade) {
      this.floraShadowTier = null;
      this.opts.vegetation?.setTier(this._tier); // same counts, so only the flora shadow flags change
    }
    this.trySwapDinos();
    if (!this.governor || busy || this.clock < this.sampleFrom) return;
    const next = this.governor.sample(dtSec * 1000);
    if (next) this.apply(next, 'governor');
  }

  /** Switch tier now (dev tools and tests). Lower tiers only, like the governor; ignored otherwise. */
  forceTier(tier: QualityTier): boolean {
    if (TIERS.indexOf(tier) >= TIERS.indexOf(this._tier)) return false;
    this.apply(tier, 'forced');
    return true;
  }

  /** What the scene currently draws (tests and the dev overlay). Allocates; not for the frame loop. */
  stats(): { tier: QualityTier; vegetation: Record<Species, number> | null; atmosphere: ReturnType<AtmosphereTarget['stats']> | null } {
    const v = this.opts.vegetation?.counts;
    return { tier: this._tier, vegetation: v ? { ...v } : null, atmosphere: this.opts.atmosphere?.stats() ?? null };
  }

  /** Any part of a switch is still fading or loading (a swap waiting for the camera does not count). */
  get transitioning(): boolean {
    return this.atmosphereFading || this.floraShadowTier !== null || this.swapping;
  }

  private get atmosphereFading(): boolean {
    return this.opts.atmosphere?.stats().transitioning ?? false;
  }

  private apply(to: QualityTier, reason: TierChange['reason']): void {
    const from = this._tier;
    const lostShadows = BUDGETS[from].shadows && !BUDGETS[to].shadows;
    this._tier = to;
    this._budget = effectiveBudget(to, this.isWebGPU);
    this.opts.atmosphere?.setTier(to);
    this.watchFade = true;
    // Counts drop now; the shadow flags follow once the sun shadow has faded out (see update()).
    const shadowTier = lostShadows ? from : this.floraShadowTier;
    this.opts.vegetation?.setTier(shadowTier ?? to, shadowTier ? vegetationCounts(to) : undefined);
    this.floraShadowTier = shadowTier;
    this.governor = this.newGovernor();
    this.sampleFrom = this.clock + this.settleSec;
    const change: TierChange = { from, to, reason, atSec: Math.round(this.clock * 100) / 100 };
    this.history.push(change);
    for (const l of this.listeners) l(change);
  }

  private trySwapDinos(): void {
    const want = this._budget.dinoVariant;
    if (this.swapping || want === this.dinoVariant || !this.opts.swapDinoVariant) return;
    const state = this.opts.director?.state;
    if (state === 'flying' || state === 'closeup') return;
    this.swapping = true;
    this.opts.swapDinoVariant(want).then(
      () => { this.dinoVariant = want; },
      (e) => { this.dinoVariant = want; console.warn('quality: dinosaur variant swap failed, keeping the loaded models', e); },
    ).finally(() => { this.swapping = false; });
  }

  private newGovernor(): FpsGovernor | null {
    return this.govOpts ? new FpsGovernor({ ...this.govOpts, startTier: this._tier }) : null;
  }
}

declare global {
  interface Window {
    __quality?: QualityProbe;
  }
}

export interface QualityProbe {
  readonly tier: QualityTier;
  readonly backend: 'webgpu' | 'webgl2';
  readonly budget: Budget;
  readonly history: readonly TierChange[];
  readonly transitioning: boolean;
  adapter: string;
  stats(): ReturnType<QualityRuntime['stats']>;
  forceTier(t: QualityTier): boolean;
  /** Compute dispatches since start (must stay 0 on WebGL2). */
  computeCalls(): number;
  /** Start / stop recording raw rAF intervals (ms), the perf.spec.ts method. */
  begin(): void;
  end(): number[];
}

/**
 * Dev builds: expose the runtime as window.__quality for tests/e2e (tier, backend, forced switches,
 * compute-call count, frame-time recording). Call `frame()` once per animation frame.
 */
export function installQualityProbe(rt: QualityRuntime, renderer: WebGPURenderer): { frame(): void } {
  const frames = new Float64Array(32768);
  let count = 0, recording = false, last = performance.now();
  const probe: QualityProbe = {
    get tier() { return rt.tier; },
    get backend() { return rt.isWebGPU ? 'webgpu' : 'webgl2'; },
    get budget() { return rt.budget; },
    get history() { return rt.history; },
    get transitioning() { return rt.transitioning; },
    adapter: 'unknown',
    stats: () => rt.stats(),
    forceTier: (t) => rt.forceTier(t),
    computeCalls: () => renderer.info.compute.calls,
    begin() { count = 0; last = performance.now(); recording = true; },
    end() { recording = false; return Array.from(frames.subarray(0, count)); },
  };
  if (rt.isWebGPU) {
    navigator.gpu?.requestAdapter().then((a) => {
      const i = a?.info;
      if (i) probe.adapter = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / ') || 'unknown';
    }, () => { /* diagnostic only */ });
  }
  window.__quality = probe;
  return {
    frame() {
      const now = performance.now();
      if (recording && count < frames.length) frames[count++] = now - last;
      last = now;
    },
  };
}
