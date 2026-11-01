// Atmosphere = lighting + sky + exponential height fog + air particles + godrays, all sized by
// BUDGETS[tier]. setTier() changes counts and toggles tier-gated effects without rebuilding particles.
// Nothing here uses compute nodes, so the WebGL2 fallback (isWebGPU = false) builds the same scene;
// the flag is kept so a future compute effect can be gated on it. The e2e checks this through
// renderer.info.compute.calls, not through a flag of ours.
// Tier downgrades cross-fade over 1.2 s instead of popping: dropped particles and godrays fade out, the
// shadow map fades out while contact shadows (soft discs under registered objects) fade in. Materials
// of objects standing on the ground can also use groundContactAO (lighting.ts) as their aoNode.
// Sky/fog colour shared with godrays after holtsetio/aurelia src/background.js @724aba26 (MIT).
import { Color, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import {
  cameraPosition, exp, float, Fn, fog, mix, positionLocal, positionWorld, select, smoothstep, uniform, vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { BUDGETS, type Budget } from '../core/budgets';
import type { QualityTier } from '../core/quality';
import { ContactShadows, Lighting } from './lighting';
import { Particles } from './particles';
import { Godrays } from './godrays';

export interface AtmosphereOptions {
  tier: QualityTier;
  isWebGPU: boolean;
  /** Dev/perf only: override budget fields or switch the fog off. */
  overrides?: Partial<Pick<Budget, 'particles' | 'godrays' | 'shadows'>> & { fog?: boolean };
  /** Max contact-shadow discs (trunks + dinosaurs). Default 512. */
  contactCapacity?: number;
}

export interface AtmosphereStats {
  tier: QualityTier;
  /** Budgeted particle count. */
  particles: number;
  /** Instances actually submitted. */
  particlesDrawn: number;
  godrays: boolean;
  shadows: boolean;
  fog: boolean;
  /** Contact-shadow discs drawn (tiers without a shadow map). */
  contactShadows: boolean;
  /** A tier switch is still fading particles or godrays. */
  transitioning: boolean;
}

/** Height-fog parameters (per metre). Density at y = 0 and exponential falloff with height. */
export const FOG_DENSITY = 0.016;
export const FOG_FALLOFF = 0.07;

type V3 = Node<'vec3'>;

/** Sky radiance for a world direction: hazy green-grey horizon, bluer zenith, warm glow + disc at the sun. */
function skyColor(dir: V3, sunDir: V3, horizon: Node<'color'>, zenith: Node<'color'>, sun: Node<'color'>): V3 {
  const up = dir.y.max(0).pow(0.6);
  const base = mix(horizon, zenith, up);
  const cosSun = dir.dot(sunDir).max(0);
  const glow = cosSun.pow(12).mul(0.55).add(cosSun.pow(200).mul(1.5));
  const disc = smoothstep(0.9993, 0.9997, cosSun).mul(4);
  return base.add(sun.mul(glow.add(disc))) as unknown as V3;
}

export class Atmosphere {
  readonly lighting: Lighting;
  readonly particles: Particles;
  /** Register ground contact for objects (trunks, dinosaurs); drawn only when the tier has no shadow map. */
  readonly contactShadows: ContactShadows;
  private godrays: Godrays | null = null;
  private _tier: QualityTier;
  private readonly overrides: NonNullable<AtmosphereOptions['overrides']>;
  private readonly fogOn: boolean;
  readonly horizon = new Color(0x9fb3a6);
  readonly zenith = new Color(0x7f9fb4);

  constructor(private readonly scene: Scene, renderer: WebGPURenderer, opts: AtmosphereOptions) {
    this._tier = opts.tier;
    this.overrides = opts.overrides ?? {};
    this.fogOn = this.overrides.fog ?? true;
    const b = this.budget();

    this.lighting = new Lighting(renderer, scene, b.shadows);
    const sunDir = this.lighting.sunDirNode;
    const horizon = uniform(this.horizon);
    const zenith = uniform(this.zenith);
    const sunTint = uniform(this.lighting.sunColor);

    const s = scene as Scene & { backgroundNode: Node | null; fogNode: Node | null };
    s.backgroundNode = Fn(() => skyColor(positionLocal.normalize(), sunDir, horizon, zenith, sunTint))();
    if (this.fogOn) s.fogNode = this.heightFog(sunDir, horizon, zenith, sunTint);

    this.particles = new Particles(b.particles, { sunDir });
    scene.add(this.particles.mesh);
    this.contactShadows = new ContactShadows(opts.contactCapacity ?? 512);
    this.contactShadows.setEnabled(!b.shadows, true);
    scene.add(this.contactShadows.mesh);
    this.applyGodrays(b.godrays, true);
  }

  get tier(): QualityTier {
    return this._tier;
  }

  /** Apply BUDGETS[tier]: particle count, godrays, shadows. Particles never rebuild; godrays build once. */
  setTier(tier: QualityTier): void {
    this._tier = tier;
    const b = this.budget();
    this.particles.setCount(b.particles);
    this.applyGodrays(b.godrays);
    if (this.lighting.shadows !== b.shadows) this.lighting.setShadows(b.shadows);
    this.contactShadows.setEnabled(!b.shadows);
  }

  /** Per frame: sun frustum follows the camera, tier fades advance. No allocation. */
  update(camera: Camera, dt: number): void {
    this.lighting.update(camera.position, dt);
    this.contactShadows.update(dt);
    this.particles.update(dt);
    this.godrays?.update(dt);
  }

  stats(): AtmosphereStats {
    return {
      tier: this._tier,
      particles: this.particles.count,
      particlesDrawn: this.particles.drawn,
      godrays: this.godrays?.enabled ?? false,
      shadows: this.lighting.shadows,
      fog: this.fogOn,
      contactShadows: this.contactShadows.enabled && this.contactShadows.mesh.count > 0,
      transitioning: this.particles.transitioning || (this.godrays?.transitioning ?? false) || this.lighting.transitioning,
    };
  }

  dispose(): void {
    this.particles.dispose();
    this.godrays?.dispose();
    this.contactShadows.dispose();
    this.lighting.dispose();
    const s = this.scene as Scene & { backgroundNode: Node | null; fogNode: Node | null };
    s.backgroundNode = null;
    s.fogNode = null;
  }

  private budget(): Budget {
    return { ...BUDGETS[this._tier], ...stripUndefined(this.overrides) };
  }

  /** Godrays build once (first time a tier allows them) and then only fade in/out. */
  private applyGodrays(on: boolean, immediate = false): void {
    if (on && !this.godrays) {
      this.godrays = new Godrays({ sunDir: this.lighting.sunDirNode, sunColor: this.lighting.sunColor });
      this.scene.add(this.godrays.mesh);
      this.godrays.setEnabled(true, true);
      return;
    }
    this.godrays?.setEnabled(on, immediate);
  }

  /**
   * Exponential height fog: density d(h) = a * exp(-b h). Optical depth along the view ray from the
   * camera (height y0) over distance L with vertical slope k: tau = a e^(-b y0) L (1 - e^(-b k L)) / (b k L).
   * Fog colour is the sky in the ray's direction, so distant trees melt into the haze and glow towards the sun.
   */
  private heightFog(sunDir: V3, horizon: Node<'color'>, zenith: Node<'color'>, sunTint: Node<'color'>): Node {
    const a = uniform(FOG_DENSITY);
    const b = uniform(FOG_FALLOFF);
    return Fn(() => {
      const ray = positionWorld.sub(cameraPosition);
      const len = ray.length().max(1e-4);
      const dir = ray.div(len);
      const x = b.mul(dir.y).mul(len);
      const shape = select(x.abs().lessThan(1e-3), float(1).sub(x.mul(0.5)), float(1).sub(exp(x.negate())).div(x));
      const tau = a.mul(exp(b.mul(cameraPosition.y.max(0)).negate())).mul(len).mul(shape);
      const factor = float(1).sub(exp(tau.negate())).min(0.97);
      // Keep the zenith-to-horizon blend low: fog sits in the forest, the sky above is clearer.
      const haze = skyColor(vec3(dir.x, dir.y.mul(0.35), dir.z).normalize(), sunDir, horizon, zenith, sunTint);
      return fog(haze, factor);
    })();
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) r[k] = o[k];
  return r;
}
