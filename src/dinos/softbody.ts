// GPU Verlet secondary motion (experiment, issue #34, ADR 0011): tail-tip lag and throat-skin jiggle on top of the
// authored clips. High tier on WebGPU only (BUDGETS[tier].verlet).
//
// Every chain is a run of skeleton bones (tail1..tail6, head->jaw). Node 0 is pinned to its animated bone. The
// others carry a Verlet *offset* from their animated bone. The offset is driven by the bone's acceleration (inertia),
// pulled back by a spring, damped relative to the animated pose (so steady walking gives no lag), kept at the
// animated bone length from its parent, and clamped. One compute dispatch per frame runs every chain (one invocation
// per chain, fixed 120 Hz substeps). The skinned vertex shader then adds sum(skinWeight * offset[skinIndex]).
// The throat chain uses the "band" weight 4w(1-w), so only the soft jaw/neck seam moves and the rigid jaw, teeth and
// tongue (w = 1) stay put.
//
// CPU work per frame: copy each chain bone's world position (from the last render) into one small buffer. No
// allocations. The offsets are relative, so reading last frame's bones only delays the secondary motion by one frame.
// Technique after holtsetio/aurelia src/physics/verletPhysics.js and src/medusaVerletBridge.js @724aba26 (MIT): a
// compute pass over particles in instancedArray storage, and a bridge that binds animated mesh points to them.
import { type Bone, type Material, type Node, type StorageBufferNode, type Object3D, type SkinnedMesh, type Skeleton, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, Loop, attribute, instanceIndex, float, instancedArray, int, max, min, mix, modelWorldMatrixInverse, positionLocal, storage,
  uint, uniform, vec4,
} from 'three/tsl';
import type { Dino } from './dino';

/** A chain of bones by name, root first. Per simulated node (index >= 1): frequency (Hz), damping ratio, max offset. */
export interface ChainSpec {
  name: string;
  bones: readonly string[];
  /** Natural frequency of each simulated node (Hz); node 0 is pinned and ignored. */
  hz: readonly number[];
  /** Damping ratio (1 = critical) per node. */
  zeta: readonly number[];
  /** Max offset per node as a fraction of the dino's focus radius. */
  maxOffset: readonly number[];
  /** Vertex weight 4w(1-w) instead of w: only the soft seam between this bone and its neighbours moves. */
  band: boolean;
}

export const CHAINS: readonly ChainSpec[] = [
  {
    name: 'tail', bones: ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'], band: false,
    hz: [0, 2.6, 2.2, 1.9, 1.7, 1.5], zeta: [0, 0.45, 0.4, 0.38, 0.35, 0.33], maxOffset: [0, 0.004, 0.009, 0.016, 0.024, 0.032],
  },
  { name: 'throat', bones: ['head', 'jaw'], band: true, hz: [0, 3.2], zeta: [0, 0.22], maxOffset: [0, 0.008] },
];

export const SUBSTEP_HZ = 120;
export const MAX_SUBSTEPS = 4;
export const MAX_CHAINS = 32;
export const MAX_NODES = 8;
export const MAX_SKELETONS = 16;
export const SLOTS_PER_SKELETON = 32;

/** Per-substep spring constant and velocity damping for a damped oscillator integrated with Verlet at `SUBSTEP_HZ`. */
export function stepParams(hz: number, zeta: number, stepHz = SUBSTEP_HZ): { k: number; damp: number } {
  const w = 2 * Math.PI * hz;
  const h = 1 / stepHz;
  return { k: Math.min(0.9, (w * h) ** 2), damp: Math.exp(-2 * zeta * w * h) };
}

/** Bone indices of every chain the skeleton has (a chain is used only if all its bones exist). */
export function resolveChains(boneNames: readonly string[], specs: readonly ChainSpec[] = CHAINS): { spec: ChainSpec; bones: number[] }[] {
  const out: { spec: ChainSpec; bones: number[] }[] = [];
  for (const spec of specs) {
    const bones = spec.bones.map((n) => boneNames.indexOf(n));
    if (bones.length >= 2 && bones.length <= MAX_NODES && bones.every((b) => b >= 0)) out.push({ spec, bones });
  }
  return out;
}

