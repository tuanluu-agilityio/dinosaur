# 0013 — Licences: CC0, CC-BY and CC-BY-NC (3.0 and 4.0)

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** planner, aligning with the spec (supersedes 0003)

## Context
ADR 0003 allowed only the 4.0 versions of CC-BY and CC-BY-NC. The spec allows CC-BY and CC-BY-NC without a version, and much free audio (P3-T05) is published under 3.0.

## Decision
Everything in ADR 0003 stands, except the allowed licences are:
- **CC0**
- **CC-BY-3.0**, **CC-BY-4.0**
- **CC-BY-NC-3.0**, **CC-BY-NC-4.0**

Still forbidden: any NoDerivatives (ND) or ShareAlike-incompatible terms that would restrict this public repo, "editorial only", unclear licences. Attribution (author, link, licence, "modified") is mandatory for every BY/NC asset.

## Consequences
`AssetEntry.license` accepts the five values above; validators and the credits view must handle 3.0.
