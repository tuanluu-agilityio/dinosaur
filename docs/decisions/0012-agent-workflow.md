# 0012 — Agent workflow decisions

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user (marked) + planner
- Numbers 0010 (quality budgets, P2-T01) and 0011 (secondary motion, P4-T05) are reserved by the plan.

## Context
The workflow spec (`docs/superpowers/specs/2026-10-30-agent-workflow-design.md`) made decisions that had no ADR (final review of #44/#45).

## Decision
1. **State lives only in GitHub + git** (issues, Project #5, PRs, branches, commits) — never in a chat session. One worktree per task (`.worktrees/task-<n>`); one orchestrator at a time (lock, 30-minute stale). (spec §8)
2. **Every change goes issue → branch → PR → squash merge**; `main` is protected (user, 2026-10-31). (spec §13, ADR 0008)
3. **Model per agent:** cheapest model that does the job — Haiku for mechanical work (asset-scout, narrator), Sonnet for building (orchestrator, frontend-dev, asset-engineer, content-writer), Opus where mistakes are expensive (perf-engineer, code-reviewer, visual-judge, fact-checker). (spec §5)
4. **Concurrency:** at most 3 tasks in progress; `heavy` tasks (Blender, perf runs) never run together; tasks in flight never share files. (spec §9)
5. **Usage limit:** stop, post pause notes, resume with `/run`; checkpoints are the primary recovery (user). (spec §14)
6. **Permissions:** auto mode + allowlist, never bypass (user). (spec §14)
7. **Deploy:** every merge to `main` builds and deploys to GitHub Pages (public repo, user). (spec §13–§14)
8. **PR AI-share labels:** `agent-author` > 70 %, `agent-assistant` > 50–70 %, `agent-unused` ≤ 50 %, by changed lines of commits with a Claude `Co-Authored-By` (user). (spec §16)
9. **Languages:** spec §11 says project docs are Vietnamese; narrowed so that agent-facing files (plans, ADRs, rubrics, conventions, CLAUDE.md, code, commits) are English to save tokens, and user-facing docs (runbook, README) are Vietnamese. (ADR 0009)

10. **Reviewer mapping extends ADR 0008:** `area:perf` PRs also get `visual-judge` (scene rubric P1–P4); rubric lines outside a task's scope are `N/A` and never block.

## Consequences
Changing any of these needs a new ADR that supersedes this one (or the relevant item).