/**
 * Fixed-step accumulator: how many substeps to run this frame. A long frame (tab hidden, load stall) resets the
 * simulation instead of fast-forwarding it.
 */
export class StepClock {
  private acc = 0;
  /** Returns the substep count for this frame, or -1 when the frame was too long and the chains must reset. */
  advance(dt: number): number {
    if (!(dt >= 0) || dt > 0.25) { this.acc = 0; return -1; }
    this.acc += dt;
    const h = 1 / SUBSTEP_HZ;
    let n = Math.floor(this.acc / h);
    if (n > MAX_SUBSTEPS) { n = MAX_SUBSTEPS; this.acc = 0; } else this.acc -= n * h;
    return n;
  }
}

interface ChainRec { dino: Dino; chain: number; bones: Bone[] }

/** Capacity is fixed, so adding a dino never rebuilds the compute kernel. */
export class SecondaryMotion {
  /** Scales every offset (dev tuning; 0 makes the effect invisible without a recompile). */
  readonly gain = uniform(1);
  private readonly renderer: WebGPURenderer;
  private readonly anim = new Float32Array(MAX_CHAINS * MAX_NODES * 4);
  private readonly params = new Float32Array(MAX_CHAINS * MAX_NODES * 4);
  private readonly info = new Float32Array(MAX_CHAINS * 4);
  private readonly animNode = instancedArray(this.anim, 'vec4');
  private readonly paramsNode = instancedArray(this.params, 'vec4');
  private readonly infoNode = instancedArray(this.info, 'vec4');
  private readonly outNode = instancedArray(MAX_SKELETONS * SLOTS_PER_SKELETON, 'vec4');
  private readonly substeps = uniform(0, 'int');
  private readonly kernel;
  private readonly chains: (ChainRec | null)[] = new Array(MAX_CHAINS).fill(null);
  private readonly skeletons: (Skeleton | null)[] = new Array(MAX_SKELETONS).fill(null);
  private readonly dinos = new Map<Dino, { skel: number; chains: number[]; materials: Material[] }>();
  private readonly clock = new StepClock();
  private resetPending = true;
  private _enabled = true;
  private zeroPending = false;

  constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
    const anim = this.animNode, params = this.paramsNode, info = this.infoNode, out = this.outNode;
    // GPU-only state per node: offset, previous offset, previous animated position, previous per-substep displacement.
    const off = instancedArray(MAX_CHAINS * MAX_NODES, 'vec4');
    const offPrev = instancedArray(MAX_CHAINS * MAX_NODES, 'vec4');
    const animPrev = instancedArray(MAX_CHAINS * MAX_NODES, 'vec4');
    const stepPrev = instancedArray(MAX_CHAINS * MAX_NODES, 'vec4');
    const substeps = this.substeps, gain = this.gain;

