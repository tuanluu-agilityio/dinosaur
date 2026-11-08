# 0011 — GPU Verlet secondary motion (tail tip, throat skin)

- **Status:** Proposed (keep/drop is open; see "Open before acceptance")
- **Date:** 2026-11-08
- **Decided by:** perf-engineer (issue #34)

## Context
ADR 0007 lists GPU Verlet (Aurelia `src/physics/verletPhysics.js`, `src/medusaVerletBridge.js`) as an experimental technique. ADR 0010 left `BUDGETS[tier].verlet` provisional (on for high only). Issue #34 asks for a GPU Verlet chain that drives tail-tip and throat-skin offsets on the high tier. It is kept only if two conditions hold. The visual-judge must rate it more natural than the authored clips alone. The high-tier frame time must grow by 1 ms or less.

## Experiment (`src/dinos/softbody.ts`, `dev/softbody.html`)
- **Chains:** tail1..tail6. tail1 is pinned, and tail2..tail6 run at 2.6 to 1.5 Hz with damping ratio 0.45 to 0.33. The throat is head (pinned) to jaw at 3.2 Hz with damping ratio 0.22. No model has a throat bone, so the jaw node moves only the soft jaw/neck seam. That seam uses the vertex weight 4w(1-w), so the rigid jaw, teeth and tongue (w = 1) stay still. Pachycephalosaurus has no jaw, so it gets the tail chain only.
- **Simulation:** Verlet runs on the offset from the animated bone. The bone's acceleration drives it, a spring pulls it back, and damping acts relative to the animated pose, so steady walking adds no lag. The animated bone length to the parent node is kept. The state is hard-clamped at twice the limit, and the output saturates softly at the limit (0.3–3.2 % of the focus radius).
- **Cost structure:** one compute dispatch per frame for all chains (one invocation per chain, fixed 120 Hz substeps, at most 4 per frame). The CPU copies each chain bone's world position from the last render into one small buffer, with no allocations. In the skinned vertex shader, `positionNode` adds sum(skinWeight × offset[skinIndex]) (4 storage reads per vertex, in the main and shadow passes). Capacity is fixed: 32 chains and 16 skeletons. Adding a dino never rebuilds the kernel. `setEnabled(false)` writes zero offsets once and then stops dispatching, without a recompile.
- **Gating:** `BUDGETS[tier].verlet` must be on, and the backend must be WebGPU. WebGL2 never constructs the system.

## Evidence (issue #34, 2026-11-08)
- **Visual A/B**, 12 m T. rex stage script (walk, 90° turn, sudden stop, roar), left half off and right half on. Each video has a frame strip: `task-34-ab-side.mp4`, `task-34-ab-tail.mp4` and `task-34-ab-head.mp4` on the `review-artifacts` release. Measured offsets: tail6 up to about 0.20 m before saturation (about 0.14 m after it), tail4–5 3–14 cm, throat seam 0.5–3 cm. The mesh does not tear. On screen the difference is subtle: the tail tip trails and overshoots on the turn and the stop.
- **Frame time:** `task-34-perf.json`, measured with the `tests/e2e/perf.spec.ts` method on the `dev/softbody.html` scene (terrain, vegetation, 1 T. rex and 3 triceratops). It is **not valid**. The empty-scene control had p95 6.0 ms at the start and 77.1 ms at the end, against a gate of ≤ 4 ms. Another project's Playwright run and a GPU screensaver used the GPU outside the board lock (KI-8), and on/off rows of the same configuration varied 40–190 ms in median. A difference of 1 ms or less cannot be resolved from this data.
- **CPU time of `SecondaryMotion.update`** (copying bone positions plus submitting the compute dispatch): median 0.3 ms on desktop and 1.2–1.6 ms on the phone proxy (CPU ×4). The phone tier never runs the effect.

## Decision
Not yet decided. The effect stays in the code base as an isolated module that the app does not use: `app.ts` does not construct `SecondaryMotion`, so no shipped frame changes. `BUDGETS.high.verlet` keeps its provisional value from ADR 0010.

## Open before acceptance
1. **Frame time:** on an idle machine (control p95 ≤ 4 ms and max ≤ 50 ms, KI-8), run the interleaved A/B on desktop high (`softbody=0` against `softbody=1`, 3 runs each, best p95 per arm). Keep the effect only if the high-tier median and p95 each grow by ≤ 1 ms.
2. **Visual-judge:** rate the A/B videos against "more natural than the clips alone".
3. If both pass: wire it in a follow-up task with `src/app/app.ts` in its file list (construct with `BUDGETS[tier].verlet && isWebGPU`, `add(dino)` after `Dino.load`, `update(dt)` once per frame, `setEnabled(false)` on a downgrade, `remove(dino)` before a variant swap). Then set this ADR to Accepted. If either fails: set `BUDGETS.*.verlet` to false (a perf.json is needed for the budget change), delete the module, and record "dropped" here.

## Consequences
- Until accepted, nothing ships, and the perf gate is unaffected.
- The 0.3 ms CPU median on desktop is mostly the cost of submitting the compute pass. If the GPU side fits the budget too, the effect can be added without changing the forest or particle budgets.
- TSL pitfall found here: nested `Loop`s all name their index `i`, and WGSL shadowing then makes the outer index unreadable in the inner loop. Give every nested loop its own `name`.
