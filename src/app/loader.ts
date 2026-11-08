// Progressive loading: the intro starts once renderer + canopy are ready; dinosaurs and species content stream in afterwards.
// A failed model or content fetch degrades that one item (hidden dinosaur, error + retry in the panel); the rest keeps working.
import type { Camera, Object3D, Scene, Texture, WebGPURenderer } from 'three/webgpu';
import { Quaternion, Vector3 } from 'three/webgpu';
import { Dino } from '../dinos/dino';
import { sampleIntro } from '../camera/paths';
import type { AssetEntry } from '../assets/manifest';
import type { QualityTier } from '../core/quality';
import { BUDGETS } from '../core/budgets';
import { loadSpecies } from '../content/load';
import type { SpeciesContent, SpeciesId } from '../content/schema';

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
const WARM_TIMEOUT_MS = 8000;

const _pos = new Vector3();
const _look = new Vector3();

/**
 * Renders the canopy once from several points of the intro flight (while the loading screen still covers the canvas), so vegetation
 * buffers, shadow passes and pipelines the flight will meet are created now and not as frame spikes during the intro.
 */
export async function warmFlight(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCameraLike, step: (dt: number) => void): Promise<void> {
  for (const u of [1, 0.75, 0.5, 0.25, 0]) {
    renderFrom(renderer, scene, camera, step, u);
    await frame();
  }
}

const _savedPos = new Vector3();
const _savedQuat = new Quaternion();

/**
 * One render from the intro pose `u`, then the camera is put back. Called right after a dinosaur joins the scene so its sun-shadow
 * (skinned depth) pipeline is built now, not when the flight first brings it into the shadow frustum (a 400+ ms hitch on the high tier).
 */
export function renderFrom(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCameraLike, step: (dt: number) => void, u: number): void {
  _savedPos.copy(camera.position);
  _savedQuat.copy(camera.quaternion);
  sampleIntro(u, _pos, _look);
  camera.position.copy(_pos);
  camera.lookAt(_look);
  camera.updateMatrixWorld(true);
  step(0);
  renderer.render(scene, camera);
  camera.position.copy(_savedPos);
  camera.quaternion.copy(_savedQuat);
  camera.updateMatrixWorld(true);
}

type PerspectiveCameraLike = Camera & { lookAt(v: Vector3): void };
export type { PerspectiveCameraLike };

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Uploads a dinosaur's textures and compiles its pipelines before it joins the scene, so the first frame that shows it
 * does not pay for them (first-load frame spikes, scene rubric P3). Never blocks for long: some software backends never finish.
 */
export async function warmDino(renderer: WebGPURenderer, scene: Scene, camera: Camera, root: Object3D): Promise<void> {
  const seen = new Set<Texture>();
  root.traverse((o) => {
    const mat = (o as { material?: unknown }).material;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (!m) continue;
      for (const k of TEXTURE_KEYS) {
        const tex = (m as Record<string, unknown>)[k] as Texture | null | undefined;
        if (tex && tex.isTexture && !seen.has(tex)) seen.add(tex);
      }
    }
  });
  for (const tex of seen) {
    try { renderer.initTexture(tex); } catch (e) { console.warn('loader: texture upload skipped', String(e)); }
    await frame(); // one upload per frame keeps each frame short
  }
  await Promise.race([
    renderer.compileAsync(root, camera, scene).catch((e: unknown) => console.warn('loader: pipeline warm-up failed', String(e))),
    new Promise((r) => setTimeout(r, WARM_TIMEOUT_MS)),
  ]);
}

/** Species text content, fetched once per species; a failed fetch is not cached so `get` can be retried. */
export class ContentStore {
  private readonly loaded = new Map<SpeciesId, SpeciesContent>();
  private readonly pending = new Map<SpeciesId, Promise<SpeciesContent>>();

  peek(id: SpeciesId): SpeciesContent | undefined { return this.loaded.get(id); }

  get(id: SpeciesId): Promise<SpeciesContent> {
    const have = this.loaded.get(id);
    if (have) return Promise.resolve(have);
    let p = this.pending.get(id);
    if (!p) {
      p = loadSpecies(id).then(
        (c) => { this.loaded.set(id, c); this.pending.delete(id); return c; },
        (e: unknown) => { this.pending.delete(id); throw e; },
      );
      this.pending.set(id, p);
    }
    return p;
  }
}

/** True when focusing `d` should swap in the tier's detail model (high tier, forest animal still on the light variant). */
export function wantsUpgrade(d: Dino, entry: AssetEntry | undefined, tier: QualityTier): entry is AssetEntry {
  return !!entry && d.variant === 'low' && BUDGETS[tier].dinoVariant === 'high' && !!entry.files.high;
}

/**
 * Loads and warms up the detail variant of `entry`, ready for `DinoWorld.replace`. Rejects if the model fails to load; the caller
 * keeps the light model then.
 */
export async function upgradeDino(renderer: WebGPURenderer, scene: Scene, camera: Camera, entry: AssetEntry): Promise<Dino> {
  const next = await Dino.load(entry, 'high', 'high');
  try {
    await warmDino(renderer, scene, camera, next.root);
  } catch (e) {
    next.dispose();
    throw e;
  }
  return next;
}

export interface Preload {
  entries: readonly AssetEntry[];
  /** One job per entry: the loaded animals (empty when the model failed). */
  jobs: Promise<Dino[]>[];
  failed: SpeciesId[];
}

/**
 * Starts fetching and parsing every model and content file now and returns at once. Called before the loading screen's warm-up so the
 * parse/transcode work lands behind the loading screen, not as frame hitches in the intro. A failing model is skipped with a console warning.
 */
export function preloadDinos(entries: readonly AssetEntry[], tier: QualityTier, count: (e: AssetEntry) => number, content: ContentStore): Preload {
  const failed: SpeciesId[] = [];
  for (const e of entries) content.get(e.species).catch((err: unknown) => console.warn(`content for ${e.species} unavailable`, String(err)));
  const jobs = entries.map((e) =>
    // The forest always uses the light variant (smaller upload, cheaper to shade); the tier's detail model loads on focus (upgradeDino).
    Promise.all(Array.from({ length: count(e) }, () => Dino.load(e, tier, 'low'))).catch((err: unknown) => {
      console.warn(`model for ${e.species} failed to load; it will not appear`, String(err));
      failed.push(e.species);
      return [] as Dino[];
    }),
  );
  return { entries, jobs, failed };
}

export interface StreamOptions {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: Camera;
  preload: Preload;
  /** Called for each warmed-up animal, in manifest order. */
  onLoaded: (e: AssetEntry, d: Dino) => void;
}

/**
 * Adds the preloaded dinosaurs one at a time (warmed up, one per frame) in manifest order, as each model arrives.
 * Resolves when everything that could load has loaded.
 */
export async function streamDinos(o: StreamOptions): Promise<{ loaded: Dino[]; failed: SpeciesId[] }> {
  const { entries, jobs, failed } = o.preload;
  const loaded: Dino[] = [];
  for (let i = 0; i < entries.length; i++) {
    const dinos = await jobs[i];
    for (const d of dinos) {
      await warmDino(o.renderer, o.scene, o.camera, d.root);
      o.onLoaded(entries[i], d);
      loaded.push(d);
      await frame();
    }
  }
  return { loaded, failed };
}
