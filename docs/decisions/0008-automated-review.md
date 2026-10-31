# 0008 — Automated review, no human gates

- **Status:** Accepted · extended by 0012 (item 10: perf PRs also get visual-judge; N/A lines)
- **Date:** 2026-10-31
- **Decided by:** user

## Context
After the plan is approved the run is fully automated. The user reviews afterwards and reopens what they dislike.

## Decision
- Every task goes branch → PR → review agent(s) → squash merge. `main` is protected (PR required, 0 approvals, no force push).
- Reviewers by area: all PRs → `code-reviewer` (`docs/rubrics/code.md`); `area:assets`/`area:dino`/`area:scene` visuals → `visual-judge` (`visual-model.md`, `scene.md`); `area:content` → `fact-checker` (`content.md`).
- Verdict `APPROVE` or `CHANGES: <list>`. Max 3 attempts, then `fail` → `needs-human`, known issue, run continues.
- Evidence (screenshots, videos, perf JSON) is linked from the PR so the user can audit later.

## Consequences
Rubrics are the quality bar; they may be tightened by ADR, never relaxed to pass a task.
