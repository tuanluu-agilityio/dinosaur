import { MathUtils, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { INTRO_DURATION, sampleIntro, smooth } from './paths';

export type DirectorState = 'intro' | 'forest' | 'flying' | 'closeup';

const FLIGHT_SEC = 1.6;
const YAW_MAX = MathUtils.degToRad(60);
const PITCH_MIN = MathUtils.degToRad(-10);
const PITCH_MAX = MathUtils.degToRad(20);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

interface Flight {
  t: number;
  fromPos: Vector3;
  toPos: Vector3;
  fromQuat: Quaternion;
  toQuat: Quaternion;
  done: () => void;
}

export class CameraDirector {
  private _state: DirectorState = 'forest';
  readonly controls: OrbitControls;
  readonly introDuration: number;
  private yaw = 0;
  private pitch = 0;
  private forestPos = new Vector3();
  private forestQuat = new Quaternion();
  private introT = 0;
  private introDone: (() => void) | null = null;
  private introPromise: Promise<void> | null = null;
  private flight: Flight | null = null;
  private flightPromise: Promise<void> | null = null;
  private flightEnd: (() => void) | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private tmpA = new Vector3();
  private tmpB = new Vector3();

  constructor(
    private camera: PerspectiveCamera,
    private dom: HTMLElement,
    introDuration = INTRO_DURATION,
  ) {
    this.introDuration = introDuration;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.capturePose();
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
  }

  get state(): DirectorState {
    return this._state;
  }

  /** Current forest look offset in radians. */
  get look(): { yaw: number; pitch: number } {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  private capturePose(): void {
    this.forestPos.copy(this.camera.position);
    this.forestQuat.copy(this.camera.quaternion);
    this.yaw = 0;
    this.pitch = 0;
  }

  playIntro(): Promise<void> {
    if (this.introPromise) return this.introPromise;
    this._state = 'intro';
    this.introT = 0;
    this.applyIntro(0);
    this.introPromise = new Promise<void>((r) => (this.introDone = r));
    return this.introPromise;
  }

  skipIntro(): void {
    if (this._state !== 'intro') return;
    this.applyIntro(1);
    this.finishIntro();
  }

  private applyIntro(u: number): void {
    sampleIntro(u, this.tmpA, this.tmpB);
    this.camera.position.copy(this.tmpA);
    this.camera.lookAt(this.tmpB);
  }

  private finishIntro(): void {
    this.capturePose();
    this._state = 'forest';
    const done = this.introDone;
    this.introDone = null;
    this.introPromise = null;
    done?.();
  }

  /** Apply a drag in forest state (radians). Clamped; no translation. */
  lookBy(dyaw: number, dpitch: number): void {
    if (this.state !== 'forest') return;
    this.yaw = MathUtils.clamp(this.yaw + dyaw, -YAW_MAX, YAW_MAX);
    this.pitch = MathUtils.clamp(this.pitch + dpitch, PITCH_MIN, PITCH_MAX);
    const qy = new Quaternion().setFromAxisAngle(AXIS_Y, this.yaw);
    const qp = new Quaternion().setFromAxisAngle(AXIS_X, this.pitch);
    this.camera.position.copy(this.forestPos);
    this.camera.quaternion.copy(qy).multiply(this.forestQuat).multiply(qp);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.state !== 'forest') return;
    this.dragging = true;
    this.dom.setPointerCapture?.(e.pointerId);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || this.state !== 'forest') return;
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      this.dragging = false;
      return;
    }
    const h = this.dom.clientHeight || 1;
    const k = MathUtils.degToRad(this.camera.fov) / h;
    this.lookBy(-(e.clientX - this.lastX) * k, -(e.clientY - this.lastY) * k);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onUp = (): void => {
    this.dragging = false;
  };

  private fly(toPos: Vector3, toQuat: Quaternion, onEnd: () => void): Promise<void> {
    this.controls.enabled = false;
    this._state = 'flying';
    let done!: () => void;
    const promise = new Promise<void>((r) => (done = r));
    this.flight = {
      t: 0,
      fromPos: this.camera.position.clone(),
      toPos,
      fromQuat: this.camera.quaternion.clone(),
      toQuat,
      done,
    };
    this.flightPromise = promise;
    this.flightEnd = onEnd;
    return promise;
  }

  /** Framing distance: 2.5r on desktop; widened when the horizontal FOV is the limiting one. */
  private fitDistance(radius: number): number {
    const tv = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const hfov = 2 * Math.atan(tv * this.camera.aspect);
    const widen = Math.max(1, tv / Math.tan(hfov / 2));
    return MathUtils.clamp(radius * 2.5 * widen, radius * 1.2, radius * 4);
  }

  focus(target: Object3D, radius: number): Promise<void> {
    if (this._state === 'intro') this.skipIntro();
    if (this._state === 'flying' && this.flightPromise) return this.flightPromise;
    const center = target.getWorldPosition(new Vector3());
    const dir = this.camera.position.clone().sub(center);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    dir.y = Math.max(dir.y, 0.25); // approach from slightly above the ground
    dir.normalize();
    const toPos = center.clone().addScaledVector(dir, this.fitDistance(radius));
    const m = new Matrix4().lookAt(toPos, center, AXIS_Y);
    const toQuat = new Quaternion().setFromRotationMatrix(m);
    return this.fly(toPos, toQuat, () => {
      const c = this.controls;
      c.target.copy(center);
      c.minDistance = radius * 1.2;
      c.maxDistance = radius * 4;
      c.minPolarAngle = 0.15;
      c.maxPolarAngle = Math.PI / 2 - 0.05;
      c.enabled = true;
      c.update();
      this._state = 'closeup';
    });
  }

  returnToForest(): Promise<void> {
    if (this._state === 'flying' && this.flightPromise) return this.flightPromise;
    if (this._state === 'forest' || this._state === 'intro') return Promise.resolve();
    return this.fly(this.forestPos.clone(), this.forestQuat.clone(), () => {
      this.yaw = 0;
      this.pitch = 0;
      this._state = 'forest';
    });
  }

  update(dt: number): void {
    if (this._state === 'intro') {
      this.introT += dt;
      const u = Math.min(1, this.introT / this.introDuration);
      this.applyIntro(u);
      if (u >= 1) this.finishIntro();
    } else if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const e = smooth(f.t / FLIGHT_SEC);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      this.camera.quaternion.slerpQuaternions(f.fromQuat, f.toQuat, e);
      if (f.t >= FLIGHT_SEC) {
        this.camera.position.copy(f.toPos);
        this.camera.quaternion.copy(f.toQuat);
        this.flight = null;
        this.flightPromise = null;
        const end = this.flightEnd;
        this.flightEnd = null;
        end?.();
        f.done();
      }
    } else if (this._state === 'closeup') {
      this.controls.update();
    }
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onDown);
    this.dom.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('pointercancel', this.onUp);
    this.controls.dispose();
  }
}
