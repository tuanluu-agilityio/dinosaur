// Hell Creek valley: flat floodplain with a central clearing for dinosaurs, a creek on the east side
// and gently rising valley walls. Height is a pure function so vegetation and tests can sample it.
import { Color, DoubleSide, Group, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu';
import { float, mix, mx_noise_float, positionWorld, smoothstep, vec3 } from 'three/tsl';

/** Clearing (ellipse) where dinosaurs live; no vegetation is placed inside. */
export const CLEARING = { x: 6, z: -35, rx: 26, rz: 30 };
export const WORLD = { minX: -130, maxX: 130, minZ: -190, maxZ: 70 };
export const WATER_LEVEL = -0.55;

/** Creek centre line x at depth z. */
export function riverX(z: number): number {
  return 78 + 9 * Math.sin(z * 0.045) + 4 * Math.sin(z * 0.13 + 1.3);
}

export function inClearing(x: number, z: number, margin = 0): boolean {
  const dx = (x - CLEARING.x) / (CLEARING.rx + margin);
  const dz = (z - CLEARING.z) / (CLEARING.rz + margin);
  return dx * dx + dz * dz < 1;
}

/** Terrain height (m) at world x,z. Exactly 0 on the central floodplain (the camera contract assumes flat ground there). */
export function terrainHeight(x: number, z: number): number {
  const wall = Math.max(0, Math.abs(x - 6) - 70) * 0.18 + Math.max(0, -z - 130) * 0.2 + Math.max(0, z - 50) * 0.2;
  const rolling = (Math.sin(x * 0.05 + 1.7) * Math.cos(z * 0.04) + 0.5 * Math.sin(x * 0.11 + z * 0.09)) * 0.9;
  const floodplain = Math.min(1, Math.max(0, (Math.abs(x - 6) - 45) / 25)); // 0 near centre
  const d = Math.abs(x - riverX(z));
  const channel = d < 14 ? -2.2 * Math.pow(1 - d / 14, 1.5) : 0;
  const hill = wall * wall * 0.06 + wall * 0.5;
  return rolling * floodplain + hill + channel;
}

export interface Terrain {
  group: Group;
  ground: Mesh;
  heightAt: (x: number, z: number) => number;
}

export function createTerrain(segments = 160): Terrain {
  const w = WORLD.maxX - WORLD.minX;
  const d = WORLD.maxZ - WORLD.minZ;
  const geo = new PlaneGeometry(w, d, segments, Math.round((segments * d) / w));
  geo.rotateX(-Math.PI / 2);
  geo.translate((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();

  // PBR ground: moss / leaf litter / mud mixed by world-space noise and height (no texture files, so nothing to stream).
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const wp = positionWorld;
  const big = mx_noise_float(vec3(wp.x.mul(0.06), 0, wp.z.mul(0.06)));
  const fine = mx_noise_float(vec3(wp.x.mul(0.9), 0, wp.z.mul(0.9)));
  const moss = vec3(0.1, 0.19, 0.07);
  const litter = vec3(0.24, 0.17, 0.09);
  const mud = vec3(0.16, 0.12, 0.08);
  const base = mix(moss, litter, smoothstep(-0.2, 0.4, big));
  const wet = smoothstep(float(0.2), float(-1.2), wp.y);
  m.colorNode = mix(base, mud, wet).mul(float(0.85).add(fine.mul(0.3)));
  m.roughnessNode = mix(float(0.95), float(0.6), wet);

  const ground = new Mesh(geo, m);
  ground.receiveShadow = true;
  const water = new Mesh(
    new PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: new Color(0x2d4a45), roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.8, side: DoubleSide }),
  );
  water.position.set((WORLD.minX + WORLD.maxX) / 2, WATER_LEVEL, (WORLD.minZ + WORLD.maxZ) / 2);
  const group = new Group();
  group.add(ground, water);
  return { group, ground, heightAt: terrainHeight };
}
