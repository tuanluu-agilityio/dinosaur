# 0011 — GPU Verlet secondary motion (tail tip, throat skin)

- **Status:** Proposed
- **Date:** 2026-11-07
- **Decided by:** perf-engineer (issue #34)

## Context
ADR 0007 lists GPU Verlet (Aurelia `src/physics/verletPhysics.js`, `src/medusaVerletBridge.js`) as an experimental technique. ADR 0010 left `BUDGETS[tier].verlet` provisional (on for high only). Issue #34 asks for a GPU Verlet chain that drives tail-tip and throat-skin offsets on the high tier. It is kept only if two conditions hold. The visual-judge must rate it more natural than the authored clips alone. The high-tier frame time must grow by 1 ms or less.

## Decision
_Filled in from the measurements below._

## Consequences
_Filled in from the measurements below._
