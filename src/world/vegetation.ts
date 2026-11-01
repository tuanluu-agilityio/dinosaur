// Late-Cretaceous (Hell Creek) flora: ferns, cycads, Metasequoia-like conifers, early angiosperm shrubs. No grass.
// One InstancedMesh per species; counts come from BUDGETS[tier]. Placement is deterministic and clustered: conifers and
// cycads by Poisson-disc sampling, the understory (ferns, shrubs) in patches under and between them. Nothing goes in the
// dinosaur clearing, in water, or inside the camera intro (isClearOfIntro, src/camera/paths.ts). Instancing pattern after
// holtsetio/aurelia src/plankton.js @724aba26 (MIT). All geometry is procedural (docs/assets/flora.md).
import {
  BufferAttribute, BufferGeometry, DoubleSide, Euler, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import {
  attribute, float, hash, instanceIndex, max, mix, normalView, normalize, positionLocal, sin, smoothstep, step, transformNormalToView, uv,
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
/** Conifer: three spheres enclose the crown (branches span 8-25 m, reach <= 4.6 m, +0.9 m sway margin) and a fourth the buttressed base. */
const CONIFER_SPHERES: Array<[number, number]> = [[24, 5.5], [17, 5.5], [10, 5.5], [1.6, 2.6]];
const SPECS: Record<Species, Spec> = {
  conifer: { radius: 7, scale: [0.75, 1.15], xz: [0.8, 1.2], spheres: CONIFER_SPHERES },
  cycad: { radius: 3.2, scale: [0.8, 1.3], xz: [0.9, 1.1], spheres: [[3.2, 3.3]] },
  shrub: { radius: 1.1, scale: [0.6, 1.5], xz: [0.8, 1.2], spheres: [[1.8, 1.5]] },
  fern: { radius: 0.55, scale: [0.55, 2.0], xz: [0.85, 1.15], spheres: [[1.2, 1.2]] },
};
/** Placement order: big first so understory clusters can form under them. */
const ORDER: Species[] = ['conifer', 'cycad', 'shrub', 'fern'];
const UNDERSTORY = new Set<Species>(['shrub', 'fern']);

export function placeVegetation(tier: QualityTier, seed = 20261031, counts: Record<Species, number> = vegetationCounts(tier)): Placements {
  // One random stream per species, so the first N conifers (and cycads) of a lower tier are the same plants as in a higher tier.
  const streams = Object.fromEntries(ORDER.map((s, i) => [s, rng(seed + 7919 * (i + 1))])) as Record<Species, () => number>;
  const gaussOf = (rand: () => number) => () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
  const cell = 8;
  const gw = Math.ceil((WORLD.maxX - WORLD.minX) / cell);
  const grid = new Map<number, Array<{ x: number; z: number; sp: Species }>>();
  const key = (cx: number, cz: number) => cz * gw + cx;
  const out: Placements = { conifer: [], cycad: [], shrub: [], fern: [] };
  const x0 = WORLD.minX + 12, x1 = WORLD.maxX - 12, z0 = WORLD.minZ + 12, z1 = WORLD.maxZ - 12;

  // Understory patches: ferns and shrubs grow in clumps, not on a lattice.
  const patches: Array<{ x: number; z: number; s: number }> = [];
  const prand = rng(seed ^ 0x5bd1e995);
  for (let i = 0; i < 160; i++) patches.push({ x: x0 + prand() * (x1 - x0), z: z0 + prand() * (z1 - z0), s: 2 + prand() * 4 });

  for (const sp of ORDER) {
    const spec = SPECS[sp];
    const rand = streams[sp];
    const gauss = gaussOf(rand);
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
  frond(ox: number, oy: number, oz: number, yaw: number, len: number, width: number, rise: number, droop: number, segs: number, roll = 0, part = 1, flat = false): void {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const first = this.pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const out = len * t;
      const up = len * (rise * t - droop * t * t);
      const w = flat ? width * Math.min(1, 0.35 + t * 3) * (1 - 0.15 * t) : width * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - 0.3 * t);
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1;
        this.v([ox + dx * out - dz * w * sg * cr, oy + up + w * sg * sr, oz + dz * out + dx * w * sg * cr], [0, 1, 0], side, t, t * t, part);
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

/** Cycad: stout armoured trunk (leaf bases) crowned by a rosette of long, stiff, upswept fronds with rectangular leaflets. */
export function cycadGeometry(): BufferGeometry {
  const m = new Mesher();
  m.tube(0, 1.5, 0.24, 0.2, 8, 0, 0, 0);
  for (let f = 0; f < 14; f++) {
    const ring = f % 2;
    m.frond(0, 1.5, 0, (f / 14) * TAU + ring * 0.2, 2.6 - ring * 0.6, 0.3, 1.5 + ring * 0.5, 0.95, 6);
  }
  return m.build();
}

/**
 * Metasequoia/Taxodium-like conifer, 26 m: fluted trunk with buttressed base, and an open crown of ~28 slender limbs
 * (longest low down) that carry opposite pairs of small flat needle sprays plus a terminal spray. The sprays are short
 * (1-1.5 m) and finely cut, so they read as soft feathery foliage, not as fern fronds. Crown radius <= 4.6 m.
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
  const limbs = 28;
  for (let i = 0; i < limbs; i++) {
    const t = i / (limbs - 1);
    const y0 = 8 + t * 16.5 + (rand() - 0.5) * 0.8;
    const yaw = i * 2.399 + (rand() - 0.5) * 0.7;
    const L = (0.6 + 3.0 * (1 - t) ** 0.85) * (0.85 + rand() * 0.3);
    const rise = 0.12, droop = 0.35;
    const r0 = 0.3 * (1 - 0.88 * (y0 / H));
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    m.frond(dx * r0, y0, dz * r0, yaw, L, 0.05, rise, droop, 2, 0, 0.5); // twig (part 0.5: bark colour, lit from above)
    const at = (s: number) => ({ x: dx * (r0 + L * s), y: y0 + L * (rise * s - droop * s * s), z: dz * (r0 + L * s) });
    for (const s of [0.25, 0.45, 0.65, 0.85]) {
      const p = at(s);
      const len = (1.25 - 0.25 * s) * (0.8 + rand() * 0.4);
      for (const side of [-1, 1]) m.frond(p.x, p.y, p.z, yaw + side * (0.95 + rand() * 0.3), len, 0.3 * len, 0.1, 0.5, 2, 0.15 + rand() * 0.5, 1, true);
    }
    const tip = at(1);
    m.frond(tip.x, tip.y, tip.z, yaw + (rand() - 0.5) * 0.4, 1.1, 0.3, 0.1, 0.5, 2, 0.2, 1, true);
  }
  return m.build();
}

/** Cheap stand-in for the conifer, drawn only into the shadow map: trunk plus three crown cones (no alpha test). */
export function coniferShadowGeometry(): BufferGeometry {
  const m = new Mesher();
  m.tube(0, 25, 0.5, 0.1, 6, 0, 0, 0.5);
  m.tube(7, 15, 3.6, 0.4, 8, 1, 0.1, 0.3);
  m.tube(13, 21, 2.9, 0.3, 8, 1, 0.25, 0.5);
  m.tube(19, 26, 1.8, 0.1, 8, 1, 0.5, 0.85);
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

type LeafKind = 'fern' | 'cycad' | 'needle' | 'ovate';
interface FloraStyle {
  kind: LeafKind;
  dark: [number, number, number];
  light: [number, number, number];
  /** metres of sway at bend = 1 (before the per-instance gain) */
  strength: number;
  bark?: [number, number, number];
  /** cycad trunk: diamond leaf-base armour */
  armor?: boolean;
  roughness?: number;
}

/** Soft leaflet/needle cut-outs per leaf kind. uv.x across the strip, uv.y along it. */
function leafMask(kind: LeafKind) {
  return Fn(() => {
    const across = uv().x.mul(2).sub(1).abs();
    const rachis = float(1).sub(smoothstep(0.05, 0.12, across));
    if (kind === 'ovate') {
      const edge = sin(uv().y.mul(Math.PI)).pow(0.6).mul(0.95);
      return float(1).sub(smoothstep(edge.sub(0.12), edge, across));
    }
    if (kind === 'cycad') { // stiff, rectangular, closely set leaflets
      const lobe = uv().y.mul(26).fract();
      const edge = float(0.98).mul(smoothstep(0.66, 0.5, lobe)).mul(smoothstep(0, 0.08, uv().y));
      return max(rachis, float(1).sub(smoothstep(edge.sub(0.12), edge, across)));
    }
    const n = kind === 'needle' ? 64 : 22; // needle: fine opposite pairs; fern: coarser pinnae
    const lobe = uv().y.mul(n).fract();
    const edge = float(1).sub(lobe.mul(kind === 'needle' ? 0.4 : 0.75)).mul(smoothstep(0, 0.1, uv().y)).mul(kind === 'needle' ? float(1).sub(smoothstep(0.8, 1, uv().y).mul(0.6)) : float(1));
    return max(rachis, float(1).sub(smoothstep(edge.sub(0.16), edge, across)));
  })();
}

function floraMaterial(opts: FloraStyle): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: opts.roughness ?? 0.85, metalness: 0 });
  const bend = attribute('bend', 'float');
  const part = attribute('part', 'float');
  // Per-plant phase and strength so neighbours never sway in lockstep. Instanced positionLocal is already world
  // space (the instance matrix applies first), so the wind noise is sampled at world XZ.
  const phase = hash(instanceIndex).mul(50);
  const gain = mix(float(0.55), float(1.45), hash(instanceIndex.add(5)));
  mat.positionNode = positionLocal.add(windOffset(positionLocal.xz.add(phase), bend, gain.mul(opts.strength)));
  const leafW = step(0.75, part), litW = step(0.25, part); // part: 0 bark, 0.5 twig (bark colour, lit from above), 1 foliage
  mat.opacityNode = mix(float(1), leafMask(opts.kind), leafW);
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true; // soft edges under MSAA instead of stair-stepped cut-outs
  // Leaf cards light from above on both faces (no black undersides): foliage normals point up whichever side is seen.
  const upView = transformNormalToView(vec3(0, 1, 0));
  let normal = mix(normalView, upView, litW.mul(0.85));
  const tint = mix(float(0.82), float(1.15), hash(instanceIndex.add(11)));
  const foliage = mix(vec3(...opts.dark), vec3(...opts.light), uv().y.mul(0.6).add(bend.mul(0.4))).mul(tint);
  const streaks = float(0.85).add(sin(uv().x.mul(TAU * 20)).mul(0.1)).add(sin(uv().x.mul(TAU * 7).add(uv().y.mul(3))).mul(0.06));
  let bark = vec3(...(opts.bark ?? [0.2, 0.14, 0.09])).mul(streaks);
  if (opts.armor) {
    // Diamond leaf-base plates: ridges between plates are darker and bend the normal so the trunk reads as armoured.
    const gx = uv().x.mul(8);
    const gy = uv().y.mul(5).add(gx.floor().mod(2).mul(0.5));
    const d = gx.fract().sub(0.5).abs().add(gy.fract().sub(0.5).abs());
    const gap = smoothstep(0.34, 0.5, d);
    bark = mix(vec3(...(opts.bark ?? [0.3, 0.22, 0.15])).mul(float(0.9).add(hash(gx.floor().add(gy.floor().mul(13))).mul(0.25))), vec3(0.08, 0.06, 0.04), gap);
    normal = mix(normal, normalize(normalView.add(upView.mul(gap.sub(0.5).mul(1.1)))), float(1).sub(litW));
  }
  mat.normalNode = normalize(normal);
  mat.colorNode = vec4(mix(bark, foliage, leafW), 1);
  return mat;
}

// ---------------------------------------------------------------- scene objects

/** Layer carrying the conifer shadow proxies; enable it on the sun's shadow camera (dev/forest.html does). */
export const SHADOW_LAYER = 1;
/** Instances are batched per spatial cell so frustum and shadow culling work (and the whole forest is not drawn for a narrow view). */
const CHUNK = 52;

export interface Vegetation {
  group: Group;
  /** InstancedMeshes per species, one per spatial chunk. */
  meshes: Record<Species, InstancedMesh[]>;
  counts: Record<Species, number>;
  placements: Placements;
}

export function createVegetation(tier: QualityTier, seed?: number, want?: Record<Species, number>): Vegetation {
  const placements = placeVegetation(tier, seed, want);
  const shadows = BUDGETS[tier].shadows;
  const defs: Record<Species, { geo: BufferGeometry; mat: MeshStandardNodeMaterial }> = {
    fern: { geo: fernGeometry(), mat: floraMaterial({ kind: 'fern', dark: [0.07, 0.16, 0.05], light: [0.2, 0.36, 0.11], strength: 0.9 }) },
    cycad: { geo: cycadGeometry(), mat: floraMaterial({ kind: 'cycad', dark: [0.04, 0.12, 0.05], light: [0.1, 0.24, 0.08], strength: 0.7, bark: [0.34, 0.26, 0.18], armor: true, roughness: 0.55 }) },
    conifer: { geo: coniferGeometry(), mat: floraMaterial({ kind: 'needle', dark: [0.1, 0.2, 0.06], light: [0.33, 0.45, 0.12], strength: 1.8, bark: [0.34, 0.17, 0.1] }) },
    shrub: { geo: shrubGeometry(), mat: floraMaterial({ kind: 'ovate', dark: [0.1, 0.2, 0.06], light: [0.3, 0.42, 0.12], strength: 0.9, bark: [0.25, 0.18, 0.1] }) },
  };
  const shadowMat = new MeshStandardNodeMaterial({ colorWrite: false, side: DoubleSide });
  shadowMat.positionNode = positionLocal.add(windOffset(positionLocal.xz.add(hash(instanceIndex).mul(50)), attribute('bend', 'float'), hash(instanceIndex.add(5)).mul(0.9).add(0.55).mul(1.8)));
  const shadowGeo = coniferShadowGeometry();

  const group = new Group();
  const meshes = { fern: [], cycad: [], conifer: [], shrub: [] } as Record<Species, InstancedMesh[]>;
  const counts = {} as Record<Species, number>;
  const m4 = new Matrix4(), q = new Quaternion(), eul = new Euler(0, 0, 0, 'YXZ'), s3 = new Vector3(), p3 = new Vector3();
  const build = (geo: BufferGeometry, mat: MeshStandardNodeMaterial, list: Placement[], name: string): InstancedMesh => {
    const mesh = new InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      q.setFromEuler(eul.set(p.tiltX, p.yaw, p.tiltZ));
      m4.compose(p3.set(p.x, p.y, p.z), q, s3.set(p.scaleXZ, p.scale, p.scaleXZ));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 6; // wind moves vertices beyond the static bounds
    mesh.name = name;
    return mesh;
  };
  for (const sp of ORDER) {
    const cells = new Map<number, Placement[]>();
    for (const p of placements[sp]) {
      const k = Math.floor((p.z - WORLD.minZ) / CHUNK) * 64 + Math.floor((p.x - WORLD.minX) / CHUNK);
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(p);
    }
    for (const list of cells.values()) {
      const mesh = build(defs[sp].geo, defs[sp].mat, list, `flora-${sp}`);
      mesh.receiveShadow = shadows && sp !== 'fern'; // ferns are low and dense: shadow lookups there cost frame time and show little
      group.add(mesh);
      meshes[sp].push(mesh);
      if (sp === 'conifer' && shadows) {
        // Only the cheap proxy casts shadows (layer SHADOW_LAYER, seen by the shadow camera but not the main one).
        const proxy = build(shadowGeo, shadowMat, list, 'flora-conifer-shadow');
        proxy.layers.set(SHADOW_LAYER);
        proxy.castShadow = true;
        group.add(proxy);
      }
    }
    counts[sp] = placements[sp].length;
  }
  return { group, meshes, counts, placements };
}
