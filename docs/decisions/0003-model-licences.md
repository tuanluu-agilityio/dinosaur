# 0003 — 3D model and media licences

- **Status:** Superseded by 0013 (adds the 3.0 versions; everything else stands)
- **Date:** 2026-10-31
- **Decided by:** user (non-commercial, free) + planner (ND exclusion)

## Context
Everything must be free. The site is non-commercial (no ads, no fees) and the repo is public. Models will be compressed, decimated and possibly re-rigged — all modifications.

## Decision
- Allowed: **CC0**, **CC-BY-4.0**, **CC-BY-NC-4.0** (models, flora, audio).
- Forbidden: any **NoDerivatives (ND)** licence, "editorial only", unclear licences.
- On download, record author, source URL, licence and every modification in `assets/manifest.json` (and `docs/assets/*.md` for flora/audio).
- Every BY/NC asset is credited in the site's credits view with author, link, licence and "modified" when applicable.

## Consequences
An asset without a recorded licence must not be committed.
