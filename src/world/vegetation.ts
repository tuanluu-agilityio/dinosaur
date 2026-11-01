// Late-Cretaceous (Hell Creek) flora: ferns, cycads, Metasequoia-like conifers, early angiosperm shrubs. No grass.
// One InstancedMesh per species; counts come from BUDGETS[tier]. Placement is deterministic and clustered: conifers and
// cycads by Poisson-disc sampling, the understory (ferns, shrubs) in patches under and between them. Nothing goes in the
// dinosaur clearing, in water, or inside the camera intro (isClearOfIntro, src/camera/paths.ts). Instancing pattern after
// holtsetio/aurelia src/plankton.js @724aba26 (MIT). All geometry is procedural (docs/assets/flora.md).
import {
  BufferAttribute, BufferGeometry, DoubleSide, Euler, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import {
  attribute, float, hash, instanceIndex, mix, normalView, normalize, positionLocal, sin, smoothstep, transformNormalToView, uv,
  vec3, vec4, Fn,
} from 'three/tsl';
import { BUDGETS } from '../core/budgets';
import type { QualityTier } from '../core/quality';
import { isClearOfIntro } from '../camera/paths';
import { inClearing, terrainHeight, WATER_LEVEL, WORLD } from './terrain';
import { windOffset } from './wind';

const TAU = Math.PI * 2;

export type Species = 'fern' | 'cycad' | 'conifer' | 'shrub';
export interface Placement { x: number; y: number; z: number; yaw: number; scale: number; scaleXZ: number; tiltX: number; tiltZ: number }
export type Placements = Record<Species, Placement[]>;

/** Instance count per species for a tier, straight from BUDGETS. */
export function vegetationCounts(tier: QualityTier): Record<Species, number> {
  const b = BUDGETS[tier];
  return { fern: b.ferns, cycad: b.cycads, conifer: b.conifers, shrub: b.shrubs };
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
  /** vertical scale range; horizontal scale is the vertical one times a factor in `xz` */
  scale: [number, number];
  xz: [number, number];
  /** Enclosing spheres at scale 1: [height of centre above the trunk base, radius], sway margin included. Tested with isClearOfIntro. */
  spheres: Array<[number, number]>;
}
/** Conifer crown: branches span 8-25 m and reach <= 4.6 m; three spheres enclose it, +0.9 m for wind sway. */
const CONIFER_SPHERES: Array<[number, number]> = [[24, 5.5], [17, 5.5], [10, 5.5]];
const SPECS: Record<Species, Spec> = {
  conifer: { radius: 7, scale: [0.75, 1.15], xz: [0.8, 1.2], spheres: CONIFER_SPHERES },
  cycad: { radius: 3.2, scale: [0.8, 1.3], xz: [0.9, 1.1], spheres: [[3.2, 3.3]] },
  shrub: { radius: 1.1, scale: [0.6, 1.5], xz: [0.8, 1.2], spheres: [[1.8, 1.5]] },
  fern: { radius: 0.55, scale: [0.55, 2.0], xz: [0.85, 1.15], spheres: [[1.2, 1.2]] },
};
/** Placement order: big first so understory clusters can form under them. */
const ORDER: Species[] = ['conifer', 'cycad', 'shrub', 'fern'];
const UNDERSTORY = new Set<Species>(['shrub', 'fern']);

export function placeVegetation(tier: QualityTier, seed = 20261031): Placements {
  const counts = vegetationCounts(tier);
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
  const cell = 8;
  const gw = Math.ceil((WORLD.maxX - WORLD.minX) / cell);
  const grid = new Map<number, Array<{ x: number; z: number; sp: Species }>>();
  const key = (cx: number, cz: number) => cz * gw + cx;
  const out: Placements = { conifer: [], cycad: [], shrub: [], fern: [] };
  const x0 = WORLD.minX + 12, x1 = WORLD.maxX - 12, z0 = WORLD.minZ + 12, z1 = WORLD.maxZ - 12;

  // Understory patches: ferns and shrubs grow in clumps, not on a lattice.
  const patches: Array<{ x: number; z: number; s: number }> = [];
  for (let i = 0; i < 160; i++) patches.push({ x: x0 + rand() * (x1 - x0), z: z0 + rand() * (z1 - z0), s: 2 + rand() * 4 });

  for (const sp of ORDER) {
    const spec = SPECS[sp];
    let radius = spec.radius;
    const target = counts[sp];
    let misses = 0;
    const trees = [...out.conifer, ...out.cycad];
    while (out[sp].length < target) {
      let x: number, z: number;
      const mode = rand();
      if (UNDERSTORY.has(sp) && radius > spec.radius * 0.4 && mode < 0.9) {
        if (mode < 0.5 && trees.length) { // denser under the canopy
          const t = trees[Math.floor(rand() * trees.length)];
          x = t.x + gauss() * 4.5; z = t.z + gauss() * 4.5;
        } else {
          const pt = patches[Math.floor(rand() * patches.length)];
          x = pt.x + gauss() * pt.s; z = pt.z + gauss() * pt.s;
        }
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      } else {
        x = x0 + rand() * (x1 - x0);
        z = z0 + rand() * (z1 - z0);
      }
      const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * (sp === 'fern' ? rand() ** 1.6 : rand());
      const scaleXZ = scale * (spec.xz[0] + rand() * (spec.xz[1] - spec.xz[0]));
      const yaw = rand() * TAU;
      const tilt = sp === 'conifer' ? 0.05 : 0.02;
      const tiltX = (rand() - 0.5) * tilt, tiltZ = (rand() - 0.5) * tilt;
      const gy = terrainHeight(x, z);
      let ok = !inClearing(x, z, 1.5) && gy > WATER_LEVEL + 0.05;
      if (ok) {
        const cx = Math.floor((x - WORLD.minX) / cell), cz = Math.floor((z - WORLD.minZ) / cell);
        const tree = sp === 'conifer' || sp === 'cycad';
        search: for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const o of grid.get(key(cx + i, cz + j)) ?? []) {
            const d = Math.hypot(o.x - x, o.z - z);
            if ((o.sp === sp && d < radius) || (tree && (o.sp === 'conifer' || o.sp === 'cycad') && d < 2.2 * scale)) { ok = false; break search; }
          }
        }
      }
      if (ok) for (const [h, r] of spec.spheres) if (!isClearOfIntro(x, z, h * scale, r * scaleXZ)) { ok = false; break; }
      if (!ok) {
        // Relax the spacing when the area saturates, so the budget count is always honoured.
        if (++misses > 4000) { radius *= 0.9; misses = 0; }
        continue;
      }
      misses = 0;
      out[sp].push({ x, y: gy, z, yaw, scale, scaleXZ, tiltX, tiltZ });
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
  /** Arching frond strip from (ox,oy,oz) heading along yaw; `roll` tilts the strip's width axis out of the horizontal. */
  frond(ox: number, oy: number, oz: number, yaw: number, len: number, width: number, rise: number, droop: number, segs: number, roll = 0): void {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const first = this.pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const out = len * t;
      const up = len * (rise * t - droop * t * t);
      const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - 0.3 * t);
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1;
        this.v([ox + dx * out - dz * w * sg * cr, oy + up + w * sg * sr, oz + dz * out + dx * w * sg * cr], [0, 1, 0], side, t, t * t, 1);
      }
      if (s < segs) { const b = first + s * 2; this.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  /** Open tapered cylinder (trunk piece). */
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
  /** Surface of revolution with per-vertex radius r(y, angle) and smooth numeric normals. */
  lathe(height: number, rows: number, sides: number, radius: (y: number, a: number) => number, bendOf: (y: number) => number): void {
    const first = this.pos.length / 3;
    const P: Vector3[][] = [];
    for (let k = 0; k <= rows; k++) {
      const y = (k / rows) * height;
      P.push(Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * TAU;
        const r = radius(y, a);
        return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      }));
    }
    for (let k = 0; k <= rows; k++) {
      for (let i = 0; i <= sides; i++) {
        const c = P[k][i % sides];
        const du = P[k][(i + 1) % sides].clone().sub(P[k][(i + sides - 1) % sides]);
        const dv = P[Math.min(rows, k + 1)][i % sides].clone().sub(P[Math.max(0, k - 1)][i % sides]);
        const n = du.cross(dv).normalize();
        if (n.x * c.x + n.z * c.z < 0) n.negate(); // outward
        this.v([c.x, c.y, c.z], [n.x, n.y, n.z], i / sides, k / rows, bendOf(c.y), 0);
      }
    }
    for (let k = 0; k < rows; k++) {
      for (let i = 0; i < sides; i++) {
        const a = first + k * (sides + 1) + i, b = a + sides + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
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
  m.tube(0, 1.5, 0.22, 0.17, 8, 0, 0, 0);
  for (let f = 0; f < 13; f++) {
    const ring = f % 2;
    m.frond(0, 1.5, 0, (f / 13) * TAU, 2.5 - ring * 0.7, 0.24, 0.9 + ring * 0.7, 0.75, 6);
  }
  return m.build();
}

/**
 * Metasequoia/Taxodium-like conifer, 26 m: fluted trunk with buttressed base, an open irregular crown of ~72 spiralling,
 * drooping feathery branch sprays (longer low down, short near the leader). Crown radius <= 4.6 m, branches span 8-25 m.
 */
export function coniferGeometry(): BufferGeometry {
  const m = new Mesher();
  const H = 26;
  m.lathe(H, 16, 20, (y, a) => {
    const taper = 0.42 * (1 - 0.88 * (y / H));
    const buttress = 1.1 * Math.exp(-y / 1.3) * (0.35 + 0.65 * Math.abs(Math.cos(a * 2.5)));
    const flute = 1 + 0.07 * Math.cos(a * 9 + y * 0.15);
    return (taper + buttress) * flute;
  }, (y) => 0.5 * (y / H) ** 2);
  const rand = rng(77);
  const branches = 72;
  for (let i = 0; i < branches; i++) {
    const t = i / (branches - 1);
    const y = 8 + t * 16.8 + (rand() - 0.5) * 0.7;
    const yaw = i * 2.399 + (rand() - 0.5) * 0.9;
    const len = Math.min(4.4, (0.9 + 3.5 * (1 - t) ** 0.85) * (0.8 + rand() * 0.4));
    const r0 = 0.3 * (1 - 0.88 * (y / H));
    m.frond(Math.cos(yaw) * r0, y, Math.sin(yaw) * r0, yaw, len, 0.4 * len, 0.35 + rand() * 0.2, 0.75 + rand() * 0.3, 7, 0.15 + rand() * 0.8);
  }
  return m.build();
}

/** Early angiosperm shrub (magnoliid-like): thin stems carrying broad ovate leaves. */
export function shrubGeometry(): BufferGeometry {
  const m = new Mesher();
  m.tube(0, 0.9, 0.04, 0.02, 4, 0, 0, 0.1);
  for (let l = 0; l < 14; l++) {
    const t = l / 14;
    m.frond(0, 0.2 + t * 0.7, 0, l * 2.399, 0.55 - t * 0.15, 0.2, 0.55, 0.45, 3, (l % 3) * 0.3);
  }
  return m.build();
}

// ---------------------------------------------------------------- materials

interface FloraStyle {
  leaflets: boolean;
  dark: [number, number, number];
  light: [number, number, number];
  strength: number;
  bark?: [number, number, number];
  /** pinna cut-outs per unit uv.y */
  pinnae?: number;
}

function floraMaterial(opts: FloraStyle): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  const bend = attribute('bend', 'float');
  const part = attribute('part', 'float');
  // Wind samples noise at world XZ: instanced positionLocal is already world space (instance matrix applies first).
  mat.positionNode = positionLocal.add(windOffset(positionLocal.xz, bend, float(opts.strength)));
  const leaflet = Fn(() => {
    const across = uv().x.mul(2).sub(1).abs();
    const edge = opts.leaflets
      ? float(1).sub(uv().y.mul(opts.pinnae ?? 22).fract().mul(0.75)).mul(smoothstep(0, 0.12, uv().y))
      : float(1).sub(uv().y.pow(3)).mul(smoothstep(0, 0.1, uv().y));
    return float(1).sub(smoothstep(edge.sub(0.05), edge, across));
  })();
  mat.opacityNode = mix(float(1), leaflet, part);
  mat.alphaTest = 0.5;
  // Leaf cards light from above on both faces (no black undersides): foliage normals point up whichever side is seen.
  mat.normalNode = normalize(mix(normalView, transformNormalToView(vec3(0, 1, 0)), part.mul(0.85)));
  const tint = mix(float(0.82), float(1.15), hash(instanceIndex.add(11)));
  const foliage = mix(vec3(...opts.dark), vec3(...opts.light), uv().y.mul(0.6).add(bend.mul(0.4))).mul(tint);
  const streaks = float(0.85).add(sin(uv().x.mul(TAU * 20)).mul(0.1)).add(sin(uv().x.mul(TAU * 7).add(uv().y.mul(3))).mul(0.06));
  const bark = vec3(...(opts.bark ?? [0.2, 0.14, 0.09])).mul(streaks);
  mat.colorNode = vec4(mix(bark, foliage, part), 1);
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
    cycad: { geo: cycadGeometry(), mat: floraMaterial({ leaflets: true, dark: [0.06, 0.15, 0.06], light: [0.16, 0.32, 0.1], strength: 0.25, bark: [0.36, 0.28, 0.19] }), cast: shadows },
    conifer: { geo: coniferGeometry(), mat: floraMaterial({ leaflets: true, pinnae: 34, dark: [0.07, 0.15, 0.05], light: [0.24, 0.36, 0.09], strength: 0.9, bark: [0.34, 0.17, 0.1] }), cast: shadows },
    shrub: { geo: shrubGeometry(), mat: floraMaterial({ leaflets: false, dark: [0.1, 0.2, 0.06], light: [0.3, 0.42, 0.12], strength: 0.3, bark: [0.25, 0.18, 0.1] }), cast: shadows },
  };
  const group = new Group();
  const meshes = {} as Record<Species, InstancedMesh>;
  const counts = {} as Record<Species, number>;
  const m4 = new Matrix4(), q = new Quaternion(), eul = new Euler(0, 0, 0, 'YXZ'), s3 = new Vector3(), p3 = new Vector3();
  for (const sp of ORDER) {
    const list = placements[sp];
    const mesh = new InstancedMesh(defs[sp].geo, defs[sp].mat, list.length);
    list.forEach((p, i) => {
      q.setFromEuler(eul.set(p.tiltX, p.yaw, p.tiltZ));
      m4.compose(p3.set(p.x, p.y, p.z), q, s3.set(p.scaleXZ, p.scale, p.scaleXZ));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false; // wind moves vertices beyond the static bounds
    mesh.castShadow = defs[sp].cast;
    mesh.receiveShadow = shadows;
    mesh.name = `flora-${sp}`;
    group.add(mesh);
    meshes[sp] = mesh;
    counts[sp] = list.length;
  }
  return { group, meshes, counts, placements };
}
