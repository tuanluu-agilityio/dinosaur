// GPU wind for vegetation. Offset = bend weight (uv.y^2 style) x noise(worldXZ * 0.08 + time * 0.4) x strength.
// Technique after holtsetio/aurelia src/common/noise.js @724aba26 (MIT): low-frequency noise advected by time in TSL.
import { mx_noise_vec3, time, vec3 } from 'three/tsl';

/**
 * World-space wind displacement. `worldXZ` is a vec2 node of the vertex's world x/z, `bend` a float node in
 * [0,1] (0 = rooted, 1 = free tip; callers pass height-fraction squared), `strength` metres of sway at bend = 1.
 * The noise is sampled at the world position, so neighbouring plants move out of phase (gusts travel).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function windOffset(worldXZ: any, bend: any, strength: any): any {
  const n = mx_noise_vec3(vec3(worldXZ.mul(0.08).add(time.mul(0.4)), time.mul(0.2)));
  return vec3(n.x, n.z.mul(0.15), n.y).mul(bend).mul(strength);
}
