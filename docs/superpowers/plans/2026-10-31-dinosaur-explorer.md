# Dinosaur Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the orchestrator runs it via `/run` (see `docs/runbook.md`).

**Goal:** A bilingual (vi/en) WebGPU site where visitors fly into a late-Cretaceous Hell Creek forest, click a living, animated dinosaur, orbit it in close-up and hear/read accurate science about it — smooth on desktop and modern phones.

**Architecture:** Vite + TypeScript + three.js `WebGPURenderer` with TSL. Each feature is an isolated module with its own dev page (`dev/<feature>.html`) so tasks in a wave never edit the same file; `src/main.ts` is wired only in Wave 4. Dinosaurs are optimized GLB models (high/low variants); the environment (vegetation sway, particles, fog/godrays) is GPU-driven in the Aurelia style. Content is per-species bilingual JSON; narration is pre-generated MP3.

**Tech Stack:** three.js (latest stable with WebGPU+TSL, pinned), TypeScript, Vite, Vitest, Playwright, glTF-Transform, KTX-Software `toktx`, Blender 4.2+ (headless Python), Python `edge-tts`, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-30-dinosaur-explorer-design.md`. ADRs in `docs/decisions/` (created in P0-T04) are binding.

## Global Constraints

- Priority on conflict: **smooth > dinosaur realism > forest density > species count**.
- Targets: **60 fps** mid-range desktop; **≥ 30 fps stable** mid-range WebGPU phone (iOS 26+, Android 2022+ Chrome). No hitch on camera flight, species load or panel open.
- No WebGPU → WebGL2 fallback: full functionality, compute effects off.
- Scene: Hell Creek, late Maastrichtian (~68–66 Ma). Species: `tyrannosaurus`, `triceratops`, `ankylosaurus`, `edmontosaurus`, `pachycephalosaurus`. Flora: ferns, cycads, conifers, early angiosperms — **no grass**.
- Launch minimum: T-rex + 2 other species passing `docs/rubrics/visual-model.md`. Never relax a rubric.
- Model licences: CC0, CC-BY-3.0/4.0, CC-BY-NC-3.0/4.0 only (ADR 0013); record author/url/licence on download.
- Aurelia reference pinned at commit `724aba263459d1b11a49b72bfc7ce8baac840ca8`; read only the files your task lists; keep MIT notice if code is borrowed.
- Info panel: right side (~1/3 width) when viewport is landscape and ≥ 768 px wide; bottom sheet otherwise.
- Language default from `navigator.languages` (`vi*` → vi, else en); persisted in `localStorage['dino.lang']`. Mute persisted in `localStorage['dino.muted']`.
- Tweakpane only in dev builds (`import.meta.env.DEV`).
- Each feature task ships a dev page `dev/<feature>.html` + a Playwright smoke test for it.

## Review Focus

1. **WebGPU unavailable** → page still loads, dinosaurs clickable, panel + narration work, no console errors; compute effects absent. (Test in P4-T02: launch Chromium with `--disable-features=WebGPU`.)
2. **Clicks during a camera flight / clicking another dinosaur while narrating** → ignored during flight; new focus stops old narration before starting new one; never two audio tracks. (P2-T08 director test, P4-T01 e2e)
3. **Language switched while narration plays** → panel text swaps instantly; audio restarts in the new language from the start of the current section, not overlapping. (P4-T01 e2e)
4. **Asset fails to load / slow 3G** → intro still plays; a dinosaur whose GLB fails is hidden and logged, others work; panel shows a retry message instead of a blank. (P4-T06 e2e with route abort + throttling)
5. **Phone rotated portrait↔landscape while panel open** → layout switches side panel ↔ bottom sheet without losing scroll position or orbit target. (P2-T07 e2e)

---

## Shared interfaces (owned by the task named; others import, never redefine)

```ts
// src/core/quality.ts (P1-T01)
export type QualityTier = 'low' | 'medium' | 'high';
export interface DeviceCaps { webgpu: boolean; mobile: boolean; hardwareConcurrency: number; deviceMemoryGB?: number }
export function readDeviceCaps(): DeviceCaps;
export function detectTier(caps: DeviceCaps): QualityTier;
export class FpsGovernor { constructor(opts?: { downgradeBelow?: number; windowSec?: number }); sample(dtMs: number): QualityTier | null; readonly tier: QualityTier }
// src/core/budgets.ts (values filled by P2-T01; P1-T01 ships placeholders)
export interface Budget { ferns: number; cycads: number; conifers: number; particles: number; shadows: boolean; godrays: boolean; textureMax: 1024 | 2048 | 4096; verlet: boolean; dinoVariant: 'low' | 'high' }
export const BUDGETS: Record<QualityTier, Budget>;
// src/core/renderer.ts (P1-T01)
export function createRenderer(canvas: HTMLCanvasElement): Promise<{ renderer: WebGPURenderer; isWebGPU: boolean }>;
export function startLoop(update: (dtSec: number) => void): () => void;

