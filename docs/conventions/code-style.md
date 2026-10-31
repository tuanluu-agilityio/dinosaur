# Code style

- TypeScript `strict`; ES modules; no default exports except Vite entry points.
- One responsibility per file; feature folders (`src/world`, `src/dinos`, `src/ui`, …) as in the plan's file lists.
- Each feature ships a dev page `dev/<feature>.html` and a Playwright smoke test; `src/main.ts` is wired only in Wave 4.
- three.js: import renderer/material/node code from `three/webgpu` and TSL from `three/tsl` (ADR 0001).
- No magic numbers for counts/sizes — use `BUDGETS[tier]` (ADR 0006); no hard-coded UI strings — use `t(key)` (ADR 0009).
- Dispose GPU resources you create (geometries, materials, textures, render targets) when a feature is torn down.
- Comments explain *why*, not *what*; no commented-out code, no stray `console.log` (use `console.warn` for recoverable asset failures only).
- Scripts in `scripts/` are Node ESM `.mjs` (or Python for Blender/edge-tts); tests in `tests/`.
- Formatting: 2-space indent, single quotes, semicolons, trailing commas — match the surrounding file.
