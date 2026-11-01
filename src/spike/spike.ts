// P2-T01 performance spike: instanced fern patch with TSL wind, GPU-driven air particles and the
// T. rex candidate GLB playing one clip. Counts come from BUDGETS[tier]; URL params override them so
// tests/e2e/perf.spec.ts can binary-search budgets. Dev page only (dev/spike.html).
// Particle technique after holtsetio/aurelia src/plankton.js @724aba26 (MIT): hash + noise of instanceIndex/time in TSL.
import {
  AdditiveBlending, AmbientLight, AnimationMixer, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide,
  Fog, HemisphereLight, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, MeshStandardMaterial,
  MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, type Object3D,
} from 'three/webgpu';
import {
  billboarding, float, hash, instanceIndex, mix, mx_noise_vec3, positionLocal, smoothstep, sin, time, triNoise3D,
  uniform, uv, varying, vec3, vec4, Fn,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createRenderer, startLoop } from '../core/renderer';
import { BUDGETS } from '../core/budgets';
import type { QualityTier } from '../core/quality';

const TAU = Math.PI * 2;
const PATCH_RADIUS = 30; // metres; fern patch is a disc around the dinosaur
const MAX_FRAMES = 32768; // frame-time buffer: 10 s uncapped (vsync off in perf.spec.ts) at up to ~3 kHz

export interface SpikeConfig {
  tier: QualityTier;
  ferns: number;
  particles: number;
  shadows: boolean;
  dinoVariant: 'low' | 'high';
  trex: boolean;
}

export function readConfig(search: string): SpikeConfig {
  const q = new URLSearchParams(search);
  const t = q.get('tier');
  const tier: QualityTier = t === 'low' || t === 'medium' || t === 'high' ? t : 'high';
  const b = BUDGETS[tier];
  const num = (k: string, d: number) => {
    const v = q.get(k);
    return v !== null && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d;
  };
  const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) !== '0' : d);
  const v = q.get('variant');
  return {
    tier,
    ferns: num('ferns', b.ferns),
    particles: num('particles', b.particles),
    shadows: flag('shadows', b.shadows),
    dinoVariant: v === 'low' || v === 'high' ? v : b.dinoVariant,
    trex: flag('trex', true),
  };
}

