import { CatmullRomCurve3, Vector3 } from 'three';

/** Intro fly-through: low through the canopy, rise, reveal the valley. */
export const INTRO_DURATION = 9;

const positions = [
  new Vector3(-34, 1.8, 30),
  new Vector3(-22, 2.2, 18),
  new Vector3(-12, 3.0, 8),
  new Vector3(-4, 5.5, 2),
  new Vector3(4, 9.0, -2),
  new Vector3(10, 13.0, 4),
  new Vector3(12, 14.5, 14),
];
const targets = [
  new Vector3(-20, 2.5, 20),
  new Vector3(-8, 3.0, 8),
  new Vector3(0, 4.0, -2),
  new Vector3(6, 5.0, -14),
  new Vector3(8, 4.0, -26),
  new Vector3(4, 2.0, -30),
  new Vector3(0, 1.5, -22),
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
