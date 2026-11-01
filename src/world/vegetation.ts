// Late-Cretaceous (Hell Creek) flora: ferns, cycads, Metasequoia-like conifers, early angiosperm shrubs. No grass.
// One InstancedMesh per species; counts come from BUDGETS[tier]. Placement is deterministic Poisson-disc sampling that
// avoids the dinosaur clearing and the camera intro (isClearOfIntro, src/camera/paths.ts). Instancing pattern after
// holtsetio/aurelia src/plankton.js @724aba26 (MIT). All geometry is procedural (docs/assets/flora.md).
import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import { attribute, float, mix, positionLocal, smoothstep, uv, vec3, vec4, Fn } from 'three/tsl';
import { BUDGETS } from '../core/budgets';
import type { QualityTier } from '../core/quality';
import { isClearOfIntro } from '../camera/paths';
import { inClearing, riverX, terrainHeight, WORLD } from './terrain';
import { windOffset } from './wind';

const TAU = Math.PI * 2;

export type Species = 'fern' | 'cycad' | 'conifer' | 'shrub';
export interface Placement { x: number; y: number; z: number; yaw: number; scale: number }
export type Placements = Record<Species, Placement[]>;

/** Instance count per species for a tier. Shrubs (early angiosperms) are 10% of the fern budget, as an understory accent. */
export function vegetationCounts(tier: QualityTier): Record<Species, number> {
  const b = BUDGETS[tier];
  return { fern: b.ferns, cycad: b.cycads, conifer: b.conifers, shrub: Math.round(b.ferns * 0.1) };
}

// ---------------------------------------------------------------- placement

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  /** minimum spacing of same-species instances (m) */
  radius: number;
  scale: [number, number];
  /** [trunk-top height, crown radius] at scale 1, for the intro-clear contract */
  contract: [number, number];
}
const SPECS: Record<Species, Spec> = {
  conifer: { radius: 7, scale: [0.75, 1.1], contract: [20, 8] },
  cycad: { radius: 3.2, scale: [0.8, 1.3], contract: [2.5, 2.4] },
  shrub: { radius: 2.4, scale: [0.8, 1.4], contract: [1.8, 1.5] },
  fern: { radius: 1.3, scale: [0.8, 1.7], contract: [1.2, 1.2] },
};
/** Placement order: big first so understory fills the gaps. */
const ORDER: Species[] = ['conifer', 'cycad', 'shrub', 'fern'];

export function placeVegetation(tier: QualityTier, seed = 20261031): Placements {
  const counts = vegetationCounts(tier);
  const rand = rng(seed);
  const cell = 8;
  const gw = Math.ceil((WORLD.maxX - WORLD.minX) / cell);
  const grid = new Map<number, Array<{ x: number; z: number; sp: Species }>>();
  const key = (cx: number, cz: number) => cz * gw + cx;
  const out: Placements = { conifer: [], cycad: [], shrub: [], fern: [] };
  const x0 = WORLD.minX + 12, x1 = WORLD.maxX - 12, z0 = WORLD.minZ + 12, z1 = WORLD.maxZ - 12;

  for (const sp of ORDER) {
    const spec = SPECS[sp];
    let radius = spec.radius;
    const target = counts[sp];
    let misses = 0;
    while (out[sp].length < target) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      const scale = spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]);
      const yaw = rand() * TAU;
      let ok = !inClearing(x, z, 1.5) && Math.abs(x - riverX(z)) > 9;
      if (ok) {
        const cx = Math.floor((x - WORLD.minX) / cell), cz = Math.floor((z - WORLD.minZ) / cell);
        search: for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const o of grid.get(key(cx + i, cz + j)) ?? []) {
            const d = Math.hypot(o.x - x, o.z - z);
            if ((o.sp === sp && d < radius) || (sp !== 'fern' && o.sp !== 'fern' && d < 2.2 * scale)) { ok = false; break search; }
          }
        }
      }
      if (ok) ok = isClearOfIntro(x, z, spec.contract[0] * scale, spec.contract[1] * scale);
      if (!ok) {
        // Relax the spacing when the area saturates, so the budget count is always honoured.
        if (++misses > 4000) { radius *= 0.9; misses = 0; }
        continue;
      }
      misses = 0;
      out[sp].push({ x, y: terrainHeight(x, z), z, yaw, scale });
      const k = key(Math.floor((x - WORLD.minX) / cell), Math.floor((z - WORLD.minZ) / cell));
      (grid.get(k) ?? grid.set(k, []).get(k)!).push({ x, z, sp });
    }
  }
  return out;
}