/** One fern = FRONDS arching strips of SEGMENTS quads. uv.x across the frond, uv.y from base (0) to tip (1). */
function fernGeometry(fronds = 8, segments = 6): BufferGeometry {
  const vertsPerFrond = (segments + 1) * 2;
  const pos = new Float32Array(fronds * vertsPerFrond * 3);
  const nrm = new Float32Array(fronds * vertsPerFrond * 3);
  const uvs = new Float32Array(fronds * vertsPerFrond * 2);
  const idx: number[] = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * TAU + (f % 2) * 0.3;
    const len = 1 - (f % 3) * 0.12;
    const dx = Math.cos(a), dz = Math.sin(a);
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const out = len * t * 0.95;
      const up = len * (1.1 * t - 0.85 * t * t) + 0.05;
      const w = 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - 0.3 * t);
      for (let side = 0; side < 2; side++) {
        const i = f * vertsPerFrond + s * 2 + side;
        const sgn = side === 0 ? -1 : 1;
        pos[i * 3] = dx * out - dz * w * sgn;
        pos[i * 3 + 1] = up;
        pos[i * 3 + 2] = dz * out + dx * w * sgn;
        nrm[i * 3 + 1] = 1; // up-facing normals stay valid under the per-instance Y rotation
        uvs[i * 2] = side;
        uvs[i * 2 + 1] = t;
      }
      if (s < segments) {
        const b = f * vertsPerFrond + s * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Instanced fern patch: placement, scale, yaw and wind all computed in TSL from instanceIndex + time. */
function createFerns(count: number, shadows: boolean): Mesh {
  const geometry = new InstancedBufferGeometry().copy(fernGeometry() as unknown as InstancedBufferGeometry);
  geometry.instanceCount = count;
  const radius = uniform(PATCH_RADIUS);
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  const vShade = varying(float(0), 'vFernShade');

  material.positionNode = Fn(() => {
    const id = instanceIndex.mul(5);
    const r = hash(id).sqrt().mul(radius).add(1.5);
    const ang = hash(id.add(1)).mul(TAU);
    const base = vec3(ang.cos().mul(r), 0, ang.sin().mul(r));
    const scale = mix(0.8, 1.7, hash(id.add(2)));
    const yaw = hash(id.add(3)).mul(TAU);
    vShade.assign(hash(id.add(4)));
    const p = positionLocal.mul(scale);
    const c = yaw.cos(), s = yaw.sin();
    const rotated = vec3(p.x.mul(c).sub(p.z.mul(s)), p.y, p.x.mul(s).add(p.z.mul(c)));
    // Wind: low-frequency gusts from noise(base.xz * 0.1 + time), plus a small per-frond flutter.
    const tip = uv().y.mul(uv().y);
    const gust = mx_noise_vec3(vec3(base.xz.mul(0.1).add(time.mul(0.3)), time.mul(0.15)));
    const flutter = sin(time.mul(3.1).add(hash(id.add(4)).mul(TAU)).add(uv().y.mul(4))).mul(0.025);
    const sway = vec3(gust.x.add(flutter), gust.z.mul(0.2), gust.y.add(flutter)).mul(tip.mul(scale).mul(0.22));
    return rotated.add(base).add(sway);
  })();

  // Pinnate leaflets cut out of each strip with alpha test.
  const leaflets = Fn(() => {
    const across = uv().x.mul(2).sub(1).abs();
    const lobe = uv().y.mul(22).fract();
    const edge = float(1).sub(lobe.mul(0.75)).mul(smoothstep(0, 0.12, uv().y));
    return float(1).sub(smoothstep(edge.sub(0.05), edge, across));
  })();
  material.opacityNode = leaflets;
  material.alphaTest = 0.5;
  const dark = vec3(0.07, 0.16, 0.05);
  const light = vec3(0.2, 0.36, 0.11);
  material.colorNode = vec4(mix(dark, light, uv().y.mul(0.6).add(vShade.mul(0.4))), 1);

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

/** Air particles (spores/dust) as camera-facing billboards, Aurelia plankton-style. */
function createParticles(count: number): Mesh {
  const geometry = new InstancedBufferGeometry().copy(new PlaneGeometry(0.05, 0.05) as unknown as InstancedBufferGeometry);
  geometry.instanceCount = count;
  const box = vec3(70, 14, 70);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: true });
  const flicker = varying(float(0), 'vFlicker');
  material.vertexNode = Fn(() => {
    const id = instanceIndex.mul(4);
    const p = vec3(hash(id), hash(id.add(1)), hash(id.add(2))).sub(vec3(0.5, 0, 0.5)).mul(box).toVar();
    p.addAssign(mx_noise_vec3(vec3(p.xz.mul(0.05), time.mul(0.05))).mul(vec3(2.5, 1.0, 2.5)));
    p.y.addAssign(time.mul(0.05).add(hash(id.add(3))).fract().mul(0.6));
    flicker.assign(triNoise3D(vec3(float(instanceIndex), 13.12, 13.37), 0.5, time));
    positionLocal.xy.mulAssign(hash(id.add(3)).mul(0.8).add(0.6));
    return billboarding({ position: p, horizontal: true, vertical: true });
  })();
  material.colorNode = vec3(1.0, 0.92, 0.7);
  material.opacityNode = Fn(() => {
    const d = uv().mul(2).sub(1).length();
    return float(1).sub(d).max(0).pow(2).mul(flicker).mul(0.6);
  })();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  return mesh;
}

