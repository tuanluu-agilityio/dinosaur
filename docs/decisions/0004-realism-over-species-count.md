# 0004 — Realism over species count

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user

## Context
The user would rather lose species than see a fake-looking dinosaur (spec §1, §6).

## Decision
- A species ships only if its model passes `docs/rubrics/visual-model.md`.
- Agents may rig, animate and anatomically fix a realistic static model in Blender (user permission).
- If no realistic model (static or animated) exists for a species, drop the species: close its issues as *not planned* with a comment.
- Launch minimum: T. rex + 2 other species. Below that, label the launch issue `needs-human`, record a known issue, keep building everything else. Never relax the rubric.
- Low-poly / stylized packs (e.g. Quaternius) are rejected.

## Consequences
The species list can shrink during the run; code must spawn only `approved` manifest entries.
