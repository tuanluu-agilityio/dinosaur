# Performance spike results (P2-T01, issue #12)

Sets `BUDGETS` in `src/core/budgets.ts`. Decision record: ADR 0010.

## What the spike renders (`dev/spike.html`, `src/spike/spike.ts`)

- **Ferns:** instanced procedural fern (8 arching fronds, 96 triangles, alpha-tested pinnate leaflets). One draw call. Placement, scale, yaw and wind come from TSL using `instanceIndex` and `time`. Wind is `mx_noise_vec3(base.xz * 0.1 + time)` plus a per-frond flutter, weighted toward the frond tips. No per-instance CPU work and no instance matrices.
- **Particles:** camera-facing billboards, Aurelia `plankton.js` style. Position, drift and flicker come from hash and noise of `instanceIndex` and `time`. Additive blending, one draw call.
- **T. rex:** the manifest candidate (Sketchfab `6465a297…`, CC-BY-4.0) fetched with `fetch.mjs` and converted with `convert.py`. The candidate is static (no rig, no clips; see `docs/assets/candidates.md`). So that the spike pays real skinning cost, a scratch Blender step added a proxy rig: a 12-bone spine chain, 2 weights per vertex, one looping 2 s `idle` clip, and its 4096 px textures. It then went through `optimize.mjs`:
  - `high`: 59k triangles, 2048 px KTX2, 7.2 MB
  - `low`: 21k triangles, 1024 px KTX2, 2.9 MB

  The proxy rig is spike-only and not committed. The real rig belongs to the T. rex asset task.
- **Scene:** ground plane, hemisphere and sun light, fog. The sun casts a 2048² shadow map when `BUDGETS[tier].shadows` is on, and ferns, T. rex and ground take part. The camera orbits at 16 m on a fixed, time-based path.
- **Overrides:** URL params `tier`, `ferns`, `particles`, `shadows=0|1`, `variant=low|high`, `trex=0`, `model=<url>`. Other values come from `BUDGETS[tier]`.
- **Model location:** the GLB is read from `assets/src/tyrannosaurus/out/` (git-ignored by convention, not committed). Without it the spike runs without the T. rex and `perf.json` shows `trexLoaded: false`.

## Method (`tests/e2e/perf.spec.ts`)

- **Hardware:** Intel Arc integrated GPU (Xe-LPG, Meteor Lake), Windows 11, Playwright 1.64 Chromium headless shell, WebGPU backend (D3D12; `--disable-dawn-features=use_dxc` because the headless shell cannot load `dxcompiler.dll`). An integrated GPU is below a mid-range discrete card, so desktop numbers are conservative.
- **Frame time:** the rAF interval in ms. Vsync and the frame-rate limit are off, so the number is real per-frame cost rather than the 16.7 ms display cap. Each scenario gets a 2 s warm-up and then a 10 s recording. Each scenario runs in a fresh browser.
- **Desktop:** 1920×1080 at DPR 1.
- **Phone proxy:** 390×844 at DPR 3, which renders at 780×1688 because the renderer caps DPR at 2. Chromium CPU throttling is ×4 through CDP.
  - Limit: the proxy slows the CPU only. The GPU is still the desktop iGPU, which is several times faster than a mid-range phone GPU.
- **Control:** an empty scene (no ferns, particles or T. rex) is measured first. On the idle reference machine it gives p95 ≈ 1.5–1.9 ms. If the control p95 is above 4 ms, the gate test fails with "machine is busy". During this task other agents shared the machine, and runs with a loaded control (p95 4–10 ms) gave fern p95s 2–10× too high. Those runs were discarded.
- **Binary search:** the search scripts were kept out of the repo. The search drives `perf.spec.ts` through `PERF_QUERY` / `PERF_OUT` / `--grep "<profile> <tier> "`. Each probe point ran 3 times and kept the minimum p95, because outside load only adds time.
- **Headroom rule:** the spike is only part of the final scene, which still needs terrain, cycads, conifers, more dinosaurs, godrays and UI. So the spike may use at most **half** of each frame budget:
  - desktop high: p95 ≤ 8.33 ms (half of 16.7)
  - phone medium: p95 ≤ 16.7 ms (half of 33.3)
- **Medium on phones:** the proxy cannot slow the GPU, so medium takes half of the proxy's measured maximum.

## Binary search (ferns; min p95 of 3 runs, ms)

