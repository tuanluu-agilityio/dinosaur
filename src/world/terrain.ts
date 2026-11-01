// Hell Creek was a low coastal floodplain: flat silty ground, a meandering creek and low rolling banks.
// Height is a pure function so vegetation and tests can sample it.
import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry,
} from 'three/webgpu';
import {
  abs, cross, dFdx, dFdy, dot, float, mix, mx_noise_float, normalView, normalize, positionView, positionWorld, sign, smoothstep, time, transformNormalToView, vec3,
} from 'three/tsl';

/** Clearing (ellipse) where dinosaurs live; no vegetation is placed inside. */
export const CLEARING = { x: 6, z: -35, rx: 26, rz: 30 };
export const WORLD = { minX: -130, maxX: 130, minZ: -190, maxZ: 70 };
export const WATER_LEVEL = -0.55;
/** Half-width of the water ribbon along the creek; terrain is above WATER_LEVEL beyond this. */
export const WATER_HALF_WIDTH = 10;

/** Creek centre line x at depth z. */
export function riverX(z: number): number {
  return 78 + 9 * Math.sin(z * 0.045) + 4 * Math.sin(z * 0.13 + 1.3);
}

export function inClearing(x: number, z: number, margin = 0): boolean {
  const dx = (x - CLEARING.x) / (CLEARING.rx + margin);
  const dz = (z - CLEARING.z) / (CLEARING.rz + margin);
  return dx * dx + dz * dz < 1;
}

const sstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terrain height (m). Exactly 0 on the central floodplain (the camera contract assumes flat ground there); banks stay below ~4 m. */
export function terrainHeight(x: number, z: number): number {
  const off = Math.abs(x - 6);
  const floodplain = sstep(45, 70, off);
  const rolling = (Math.sin(x * 0.05 + 1.7) * Math.cos(z * 0.04) + 0.5 * Math.sin(x * 0.11 + z * 0.09)) * 0.7;
  // Low banks at the valley edges (max ~3.5 m), no peaks.
  const bank = 3.5 * sstep(70, 125, off) + 3 * sstep(125, 160, -z) + 3 * sstep(30, 70, z);
  const d = Math.abs(x - riverX(z));
  const channel = d < 14 ? -2.2 * Math.pow(1 - d / 14, 1.5) : 0;
  return rolling * floodplain + bank + channel;
}

export interface Terrain {
  group: Group;
  ground: Mesh;
  water: Mesh;
  heightAt: (x: number, z: number) => number;
}

/** Strip of water following the creek, not a plane over the whole map. */
function waterGeometry(): BufferGeometry {
  const rows = 120;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const z = WORLD.minZ + ((WORLD.maxZ - WORLD.minZ) * i) / rows;
    const cx = riverX(z);
    pos.push(cx - WATER_HALF_WIDTH, WATER_LEVEL, z, cx + WATER_HALF_WIDTH, WATER_LEVEL, z);
    uv.push(0, i, 1, i);
    if (i < rows) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createTerrain(segments = 200): Terrain {
  const w = WORLD.maxX - WORLD.minX;
  const d = WORLD.maxZ - WORLD.minZ;
  const geo = new PlaneGeometry(w, d, segments, Math.round((segments * d) / w));
  geo.rotateX(-Math.PI / 2);
  geo.translate((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();

  // PBR ground from world-space noise (no texture files): dark leaf litter and silt, wet mud near the creek,
  // sparse moss. Fine detail drives both albedo and a perturbed normal + roughness so the near ground is not flat noise.
  const m = new MeshStandardNodeMaterial({ metalness: 0 });
  const wp = positionWorld;
  const n2 = (s: number) => mx_noise_float(vec3(wp.x.mul(s), 0, wp.z.mul(s)));
  const big = n2(0.05);
  const mid = n2(0.35);
  const fine = n2(2.2);
  const litter = vec3(0.17, 0.115, 0.07);
  const silt = vec3(0.3, 0.255, 0.19);
  const moss = vec3(0.09, 0.13, 0.05);
  const mud = vec3(0.1, 0.08, 0.06);
  let base = mix(litter, silt, smoothstep(-0.1, 0.5, big));
  base = mix(base, moss, smoothstep(0.25, 0.7, mid.mul(0.6).add(big.mul(0.4))).mul(0.45));
  const wet = smoothstep(float(0.3), float(-1.0), wp.y);
  base = mix(base, mud, wet);
  m.colorNode = base.mul(float(0.8).add(fine.mul(0.3)));
  m.roughnessNode = mix(float(0.97).sub(fine.mul(0.08)), float(0.45), wet);
  // Bump normal from screen-space derivatives of the height-like noise (surface-gradient method): no extra noise evaluations.
  const h = fine.add(mid.mul(0.6));
  const sx = dFdx(positionView), sy = dFdy(positionView);
  const r1 = cross(sy, normalView), r2 = cross(normalView, sx);
  const det = dot(sx, r1);
  const grad = sign(det).mul(dFdx(h).mul(r1).add(dFdy(h).mul(r2)));
  m.normalNode = normalize(abs(det).mul(normalView).sub(grad.mul(0.02)));

  const ground = new Mesh(geo, m);
  ground.receiveShadow = true;

  // Water: low roughness, animated ripple normals, depth-tinted and translucent.
  const wm = new MeshPhysicalNodeMaterial({ color: 0x2f4a40, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82 });
  const wpos = positionWorld;
  const t = time.mul(0.35);
  const rip = (ox: number, oz: number) => mx_noise_float(vec3(wpos.x.mul(0.9).add(t).add(ox), t.mul(0.5), wpos.z.mul(0.9).sub(t.mul(0.6)).add(oz)));
  const r0 = rip(0, 0);
  const rx = rip(0.04, 0).sub(r0).div(0.04);
  const rz = rip(0, 0.04).sub(r0).div(0.04);
  wm.normalNode = transformNormalToView(normalize(vec3(rx.mul(-0.12), 1, rz.mul(-0.12))));
  wm.colorNode = mix(vec3(0.16, 0.26, 0.22), vec3(0.28, 0.33, 0.25), smoothstep(-0.4, 0.5, r0));
  const water = new Mesh(waterGeometry(), wm);
  water.receiveShadow = false;

  const group = new Group();
  group.add(ground, water);
  return { group, ground, water, heightAt: terrainHeight };
}
