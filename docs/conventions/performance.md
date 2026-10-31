# Performance rules

Targets and fallback: ADR 0006. Budgets: `src/core/budgets.ts` (numbers set by the P2-T01 spike, ADR 0010).

- Measure, don't guess: `tests/e2e/perf.spec.ts` reports median and p95 frame time per tier (desktop, and phone proxy = 390×844 + CPU throttling ×4). Attach `test-results/perf.json` to perf-relevant PRs.
- Many similar objects → `InstancedMesh`; per-instance motion in TSL from `instanceIndex` + `time` (ADR 0007), never a CPU loop over instances per frame.
- No allocations in the render loop (reuse vectors/matrices); no `new` in `update(dt)`.
- Textures KTX2, meshes meshopt-compressed (`scripts/assets/optimize.mjs`); phones get the `low` dinosaur variant.
- Stream assets: canopy + intro first, dinosaurs and far vegetation during the intro, high variant on focus.
- Effects gated by tier: shadows, godrays, Verlet only where `BUDGETS[tier]` allows.
- When over budget: lower budget numbers first, change code second — in separate commits.
- Never block the main thread > 50 ms (decode/compile off the critical path; `renderer.compileAsync` before first show).