// src/content/schema.ts (P1-T02)
export type SpeciesId = 'tyrannosaurus' | 'triceratops' | 'ankylosaurus' | 'edmontosaurus' | 'pachycephalosaurus';
export type Lang = 'vi' | 'en';
export type Localized = Record<Lang, string>;
export interface SpeciesContent {
  id: SpeciesId; scientificName: string; commonName: Localized;
  quickFacts: { lengthM: [number, number]; massT: [number, number]; periodMa: [number, number]; diet: 'carnivore' | 'herbivore' | 'omnivore' };
  sections: { behavior: Localized; anatomy: Localized; huntingOrDefense: Localized; discovery: Localized };
  contested: Localized[]; sources: { title: string; url: string; year?: number }[];
}
export function validateSpecies(json: unknown): SpeciesContent; // throws SchemaError(path, message)
export function loadSpecies(id: SpeciesId): Promise<SpeciesContent>; // fetches content/species/<id>.json
// src/i18n/i18n.ts (P1-T02)
export function initialLang(navigatorLangs: readonly string[], stored: string | null): Lang;
export function getLang(): Lang; export function setLang(l: Lang): void; export function onLangChange(cb: (l: Lang) => void): () => void;
export function t(key: UiKey): string; // UI strings in src/i18n/ui.json

// src/assets/manifest.ts (P1-T03 data, P1-T04 code)
export interface AssetEntry { species: SpeciesId; sourceUrl: string; author: string; license: 'CC0' | 'CC-BY-3.0' | 'CC-BY-4.0' | 'CC-BY-NC-3.0' | 'CC-BY-NC-4.0'; modifications: string[]; files: { high: string; low: string }; clips: Partial<Record<'idle' | 'walk' | 'eat' | 'roar' | 'run', string>>; status: 'candidate' | 'approved' | 'rejected' }
export function validateManifest(json: unknown): AssetEntry[];

