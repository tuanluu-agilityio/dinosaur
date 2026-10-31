# 0001 — three.js WebGPURenderer + TSL, no UI framework

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user (three.js, Aurelia-style WebGPU) + planner (no framework)

## Context
The user chose three.js and, after seeing holtsetio/aurelia, an Aurelia-style WebGPU approach. Smoothness is the top priority (spec §1, §8).

## Decision
- Render with three.js `WebGPURenderer` (imports from `three/webgpu`, shaders in TSL from `three/tsl`). It falls back to WebGL2 automatically.
- Vite + TypeScript. No React / React Three Fiber / Vue / UI framework. UI is plain HTML/CSS over the canvas.
- Pin the exact `three` version in `package.json`; upgrades need a PR that runs the perf gate (ADR 0010 once written).

## Consequences
- Direct control of the render loop and memory.
- Do not import from plain `three` for renderer/material code paths that must work with WebGPU; do not add a framework dependency.
