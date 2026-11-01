// Godrays: soft light shafts slanting from canopy gaps down along the low sun's direction.
// Each shaft is one instanced quad stretched along the light ray and turned about that axis to face the
// camera (cylindrical billboard). Anchor, width and shimmer come from hash(instanceIndex) + `time` in
// TSL; the anchors wrap around the camera so shafts are always nearby. Opacity rises when looking
// towards the sun, fades with distance (matched to the height fog) and near the lens.
// High tier only (BUDGETS[tier].godrays). Vertex/fragment only: no compute nodes.
// Technique after holtsetio/aurelia src/godrays.js + src/background.js @724aba26 (MIT): translucent
// shaft geometry offset along lightDir, density by view angle and distance, no depth write.
import { AdditiveBlending, DoubleSide, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu';
import {
  cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, Fn, hash, instanceIndex, mix, positionLocal,
  sin, smoothstep, time, uniform, varying, vec3, vec4,
} from 'three/tsl';
import type { Color, Node } from 'three/webgpu';

const TAU = Math.PI * 2;
const FADE_SEC = 1.2;

export interface GodrayOptions {
  /** Shared "towards the sun" uniform from Lighting. */
  sunDir: Node<'vec3'>;
  sunColor: Color;
  /** Number of shafts in the wrap box. A visual density constant, not a quality knob: the whole effect is on/off per tier. */
  shafts?: number;
  /** Canopy height (m) where shafts start. */
  canopyHeight?: number;
  /** Horizontal size (m) of the box that wraps around the camera. */
  boxXZ?: number;
  /** Distance (m) where shafts are fully faded; match the fog. */
  fadeFar?: number;
}

export class Godrays {
  readonly mesh: Mesh;
  readonly shafts: number;
  /** 0..1 master intensity; tier switches fade it instead of popping the shafts. */
  private readonly intensity = uniform(1);
  private target = 1;

  constructor(opts: GodrayOptions) {
    this.shafts = opts.shafts ?? 36;
    const canopy = uniform(opts.canopyHeight ?? 22);
    const boxXZ = uniform(opts.boxXZ ?? 70);
    const fadeFar = uniform(opts.fadeFar ?? 70);
    const tint = uniform(opts.sunColor);
    const sunDir = opts.sunDir;

    const geometry = new InstancedBufferGeometry().copy(new PlaneGeometry(1, 1) as unknown as InstancedBufferGeometry);
    geometry.instanceCount = this.shafts;
    const material = new MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
    });
    material.name = 'atmosphere.godrays';

    const vAlong = varying(float(0), 'vShaftAlong');
    const vAcross = varying(float(0), 'vShaftAcross');
    const vStrength = varying(float(0), 'vShaftStrength');

    material.vertexNode = Fn(() => {
      const id = instanceIndex.mul(5);
      const ray = sunDir.negate().normalize(); // direction light travels (downwards)
      const length = canopy.div(ray.y.negate().max(0.05)).mul(1.1);
      // Anchor on the canopy plane, wrapped around the point the camera sees shafts reach the ground.
      const groundShift = vec3(ray.x, 0, ray.z).mul(length.mul(0.8));
      const centre = cameraPosition.sub(groundShift);
      const home = vec3(hash(id), 0, hash(id.add(1))).mul(boxXZ);
      const rel = home.xz.sub(centre.xz).div(boxXZ).add(0.5).fract().sub(0.5).mul(boxXZ);
      const anchor = vec3(rel.x.add(centre.x), canopy, rel.y.add(centre.z));

      const t = float(0.5).sub(positionLocal.y); // 0 at the canopy, 1 past the ground
      const width = mix(0.8, 3.2, hash(id.add(2)).pow(2));
      const axisPoint = anchor.add(ray.mul(length.mul(t)));
      // Turn about the shaft axis to face the camera.
      const toCam = cameraPosition.sub(axisPoint);
      const side = ray.cross(toCam).normalize();
      const world = axisPoint.add(side.mul(positionLocal.x.mul(width)));

      // Strength: forward scattering towards the sun, distance fade, near-lens fade, slow canopy sway.
      const viewDir = world.sub(cameraPosition).normalize();
      const forward = viewDir.dot(sunDir).max(0);
      const angle = mix(0.2, 1.0, forward.pow(2));
      const dist = toCam.length();
      const fade = float(1).sub(smoothstep(fadeFar.mul(0.35), fadeFar, dist)).mul(smoothstep(2.0, 7.0, dist));
      const sway = sin(time.mul(mix(0.15, 0.4, hash(id.add(3)))).add(hash(id.add(4)).mul(TAU))).mul(0.5).add(0.5);
      vStrength.assign(angle.mul(fade).mul(mix(0.35, 1.0, sway)).mul(mix(0.5, 1.0, hash(id.add(2)))));
      vAlong.assign(t);
      vAcross.assign(positionLocal.x.mul(2));
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world, 1));
    })();

    material.colorNode = tint;
    material.opacityNode = Fn(() => {
      const across = float(1).sub(vAcross.mul(vAcross)).max(0).pow(1.5);
      const along = smoothstep(0.0, 0.1, vAlong).mul(float(1).sub(smoothstep(0.82, 0.92, vAlong)));
      return across.mul(along).mul(vStrength).mul(this.intensity).mul(1.4);
    })();

    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'atmosphere.godrays';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 90;
  }

  /** On (or fading in). Off once a fade-out has started. */
  get enabled(): boolean {
    return this.target > 0;
  }

  /** A fade is running. */
  get transitioning(): boolean {
    return this.intensity.value !== this.target;
  }

  /** Fade in/out over FADE_SEC; `immediate` skips the fade (initial build). */
  setEnabled(on: boolean, immediate = false): void {
    this.target = on ? 1 : 0;
    if (immediate) this.intensity.value = this.target;
    this.mesh.visible = this.intensity.value > 0 || on;
  }

  /** Per frame. No allocation. */
  update(dt: number): void {
    const v = this.intensity.value;
    if (v === this.target) return;
    const step = dt / FADE_SEC;
    this.intensity.value = this.target > v ? Math.min(this.target, v + step) : Math.max(this.target, v - step);
    this.mesh.visible = this.intensity.value > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