// src/camera/director.ts (P2-T08)
export class CameraDirector { constructor(camera: PerspectiveCamera, dom: HTMLElement); playIntro(): Promise<void>; skipIntro(): void; focus(target: Object3D, radius: number): Promise<void>; returnToForest(): Promise<void>; readonly state: 'intro' | 'forest' | 'flying' | 'closeup'; update(dt: number): void }
// src/ui/panel.ts (P2-T07)
export class InfoPanel { constructor(root: HTMLElement); show(c: SpeciesContent, lang: Lang): void; hide(): void; onBack(cb: () => void): void; onSection(cb: (s: keyof SpeciesContent['sections']) => void): void }
// src/audio/narrator.ts (P3-T04)
export class Narrator { play(id: SpeciesId, lang: Lang, section?: keyof SpeciesContent['sections']): Promise<void>; stop(): void; setMuted(m: boolean): void; readonly muted: boolean } // files: public/audio/<lang>/<id>.<section>.mp3
// src/dinos/dino.ts (P3-T03)
export class Dino { static load(entry: AssetEntry, tier: QualityTier): Promise<Dino>; readonly id: SpeciesId; readonly root: Object3D; readonly focusRadius: number; play(clip: 'idle' | 'walk' | 'eat' | 'roar' | 'run'): void; update(dt: number): void }
export class DinoWorld { constructor(scene: Scene); add(d: Dino, behaviour: 'wander' | 'herd' | 'graze'): void; pick(ndc: Vector2, camera: Camera): Dino | null; update(dt: number): void }
```

---

## Wave 1 — Foundations

### P1-T01 — App scaffold, renderer, quality tiers, CI deploy
```task
id: P1-T01
wave: 1
agent: frontend-dev
model: sonnet
area: build
depends: [P0-T07]
heavy: false
files: [package.json, tsconfig.json, vite.config.ts, index.html, src/main.ts, src/core/renderer.ts, src/core/quality.ts, src/core/budgets.ts, tests/unit/quality.test.ts, playwright.config.ts, tests/e2e/smoke.spec.ts, .github/workflows/deploy.yml, dev/renderer.html]
```
Read: ADR 0001, 0006; Aurelia `src/app.js`, `vite.config.js`.

- [ ] **Step 1:** Add deps: `three` (latest stable, exact version), `typescript`, `vite`, `@playwright/test`, `vite-plugin-tsl-operator`; `vite.config.ts` multi-page (`index.html` + `dev/*.html`), `base: '/dinosaur/'`.
- [ ] **Step 2: Failing tests** `tests/unit/quality.test.ts`: `detectTier({webgpu:false,…})` → `'low'`; webgpu+mobile → `'medium'`; webgpu+desktop+concurrency ≥ 8 → `'high'`; `FpsGovernor({downgradeBelow:28, windowSec:3})` fed 3 s of 40 ms frames from `high` → returns `'medium'` once, then `null` until another full window; never below `'low'`; never upgrades.
- [ ] **Step 3:** Implement `quality.ts`, `budgets.ts` (placeholders: high 6000/800/300 ferns/cycads/conifers, 20000 particles; medium half; low quarter, shadows/godrays/verlet only on high), `renderer.ts` (`WebGPURenderer({antialias:true})`, `await renderer.init()`, `isWebGPU = renderer.backend.isWebGPUBackend`), `startLoop` via `renderer.setAnimationLoop`.
- [ ] **Step 4:** `dev/renderer.html` + `src/main.ts` render a lit cube and show tier + backend in a dev-only overlay. Smoke e2e: page loads, canvas non-empty (pixel read), zero console errors.
- [ ] **Step 5:** `.github/workflows/deploy.yml`: on push to `main` → `npm ci`, `npm test`, `npm run build`, deploy `dist` with `actions/deploy-pages`.
- [ ] **Step 6:** Commit `build(build): scaffold vite, webgpu renderer, quality tiers and pages deploy`.

**Acceptance:** unit + smoke pass; workflow green on merge; Pages URL serves the cube.

### P1-T02 — Content schema and i18n core
```task
id: P1-T02
wave: 1
agent: frontend-dev
model: sonnet
area: i18n
depends: [P0-T07]
heavy: false
files: [src/content/schema.ts, src/content/load.ts, src/i18n/i18n.ts, src/i18n/ui.json, content/species/_example.json, tests/unit/schema.test.ts, tests/unit/i18n.test.ts]
```
Read: ADR 0009.

- [ ] **Step 1: Failing tests** `schema.test.ts`: `_example.json` validates; missing `sections.behavior.vi` → `SchemaError` with path `sections.behavior.vi`; `lengthM: [12, 8]` (min > max) → error; empty `sources` → error.
- [ ] **Step 2: Failing tests** `i18n.test.ts`: `initialLang(['vi-VN','en'], null)` → `'vi'`; `(['en-US'], null)` → `'en'`; `(['vi'], 'en')` → `'en'` (stored wins); `(['fr'], 'xx')` → `'en'`; `setLang` notifies subscribers once and persists `dino.lang`.
- [ ] **Step 3:** Implement. `ui.json` holds every UI string (`back`, `mute`, `unmute`, `skipIntro`, `clickHint`, `sections.*`, `quickFacts.*`, `credits`, `loadError`, `retry`) in vi + en.
- [ ] **Step 4:** Commit `feat(i18n): add species content schema, loader and i18n core`.

### P1-T03 — Asset scouting (all species)
```task
id: P1-T03
wave: 1
agent: asset-scout
model: haiku
area: assets
depends: [P0-T07]
heavy: false
files: [docs/assets/candidates.md, assets/manifest.json]
```
Read: ADR 0003, 0004, 0013; `docs/rubrics/visual-model.md`.

- [ ] **Step 1:** For each species, search Sketchfab (API `GET /v3/search?type=models&downloadable=true&q=<name>` with `SKETCHFAB_API_TOKEN`), filter licences to CC0 / CC-BY / CC-BY-NC. Also check the leads in the spec's research (Sketchfab "Prehistoric Planet T-rex", "animated T-rex biting loop").
- [ ] **Step 2:** For each species list ≤ 4 candidates in `docs/assets/candidates.md`: url, author, licence, rigged (y/n), animation clip names, face/vertex count, texture sizes, thumbnail url, obvious rubric red flags. Rank; mark top pick.
- [ ] **Step 3:** Write `assets/manifest.json` entries `status: 'candidate'` for the top pick per species (files paths left as `assets/src/<species>/…`). Species with zero acceptable candidate → no entry + a line in candidates.md "NO CANDIDATE".
- [ ] **Step 4:** Commit `asset(assets): add model candidates and manifest draft`.

**Acceptance:** every candidate's licence verified on its page (quote the licence string); no ND licences.

### P1-T04 — Asset pipeline scripts
```task
id: P1-T04
wave: 1
agent: asset-engineer
model: sonnet
area: assets
depends: [P0-T07]
heavy: true
files: [scripts/assets/optimize.mjs, scripts/assets/blender/convert.py, scripts/assets/blender/turntable.py, scripts/assets/fetch.mjs, src/assets/manifest.ts, tests/unit/manifest.test.ts, tests/assets/optimize.test.mjs, tests/fixtures/box-animated.glb]
```

- [ ] **Step 1: Failing tests** `manifest.test.ts`: rejects licence `CC-BY-ND-4.0`; rejects `approved` entry without `files.low`; accepts example.
- [ ] **Step 2: Failing test** `optimize.test.mjs`: running `optimize.mjs tests/fixtures/box-animated.glb out/` produces `out/box-animated.high.glb` and `.low.glb`; low has ≤ 50 % of the high triangle count and textures ≤ 1024 px; animation clips preserved (names equal).
- [ ] **Step 3:** Implement `optimize.mjs` with `@gltf-transform/core` + `functions`: `dedup, prune, resample, weld, simplify (low: ratio 0.35, error 0.01), meshopt` compression, textures → KTX2 (`toktx`, high max 2048, low max 1024). Implement `fetch.mjs <species>` (Sketchfab download API → `assets/src/<species>/`, never logs the token).
- [ ] **Step 4:** `convert.py` (Blender headless: import FBX/OBJ/blend → export GLB with animations); `turntable.py` (render 6 PNG angles at 1024 px + 5 s MP4 of each clip, EEVEE, neutral grey HDRI) for visual-judge evidence into `review-artifacts/<species>/` (gitignored, attached to PR via comment links to uploaded files using `gh` release assets of a `review-artifacts` pre-release). *(planner's call for evidence storage)*
- [ ] **Step 5:** Commit `asset(assets): add fetch, optimize and blender review pipeline`.

---

## Wave 2 — Spike, content, UI, camera, per-species assets

### P2-T01 — Performance spike: fern patch + particles + T-rex
```task
id: P2-T01
wave: 2
agent: perf-engineer
model: opus
area: perf
depends: [P1-T01, P1-T03, P1-T04]
heavy: true
files: [dev/spike.html, src/spike/spike.ts, src/core/budgets.ts, docs/perf/spike-results.md, docs/decisions/0010-quality-budgets.md, tests/e2e/perf.spec.ts]
```
Read: ADR 0006, 0007; Aurelia `src/plankton.js`, `src/common/noise.js`.

- [ ] **Step 1:** `spike.ts`: instanced fern (procedural quad cards or CC0 mesh) with TSL vertex wind (noise(position.xz*0.1 + time)) ; 20k billboard particles TSL-driven per `instanceIndex`; T-rex top-pick GLB through `optimize.mjs`, playing one clip.
- [ ] **Step 2:** `perf.spec.ts`: measures median and p95 frame time over 10 s for each tier on desktop, and with Chromium CPU throttling ×4 + 390×844 viewport as a phone proxy; writes JSON to `test-results/perf.json`.
- [ ] **Step 3:** Binary-search counts so high tier holds 60 fps desktop and medium holds p95 ≤ 33 ms on phone proxy; write numbers into `BUDGETS`; record method + table in `spike-results.md`; ADR 0010 states the budgets and that `perf.spec.ts` is the regression gate.
- [ ] **Step 4:** Commit `perf(perf): set quality budgets from spike measurements`.

### P2-T02 — Content: Tyrannosaurus rex
```task
id: P2-T02
wave: 2
agent: content-writer
model: sonnet
area: content
depends: [P1-T02]
heavy: false
files: [content/species/tyrannosaurus.json]
```
Read: `docs/rubrics/content.md`, ADR 0002.
- [ ] Write vi + en per `SpeciesContent`; each `en` section 120–200 words (`vi` 160–300 syllables); ≥ 4 sources (museum, peer-reviewed, review papers); contested items at minimum: integument (feathers vs scales), lips, top speed, scavenger-vs-predator. Validate with `validateSpecies` (`npx vitest run schema`). Commit `content(content): add tyrannosaurus content`.

### P2-T03 — Content: Triceratops
```task
id: P2-T03
wave: 2
agent: content-writer
model: sonnet
area: content
depends: [P1-T02]
heavy: false
files: [content/species/triceratops.json]
```
- [ ] Same as P2-T02; contested at minimum: Torosaurus synonymy, frill function, herd behaviour. Commit `content(content): add triceratops content`.

### P2-T04 — Content: Ankylosaurus
```task
id: P2-T04
wave: 2
agent: content-writer
model: sonnet
area: content
depends: [P1-T02]
heavy: false
files: [content/species/ankylosaurus.json]
```
- [ ] Same as P2-T02; note the fragmentary fossil record explicitly. Commit `content(content): add ankylosaurus content`.

### P2-T05 — Content: Edmontosaurus
```task
id: P2-T05
wave: 2
agent: content-writer
model: sonnet
area: content
depends: [P1-T02]
heavy: false
files: [content/species/edmontosaurus.json]
```
- [ ] Same as P2-T02; include T-rex bite-marked specimens, soft-tissue "comb" find. Commit `content(content): add edmontosaurus content`.

### P2-T06 — Content: Pachycephalosaurus
```task
id: P2-T06
wave: 2
agent: content-writer
model: sonnet
area: content
depends: [P1-T02]
heavy: false
files: [content/species/pachycephalosaurus.json]
```
- [ ] Same as P2-T02; contested: head-butting, Stygimoloch/Dracorex as growth stages. Commit `content(content): add pachycephalosaurus content`.

### P2-T07 — UI shell: info panel, language toggle, audio controls
```task
id: P2-T07
wave: 2
agent: frontend-dev
model: sonnet
area: ui
depends: [P1-T01, P1-T02]
heavy: false
files: [src/ui/panel.ts, src/ui/controls.ts, src/ui/styles.css, dev/panel.html, tests/e2e/panel.spec.ts]
```
- [ ] **Step 1: Failing e2e** `panel.spec.ts` on `dev/panel.html` with `_example.json`: at 1280×800 panel is right-docked, width 30–36 % of viewport; at 390×844 it is a bottom sheet ≤ 55 % height, draggable to 90 %; rotating 844×390 → right-docked and the scroll position of the section list is preserved (Review Focus 5); language toggle switches all text without reload; mute button toggles `dino.muted`; back button fires `onBack`.
- [ ] **Step 2:** Implement `InfoPanel` and `controls.ts` (lang toggle, mute, skip-intro, back) with plain DOM + CSS; text from `t()`; quick-facts render ranges with units (`12–13 m`, `8–14 t`, `68–66 Ma`); a "Contested" block lists `contested[]`; a "Sources" block lists `sources[]` as links opening in a new tab.
- [ ] **Step 3:** Commit `feat(ui): add info panel, language and audio controls`.

### P2-T08 — Camera director: intro, focus, orbit
```task
id: P2-T08
wave: 2
agent: frontend-dev
model: sonnet
area: scene
depends: [P1-T01]
heavy: false
files: [src/camera/director.ts, src/camera/paths.ts, dev/camera.html, tests/unit/director.test.ts, tests/e2e/camera.spec.ts]
```
- [ ] **Step 1: Failing tests** `director.test.ts` (fake clock): `playIntro` resolves after the path duration (default 9 s) and state goes `intro → forest`; `skipIntro` resolves it immediately; `focus()` while `state==='flying'` is ignored (returns the in-flight promise); `focus` ends in `closeup` with OrbitControls target = object world position, minDistance = `radius*1.2`, maxDistance = `radius*4`, polar angle clamped above ground; `returnToForest` restores the forest pose; in `forest` state the user can look around by drag within yaw ±60° and pitch −10°..+20° of the forest pose, no translation.
- [ ] **Step 2:** Implement with `OrbitControls` (enabled only in `closeup`) and a Catmull-Rom path for the intro (low through canopy → rise → reveal valley); ease-in-out flights 1.6 s.
- [ ] **Step 3:** e2e on `dev/camera.html`: drag rotates in closeup; pinch/scroll zooms within limits.
- [ ] **Step 4:** Commit `feat(scene): add camera director with intro, focus and orbit`.

### P2-T09 — Asset: Tyrannosaurus (fetch, fix, animate, optimize)
```task
id: P2-T09
wave: 2
agent: asset-engineer
model: sonnet
area: assets
depends: [P1-T03, P1-T04]
heavy: true
files: [assets/src/tyrannosaurus/**, public/models/tyrannosaurus.high.glb, public/models/tyrannosaurus.low.glb, assets/manifest.json, docs/assets/tyrannosaurus.md]
```
Read: `docs/rubrics/visual-model.md` (T-rex red flags), `docs/assets/candidates.md`.
- [ ] **Step 1:** `fetch.mjs tyrannosaurus`; convert to GLB if needed.
- [ ] **Step 2:** If the model lacks any of `idle`, `walk`: rig (Blender Rigify or existing armature) and author the missing clips via Blender Python (procedural gait cycle + idle breathing); fix rubric red flags (e.g. hand pronation) by re-posing the rest pose. Log every modification in `manifest.json.modifications` and `docs/assets/tyrannosaurus.md`.
- [ ] **Step 3:** `optimize.mjs` → high/low; `turntable.py` → evidence; check size limits.
- [ ] **Step 4:** If the top pick fails self-check against the rubric, try the next candidate (max 2 alternates), then report failure.
- [ ] **Step 5:** Set manifest `status: 'approved'` only after visual-judge APPROVE (orchestrator flips it at merge). Commit `asset(dino): add tyrannosaurus model`.

### P2-T10 — Asset: Triceratops
```task
id: P2-T10
wave: 2
agent: asset-engineer
model: sonnet
area: assets
depends: [P1-T03, P1-T04]
heavy: true
files: [assets/src/triceratops/**, public/models/triceratops.high.glb, public/models/triceratops.low.glb, assets/manifest.json, docs/assets/triceratops.md]
```
- [ ] Same steps as P2-T09 for `triceratops`; required clips `idle`, `walk`, `eat`.

### P2-T11 — Asset: Ankylosaurus
```task
id: P2-T11
wave: 2
agent: asset-engineer
model: sonnet
area: assets
depends: [P1-T03, P1-T04]
heavy: true
files: [assets/src/ankylosaurus/**, public/models/ankylosaurus.high.glb, public/models/ankylosaurus.low.glb, assets/manifest.json, docs/assets/ankylosaurus.md]
```
- [ ] Same steps as P2-T09 for `ankylosaurus`; required clips `idle`, `walk`, `eat`. If P1-T03 recorded NO CANDIDATE → close this issue `not planned` with ADR note.

### P2-T12 — Asset: Edmontosaurus
```task
id: P2-T12
wave: 2
agent: asset-engineer
model: sonnet
area: assets
depends: [P1-T03, P1-T04]
heavy: true
files: [assets/src/edmontosaurus/**, public/models/edmontosaurus.high.glb, public/models/edmontosaurus.low.glb, assets/manifest.json, docs/assets/edmontosaurus.md]
```
- [ ] Same steps as P2-T09; required clips `idle`, `walk`, `eat` (herd animal — low variant must stay ≤ 2 MB because 3–5 instances render).

### P2-T13 — Asset: Pachycephalosaurus
```task
id: P2-T13
wave: 2
agent: asset-engineer
model: sonnet
area: assets
depends: [P1-T03, P1-T04]
heavy: true
files: [assets/src/pachycephalosaurus/**, public/models/pachycephalosaurus.high.glb, public/models/pachycephalosaurus.low.glb, assets/manifest.json, docs/assets/pachycephalosaurus.md]
```
- [ ] Same steps as P2-T09; required clips `idle`, `walk`. Same NO CANDIDATE rule as P2-T11.

> Note: P2-T09..T13 all touch `assets/manifest.json`; they are `heavy` so the scheduler already serializes them — the file overlap is intentional and safe.

---

## Wave 3 — World

### P3-T01 — Terrain and late-Cretaceous vegetation with GPU wind
```task
id: P3-T01
wave: 3
agent: frontend-dev
model: sonnet
area: scene
depends: [P2-T01]
heavy: false
files: [src/world/terrain.ts, src/world/vegetation.ts, src/world/wind.ts, public/models/flora/**, docs/assets/flora.md, dev/forest.html, tests/e2e/forest.spec.ts]
```
Read: ADR 0002, 0010; Aurelia `src/common/noise.js`, `src/plankton.js` (instancing pattern).
- [ ] **Step 1:** Source CC0/CC-BY flora (ferns, cycads, conifers like Metasequoia, early angiosperm shrubs) and record credits in `docs/assets/flora.md`; no grass.
- [ ] **Step 2:** `terrain.ts`: valley heightmap (river bank, clearing in centre for dinosaurs), PBR ground material. `vegetation.ts`: `InstancedMesh` per species with counts from `BUDGETS[tier]`, placement by Poisson-disc avoiding the clearing and camera path; `wind.ts`: TSL `positionNode` offset = bend weight (uv.y²) × noise(worldXZ·0.08 + time·0.4) × strength.
- [ ] **Step 3:** e2e on `dev/forest.html`: instance counts equal budgets per tier; no console errors; screenshot evidence for visual-judge (`scene.md`).
- [ ] **Step 4:** Commit `feat(scene): add terrain and cretaceous vegetation with gpu wind`.

### P3-T02 — Atmosphere: particles, fog, godrays, lighting
```task
id: P3-T02
wave: 3
agent: perf-engineer
model: opus
area: scene
depends: [P2-T01]
heavy: false
files: [src/world/atmosphere.ts, src/world/particles.ts, src/world/godrays.ts, src/world/lighting.ts, dev/atmosphere.html, tests/e2e/atmosphere.spec.ts]
```
Read: Aurelia `src/plankton.js`, `src/godrays.js`, `src/background.js`, `src/lights.js`.
- [ ] Particles (dust, pollen, small insects) TSL billboards driven by `instanceIndex` + `time`, count from budgets; exponential height fog; godrays shafts from a low sun through canopy (high tier only); hemisphere + directional light, shadows per budget. e2e: toggling tier changes particle count and disables godrays below high; `isWebGPU=false` path builds without compute nodes. Commit `feat(scene): add atmosphere, particles and godrays`.

### P3-T03 — Dinosaur runtime: loading, animation, behaviours, picking
```task
id: P3-T03
wave: 3
agent: frontend-dev
model: sonnet
area: dino
depends: [P2-T01, P2-T09]
heavy: false
files: [src/dinos/dino.ts, src/dinos/world.ts, src/dinos/behaviours.ts, dev/dinos.html, tests/unit/behaviours.test.ts, tests/e2e/dinos.spec.ts]
```
- [ ] **Step 1: Failing tests** `behaviours.test.ts`: `wander` keeps position inside its area polygon for 10 000 steps; herd members keep 3–8 m spacing; speed ↔ clip mapping (`< 0.1 m/s` → idle/eat, else walk); clip cross-fade 0.4 s requested on state change only.
- [ ] **Step 2:** Implement `Dino.load` (picks `files.low|high` from `BUDGETS[tier].dinoVariant`, `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader`), `AnimationMixer` with manifest `clips` mapping, `focusRadius` from bounding sphere; `DinoWorld.pick` raycasts against a per-dino low-poly proxy capsule (cheap).
- [ ] **Step 3:** Only `approved` manifest entries are spawned. Hover label (species common name via `t`).
- [ ] **Step 4:** Commit `feat(dino): add dinosaur runtime, behaviours and picking`.

### P3-T04 — Narration: generator script and Narrator
```task
id: P3-T04
wave: 3
agent: frontend-dev
model: sonnet
area: audio
depends: [P1-T02]
heavy: false
files: [scripts/audio/generate.py, scripts/audio/requirements.txt, src/audio/narrator.ts, tests/unit/narrator.test.ts, tests/audio/test_generate.py]
```
- [ ] **Step 1: Failing tests** `narrator.test.ts` (fake `HTMLAudioElement`): `play` stops a previous track first (never two playing); muted → no `play()` call but state remembered; `play` of a missing file rejects with `NarrationMissing` and does not throw to the UI.
- [ ] **Step 2: Failing test** `test_generate.py`: given two JSON files, produces `public/audio/<lang>/<id>.<section>.mp3` paths list; unchanged text (sha256 in `public/audio/.hashes.json`) → skipped.
- [ ] **Step 3:** Implement; voices `vi-VN-HoaiMyNeural`, `en-US-GuyNeural` (documentary tone), rate `-5%`. Commit `feat(audio): add narration generator and narrator`.

### P3-T05 — Ambient soundscape
```task
id: P3-T05
wave: 3
agent: asset-scout
model: haiku
area: audio
depends: [P0-T07]
heavy: false
files: [public/audio/ambient/**, docs/assets/audio.md]
```
- [ ] Find CC0/CC-BY forest ambience (insects, wind, water, distant calls — no modern bird song) ≤ 1.5 MB total, OGG + M4A; credits in `docs/assets/audio.md`. Commit `asset(audio): add ambient forest soundscape`.

---

## Wave 4 — Integration

### P4-T01 — Close-up flow wiring in `main.ts`
```task
id: P4-T01
wave: 4
agent: frontend-dev
model: sonnet
area: ui
depends: [P2-T07, P2-T08, P3-T01, P3-T02, P3-T03, P3-T04]
heavy: false
files: [src/main.ts, src/app/app.ts, tests/e2e/closeup.spec.ts]
```
- [ ] **Step 1: Failing e2e** `closeup.spec.ts` (mock audio): click T-rex → camera reaches closeup ≤ 2 s, panel shows T-rex in current lang, narration `tyrannosaurus.behavior` starts; click another dino during flight → ignored; back → forest, narration stopped; switch lang mid-narration → text swaps, audio restarts in new lang same section, exactly one audio element playing (Review Focus 2, 3).
- [ ] **Step 2:** `app.ts` composes renderer, world, atmosphere, dinos, director, panel, narrator, ambient audio (starts on first user gesture). Commit `feat(ui): wire forest, close-up, panel and narration`.

### P4-T02 — Runtime quality governor and WebGL2 fallback
```task
id: P4-T02
wave: 4
agent: perf-engineer
model: opus
area: perf
depends: [P3-T01, P3-T02, P3-T03]
heavy: true
files: [src/app/quality-runtime.ts, tests/e2e/fallback.spec.ts, tests/e2e/perf.spec.ts]
```
- [ ] `FpsGovernor` downgrade applies live (vegetation counts, particles, godrays, shadows; dino variant swap only when not in closeup). e2e `fallback.spec.ts` with `--disable-features=WebGPU`: loads, click works, panel + narration work, zero console errors, no compute effects (Review Focus 1). Extend `perf.spec.ts` to the full scene. Commit `perf(perf): add live quality governor and webgl2 fallback`.

### P4-T03 — Generate narration audio
```task
id: P4-T03
wave: 4
agent: narrator
model: haiku
area: audio
depends: [P3-T04, P2-T02, P2-T03, P2-T04, P2-T05, P2-T06]
heavy: false
files: [public/audio/vi/**, public/audio/en/**, public/audio/.hashes.json]
```
- [ ] Run `python scripts/audio/generate.py` for species whose content is merged; verify each file plays (ffprobe duration > 5 s). Commit `asset(audio): generate narration for all species`.

### P4-T04 — Credits and sources view
```task
id: P4-T04
wave: 4
agent: frontend-dev
model: sonnet
area: ui
depends: [P2-T07, P2-T09]
heavy: false
files: [src/ui/credits.ts, tests/e2e/credits.spec.ts, THIRD_PARTY_NOTICES.md]
```
- [ ] Credits dialog lists every `approved` manifest entry (author, link, licence, "modified" if `modifications` non-empty), flora and audio credits, Aurelia MIT notice if any code was borrowed. e2e: each approved model appears. Commit `feat(ui): add credits and licences view`.

### P4-T05 — Verlet secondary-motion experiment
```task
id: P4-T05
wave: 4
agent: perf-engineer
model: opus
area: dino
depends: [P3-T03, P2-T01]
heavy: true
files: [src/dinos/softbody.ts, dev/softbody.html, docs/decisions/0011-secondary-motion.md]
```
Read: Aurelia `src/physics/verletPhysics.js`, `src/medusaVerletBridge.js`.
- [ ] GPU Verlet chain (compute) driving tail-tip and throat-skin bone offsets on high tier only. Keep only if visual-judge rates it more natural AND high-tier frame time grows ≤ 1 ms. ADR 0011 records keep/drop with evidence. Commit `feat(dino): add gpu verlet secondary motion` or `docs(dino): record secondary motion dropped`.

### P4-T06 — Progressive loading, intro, failure handling
```task
id: P4-T06
wave: 4
agent: frontend-dev
model: sonnet
area: scene
depends: [P4-T01]
heavy: false
files: [src/app/loader.ts, src/app/app.ts, tests/e2e/loading.spec.ts]
```
- [ ] Intro starts once renderer + canopy are ready (< 3 s on Fast 3G target for first frame); dinosaurs and far vegetation stream during intro; high-tier dino variant loads on focus. e2e (Review Focus 4): abort one GLB route → that dino hidden + console warn, others clickable; panel shows `loadError` + `retry` for failed content fetch; Slow 3G → intro still plays. Commit `feat(scene): add progressive loading and failure handling`.

---

## Wave 5 — Quality and launch

### P5-T01 — Full performance pass
```task
id: P5-T01
wave: 5
agent: perf-engineer
model: opus
area: perf
depends: [P4-T01, P4-T02, P4-T05, P4-T06]
heavy: true
files: [docs/perf/results.md, src/core/budgets.ts]
```
- [ ] Run `perf.spec.ts` on all tiers + phone proxy; meet targets; fix by lowering budgets first, code changes second (each a separate commit). Record table in `docs/perf/results.md`. Commit `perf(perf): final tuning to meet targets`.

### P5-T02 — Scene-wide visual and scientific QA
```task
id: P5-T02
wave: 5
agent: visual-judge
model: opus
area: scene
depends: [P4-T01, P4-T03, P4-T04]
heavy: false
files: [docs/reviews/final-qa.md]
```
- [ ] Capture forest + each close-up on desktop and phone proxy, both languages; grade with `scene.md`, `visual-model.md`, `content.md` (fact-checker re-checks panel text as rendered). Every FAIL becomes a new issue (orchestrator creates, wave 5). Commit `docs(docs): add final qa report`.

### P5-T03 — Launch
```task
id: P5-T03
wave: 5
agent: frontend-dev
model: sonnet
area: build
depends: [P5-T01, P5-T02]
heavy: false
files: [README.md, docs/known-issues.md]
```
- [ ] Check launch minimum (T-rex + 2 approved); README (vi + en: what it is, live URL, credits link, how to run locally); verify the Pages URL in a fresh browser; post final summary (species shipped, perf numbers, known issues, token/cost per task if recorded) to `Run status`. Commit `docs(build): add readme for launch`.
