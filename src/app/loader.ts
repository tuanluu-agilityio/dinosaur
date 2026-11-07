// Progressive loading: the intro starts once renderer + canopy are ready; dinosaurs and species content stream in afterwards.
// A failed model or content fetch degrades that one item (hidden dinosaur, error + retry in the panel); the rest keeps working.
import type { Camera, Object3D, Scene, Texture, WebGPURenderer } from 'three/webgpu';
import { Dino } from '../dinos/dino';
import type { AssetEntry } from '../assets/manifest';
import type { QualityTier } from '../core/quality';
import { loadSpecies } from '../content/load';
import type { SpeciesContent, SpeciesId } from '../content/schema';

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
const WARM_TIMEOUT_MS = 8000;

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

export interface StreamOptions {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: Camera;
  tier: QualityTier;
  entries: readonly AssetEntry[];
  /** How many animals of a species to spawn. */
  count: (e: AssetEntry) => number;
  /** Called for each warmed-up animal, in manifest order. */
  onLoaded: (e: AssetEntry, d: Dino) => void;
  content: ContentStore;
}

/**
 * Fetches every model and content file in parallel, then adds the dinosaurs one at a time (warmed up, one per frame) in manifest order.
 * Resolves when everything that could load has loaded. A failing model is skipped with a console warning.
 */
export async function streamDinos(o: StreamOptions): Promise<{ loaded: Dino[]; failed: SpeciesId[] }> {
  const failed: SpeciesId[] = [];
  for (const e of o.entries) o.content.get(e.species).catch((err: unknown) => console.warn(`content for ${e.species} unavailable`, String(err)));
  const jobs = o.entries.map((e) => {
    return Promise.all(Array.from({ length: o.count(e) }, () => Dino.load(e, o.tier))).catch((err: unknown) => {
      console.warn(`model for ${e.species} failed to load; it will not appear`, String(err));
      failed.push(e.species);
      return [] as Dino[];
    });
  });
  const loaded: Dino[] = [];
  for (let i = 0; i < o.entries.length; i++) {
    const dinos = await jobs[i];
    for (const d of dinos) {
      await warmDino(o.renderer, o.scene, o.camera, d.root);
      o.onLoaded(o.entries[i], d);
      loaded.push(d);
      await frame();
    }
  }
  return { loaded, failed };
}