    this.kernel = Fn(() => {
      const ci = int(instanceIndex).toVar();
      const inf = info.element(ci);
      const count = int(inf.x).toVar();
      If(count.greaterThan(1), () => {
        const base = ci.mul(MAX_NODES).toVar();
        const reset = anim.element(base).w.greaterThan(0.5);
        const steps = max(float(substeps), float(1));
        // Per-substep displacement of every animated node since the last dispatch; reset clears the state.
        loop(int(0), count, 'node', (i) => {
          const n = base.add(i);
          const a = anim.element(n).xyz;
          If(reset, () => {
            animPrev.element(n).assign(vec4(a, 0));
            off.element(n).assign(vec4(0));
            offPrev.element(n).assign(vec4(0));
            stepPrev.element(n).assign(vec4(0));
          });
        });
        loop(int(0), substeps, 'sub', (s) => {
          loop(int(1), count, 'node', (i) => {
            const n = base.add(i);
            const p = params.element(n);
            const a = anim.element(n).xyz;
            const ap = anim.element(n.sub(1)).xyz;
            const step = a.sub(animPrev.element(n).xyz).div(steps).toVar();
            const o = off.element(n).xyz.toVar();
            const op = offPrev.element(n).xyz;
            // Verlet on the offset: velocity relative to the animated bone, damped; spring back; inertia from the
            // change of the animated displacement (its acceleration), injected on the first substep only.
            const next = o.add(o.sub(op).mul(p.z)).sub(o.mul(p.y)).toVar();
            If(s.equal(0), () => { next.subAssign(step.sub(stepPrev.element(n).xyz)); });
            // Keep the animated bone length from the (already updated) parent node.
            const parent = ap.add(off.element(n.sub(1)).xyz);
            const d = a.add(next).sub(parent).toVar();
            const rest = a.sub(ap).length();
            const fixed = parent.add(d.mul(rest.div(max(d.length(), 1e-5)))).sub(a).toVar();
            // Hard clamp of the state at twice the limit, so a teleport can never tear the mesh.
            const len = fixed.length();
            fixed.mulAssign(min(float(1), p.w.mul(2).div(max(len, 1e-6))));
            offPrev.element(n).assign(vec4(o, 0));
            off.element(n).assign(vec4(fixed, 0));
          });
        });
        loop(int(1), count, 'node', (i) => {
          const n = base.add(i);
          const a = anim.element(n).xyz;
          If(substeps.greaterThan(0), () => {
            stepPrev.element(n).assign(vec4(a.sub(animPrev.element(n).xyz).div(steps), 0));
            animPrev.element(n).assign(vec4(a, 0));
          });
          // Soft saturation to the limit on output: o * m / sqrt(m^2 + |o|^2), so the tip never stops dead at a wall.
          const o = off.element(n).xyz;
          const m = params.element(n).w;
          const soft = m.div(m.mul(m).add(o.dot(o)).sqrt().max(1e-6));
          out.element(uint(params.element(n).x)).assign(vec4(o.mul(soft).mul(gain), inf.y));
        });
        If(substeps.greaterThan(0), () => { animPrev.element(base).assign(vec4(anim.element(base).xyz, 0)); });
      });
    })().compute(MAX_CHAINS);
  }

  get enabled(): boolean { return this._enabled; }

  /** Turning off writes zero offsets once, then stops dispatching (no material recompile). */
  setEnabled(on: boolean): void {
    if (on === this._enabled) return;
    this._enabled = on;
    if (on) this.resetPending = true;
    else this.zeroPending = true;
  }

  /** Binds the dino's tail and throat chains. Returns the number of chains bound (0: no free capacity or no chain). */
  add(dino: Dino): number {
    if (this.dinos.has(dino)) return this.dinos.get(dino)!.chains.length;
    let skinned: SkinnedMesh | null = null;
    const meshes: SkinnedMesh[] = [];
    dino.root.traverse((o: Object3D) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh) { meshes.push(m); skinned ??= m; } });
    if (!skinned) return 0;
    const skeleton = (skinned as SkinnedMesh).skeleton;
    if (skeleton.bones.length > SLOTS_PER_SKELETON) return 0;
    const resolved = resolveChains(skeleton.bones.map((b) => b.name));
    const skel = this.skeletons.indexOf(null);
    const free = this.chains.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), []);
    if (!resolved.length || skel < 0 || free.length < resolved.length) return 0;
    this.skeletons[skel] = skeleton;
    const radius = dino.focusRadius;
    const chains: number[] = [];
    resolved.forEach(({ spec, bones }, k) => {
      const c = free[k];
      chains.push(c);
      this.chains[c] = { dino, chain: c, bones: bones.map((b) => skeleton.bones[b]) };
      this.info.set([bones.length, spec.band ? 1 : 0, 0, 0], c * 4);
      bones.forEach((b, i) => {
        const { k: spring, damp } = stepParams(spec.hz[i] || 1, spec.zeta[i] || 1);
        this.params.set([skel * SLOTS_PER_SKELETON + b, spring, damp, (spec.maxOffset[i] ?? 0) * radius], (c * MAX_NODES + i) * 4);
      });
    });
    this.paramsNode.value.needsUpdate = true;
    this.infoNode.value.needsUpdate = true;

    // Every material on this skeleton reads the offsets of its own slot block (materials are per-load, never shared).
    const slotBase = uniform(skel * SLOTS_PER_SKELETON, 'uint');
    const read = storage(this.outNode.value, 'vec4', MAX_SKELETONS * SLOTS_PER_SKELETON).toReadOnly() as unknown as Vec4Buffer;
    const materials: Material[] = [];
    for (const m of meshes) {
      if (m.skeleton !== skeleton) continue;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (materials.includes(mat)) continue;
        materials.push(mat);
        (mat as Material & { positionNode: unknown }).positionNode = skinOffset(read, slotBase);
        mat.needsUpdate = true;
      }
    }
    this.dinos.set(dino, { skel, chains, materials });
    this.resetPending = true;
    return chains.length;
  }

  /** Frees the dino's chains (call before disposing it, e.g. on a variant swap). */
  remove(dino: Dino): void {
    const rec = this.dinos.get(dino);
    if (!rec) return;
    for (const c of rec.chains) { this.chains[c] = null; this.info[c * 4] = 0; }
    this.skeletons[rec.skel] = null;
    this.infoNode.value.needsUpdate = true;
    this.dinos.delete(dino);
  }

  /** Dev/evidence: current world-space offset (xyz) and band flag (w) per bone slot, read back from the GPU. */
  async readOffsets(): Promise<Float32Array> {
    return new Float32Array(await this.renderer.getArrayBufferAsync(this.outNode.value));
  }

  get chainCount(): number { return this.chains.reduce((n, c) => n + (c ? 1 : 0), 0); }

  /** Once per frame. Reads the bone world matrices of the last render; no allocations. */
  update(dt: number): void {
    if (!this._enabled) {
      if (this.zeroPending) { this.zeroPending = false; this.gain.value = 0; this.substeps.value = 0; this.renderer.compute(this.kernel); }
      return;
    }
    if (this.gain.value === 0) this.gain.value = 1;
    let steps = this.clock.advance(dt);
    const reset = this.resetPending || steps < 0;
    this.resetPending = false;
    if (steps < 0) steps = 1;
    if (steps === 0 && !reset) return;
    const anim = this.anim;
    for (let c = 0; c < MAX_CHAINS; c++) {
      const rec = this.chains[c];
      if (!rec) continue;
      for (let i = 0; i < rec.bones.length; i++) {
        const e = rec.bones[i].matrixWorld.elements;
        const o = (c * MAX_NODES + i) * 4;
        anim[o] = e[12]; anim[o + 1] = e[13]; anim[o + 2] = e[14]; anim[o + 3] = reset ? 1 : 0;
      }
    }
    this.animNode.value.needsUpdate = true;
    this.substeps.value = steps;
    this.renderer.compute(this.kernel);
  }
}

