// Composes the whole experience: renderer, world, atmosphere, dinosaurs, camera director, panel, narration and ambient audio.
import { Scene, PerspectiveCamera, Vector2, Vector3, Quaternion, ACESFilmicToneMapping, type WebGPURenderer } from 'three/webgpu';
import { sampleIntro } from '../camera/paths';
import { createRenderer, startLoop } from '../core/renderer';
import { detectTier, readDeviceCaps, type QualityTier } from '../core/quality';
import { QualityRuntime, installQualityProbe, qualityParams } from './quality-runtime';
import { createTerrain } from '../world/terrain';
import { createVegetation, type Vegetation } from '../world/vegetation';
import { Atmosphere } from '../world/atmosphere';
import type { Dino } from '../dinos/dino';
import { DinoWorld } from '../dinos/world';
import { CameraDirector } from '../camera/director';
import { InfoPanel } from '../ui/panel';
import { Controls } from '../ui/controls';
import { Credits } from '../ui/credits';
import { Narrator } from '../audio/narrator';
import { validateManifest } from '../assets/manifest';
import type { ContentStore } from './loader';
import type { SpeciesContent, SpeciesId } from '../content/schema';
import { getLang, onLangChange, t } from '../i18n/i18n';
import manifestJson from '../../assets/manifest.json';

type Section = keyof SpeciesContent['sections'];
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const DEV: boolean = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
const SETTLE_MS = 5000; // quiet period after the last dinosaur joins before data-ready
const CLICK_SLOP = 6; // px a pointer may move and still count as a click

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

function injectStyle(): void {
  const s = document.createElement('style');
  s.textContent = `
    .dino-label { position: fixed; left: 0; top: 0; display: none; pointer-events: none; z-index: 25; padding: 4px 8px; border-radius: 4px;
      background: rgba(10,14,10,.78); color: #f1efe4; font: 14px/1.2 system-ui, sans-serif; }
    .dino-hint { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 15; padding: 8px 14px; border-radius: 8px;
      background: rgba(10,14,10,.7); color: #f1efe4; font: 15px/1.3 system-ui, sans-serif; pointer-events: none; }
    .dino-hint[hidden], .dino-status[hidden], .dino-load-error[hidden] { display: none; }
    .dino-load-error { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 35; display: flex; gap: 12px; align-items: center;
      padding: 10px 14px; border-radius: 8px; background: rgba(40,14,10,.92); color: #f6e3dd; font: 15px/1.3 system-ui, sans-serif; }
    .dino-load-error button { font: 600 14px system-ui; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
    .dino-status { position: fixed; inset: 0; z-index: 40; display: grid; place-content: center; gap: 12px; text-align: center;
      background: #0b0f0c; color: #e8efe6; font: 16px/1.4 system-ui, sans-serif; }
    .dino-status button { font: 600 14px system-ui; padding: 10px 16px; border-radius: 8px; cursor: pointer; }`;
  document.head.appendChild(s);
}

/** Looping forest ambience; starts on the first user gesture (autoplay policy). */
class Ambient {
  private readonly el = document.createElement('audio');
  private started = false;
  constructor() {
    const ogg = this.el.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    this.el.src = `${BASE}audio/ambient/forest-night.${ogg ? 'ogg' : 'm4a'}`;
    this.el.loop = true;
    this.el.volume = 0.5;
    const go = (): void => {
      removeEventListener('pointerdown', go);
      removeEventListener('keydown', go);
      this.started = true;
      this.el.play().catch(() => { /* blocked or missing: ambience is optional */ });
    };
    addEventListener('pointerdown', go);
    addEventListener('keydown', go);
  }
  setMuted(m: boolean): void {
    this.el.muted = m;
    if (this.started && !m && this.el.paused) this.el.play().catch(() => { /* optional */ });
  }
}

const _pos = new Vector3();
const _look = new Vector3();
const _savedPos = new Vector3();
const _savedQuat = new Quaternion();

