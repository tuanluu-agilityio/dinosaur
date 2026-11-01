// Forest-air particles: dust motes, cycad/conifer pollen and small insects as camera-facing billboards.
// One instanced draw call; every particle's kind, home, drift and flicker come from hash(instanceIndex)
// and `time` in TSL, so the CPU never touches a particle. The count is BUDGETS[tier].particles and is
// changed by setting geometry.instanceCount (no rebuild, no recompile). Vertex-only work: no compute
// nodes, so the WebGL2 fallback runs the same material.
// Technique after holtsetio/aurelia src/plankton.js @724aba26 (MIT): hashed instance positions,
// noise drift, camera-relative wrapping, flicker from triNoise3D, camera-facing quads.
import {
  InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, NormalBlending, PlaneGeometry,
} from 'three/webgpu';
import {
  cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, Fn, hash, instanceIndex, mix, mx_noise_vec3,
  positionGeometry, sin, smoothstep, step, time, triNoise3D, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

const TAU = Math.PI * 2;

export interface ParticleOptions {
  /** Shared "towards the sun" uniform from Lighting. */
  sunDir: Node<'vec3'>;
  /** Horizontal size (m) of the box that wraps around the camera. */
  boxXZ?: number;
  /** Height (m) of the particle layer above the forest floor (y = 0). */
  height?: number;
}

/** Share of each kind; the rest is dust. */
const INSECT_SHARE = 0.05;
const POLLEN_SHARE = 0.25;

export class Particles {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private _count = 0;

  constructor(count: number, opts: ParticleOptions) {
    const boxXZ = uniform(opts.boxXZ ?? 44);
    const height = uniform(opts.height ?? 12);
    const sunDir = opts.sunDir;

    this.geometry = new InstancedBufferGeometry().copy(new PlaneGeometry(1, 1) as unknown as InstancedBufferGeometry);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, fog: false });
    material.name = 'atmosphere.particles';

    const vColor = varying(vec3(0), 'vParticleColor');
    const vAlpha = varying(float(0), 'vParticleAlpha');

    material.vertexNode = Fn(() => {
      const id = instanceIndex.mul(7);
      const kindHash = hash(id.add(3));
      const insect = step(kindHash, INSECT_SHARE);
      const pollen = step(kindHash, INSECT_SHARE + POLLEN_SHARE).sub(insect);
      const dust = float(1).sub(insect).sub(pollen);
      const phase = hash(id.add(4)).mul(TAU);

      // Home position in a box [0, boxXZ) x [0, height) x [0, boxXZ).
      const p = vec3(hash(id), hash(id.add(1)), hash(id.add(2))).mul(vec3(boxXZ, height, boxXZ)).toVar();
      // Shared slow air movement: low-frequency noise field plus a light breeze along +x.
      const air = mx_noise_vec3(vec3(p.xz.mul(0.06), time.mul(0.04).add(hash(id.add(5))))).toVar();
      p.addAssign(air.mul(vec3(2.2, 0.8, 2.2)));
      // Dust sinks and rises with eddies; pollen rides the breeze downwind; insects loop fast around home.
      p.y.addAssign(sin(time.mul(0.11).add(phase)).mul(dust).mul(0.5));
      p.x.addAssign(time.mul(0.35).mul(pollen));
      p.y.addAssign(time.mul(-0.03).mul(pollen));
      const loopRate = mix(1.6, 3.4, hash(id.add(6)));
      const loop = vec3(
        sin(time.mul(loopRate).add(phase)),
        sin(time.mul(loopRate.mul(1.37)).add(phase.mul(2))).mul(0.4),
        sin(time.mul(loopRate.mul(0.71)).add(phase.add(1.3))),
      ).mul(0.7);
      p.addAssign(loop.mul(insect));

      // Wrap x/z around the camera and y into [0, height) so the cloud follows the camera forever.
      const rel = p.xz.sub(cameraPosition.xz).div(boxXZ).add(0.5);
      p.x.assign(rel.x.fract().sub(0.5).mul(boxXZ).add(cameraPosition.x));
      p.z.assign(rel.y.fract().sub(0.5).mul(boxXZ).add(cameraPosition.z));
      p.y.assign(p.y.div(height).fract().mul(height));

      // Fade at the wrap seams, near the camera (no big blobs in the lens) and with distance.
      const toCam = p.sub(cameraPosition);
      const dist = toCam.length();
      const horiz = vec2(toCam.x, toCam.z).length();
      const seam = float(1).sub(smoothstep(boxXZ.mul(0.32), boxXZ.mul(0.5), horiz));
      const vertical = smoothstep(0.0, 0.6, p.y).mul(float(1).sub(smoothstep(height.sub(1.5), height, p.y)));
      const near = smoothstep(0.4, 1.6, dist);

      // Forward scattering: motes light up when you look towards the sun through them.
      const view = toCam.div(dist.max(0.001)).negate(); // particle -> camera
      const forward = view.dot(sunDir).negate().max(0).pow(6); // camera looks along -view
      const glow = mix(0.35, 1.6, forward);

      const flicker = triNoise3D(vec3(float(instanceIndex).mul(0.013), 13.12, 13.37), 0.5, time);
      const wing = sin(time.mul(23).add(phase)).mul(0.25).add(0.75);
      const kindAlpha = dust.mul(flicker.mul(0.55)).add(pollen.mul(0.7)).add(insect.mul(wing).mul(0.85));
      vAlpha.assign(kindAlpha.mul(seam).mul(vertical).mul(near));

      const dustColor = vec3(1.0, 0.93, 0.78).mul(glow);
      const pollenColor = vec3(0.95, 0.82, 0.38).mul(glow.mul(0.8).add(0.2));
      const insectColor = vec3(0.07, 0.06, 0.05);
      vColor.assign(dustColor.mul(dust).add(pollenColor.mul(pollen)).add(insectColor.mul(insect)));

      // Size (m): dust 2-4 cm, pollen 4-7 cm, insects 2.5-4 cm.
      const size = dust.mul(mix(0.02, 0.04, hash(id.add(6))))
        .add(pollen.mul(mix(0.04, 0.07, hash(id.add(6)))))
        .add(insect.mul(mix(0.025, 0.04, hash(id.add(6)))));
      // Camera-facing quad: offset the corner in view space, then project.
      const viewPos = cameraViewMatrix.mul(vec4(p, 1));
      return cameraProjectionMatrix.mul(viewPos.add(vec4(positionGeometry.xy.mul(size), 0, 0)));
    })();

    material.colorNode = vColor;
    material.opacityNode = Fn(() => {
      const d = uv().mul(2).sub(1).length();
      return float(1).sub(d).max(0).pow(1.5).mul(vAlpha);
    })();

    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = 'atmosphere.particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100;
    this.setCount(count);
  }

  get count(): number {
    return this._count;
  }

  /** Instances drawn this frame. */
  get drawn(): number {
    return this.mesh.visible ? this.geometry.instanceCount : 0;
  }

  setCount(n: number): void {
    this._count = Math.max(0, Math.floor(n));
    this.geometry.instanceCount = this._count;
    this.mesh.visible = this._count > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