// --- TSL helpers -------------------------------------------------------------------------------------------------

/**
 * `for (int name = start; name < end; name++)`. Nested TSL Loops all default to the variable name `i`, and WGSL
 * shadowing then makes the outer index unreadable inside the inner loop, so every loop here gets its own name.
 */
function loop(start: Node<'int'>, end: Node<'int'>, name: string, body: (i: Node<'int'>) => void): void {
  (Loop as unknown as (p: object, f: (v: Record<string, Node<'int'>>) => void) => void)(
    { start, end, type: 'int', condition: '<', name }, (v) => body(v[name]));
}

type Vec4Buffer = StorageBufferNode<'vec4'>;

/** Skinned position plus sum over the 4 influences of weight * offset[slotBase + skinIndex], world -> mesh space. */
function skinOffset(read: Vec4Buffer, slotBase: Node<'uint'>) {
  return Fn(() => {
    const si = attribute('skinIndex', 'uvec4');
    const sw = attribute('skinWeight', 'vec4');
    const term = (idx: Node<'uint'>, w: Node<'float'>) => {
      const o = read.element(uint(slotBase).add(uint(idx)));
      return o.xyz.mul(mix(w, w.mul(float(1).sub(w)).mul(4), o.w));
    };
    const offWorld = term(si.x, sw.x).add(term(si.y, sw.y)).add(term(si.z, sw.z)).add(term(si.w, sw.w));
    return positionLocal.add(modelWorldMatrixInverse.mul(vec4(offWorld, 0)).xyz);
  })();
}