/** One render from intro pose `u`, then the camera is restored (builds buffers and pipelines the flight will meet). Kept here so loader.ts stays out of the first-frame bundle. */
function renderFlightPose(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, step: (dt: number) => void, u: number): void {
  _savedPos.copy(camera.position);
  _savedQuat.copy(camera.quaternion);
  sampleIntro(u, _pos, _look);
  camera.position.copy(_pos);
  camera.lookAt(_look);
  camera.updateMatrixWorld(true);
  step(0);
  renderer.render(scene, camera);
  camera.position.copy(_savedPos);
  camera.quaternion.copy(_savedQuat);
  camera.updateMatrixWorld(true);
}

export async function createApp(canvas: HTMLCanvasElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  injectStyle();
  const ui = document.body;

  const status = div('dino-status', ui);
  status.textContent = '…';
  const fail = (e: unknown): void => {
    console.error(e);
    status.replaceChildren();
    const msg = document.createElement('p');
    msg.textContent = t('loadError');
    const retry = document.createElement('button');
    retry.textContent = t('retry');
    retry.addEventListener('click', () => location.reload());
    status.append(msg, retry);
    status.hidden = false;
  };

  try {
    const { renderer, isWebGPU } = await createRenderer(canvas);
    renderer.toneMapping = ACESFilmicToneMapping;
    // Dinosaur code (GLTF/KTX2/meshopt decoders, ~65 kB gz) is not needed for the first frame: fetch it now, while the canopy compiles.
    const lazy = Promise.all([import('./loader'), import('../dinos/dino')]);
    lazy.catch(() => { /* reported where it is awaited, after the intro starts */ });
    const qp = qualityParams(location.search);
    let tier: QualityTier = qp.tier ?? detectTier({ ...readDeviceCaps(), webgpu: isWebGPU });

    // Models and species text start loading now, behind the loading screen; they join the scene once the intro runs.
    const manifest = validateManifest(manifestJson).filter((e) => e.status === 'approved');
    let content!: ContentStore; // created once the dinosaur chunk has arrived (below)
    const countOf = (e: { species: SpeciesId }): number => (e.species === 'triceratops' ? 3 : 1);

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 400);
    const atmosphere = new Atmosphere(scene, renderer, { tier, isWebGPU });
    scene.add(createTerrain().group);
    let vegetation: Vegetation | null = null;
    if (!q.has('noveg')) { vegetation = createVegetation(tier); scene.add(vegetation.group); }

    // Dinosaurs: every approved manifest entry; a herd for triceratops, the rest solo.
    // Models and species text stream in after the intro starts (loader.ts); nothing here waits for them.
    const world = new DinoWorld(scene);
    const label = div('dino-label', ui);
    world.label = label;
    world.commonName = (id) => content.peek(id)?.commonName[getLang()] ?? id;
    const shadowIdx = new Map<Dino, number>();
    world.onDinoMoved = (d, x, y, z) => {
      const r = d.focusRadius * 0.28;
      const yaw = d.root.rotation.y - Math.PI / 2;
      const i = shadowIdx.get(d);
      if (i === undefined) shadowIdx.set(d, atmosphere.contactShadows.add(x, y, z, r, 3, yaw));
      else atmosphere.contactShadows.set(i, x, y, z, r, 3, yaw);
    };
    world.onDinoReplaced = (from, to) => {
      const i = shadowIdx.get(from);
      if (i !== undefined) { shadowIdx.delete(from); shadowIdx.set(to, i); }
    };
    const director = new CameraDirector(camera, canvas);
    const quality = new QualityRuntime({
      renderer, isWebGPU, tier, director, scene, camera, atmosphere, vegetation: vegetation ?? undefined,
      governor: qp.governor ? { downgradeBelow: 28, windowSec: 3 } : false,
    });
    const probe = DEV || q.has('test') ? installQualityProbe(quality, renderer) : null;
    const panel = new InfoPanel(ui);
    const controls = new Controls(ui);
    new Credits(ui);
    const narrator = new Narrator();
    const ambient = new Ambient();
    const hint = div('dino-hint', ui);
    const hintText = (): void => { hint.textContent = t('clickHint'); };
    hintText();

    let selected: Dino | null = null;
    let section: Section = 'behavior';
    let pendingBack = false;
    let frozen = false;

    const narrate = (): void => {
      if (!selected) return;
      narrator.play(selected.id, getLang(), section).catch((e) => console.warn(String(e)));
    };
    const updateHint = (): void => { hint.hidden = director.state !== 'forest' || selected !== null; };

    narrator.setMuted(controls.isMuted);
    ambient.setMuted(controls.isMuted);
    controls.onMute((m) => { narrator.setMuted(m); ambient.setMuted(m); if (!m) narrate(); });

    const back = async (): Promise<void> => {
      const d = selected;
      if (!d) return;
      if (director.state === 'flying') { pendingBack = true; return; } // leave once the flight lands
      narrator.stop();
      panel.hide();
      selected = null;
      pendingBack = false;
      updateHint();
      await director.returnToForest();
      world.setPaused(d, false);
      updateHint();
    };

    const loadErr = div('dino-load-error', ui);
    loadErr.hidden = true;
    const errMsg = document.createElement('span');
    const errRetry = document.createElement('button');
    let errAgain: (() => void) | null = null;
    errRetry.addEventListener('click', () => { loadErr.hidden = true; errAgain?.(); });
    loadErr.append(errMsg, errRetry);
    const errText = (): void => { errMsg.textContent = t('loadError'); errRetry.textContent = t('retry'); };
    errText();
    const showContentError = (again: () => void): void => {
      errAgain = again;
      errText();
      loadErr.hidden = false;
    };

    const select = async (d: Dino): Promise<void> => {
      let info = content.peek(d.id);
      if (!info) {
        try { info = await content.get(d.id); } catch (e) { console.warn(`content for ${d.id} failed to load`, String(e)); showContentError(() => { void select(d); }); return; }
        if (selected || director.state !== 'forest') return; // the user moved on while it loaded
      }
      loadErr.hidden = true;
      selected = d;
      const entry = manifest.find((m) => m.species === d.id);
      if (wantsUpgrade(d, entry, tier)) {
        // High tier: the detail model loads while the camera flies in and replaces the light one in place (same pose, no jump).
        upgradeDino(renderer, scene, camera, entry).then(
          (next) => {
            if (selected !== d) { next.dispose(); return; } // the user already left this animal
            if (world.replace(d, next)) selected = next;
          },
          (e: unknown) => console.warn(`detail model for ${d.id} failed to load; keeping the light one`, String(e)),
        );
      }
      section = 'behavior';
      pendingBack = false;
      label.style.display = 'none';
      world.setPaused(d, true);
      panel.show(info, getLang());
      narrate();
      updateHint();
      await director.focus(d.proxy, d.focusRadius);
      if (pendingBack) await back();
    };

    panel.onBack(() => { void back(); });
    panel.onSection((s) => { section = s; narrate(); });
    onLangChange((l) => {
      hintText();
      errText();
      const c = selected && content.peek(selected.id);
      if (c) { panel.show(c, l); narrate(); } // same section, new language; Narrator.play stops the old track first
    });

    // Pointer: hover label and click-to-select only in the forest state; a drag (look around) is not a click.
    const ndc = new Vector2();
    const setNdc = (ev: PointerEvent): Vector2 => ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
    canvas.addEventListener('pointermove', (ev) => {
      if (director.state !== 'forest' || selected) { label.style.display = 'none'; return; }
      world.hover(setNdc(ev), camera, ev.clientX, ev.clientY);
    });
    canvas.addEventListener('pointerup', (ev) => {
      const start = down;
      down = null;
      if (!start || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > CLICK_SLOP) return;
      if (director.state !== 'forest' || selected) return; // ignored while flying or already in a close-up
      const hit = world.pick(setNdc(ev), camera);
      if (hit) void select(hit);
    });

    const resize = (): void => {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.fov = camera.aspect < 1 ? 70 : 50;
      camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();

    const overlay = document.getElementById('dev-overlay');
    const showOverlay = (): void => {
      if (!overlay || (!DEV && !location.pathname.includes('/dev/'))) return;
      overlay.hidden = false;
      overlay.textContent = `tier: ${tier} | backend: ${isWebGPU ? 'webgpu' : 'webgl2'}`;
    };
    showOverlay();

    // Pre-compile the canopy pipelines, but never block start-up on it (some software backends never report completion).
    await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 15000))]);
    const warmStep = (dt: number): void => { atmosphere.update(camera, dt); vegetation?.update(dt, camera); };
    for (const u of [1, 0.75, 0.5, 0.25, 0]) {
      renderFlightPose(renderer, scene, camera, warmStep, u);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }

    let simClock = 0;
    startLoop((dt) => {
      simClock += dt;
      if (!frozen) world.update(dt);
      director.update(dt);
      atmosphere.update(camera, dt);
      vegetation?.update(dt, camera);
      probe?.frame();
      quality.update(dt);
      if (quality.tier !== tier) { tier = quality.tier; showOverlay(); }
      renderer.render(scene, camera);
    });

    // Renderer + canopy are ready: the intro starts now, dinosaurs stream in while it plays.
    status.hidden = true;
    const introDone = director.playIntro();
    if (q.has('noIntro')) director.skipIntro();
    else { controls.showSkipIntro(true); controls.onSkipIntro(() => director.skipIntro()); }
    void introDone.then(() => { controls.showSkipIntro(false); updateHint(); });
    updateHint(); // the click hint stays hidden during the intro
    document.documentElement.dataset.intro = '1';
    if (DEV || q.has('test')) {
      const v = new Vector3();
      const find = (id: SpeciesId): Dino => world.dinos.find((d) => d.id === id)!;
      (window as unknown as Record<string, unknown>).__app = {
        director, camera, world, narrator,
        get selected() { return selected?.id ?? null; },
        get tier() { return tier; },
        get simClock() { return simClock; },
        freeze(f: boolean) { frozen = f; },
        /** Aim the forest camera straight at a dinosaur (test/evidence aid). */
        lookAt(id: SpeciesId) { camera.lookAt(find(id).proxy.getWorldPosition(v)); camera.updateMatrixWorld(true); },
        screenOf(id: SpeciesId) {
          const p = find(id).proxy.getWorldPosition(v.set(0, 0, 0)).project(camera);
          return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
        },
      };
    }
    const warmed = new Set<SpeciesId>();
    const [L, dinoMod] = await lazy;
    const { ContentStore: Store, preloadDinos, streamDinos, upgradeDino, wantsUpgrade } = L;
    dinoMod.configureDinoLoader(renderer);
    content = new Store();
    const preload = preloadDinos(manifest, tier, countOf, content);
    await streamDinos({
      renderer, scene, camera, preload,
      onLoaded: (e, d) => {
        world.add(d, e.species === 'triceratops' ? 'herd' : e.species === 'tyrannosaurus' ? 'wander' : 'graze');
        if (!warmed.has(e.species)) { warmed.add(e.species); renderFlightPose(renderer, scene, camera, warmStep, 1); } // builds its shadow pipeline now
      },
    });
    // The GPU finishes some pipeline work a few seconds after a dinosaur joins (measured: one ~400 ms stall about 3.4 s after the
    // last one on the high tier). "Ready" means loaded and settled, so tests and the perf gate start after that stall, not inside it.
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    document.documentElement.dataset.ready = '1';
  } catch (e) {
    fail(e);
  }
}
