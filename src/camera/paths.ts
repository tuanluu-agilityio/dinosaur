import { CatmullRomCurve3, Vector3 } from 'three';

/** Intro fly-through: low through the canopy, rise, reveal the valley. */
export const INTRO_DURATION = 9;

/**
 * Hell Creek canopy is 20-30 m; the closing keypoints end above it so the
 * valley reveal is seen from over the treetops.
 */
export const CANOPY_TOP = 30;
/**
 * No-tree corridor: the forest must keep every trunk at least this many metres
 * (horizontal) from the intro path's low opening segment (see `introCorridor`).
 */
export const INTRO_CORRIDOR_RADIUS = 4;

const positions = [
  new Vector3(-34, 1.8, 30),
  new Vector3(-22, 2.2, 18),
  new Vector3(-12, 3.0, 8),
  new Vector3(-4, 8.0, 2),
  new Vector3(4, 18.0, -2),
  new Vector3(10, 30.0, 4),
  new Vector3(12, 38.0, 14),
];
const targets = [
  new Vector3(-20, 2.5, 20),
  new Vector3(-8, 3.0, 8),
  new Vector3(0, 4.0, -2),
  new Vector3(6, 5.0, -14),
  new Vector3(8, 6.0, -26),
  new Vector3(4, 4.0, -34),
  new Vector3(0, 3.0, -30),
];

const posCurve = new CatmullRomCurve3(positions, false, 'catmullrom', 0.5);
const tgtCurve = new CatmullRomCurve3(targets, false, 'catmullrom', 0.5);

/** Ease-in-out on [0,1]. */
export const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function sampleIntro(u: number, outPos: Vector3, outTarget: Vector3): void {
  const e = smooth(u);
  posCurve.getPoint(e, outPos);
  tgtCurve.getPoint(e, outTarget);
}

/** Horizontal (x,z) samples of the path below or just above the canopy: trunks must stay `INTRO_CORRIDOR_RADIUS` clear of these. */
export function introCorridor(samples = 40): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= samples; i++) {
    sampleIntro(i / samples, p, t);
    if (p.y < CANOPY_TOP + 6) out.push([p.x, p.z]);
  }
  return out;
}
