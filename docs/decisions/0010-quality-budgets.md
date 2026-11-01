# 0010 — Quality budgets and the perf regression gate

- **Status:** Accepted
- **Date:** 2026-11-01
- **Decided by:** perf-engineer (issue #12)

## Context
ADR 0006 asks for 60 fps on a mid-range desktop and p95 ≤ 33 ms on a mid-range WebGPU phone. It also requires every feature to read its counts from `BUDGETS[tier]`. The P2-T01 spike (`docs/perf/spike-results.md`) measured an instanced fern patch with TSL wind, GPU billboard particles and a skinned T. rex. It ran at desktop 1920×1080 and on a phone proxy (390×844, DPR 3, CPU ×4) on an Intel Arc integrated GPU.

## Decision
1. Budgets (`src/core/budgets.ts`):

   | Tier | Ferns | Particles | Shadows | Dino variant | Texture max | Cycads / conifers | Godrays / Verlet |
   |---|---|---|---|---|---|---|---|
   | high | 6000 | 20000 | on | high | 2048 | 450 / 180 (provisional) | on / on (provisional) |
   | medium | 3000 | 10000 | off | low | 1024 | 225 / 90 (provisional) | off / off |
   | low | 1500 | 5000 | off | low | 1024 | 110 / 45 (provisional) | off / off |

2. The spike's content (ferns, particles, one dinosaur) may use at most half of the frame budget. The other half is reserved for the rest of the scene. On desktop high that is p95 ≤ 8.3 ms. On the phone proxy at medium it is p95 ≤ 16.7 ms, and medium then takes half of the proxy's maximum because the proxy cannot slow the GPU.
2a. The forest (terrain, all flora, water, shadows; scenario `dev/forest.html`) may use at most 60% of the frame, because dinosaurs, particles and godrays need the other 40%: p95 <= 10.0 ms on desktop high and p95 <= 20.0 ms on the phone proxy at medium (orchestrator decision on PR #71; priority smooth > realism > forest density). Forest rows are measured as the minimum p95 of 3 runs, each in a fresh browser, and no forest row may have a frame over 100 ms.
3. `tests/e2e/perf.spec.ts` is the performance regression gate. Any PR that touches rendering, scene content or `BUDGETS` runs `npx playwright test perf --workers=1` on a machine with a hardware WebGPU adapter and attaches `test-results/perf.json`. The gate passes when all of these hold:
   - an empty-scene control has p95 ≤ 4 ms (proof that the machine is idle)
   - desktop/high has p95 ≤ 16.7 ms
   - phone-proxy/medium has p95 ≤ 33.3 ms
   - the longest frame in both of those scenarios is under 100 ms (scene rubric P3)
   - no scenario logs a console error

   On software adapters (CI without a GPU) the gate skips. That is not a pass.
3a. Early-angiosperm shrubs have their own budget field, `shrubs` (450 high / 225 medium / 110 low), added by the forest task (#25). Provisional until the forest scenario of the gate measures it. Task #25 lowered the provisional cycad/conifer/shrub counts to fit the forest share in 2a (high 450/180/450, medium 225/90/225, low 110/45/110, after a second measurement showed the first cut was not enough) before changing any code.
4. "Provisional" values were not measured by the spike. The task that adds each feature (forest vegetation, godrays, Verlet) must measure it with the gate. If it is over budget, lower the number first and change code second, in separate commits (`docs/conventions/performance.md`).

## Consequences
- **Hard-coded counts:** feature code never hard-codes instance or particle counts. A change to `BUDGETS` needs a `perf.json` from the gate in the PR.
- **Measurement method:** frame time is the rAF interval with vsync off. It measures cost, not the display cap. A busy machine fails the control check instead of producing false regressions.
- **Phone GPU:** the phone proxy does not model a phone GPU. Before launch, a check on a real mid-range WebGPU phone is still required, and it may lower the medium numbers through a new ADR.
- **Texture sizes:** these follow the `optimize.mjs` variants (2048 high, 1024 low). 4096 textures are not shipped.
