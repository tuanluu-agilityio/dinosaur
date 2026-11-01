// Hell Creek lighting: a low, warm morning sun (directional) plus a sky/ground hemisphere fill.
// Shadows follow BUDGETS[tier].shadows. The shadow frustum follows the camera focus and snaps to
// shadow-map texels so moving the camera does not make shadow edges shimmer.
// After holtsetio/aurelia src/lights.js @724aba26 (MIT): one directional + one hemisphere light,
// light direction shared with the fog/godray shaders as a uniform.
import { Color, DirectionalLight, HemisphereLight, Object3D, Vector3, type Scene, type WebGPURenderer } from 'three/webgpu';
import { uniform } from 'three/tsl';

/** Sun elevation above the horizon (deg). Low so shafts slant through the canopy. */
export const SUN_ELEVATION_DEG = 24;
/** Sun azimuth (deg, from +X towards +Z). */
export const SUN_AZIMUTH_DEG = 35;
const SHADOW_HALF_EXTENT = 30; // metres around the focus point
const SHADOW_MAP = 2048;
const SUN_DISTANCE = 80;

/** Unit vector pointing from the scene towards the sun. */
export function sunDirection(elevationDeg = SUN_ELEVATION_DEG, azimuthDeg = SUN_AZIMUTH_DEG, out = new Vector3()): Vector3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** Towards the sun, unit length. Shared by sky, fog, particles and godrays. */
  readonly sunDir = sunDirection();
  /** TSL uniform view of sunDir. */
  readonly sunDirNode = uniform(this.sunDir);
  readonly sunColor = new Color(0xffe2b8);
  readonly object = new Object3D();
  private _shadows = false;
  private readonly texel = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP;
  private readonly snapped = new Vector3();
  // Shadow-camera basis (sun never moves): x = up × sunDir, y = sunDir × x.
  private readonly lx = new Vector3(0, 1, 0).cross(this.sunDir).normalize();
  private readonly ly = this.sunDir.clone().cross(this.lx).normalize();

  constructor(private readonly renderer: WebGPURenderer, scene: Scene, shadows: boolean) {
    this.object.name = 'lighting';
    // Sky: hazy humid green-blue; ground bounce: dark leaf litter.
    this.hemi = new HemisphereLight(0xc9dccb, 0x3a2f1f, 1.1);
    this.sun = new DirectionalLight(this.sunColor, 2.8);
    this.sun.name = 'sun';
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_HALF_EXTENT; cam.right = SHADOW_HALF_EXTENT;
    cam.top = SHADOW_HALF_EXTENT; cam.bottom = -SHADOW_HALF_EXTENT;
    cam.near = 1; cam.far = SUN_DISTANCE * 2;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.object.add(this.hemi, this.sun, this.sun.target);
    scene.add(this.object);
    this.setShadows(shadows);
    this.update(this.snapped);
  }

  get shadows(): boolean {
    return this._shadows;
  }

  /** Changing this recompiles lit materials once; the quality governor only does it on downgrade. */
  setShadows(on: boolean): void {
    this._shadows = on;
    this.sun.castShadow = on;
    this.renderer.shadowMap.enabled = on;
  }

  /** Keep the sun (and its shadow frustum) centred on `focus`. No allocation. */
  update(focus: Vector3): void {
    // Snap the focus to whole shadow texels in the light's view plane; slide freely along the light ray.
    const s = this.texel;
    const x = Math.round(focus.dot(this.lx) / s) * s;
    const y = Math.round(focus.dot(this.ly) / s) * s;
    const z = focus.dot(this.sunDir);
    this.snapped.copy(this.lx).multiplyScalar(x).addScaledVector(this.ly, y).addScaledVector(this.sunDir, z);
    this.sun.target.position.copy(this.snapped);
    this.sun.position.copy(this.sunDir).multiplyScalar(SUN_DISTANCE).add(this.snapped);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.sun.shadow.dispose();
    this.object.removeFromParent();
  }
}
