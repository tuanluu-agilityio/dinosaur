import { describe, it, expect } from 'vitest';
import { Object3D, PerspectiveCamera, MathUtils } from 'three';
import { CameraDirector } from '../../src/camera/director';

function fakeDom(): HTMLElement {
  const doc = { addEventListener: () => {}, removeEventListener: () => {} };
  return {
    style: {},
    clientHeight: 800,
    clientWidth: 1200,
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getRootNode: () => doc,
    ownerDocument: doc,
  } as unknown as HTMLElement;
}
function make() {
  const cam = new PerspectiveCamera(60, 1.5, 0.1, 500);
  cam.position.set(0, 2, 20);
  const d = new CameraDirector(cam, fakeDom());
  return { cam, d };
}
// Fake clock: tests drive update(dt) directly.
function run(d: CameraDirector, sec: number, step = 0.1) {
  for (let t = 0; t < sec - 1e-9; t += step) d.update(step);
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CameraDirector', () => {
  it('intro resolves after 9 s and goes intro -> forest', async () => {
    const { d } = make();
    let resolved = false;
    const p = d.playIntro().then(() => (resolved = true));
    expect(d.state).toBe('intro');
    run(d, 8.5);
    await flush();
    expect(resolved).toBe(false);
    run(d, 0.6);
    await p;
    expect(d.state).toBe('forest');
  });

  it('skipIntro resolves immediately', async () => {
    const { d } = make();
    const p = d.playIntro();
    d.skipIntro();
    await p;
    expect(d.state).toBe('forest');
  });

  it('focus ends in closeup with orbit limits; ignored while flying', async () => {
    const { d } = make();
    const obj = new Object3D();
    obj.position.set(3, 1, -4);
    const p1 = d.focus(obj, 5);
    expect(d.state).toBe('flying');
    const p2 = d.focus(new Object3D(), 99);
    expect(p2).toBe(p1);
    run(d, 1.7);
    await p1;
    expect(d.state).toBe('closeup');
    expect(d.controls.enabled).toBe(true);
    expect(d.controls.target.toArray()).toEqual([3, 1, -4]);
    expect(d.controls.minDistance).toBeCloseTo(6);
    expect(d.controls.maxDistance).toBeCloseTo(20);
    expect(d.controls.maxPolarAngle).toBeLessThan(Math.PI / 2);
  });

  it('returnToForest restores the forest pose', async () => {
    const { d, cam } = make();
    const pos = cam.position.clone();
    const q = cam.quaternion.clone();
    const f = d.focus(new Object3D(), 4);
    run(d, 1.7);
    await f;
    const r = d.returnToForest();
    run(d, 1.7);
    await r;
    expect(d.state).toBe('forest');
    expect(d.controls.enabled).toBe(false);
    expect(cam.position.distanceTo(pos)).toBeLessThan(1e-6);
    expect(cam.quaternion.angleTo(q)).toBeLessThan(1e-6);
  });

  it('forest look is clamped and never translates', () => {
    const { d, cam } = make();
    const pos = cam.position.clone();
    d.lookBy(MathUtils.degToRad(500), MathUtils.degToRad(500));
    expect(d.look.yaw).toBeCloseTo(MathUtils.degToRad(60));
    expect(d.look.pitch).toBeCloseTo(MathUtils.degToRad(20));
    d.lookBy(MathUtils.degToRad(-1000), MathUtils.degToRad(-1000));
    expect(d.look.yaw).toBeCloseTo(MathUtils.degToRad(-60));
    expect(d.look.pitch).toBeCloseTo(MathUtils.degToRad(-10));
    expect(cam.position.distanceTo(pos)).toBe(0);
  });
});
