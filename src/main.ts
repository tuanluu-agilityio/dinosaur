import {
  Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshStandardMaterial, DirectionalLight, AmbientLight,
} from 'three/webgpu';
import { createRenderer, startLoop } from './core/renderer';
import { detectTier, readDeviceCaps, FpsGovernor } from './core/quality';

async function main() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const { renderer, isWebGPU } = await createRenderer(canvas);
  const caps = { ...readDeviceCaps(), webgpu: isWebGPU };
  let tier = detectTier(caps);
  const governor = new FpsGovernor({ downgradeBelow: 28, windowSec: 3 }, tier);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2.5, 2, 3.5);
  camera.lookAt(0, 0, 0);
  const cube = new Mesh(new BoxGeometry(1.5, 1.5, 1.5), new MeshStandardMaterial({ color: 0x4caf50, roughness: 0.6 }));
  scene.add(cube, new AmbientLight(0xffffff, 0.4));
  const sun = new DirectionalLight(0xfff2cc, 3);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const overlay = document.getElementById('dev-overlay');
  const show = () => {
    if (!overlay || !import.meta.env.DEV && !location.pathname.includes('/dev/')) return;
    overlay.hidden = false;
    overlay.textContent = `tier: ${tier} | backend: ${isWebGPU ? 'webgpu' : 'webgl2'}`;
  };
  show();

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  startLoop((dt) => {
    cube.rotation.y += dt * 0.6;
    const next = governor.sample(dt * 1000);
    if (next) { tier = next; show(); }
    renderer.render(scene, camera);
  });
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => { console.error(e); });
