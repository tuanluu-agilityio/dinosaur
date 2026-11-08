// One living dinosaur: glTF model, animation mixer, focus radius and a cheap picking proxy.
import {
  AnimationAction, AnimationClip, AnimationMixer, Box3, CapsuleGeometry, Group, LoopRepeat, Mesh, MeshBasicNodeMaterial, Object3D,
  Sphere, Vector3, type Material, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { AssetEntry } from '../assets/manifest';
import type { SpeciesId } from '../content/schema';
import type { QualityTier } from '../core/quality';
import { BUDGETS } from '../core/budgets';
import { ClipFader, resolveClip, type ClipId } from './behaviours';

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const IS_DEV: boolean = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

let loader: GLTFLoader | null = null;
let renderer: WebGPURenderer | null = null;
let basisPath = IS_DEV ? `${BASE}node_modules/three/examples/jsm/libs/basis/` : `${BASE}basis/`;

/**
 * Textures are KTX2, so the loader needs the renderer to pick a GPU format. Call once after createRenderer.
 * `basisPath` (default `<base>basis/`, or node_modules in dev) must serve basis_transcoder.js and .wasm.
 */
export function configureDinoLoader(r: WebGPURenderer, opts: { basisPath?: string } = {}): void {
  renderer = r;
  if (opts.basisPath) basisPath = opts.basisPath;
  loader = null;
}

function getLoader(): GLTFLoader {
  if (loader) return loader;
  if (!renderer) throw new Error('configureDinoLoader(renderer) must be called before Dino.load');
  const ktx2 = new KTX2Loader().setTranscoderPath(basisPath).detectSupport(renderer);
  loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  return loader;
}

/** Manifest paths are repo-relative (public/models/x.glb); the site serves public/ at the base URL. */
export const modelUrl = (path: string): string => `${BASE}${path.replace(/^public\//, '')}`;

/**
 * Parsed models by URL, shared by every animal of a species: clones share geometry, materials and textures, so three herd animals
 * upload their textures and compile their pipelines once. Reference-counted so the last animal to go frees the GPU resources.
 */
interface Shared { gltf: Promise<{ scene: Group; animations: AnimationClip[] }>; refs: number }
const shared = new Map<string, Shared>();

function disposeScene(root: Object3D): void {
  const textures = new Set<Texture>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const v of Object.values(mat as Material)) if (v && (v as Texture).isTexture) textures.add(v as Texture);
      mat.dispose();
    }
  });
  for (const t of textures) t.dispose();
}

const _box = new Box3();
const _size = new Vector3();
const _centre = new Vector3();
const _sphere = new Sphere();

export class Dino {
  readonly id: SpeciesId;
  readonly root: Group;
  readonly focusRadius: number;
  /** Invisible low-poly capsule used for picking; a child of root so it follows the animal. */
  readonly proxy: Mesh;
  readonly clips: readonly ClipId[];
  readonly variant: 'low' | 'high';
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<ClipId, AnimationAction>();
  private readonly fader = new ClipFader();
  private active: AnimationAction | null = null;

  private readonly url: string;

  private constructor(entry: AssetEntry, scene: Group, animations: AnimationClip[], variant: 'low' | 'high', url: string) {
    this.id = entry.species;
    this.url = url;
    this.variant = variant;
    this.root = new Group();
    this.root.name = `dino-${entry.species}`;
    this.root.add(scene);
    scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } // skinned bounds do not follow the pose
    });

    this.mixer = new AnimationMixer(scene);
    for (const [clip, name] of Object.entries(entry.clips) as [ClipId, string][]) {
      const src = animations.find((a) => a.name === name);
      if (!src) continue;
      const action = this.mixer.clipAction(src);
      action.setLoop(LoopRepeat, Infinity);
      this.actions.set(clip, action);
    }
    this.clips = [...this.actions.keys()];

    // Size and proxy come from the rest pose in root space (authored at real scale, +z forward, feet at y=0).
    this.root.updateMatrixWorld(true);
    _box.setFromObject(this.root, true);
    _box.getSize(_size);
    _box.getCenter(_centre);
    _box.getBoundingSphere(_sphere);
    this.focusRadius = _sphere.radius;

    const length = Math.max(_size.x, _size.z);
    const radius = Math.max(0.3, Math.min(_size.y * 0.4, length * 0.25));
    const mat = new MeshBasicNodeMaterial();
    mat.visible = false;
    this.proxy = new Mesh(new CapsuleGeometry(radius, Math.max(0, length - radius * 2), 2, 8), mat);
    this.proxy.name = 'pick-proxy';
    this.proxy.rotation.x = Math.PI / 2; // capsule axis along the body (z)
    this.proxy.position.set(_centre.x, Math.max(radius, _centre.y), _centre.z);
    this.proxy.userData.dino = this;
    this.root.add(this.proxy);
  }

  /** Loads one animal. `variant` forces a model variant; by default the tier's budget decides. */
  static async load(entry: AssetEntry, tier: QualityTier, variant?: 'low' | 'high'): Promise<Dino> {
    if (entry.status !== 'approved') throw new Error(`Dino.load: ${entry.species} is not approved`);
    const want = variant ?? BUDGETS[tier].dinoVariant;
    const v = want === 'low' && entry.files.low ? 'low' : 'high';
    const url = modelUrl(entry.files[v]);
    let s = shared.get(url);
    if (!s) {
      s = { gltf: getLoader().loadAsync(url), refs: 0 };
      shared.set(url, s);
      s.gltf.catch(() => { if (shared.get(url) === s) shared.delete(url); }); // a failed fetch is not cached
    }
    s.refs++;
    try {
      const gltf = await s.gltf;
      return new Dino(entry, cloneSkinned(gltf.scene) as Group, gltf.animations, v, url);
    } catch (e) {
      s.refs--;
      throw e;
    }
  }

  /** Releases this animal; the last animal of a model frees its geometry, materials and textures. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    const s = shared.get(this.url);
    if (!s || --s.refs > 0) return;
    shared.delete(this.url);
    void s.gltf.then((g) => disposeScene(g.scene));
  }

  /** Continues `from`'s clip at the same time, so swapping models mid-animation does not visibly jump. */
  matchPose(from: Dino): void {
    const clip = from.currentClip;
    if (!clip) return;
    this.play(clip);
    if (this.active && from.active) this.active.time = from.active.time;
  }

  /** Plays a clip (falling back to one the model has). Cross-fades 0.4 s, only when the clip actually changes. */
  play(clip: ClipId): void {
    const resolved = resolveClip(this.clips, clip);
    if (!resolved) return;
    const fade = this.fader.request(resolved);
    if (fade === null) return;
    const next = this.actions.get(resolved)!;
    next.reset().setEffectiveWeight(1).play();
    if (this.active && fade > 0) this.active.crossFadeTo(next, fade, false);
    else if (this.active) this.active.stop();
    this.active = next;
  }

  get currentClip(): ClipId | null { return this.fader.current; }

  /** Offsets the running clip so animals of one species do not step in lockstep. */
  desync(seconds: number): void { if (this.active) this.active.time = seconds; }

  update(dt: number): void { this.mixer.update(dt); }
}