| Profile / tier | Fixed | Ferns → p95 | Result |
|---|---|---|---|
| desktop high (target ≤ 8.33) | particles 20000, shadows on, T. rex high | 9000 → 12.7 · 6500 → 10.2 · 5250 → 7.8 · 6000 → 8.1 · 6250 → 8.6 | **6000** |
| phone medium (target ≤ 16.67) | particles 10000, shadows off, T. rex low | 9000 → 27.0 · 7250 → 21.2 · 6750 → 20.6 · 6250 → 13.7 · 5250 → 9.8 | 6250 proxy max → **3000** (half, GPU not emulated) |

**Particles are cheap.** Desktop high with 6000 ferns: 20 000 particles gave p95 8.1 ms, 85 000 gave 9.2 ms and 160 000 gave 9.9 ms, so each extra 10 000 costs about 0.1 ms. On the phone proxy with 3000 ferns, over 3 clean runs each with an idle control:

| Particles | Median (ms) | p95 (ms) |
|---|---|---|
| 10 000 | 3.3 | 8.7 |
| 20 000 | 4.4 | 8.9 |
| 40 000 | 3.6 | 9.9 |

The particle counts stay at 20 000 / 10 000 / 5 000. Smoothness ranks above effects, and more motes do not add realism.

## Before / after (full `perf.spec.ts` run; median / p95 / max ms)

**Before:** placeholder `BUDGETS`, shared browser, clamped dt. Commit `test(perf): add frame-time gate…`.
**After:** measured `BUDGETS`, fresh browser per scenario, raw rAF interval, control p95 1.9 ms. Commit `perf(perf): set quality budgets…`, which produced `test-results/perf.json`.

| Profile | Tier | Ferns / particles / shadows / dino | Before | After | Gate |
|---|---|---|---|---|---|
| desktop | high | 6000 / 20000 / on / high | 7.3 / 9.1 / 47.2 | 7.8 / 10.4 / 20.6 | p95 ≤ 16.7, max < 100: **pass** |
| desktop | medium | 3000 / 10000 / off / low | 2.9 / 8.7 / 85.3 | 3.2 / 6.7 / 69.0 | none |
| desktop | low | 1500 / 5000 / off / low | 2.2 / 5.1 / 92.6 | 2.2 / 3.8 / 61.2 | none |
| phone | high | 6000 / 20000 / on / high | 5.9 / 37.6 / ≥100 | 4.5 / 21.3 / 76.8 | none (phones start on medium) |
| phone | medium | 3000 / 10000 / off / low | 3.1 / 14.5 / 42.4 | 2.9 / 4.6 / 23.8 | p95 ≤ 33.3, max < 100: **pass** |
| phone | low | 1500 / 5000 / off / low | 2.3 / 4.3 / 24.6 | 2.2 / 3.5 / 26.8 | none |

The ferns and particles counts did not change, because the search confirmed the placeholders sit at the half-budget line. The before/after difference is the measurement fix, not a content change:

- "Before" ran every scenario in one browser. That leaked a single 105–123 ms frame into phone/medium in three full runs out of three.
- "After" ran each scenario in a fresh browser, and the full suite passed 8/8 twice in a row.

Two budget values did change: `textureMax` went down to match what was measured. The `optimize.mjs` variants cap textures at 2048 (high) and 1024 (low), so high is now 2048 (was 4096) and medium is 1024 (was 2048).

## Not measured here

- **Cycads and conifers:** counts are provisional (placeholder ratios). The forest task (P2 `vegetation.ts`) must measure them with `perf.spec.ts`.
- **Godrays and Verlet:** still provisional (high only).
- **Real phone GPU:** the phone proxy does not cover it. Check on a real mid-range WebGPU phone before launch.
- **Per-frame allocation:** sampled heap is about 400 B per frame, all inside three's renderer (`update`, `beginRender`). The spike's own loop allocates nothing.

## Evidence

- `test-results/perf.json` from the "after" run, published as `task-12-perf.json`.
- Tier screenshots: `task-12-spike-{desktop,phone}-{high,medium,low}.png` and `task-12-spike-webgl2-low.png` (WebGL2 fallback, no console errors).
- 10 s desktop-high recording: `task-12-spike-desktop-high.mp4` with frame strip `task-12-spike-desktop-high-strip.png`.

All files are in the `review-artifacts` release.