async function loadTrex(
  renderer: Awaited<ReturnType<typeof createRenderer>>['renderer'],
  variant: 'low' | 'high',
  shadows: boolean,
): Promise<{ root: Object3D; mixer: AnimationMixer } | null> {
  const url = new URLSearchParams(location.search).get('model') ??
    `${import.meta.env.BASE_URL}assets/src/tyrannosaurus/out/tyrannosaurus.${variant}.glb`;
  const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}node_modules/three/examples/jsm/libs/basis/`);
  ktx2.detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.scale.setScalar(3.6); // candidate is ~3.3 m long; adult T. rex ~12 m
    root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = shadows; m.frustumCulled = false; }
    });
    const mixer = new AnimationMixer(root);
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play();
    return { root, mixer };
  } catch (e) {
    console.warn(`spike: T. rex model not loaded (${url}); run the asset pipeline to measure with it`, e);
    return null;
  } finally {
    ktx2.dispose();
  }
}

interface SpikeApi {
  ready: boolean;
  config: SpikeConfig;
  trexLoaded: boolean;
  backend: 'webgpu' | 'webgl2';
  adapter: string;
  begin(): void;
  end(): number[];
}

declare global {
  interface Window { __spike?: SpikeApi }
}

async function main() {
  const config = readConfig(location.search);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const { renderer, isWebGPU } = await createRenderer(canvas);
  renderer.shadowMap.enabled = config.shadows;

  let adapter = 'unknown';
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: Record<string, string> } | null> } }).gpu;
    const info = (await gpu?.requestAdapter())?.info;
    if (info) adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') || 'unknown';
  } catch { /* adapter info is diagnostic only */ }

  const scene = new Scene();
  const sky = new Color(0x9fb3a6);
  scene.background = sky;
  scene.fog = new Fog(sky, 25, 90);
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);

  scene.add(new HemisphereLight(0xcfe3d0, 0x3b3022, 1.2), new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(20, 30, 10);
  if (config.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -25; cam.right = 25; cam.top = 25; cam.bottom = -25; cam.near = 1; cam.far = 80;
  }
  scene.add(sun);

  const ground = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ color: 0x3a2f20, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = config.shadows;
  scene.add(ground);

  if (config.ferns > 0) scene.add(createFerns(config.ferns, config.shadows));
  if (config.particles > 0) scene.add(createParticles(config.particles));

  const trex = config.trex ? await loadTrex(renderer, config.dinoVariant, config.shadows) : null;
  if (trex) scene.add(trex.root);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const overlay = document.getElementById('dev-overlay');
  const label = `tier: ${config.tier} | ferns ${config.ferns} | particles ${config.particles} | shadows ${config.shadows ? 'on' : 'off'} | trex ${trex ? config.dinoVariant : 'none'} | ${isWebGPU ? 'webgpu' : 'webgl2'}`;
  if (overlay) { overlay.hidden = false; overlay.textContent = label; }

  // Frame-time recording into a preallocated buffer: no allocation in the loop.
  const frames = new Float64Array(MAX_FRAMES);
  let count = 0;
  let recording = false;
  let elapsed = 0;
  let lastNow = performance.now();

  camera.position.set(16, 3.2, 0);
  camera.lookAt(0, 2.2, 0);
  await renderer.compileAsync(scene, camera);

  startLoop((dt) => {
    elapsed += dt;
    // Raw interval: startLoop clamps dt to 100 ms, which would hide long hitches (rubric P3).
    const now = performance.now();
    if (recording && count < MAX_FRAMES) frames[count++] = now - lastNow;
    lastNow = now;
    // Slow deterministic orbit so the measured frames include view changes.
    const a = elapsed * 0.08;
    camera.position.set(Math.cos(a) * 16, 3.2, Math.sin(a) * 16);
    camera.lookAt(0, 2.2, 0);
    trex?.mixer.update(dt);
    renderer.render(scene, camera);
  });

  window.__spike = {
    ready: true,
    config,
    trexLoaded: trex !== null,
    backend: isWebGPU ? 'webgpu' : 'webgl2',
    adapter,
    begin() { count = 0; lastNow = performance.now(); recording = true; },
    end() { recording = false; return Array.from(frames.subarray(0, count)); },
  };
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => { console.error(e); });