// ---------------------------------------------------------------- geometry
// Attributes: position, normal, uv (uv.y runs along a frond/leaf, used for leaflet cut-outs),
// bend (0 rooted .. 1 free tip; wind weight, already squared), part (0 bark, 1 foliage).

class Mesher {
  pos: number[] = []; nrm: number[] = []; uvs: number[] = []; bend: number[] = []; part: number[] = []; idx: number[] = [];
  v(p: [number, number, number], n: [number, number, number], u: number, w: number, bend: number, part: number): number {
    this.pos.push(...p); this.nrm.push(...n); this.uvs.push(u, w); this.bend.push(bend); this.part.push(part);
    return this.pos.length / 3 - 1;
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setAttribute('bend', new BufferAttribute(new Float32Array(this.bend), 1));
    g.setAttribute('part', new BufferAttribute(new Float32Array(this.part), 1));
    g.setIndex(this.idx);
    return g;
  }
  /** Arching frond strip from (ox,oy,oz) heading along yaw. */
  frond(ox: number, oy: number, oz: number, yaw: number, len: number, width: number, rise: number, droop: number, segs: number): void {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const first = this.pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const out = len * t;
      const up = len * (rise * t - droop * t * t);
      const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - 0.3 * t);
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1;
        this.v([ox + dx * out - dz * w * sg, oy + up, oz + dz * out + dx * w * sg], [0, 1, 0], side, t, t * t, 1);
      }
      if (s < segs) { const b = first + s * 2; this.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  /** Open tapered cylinder (trunk) or cone shell. */
  tube(y0: number, y1: number, r0: number, r1: number, sides: number, part: number, bend0: number, bend1: number): void {
    const first = this.pos.length / 3;
    const slope = (r0 - r1) / (y1 - y0);
    const l = Math.hypot(1, slope);
    for (let k = 0; k < 2; k++) {
      const y = k === 0 ? y0 : y1, r = k === 0 ? r0 : r1;
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        this.v([c * r, y, s * r], [c / l, slope / l, s / l], i / sides, k, k === 0 ? bend0 : bend1, part);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = first + i, b = a + sides + 1;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

export function fernGeometry(fronds = 8, segments = 6): BufferGeometry {
  const m = new Mesher();
  for (let f = 0; f < fronds; f++) m.frond(0, 0.05, 0, (f / fronds) * TAU + (f % 2) * 0.3, 0.95 - (f % 3) * 0.12, 0.16, 1.1, 0.85, segments);
  return m.build();
}

/** Cycad: short stout trunk crowned by a rosette of long stiff fronds. */
export function cycadGeometry(): BufferGeometry {
  const m = new Mesher();
  m.tube(0, 1.1, 0.3, 0.22, 7, 0, 0, 0);
  for (let f = 0; f < 13; f++) {
    const ring = f % 2;
    m.frond(0, 1.1, 0, (f / 13) * TAU, 1.9 - ring * 0.5, 0.2, 0.9 + ring * 0.7, 0.75, 6);
  }
  return m.build();
}

/** Metasequoia-like conifer: straight trunk, tiered conical crown (~26 m, crown radius <= 4 m). */
export function coniferGeometry(): BufferGeometry {
  const m = new Mesher();
  const H = 26;
  m.tube(0, H - 2, 0.55, 0.12, 8, 0, 0, 0.6);
  const tiers = 9;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const yb = 7 + t * 14;
    const r = 3.8 * (1 - t * 0.8);
    const h = 5.5 - t * 1.8;
    m.tube(yb, yb + h, r, 0.05, 10, 1, (yb / H) ** 2, ((yb + h) / H) ** 2);
  }
  return m.build();
}

/** Early angiosperm shrub (magnoliid-like): thin stems carrying broad ovate leaves. */
export function shrubGeometry(): BufferGeometry {
  const m = new Mesher();
  m.tube(0, 0.9, 0.04, 0.02, 4, 0, 0, 0.1);
  for (let l = 0; l < 14; l++) {
    const t = l / 14;
    m.frond(0, 0.2 + t * 0.7, 0, l * 2.399, 0.55 - t * 0.15, 0.2, 0.55, 0.45, 3);
  }
  return m.build();
}

// ---------------------------------------------------------------- materials

function floraMaterial(opts: { leaflets: boolean; solid?: boolean; dark: [number, number, number]; light: [number, number, number]; strength: number; bark?: [number, number, number] }): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  const bend = attribute('bend', 'float');
  const part = attribute('part', 'float');
  mat.positionNode = positionLocal.add(windOffset(positionLocal.xz, bend, float(opts.strength)));
  if (!opts.solid) {
    const leaflet = Fn(() => {
      const across = uv().x.mul(2).sub(1).abs();
      const edge = opts.leaflets
        ? float(1).sub(uv().y.mul(22).fract().mul(0.75)).mul(smoothstep(0, 0.12, uv().y))
        : float(1).sub(uv().y.pow(3)).mul(smoothstep(0, 0.1, uv().y));
      return float(1).sub(smoothstep(edge.sub(0.05), edge, across));
    })();
    mat.opacityNode = mix(float(1), leaflet, part);
    mat.alphaTest = 0.5;
  }
  const foliage = mix(vec3(...opts.dark), vec3(...opts.light), uv().y.mul(0.6).add(bend.mul(0.4)));
  mat.colorNode = vec4(mix(vec3(...(opts.bark ?? [0.2, 0.14, 0.09])), foliage, part), 1);
  return mat;
}

// ---------------------------------------------------------------- scene objects

export interface Vegetation {
  group: Group;
  meshes: Record<Species, InstancedMesh>;
  counts: Record<Species, number>;
  placements: Placements;
}

export function createVegetation(tier: QualityTier, seed?: number): Vegetation {
  const placements = placeVegetation(tier, seed);
  const shadows = BUDGETS[tier].shadows;
  const defs: Record<Species, { geo: BufferGeometry; mat: MeshStandardNodeMaterial; cast: boolean }> = {
    fern: { geo: fernGeometry(), mat: floraMaterial({ leaflets: true, dark: [0.07, 0.16, 0.05], light: [0.2, 0.36, 0.11], strength: 0.3 }), cast: false },
    cycad: { geo: cycadGeometry(), mat: floraMaterial({ leaflets: true, dark: [0.06, 0.15, 0.06], light: [0.16, 0.32, 0.1], strength: 0.25, bark: [0.23, 0.17, 0.12] }), cast: shadows },
    conifer: { geo: coniferGeometry(), mat: floraMaterial({ leaflets: false, solid: true, dark: [0.05, 0.13, 0.06], light: [0.14, 0.27, 0.1], strength: 0.9, bark: [0.24, 0.16, 0.1] }), cast: shadows },
    shrub: { geo: shrubGeometry(), mat: floraMaterial({ leaflets: false, dark: [0.1, 0.2, 0.06], light: [0.3, 0.42, 0.12], strength: 0.3, bark: [0.25, 0.18, 0.1] }), cast: false },
  };
  const group = new Group();
  const meshes = {} as Record<Species, InstancedMesh>;
  const counts = {} as Record<Species, number>;
  const m4 = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), s3 = new Vector3(), p3 = new Vector3();
  for (const sp of ORDER) {
    const list = placements[sp];
    const mesh = new InstancedMesh(defs[sp].geo, defs[sp].mat, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      m4.compose(p3.set(p.x, p.y, p.z), q, s3.set(p.scale, p.scale, p.scale));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false; // wind moves vertices beyond the static bounds
    mesh.castShadow = defs[sp].cast;
    mesh.receiveShadow = defs[sp].cast;
    mesh.name = `flora-${sp}`;
    group.add(mesh);
    meshes[sp] = mesh;
    counts[sp] = list.length;
  }
  return { group, meshes, counts, placements };
}
