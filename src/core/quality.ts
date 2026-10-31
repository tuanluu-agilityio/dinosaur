export type QualityTier = 'low' | 'medium' | 'high';
export interface DeviceCaps {
  webgpu: boolean;
  mobile: boolean;
  hardwareConcurrency: number;
  deviceMemoryGB?: number;
}

export function readDeviceCaps(): DeviceCaps {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) ||
    (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent));
  return {
    webgpu: 'gpu' in nav,
    mobile,
    hardwareConcurrency: nav.hardwareConcurrency || 4,
    deviceMemoryGB: nav.deviceMemory,
  };
}

export function detectTier(caps: DeviceCaps): QualityTier {
  if (!caps.webgpu) return 'low';
  if (caps.mobile) return 'medium';
  return caps.hardwareConcurrency >= 8 ? 'high' : 'medium';
}

const ORDER: QualityTier[] = ['low', 'medium', 'high'];

/** Downgrades one tier when the average frame rate over a full window is too low. Never upgrades. */
export class FpsGovernor {
  private _tier: QualityTier;
  private readonly downgradeBelow: number;
  private readonly windowMs: number;
  private elapsed = 0;
  private frames = 0;

  constructor(opts: { downgradeBelow?: number; windowSec?: number; startTier?: QualityTier } = {}) {
    this.downgradeBelow = opts.downgradeBelow ?? 28;
    this.windowMs = (opts.windowSec ?? 3) * 1000;
    this._tier = opts.startTier ?? 'high';
  }

  get tier(): QualityTier {
    return this._tier;
  }

  sample(dtMs: number): QualityTier | null {
    this.elapsed += dtMs;
    this.frames++;
    if (this.elapsed < this.windowMs) return null;
    const fps = (this.frames * 1000) / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    const i = ORDER.indexOf(this._tier);
    if (fps < this.downgradeBelow && i > 0) {
      this._tier = ORDER[i - 1];
      return this._tier;
    }
    return null;
  }
}
