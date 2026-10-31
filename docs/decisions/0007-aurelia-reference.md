# 0007 — Aurelia as the GPU-technique reference

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user

## Context
The user locked the Aurelia approach (holtsetio/aurelia, MIT). Agents need to know exactly what "Aurelia-style" means.

## Decision
Reference: https://github.com/holtsetio/aurelia at commit **`724aba263459d1b11a49b72bfc7ce8baac840ca8`** (three ^0.175, `three/webgpu` + `three/tsl`, Vite + `vite-plugin-tsl-operator`). Read only the files your task lists.

| Technique here | Meaning | Aurelia file |
|---|---|---|
| Renderer setup | `WebGPURenderer`, loop, TSL post | `src/app.js`, `index.js`, `vite.config.js` |
| Air particles | instanced billboards; motion from hash+noise of `instanceIndex` and `time` in TSL, no CPU per-particle work | `src/plankton.js` |
| Fog + godrays | translucent shaft geometry, density by view angle/distance, blended with background | `src/godrays.js`, `src/background.js`, `src/lights.js` |
| Vegetation wind | vertex offset in TSL from noise(position, time) on instanced meshes | `src/common/noise.js`, instancing in `src/plankton.js` |
| GPU Verlet (experimental) | particles + springs in `instancedArray`, compute pass per frame, bridge binds mesh vertices | `src/physics/verletPhysics.js`, `src/medusaVerletBridge.js`, `src/medusaTentacles.js` |
| Dev tuning | Tweakpane — dev builds only | `src/conf.js` |

Not used: procedural geometry (`src/medusaBell*.js`); dinosaurs are GLB models (ADR 0004).

## Consequences
Do not copy Aurelia code wholesale. Borrowed snippets keep the MIT notice and are listed in `THIRD_PARTY_NOTICES.md`.
