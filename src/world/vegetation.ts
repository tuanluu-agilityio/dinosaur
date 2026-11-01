// Late-Cretaceous (Hell Creek) flora: ferns, cycads, Metasequoia-like conifers, early angiosperm shrubs. No grass.
// One InstancedMesh per species; counts come from BUDGETS[tier]. Placement is deterministic and clustered: conifers and
// cycads by Poisson-disc sampling, the understory (ferns, shrubs) in patches under and between them. Nothing goes in the
// dinosaur clearing, in water, or inside the camera intro (isClearOfIntro, src/camera/paths.ts). Instancing pattern after
// holtsetio/aurelia src/plankton.js @724aba26 (MIT). All geometry is procedural (docs/assets/flora.md).
import {
  BufferAttribute, BufferGeometry, DoubleSide, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardNodeMaterial,
  Quaternion, Vector3,
} from 'three/webgpu';
import type { Camera } from 'three/webgpu';
import {
  attribute, cameraPosition, float, fwidth, hash, interleavedGradientNoise, max, mix, normalView, normalize, positionLocal, screenCoordinate, sin, smoothstep, step,
  transformNormalToView, uniform, uv, vec3, vec4, Fn,
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
  fern: { radius: 0.55, scale: [0.55, 2.0], xz: [0.85, 1.15], spheres: [[1.2, 2.1]] }, // 1.2 m reach + 0.9 m sway
};
/** Placement order: big first so understory clusters can form under them. */
const ORDER: Species[] = ['conifer', 'cycad', 'shrub', 'fern'];
const UNDERSTORY = new Set<Species>(['shrub', 'fern']);

/**
 * Deterministic placement for a tier. Every tier is a prefix of one seeded list (generated at the high-tier size, or larger
 * for perf-tuning overrides), so a tier switch only adds or removes plants and never moves one.
 */
export function placeVegetation(tier: QualityTier, seed = 20261031, counts: Record<Species, number> = vegetationCounts(tier)): Placements {
  const high = vegetationCounts('high');
  const totals = Object.fromEntries(ORDER.map((sp) => [sp, Math.max(counts[sp], high[sp])])) as Record<Species, number>;
  const all = placeAll(seed, totals);
  return Object.fromEntries(ORDER.map((sp) => [sp, all[sp].slice(0, counts[sp])])) as Placements;
}

