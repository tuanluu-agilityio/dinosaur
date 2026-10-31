import { WebGPURenderer } from 'three/webgpu';

let current: WebGPURenderer | null = null;

export async function createRenderer(
  canvas: HTMLCanvasElement,
): Promise<{ renderer: WebGPURenderer; isWebGPU: boolean }> {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
  await renderer.init();
  current = renderer;
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return { renderer, isWebGPU: backend.isWebGPUBackend === true };
}

/** Runs update(dtSec) every frame via renderer.setAnimationLoop. Returns a stop function. */
export function startLoop(update: (dtSec: number) => void): () => void {
  const r = current;
  if (!r) throw new Error('startLoop called before createRenderer');
  let last = performance.now();
  r.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    update(dt);
  });
  return () => r.setAnimationLoop(null);
}
