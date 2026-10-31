# 0006 — Performance targets and fallback

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user (jank is the worst outcome; phones must be smooth) + planner (numbers)

## Context
Jank is the user's top anti-goal. Target devices are WebGPU-capable desktops and phones.

## Decision
- **60 fps** on a mid-range desktop; **≥ 30 fps stable** (p95 frame ≤ 33 ms) on a mid-range WebGPU phone (iOS 26+, Android 2022+ Chrome).
- No hitch on camera flights, species loading or panel opening.
- Quality tiers `low | medium | high`, picked from device capabilities and **downgraded automatically** when fps stays low. Never upgrade at runtime.
- No WebGPU → WebGL2 fallback: full functionality, compute effects off; not optimised further.
- Priority on conflict: smooth > dinosaur realism > forest density > species count.

## Consequences
Every feature reads its counts from `BUDGETS[tier]`; nothing hard-codes instance or particle counts.