const placeCache = new Map<string, Placements>();
function placeAll(seed: number, totals: Record<Species, number>): Placements {
  const ck = `${seed}:${ORDER.map((s) => totals[s]).join(',')}`;
  const hit = placeCache.get(ck);
  if (hit) return hit;
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
  for (let i = 0; i < 260; i++) patches.push({ x: x0 + prand() * (x1 - x0), z: z0 + prand() * (z1 - z0), s: 2.5 + prand() * 5 });

  for (const sp of ORDER) {
    const spec = SPECS[sp];
    const rand = streams[sp];
    const gauss = gaussOf(rand);
    let radius = spec.radius;
    const target = totals[sp];
    let misses = 0;
    while (out[sp].length < target) {
      let x: number, z: number;
      const mode = rand();
      if (UNDERSTORY.has(sp) && radius > spec.radius * 0.4 && mode < 0.8) {
        if (mode < 0.4) { // denser under the canopy
          // Plant k only clusters under trees of the same rank fraction, so it exists in a tier only with its tree.
          const frac = (out[sp].length + 1) / target;
          const nc = Math.max(1, Math.ceil(out.conifer.length * frac)), ny = Math.max(1, Math.ceil(out.cycad.length * frac));
          const t = rand() < nc / (nc + ny) ? out.conifer[Math.floor(rand() * nc)] : out.cycad[Math.floor(rand() * ny)];
          if (!t) continue;
          x = t.x + gauss() * 4.5; z = t.z + gauss() * 4.5;
        } else {
          const pt = patches[Math.floor(rand() * patches.length)];
          x = pt.x + gauss() * pt.s; z = pt.z + gauss() * pt.s;
        }
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      } else { // scattered cover between the clumps
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
  placeCache.set(ck, out);
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
  frond(ox: number, oy: number, oz: number, yaw: number, len: number, width: number, rise: number, droop: number, segs: number, roll = 0, part = 1, flat = false, bend0 = 0, bendGain = 1): void {
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
        this.v([ox + dx * out - dz * w * sg * cr, oy + up + w * sg * sr, oz + dz * out + dx * w * sg * cr], [0, 1, 0], side, t, bend0 + t * t * bendGain, part);
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
  /**
   * Drooping conical skirt from a rim (y0, r0) up to (y1, r1) near the trunk. `rim(angle)` scales the radius at the rim
   * (fading to 1 at the top) so the outline is irregular. uv is in cells of `cell` metres: x around, y up the slope from the rim.
   */
  skirt(y0: number, r0: number, y1: number, r1: number, sides: number, rows: number, rim: (a: number) => number, part: number, bendOf: (y: number) => number, cell: number): void {
    const first = this.pos.length / 3;
    const slant = Math.hypot(r0 - r1, y1 - y0);
    const cols = Math.max(4, Math.round((TAU * r0) / (cell * 0.55))); // sprays are narrower than long
    for (let k = 0; k <= rows; k++) {
      const s = k / rows;
      const y = y0 + (y1 - y0) * (1 - (1 - s) ** 2); // steep at the rim: branch tips droop
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        const c = Math.cos(a), sn = Math.sin(a);
        const r = (r0 + (r1 - r0) * s) * (1 + (rim(a) - 1) * (1 - s));
        const n = new Vector3(c * (y1 - y0), r0 - r1, sn * (y1 - y0)).normalize();
        this.v([c * r, y, sn * r], [n.x, n.y, n.z], (i / sides) * cols, (s * slant) / cell, bendOf(y), part);
      }
    }
    for (let k = 0; k < rows; k++) {
      for (let i = 0; i < sides; i++) {
        const a = first + k * (sides + 1) + i, b = a + sides + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
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

export function fernGeometry(fronds = 8, segments = 4): BufferGeometry {
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

/** Conifer height (m) and crown: the crown covers the upper two-thirds, from CROWN_BASE to the tip. */
const CONIFER_H = 26;
const CROWN_BASE = 8.5;
/** Crown radius at height y (m), before per-tier irregularity. Stays <= 4.2 m, inside the 4.6 m of the intro spheres. */
function crownRadius(y: number): number {
  const f = Math.min(1, Math.max(0, (CONIFER_H - y) / (CONIFER_H - CROWN_BASE)));
  return 0.25 + 3.75 * f ** 0.9;
}
/** Trunk wind weight at height y, shared by trunk, crown and limb roots so they move together. */
const trunkBend = (y: number) => 0.5 * (y / CONIFER_H) ** 2;

/**
 * Metasequoia/Taxodium-like conifer, 26 m, as always drawn: fluted trunk with buttressed base and a dense, narrow conical
 * crown over the upper two-thirds. The crown is a stack of irregular drooping skirts (one per branch whorl) plus a dark
 * inner core; the shader cuts the skirts into overlapping feathery needle sprays (part 2 outer, part 3 inner), so the
 * outline is ragged and the crown reads as foliage, not as a cone. Near trees also draw coniferSprayGeometry.
 */
export function coniferGeometry(): BufferGeometry {
  const m = new Mesher();
  const H = CONIFER_H;
  m.lathe(H, 16, 20, (y, a) => {
    const taper = 0.42 * (1 - 0.88 * (y / H));
    const buttress = 1.1 * Math.exp(-y / 1.3) * (0.35 + 0.65 * Math.abs(Math.cos(a * 2.5)));
    const flute = 1 + 0.07 * Math.cos(a * 9 + y * 0.15);
    return (taper + buttress) * flute;
  }, trunkBend);
  const rand = rng(91);
  // Inner core: keeps the sky from showing straight through the crown.
  m.skirt(CROWN_BASE + 1.2, crownRadius(CROWN_BASE + 1.2) * 0.55, H - 0.6, 0.05, 10, 6, () => 1, 3, trunkBend, 0.6);
  const tiers = 11;
  for (let j = 0; j < tiers; j++) {
    const y0 = CROWN_BASE + (j / tiers) * (H - CROWN_BASE - 1.2) + (rand() - 0.5) * 0.5;
    const rim = crownRadius(y0) * (0.9 + rand() * 0.15);
    const top = Math.min(H, y0 + 2.6 + rand() * 0.6);
    const ph = rand() * TAU, ph2 = rand() * TAU;
    const sides = Math.max(8, Math.round(rim * 4));
    m.skirt(y0, rim, top, crownRadius(top) * 0.2, sides, 3, (a) => 1 + 0.16 * Math.sin(3 * a + ph) + 0.09 * Math.sin(7 * a + ph2), 2, trunkBend, 0.6);
  }
  return m.build();
}

/**
 * Near-only detail for the conifer: ~40 slender limbs with opposite pairs of small flat needle sprays and a terminal spray,
 * reaching just past the crown skirts so the silhouette is feathery up close. Faded out with distance (LOD).
 */
export function coniferSprayGeometry(): BufferGeometry {
  const m = new Mesher();
  const H = CONIFER_H;
  const rand = rng(77);
  const limbs = 40;
  for (let i = 0; i < limbs; i++) {
    const t = i / (limbs - 1);
    const y0 = CROWN_BASE + 0.3 + t * (H - CROWN_BASE - 1.3) + (rand() - 0.5) * 0.5;
    const yaw = i * 2.399 + (rand() - 0.5) * 0.7;
    const L = Math.min(4.2, crownRadius(y0) * (0.95 + rand() * 0.15) + 0.2);
    const rise = 0.1, droop = 0.4;
    const r0 = 0.3 * (1 - 0.88 * (y0 / H));
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const b0 = trunkBend(y0);
    m.frond(dx * r0, y0, dz * r0, yaw, L, 0.05, rise, droop, 2, 0, 0.5, false, b0, 0.15); // twig (part 0.5: bark colour, lit from above)
    const at = (s: number) => ({ x: dx * (r0 + L * s), y: y0 + L * (rise * s - droop * s * s), z: dz * (r0 + L * s) });
    for (const s of [0.45, 0.65, 0.85]) {
      const p = at(s);
      const len = (1.3 - 0.3 * s) * (0.8 + rand() * 0.4) * Math.min(1, 0.45 + L / 3);
      for (const side of [-1, 1]) m.frond(p.x, p.y, p.z, yaw + side * (0.95 + rand() * 0.3), len, 0.3 * len, 0.1, 0.5, 2, 0.15 + rand() * 0.5, 1, true, b0, 0.25);
    }
    const tip = at(1);
    m.frond(tip.x, tip.y, tip.z, yaw + (rand() - 0.5) * 0.4, 1.1, 0.3, 0.1, 0.5, 2, 0.2, 1, true, b0, 0.25);
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
  /** conifer crown skirts (part 2 outer, 3 inner core) cut into feathery needle sprays */
  crown?: boolean;
  /** near-only detail: dissolves between LOD_NEAR and LOD_FAR metres from the camera */
  nearOnly?: boolean;
  /** casts shadows through its cut-outs (the shadow follows the crown) */
  castShadow?: boolean;
}

/** Conifer spray detail dissolves between these distances (m, horizontal) from the camera; the crown skirts remain. */
export const LOD_NEAR = 50;
export const LOD_FAR = 70;

/**
 * One feathery Metasequoia spray: a thin rachis with opposite rows of separate linear needles slanting toward the tip.
 * lx: distance from the rachis (0..0.5), ly: 0 at the tip .. 1 at the base, `needlesPerPx`: needle rows per pixel. When the
 * needles get finer than a pixel the cut-out blends into the spray outline, so distant crowns stay dense instead of noisy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sprayCut(lx: any, ly: any, needlesPerPx: any) {
  const w = float(0.46).mul(smoothstep(0, 0.35, ly)).mul(float(1).sub(ly.mul(0.3)));
  const outline = float(1).sub(smoothstep(w.sub(0.05), w, lx));
  const q = ly.mul(15).add(lx.mul(9)).fract();
  const needles = smoothstep(0.62, 0.42, q).mul(outline);
  // Mid distance: a serrated (pinnate) outline; far: the plain outline.
  const e = w.mul(float(1).sub(ly.mul(15).fract().mul(0.5)));
  const serrated = float(1).sub(smoothstep(e.sub(0.06), e, lx));
  const rachis = float(1).sub(smoothstep(0.015, 0.035, lx));
  const cut = mix(mix(needles, serrated, smoothstep(0.35, 0.7, needlesPerPx)), outline.mul(0.9), smoothstep(1, 2, needlesPerPx));
  return max(cut, rachis).mul(step(0, ly));
}

/**
 * Crown skirt cut-out: two offset layers of overlapping feathery sprays (tips pointing down the slope), each with its own
 * jittered position and length so the rim is ragged. uv in cells (x around, y up from the rim).
 */
function crownMask() {
  return Fn(() => {
    const layer = (ox: number, oy: number, salt: number, salt2: number) => {
      const u = uv().x.add(ox), v = uv().y.add(oy);
      const cu = u.floor(), cv = v.floor();
      const h = hash(cu.add(cv.mul(57)).add(salt));
      const h2 = hash(cu.mul(13).add(cv.mul(7)).add(salt2));
      const lx = u.fract().sub(0.5).add(h.sub(0.5).mul(0.3)).abs();
      const t0 = h2.mul(0.35);
      const ly = v.fract().sub(t0).div(float(1).sub(t0)); // 0 at the spray tip, 1 at its base
      return sprayCut(lx, ly, fw);
    };
    const fw = fwidth(uv().y).mul(15);
    // The second layer starts half a cell up, so only spray tips reach the rim.
    return max(layer(0, 0, 0, 3), layer(0.5, 0.5, 17, 20).mul(step(0.5, uv().y)));
  })();
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
    if (kind === 'needle') return sprayCut(across.mul(0.5), float(1).sub(uv().y), fwidth(uv().y).mul(15));
    const lobe = uv().y.mul(22).fract(); // fern: pinnae
    const edge = float(1).sub(lobe.mul(0.75)).mul(smoothstep(0, 0.1, uv().y));
    return max(rachis, float(1).sub(smoothstep(edge.sub(0.16), edge, across)));
  })();
}

/** Per-species tier fade: instances with rank in [to, from) fade out (and [from, to) fade in) as `p` runs 0 -> 1. */
const fadeUniform = (v: number) => uniform(v);
type U = ReturnType<typeof fadeUniform>;
interface TierFade { from: U; to: U; p: U }
/** Seconds a tier switch takes to fade plants in or out. */
export const TIER_FADE_SECONDS = 0.5;

/** Per-instance data (InstancedBufferAttribute 'inst'): world x, z of the plant and its rank in the seeded placement list. */
const inst = () => attribute('inst', 'vec4');
// Screen-door threshold: a stable per-pixel pattern, so fading plants dissolve instead of popping.
const dither = () => interleavedGradientNoise(screenCoordinate.xy);
function tierVisibility(f: TierFade) {
  const rank = inst().z.add(0.5);
  return mix(step(rank, f.from), step(rank, f.to), f.p);
}

function floraMaterial(opts: FloraStyle, fade: TierFade): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: opts.roughness ?? 0.85, metalness: 0 });
  const bend = attribute('bend', 'float');
  const part = attribute('part', 'float');
  const rank = inst().z;
  // Per-plant phase and strength so neighbours never sway in lockstep. Instanced positionLocal is already world
  // space (the instance matrix applies first), so the wind noise is sampled at world XZ.
  const phase = hash(rank).mul(50);
  const gain = mix(float(0.55), float(1.45), hash(rank.add(5)));
  mat.positionNode = positionLocal.add(windOffset(positionLocal.xz.add(phase), bend, gain.mul(opts.strength)));
  // part: 0 bark, 0.5 twig (bark colour, lit from above), 1 foliage card, 2 crown skirt, 3 inner crown core
  const leafW = step(0.75, part), litW = step(0.25, part), coreW = step(2.5, part);
  const cut = mix(float(1), opts.crown ? crownMask() : leafMask(opts.kind), leafW);
  const tierVis = tierVisibility(fade);
  let vis = tierVis;
  if (opts.nearOnly) vis = vis.mul(float(1).sub(smoothstep(LOD_NEAR, LOD_FAR, inst().xy.sub(cameraPosition.xz).length())));
  const threshold = dither().mul(0.998).add(0.001);
  mat.opacityNode = cut.mul(step(threshold, vis));
  if (opts.castShadow) mat.maskShadowNode = cut.mul(step(threshold, tierVis)).greaterThan(0.5);
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true; // soft edges under MSAA instead of stair-stepped cut-outs
  // Leaf cards light from above on both faces (no black undersides): foliage normals point up whichever side is seen.
  const upView = transformNormalToView(vec3(0, 1, 0));
  // Crown skirts keep more of their cone normal so the sunlit side of the crown reads as a volume.
  let normal = mix(normalView, upView, litW.mul(opts.crown ? 0.4 : 0.85));
  const tint = mix(float(0.82), float(1.15), hash(rank.add(11)));
  const along = opts.crown ? float(1).sub(uv().y.fract()) : uv().y; // crown: spray tips are lighter than their bases
  let foliage = mix(vec3(...opts.dark), vec3(...opts.light), along.mul(0.6).add(bend.mul(0.4))).mul(tint);
  if (opts.crown) {
    const sprayTint = mix(float(0.75), float(1.15), hash(uv().x.floor().add(uv().y.floor().mul(57)).add(rank)));
    foliage = foliage.mul(mix(sprayTint, float(0.45), coreW));
  }
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

/** Instances are batched per spatial cell so frustum and shadow culling work (and the whole forest is not drawn for a narrow view). */
const CHUNK = 52;

export interface Vegetation {
  group: Group;
  /** InstancedMeshes per species, one per spatial chunk. `count` is the number of plants drawn (fading ones included). */
  meshes: Record<Species, InstancedMesh[]>;
  /** Plants per species in the current tier. */
  counts: Record<Species, number>;
  /** Placements of the current tier: a prefix of one seeded list, so switching tiers never moves a plant. */
  placements: Placements;
  /** Switch tier in place: lower tiers fade the extra plants out over TIER_FADE_SECONDS, higher tiers fade them in. */
  setTier(tier: QualityTier, want?: Record<Species, number>): void;
  /** Advance fades (and level of detail); call once per frame. */
  update(dtSec: number, camera?: Camera): void;
  /** Free geometries and materials and detach from the scene. */
  dispose(): void;
}

interface Chunk { mesh: InstancedMesh; ranks: number[]; extra: InstancedMesh[] }
const countBelow = (ranks: number[], n: number) => { let k = 0; while (k < ranks.length && ranks[k] < n) k++; return k; };

/** Geometry for one chunk: shares the species' vertex buffers and adds the per-instance 'inst' attribute. */
function chunkGeometry(base: BufferGeometry, data: Float32Array): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) g.setAttribute(name, a);
  g.setIndex(base.index);
  g.setAttribute('inst', new InstancedBufferAttribute(data, 4));
  return g;
}

export function createVegetation(tier: QualityTier, seed?: number, want?: Record<Species, number>): Vegetation {
  const counts = { ...(want ?? vegetationCounts(tier)) };
  // Every species is built once at full (high-tier) capacity; a tier only changes how many of the ranked plants are drawn.
  const high = vegetationCounts('high');
  const capacity = Object.fromEntries(ORDER.map((sp) => [sp, Math.max(counts[sp], high[sp])])) as Record<Species, number>;
  const full = placeVegetation('high', seed, capacity);
  const fades = Object.fromEntries(ORDER.map((sp) => [sp, { from: fadeUniform(counts[sp]), to: fadeUniform(counts[sp]), p: fadeUniform(1) }])) as Record<Species, TierFade>;
  const defs: Record<Species, { geo: BufferGeometry; mat: MeshStandardNodeMaterial }> = {
    fern: { geo: fernGeometry(), mat: floraMaterial({ kind: 'fern', dark: [0.07, 0.16, 0.05], light: [0.2, 0.36, 0.11], strength: 0.9 }, fades.fern) },
    cycad: { geo: cycadGeometry(), mat: floraMaterial({ kind: 'cycad', dark: [0.04, 0.12, 0.05], light: [0.1, 0.24, 0.08], strength: 0.7, bark: [0.34, 0.26, 0.18], armor: true, roughness: 0.55 }, fades.cycad) },
    conifer: { geo: coniferGeometry(), mat: floraMaterial({ kind: 'needle', crown: true, castShadow: true, dark: [0.06, 0.13, 0.04], light: [0.24, 0.36, 0.1], strength: 1.8, bark: [0.34, 0.17, 0.1] }, fades.conifer) },
    shrub: { geo: shrubGeometry(), mat: floraMaterial({ kind: 'ovate', dark: [0.1, 0.2, 0.06], light: [0.3, 0.42, 0.12], strength: 0.9, bark: [0.25, 0.18, 0.1] }, fades.shrub) },
  };
  // Near conifers add limbs of needle sprays; they dissolve with distance and do not cast shadows (the crown does).
  const sprayGeo = coniferSprayGeometry();
  const sprayMat = floraMaterial({ kind: 'needle', nearOnly: true, dark: [0.06, 0.13, 0.04], light: [0.24, 0.36, 0.1], strength: 1.8, bark: [0.34, 0.17, 0.1] }, fades.conifer);

  const group = new Group();
  const meshes = { fern: [], cycad: [], conifer: [], shrub: [] } as Record<Species, InstancedMesh[]>;
  const chunks = { fern: [], cycad: [], conifer: [], shrub: [] } as Record<Species, Chunk[]>;
  const owned: BufferGeometry[] = [];
  const sprays: InstancedMesh[] = [];
  const m4 = new Matrix4(), q = new Quaternion(), eul = new Euler(0, 0, 0, 'YXZ'), s3 = new Vector3(), p3 = new Vector3();
  const build = (geo: BufferGeometry, mat: MeshStandardNodeMaterial, list: Array<[Placement, number]>, name: string): InstancedMesh => {
    const data = new Float32Array(list.length * 4);
    list.forEach(([p, rank], i) => data.set([p.x, p.z, rank, 0], i * 4));
    const g = chunkGeometry(geo, data);
    owned.push(g);
    const mesh = new InstancedMesh(g, mat, list.length);
    list.forEach(([p], i) => {
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
    const cells = new Map<number, Array<[Placement, number]>>();
    full[sp].forEach((p, rank) => {
      const k = Math.floor((p.z - WORLD.minZ) / CHUNK) * 64 + Math.floor((p.x - WORLD.minX) / CHUNK);
      (cells.get(k) ?? cells.set(k, []).get(k)!).push([p, rank]); // ranks ascend within a chunk
    });
    for (const list of cells.values()) {
      const mesh = build(defs[sp].geo, defs[sp].mat, list, `flora-${sp}`);
      group.add(mesh);
      meshes[sp].push(mesh);
      const chunk: Chunk = { mesh, ranks: list.map(([, r]) => r), extra: [] };
      if (sp === 'conifer') {
        const detail = build(sprayGeo, sprayMat, list, 'flora-conifer-sprays');
        group.add(detail);
        chunk.extra.push(detail);
        sprays.push(detail);
      }
      chunks[sp].push(chunk);
    }
  }

  const applyShadows = (on: boolean) => {
    // Ferns are low and dense: shadow lookups there cost frame time and show little.
    for (const sp of ORDER) for (const m of meshes[sp]) m.receiveShadow = on && sp !== 'fern';
    for (const m of meshes.conifer) m.castShadow = on; // the crown's cut-outs shape the shadow
    for (const m of sprays) m.receiveShadow = on;
  };
  applyShadows(BUDGETS[tier].shadows);
  const camPos = new Vector3();
  const fading = new Set<Species>();
  const draw = (sp: Species, n: number) => {
    for (const c of chunks[sp]) {
      c.mesh.count = countBelow(c.ranks, n);
      for (const e of c.extra) e.count = c.mesh.count;
    }
  };
  const slice = () => Object.fromEntries(ORDER.map((sp) => [sp, full[sp].slice(0, counts[sp])])) as Placements;
  const veg: Vegetation = {
    group, meshes, counts, placements: slice(),
    setTier(t, w) {
      const next = w ?? vegetationCounts(t);
      applyShadows(BUDGETS[t].shadows);
      for (const sp of ORDER) {
        const f = fades[sp];
        const now = counts[sp];
        const n = Math.min(Math.max(0, next[sp]), capacity[sp]);
        f.from.value = now; f.to.value = n; f.p.value = n === now ? 1 : 0;
        draw(sp, Math.max(now, n)); // plants fading out are still drawn until the fade ends
        if (n !== now) fading.add(sp); else fading.delete(sp);
        counts[sp] = n;
      }
      veg.placements = slice();
    },
    update(dt, camera) {
      // Skip spray chunks that are entirely beyond the LOD range (the shader dissolves the rest per plant).
      if (camera) {
        camera.getWorldPosition(camPos);
        for (const m of sprays) {
          const bs = m.boundingSphere!;
          m.visible = Math.hypot(bs.center.x - camPos.x, bs.center.z - camPos.z) - bs.radius < LOD_FAR;
        }
      }
      for (const sp of fading) {
        const f = fades[sp];
        f.p.value = Math.min(1, (f.p.value as number) + dt / TIER_FADE_SECONDS);
        if ((f.p.value as number) >= 1) { f.from.value = counts[sp]; draw(sp, counts[sp]); fading.delete(sp); }
      }
    },
    dispose() {
      group.removeFromParent();
      for (const g of owned) g.dispose();
      for (const sp of ORDER) { defs[sp].geo.dispose(); defs[sp].mat.dispose(); }
      sprayGeo.dispose(); sprayMat.dispose();
    },
  };
  for (const sp of ORDER) draw(sp, counts[sp]);
  return veg;
}
