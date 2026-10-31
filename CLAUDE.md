# Dinosaur Explorer — agent rules

Bilingual (vi/en) three.js WebGPU site: fly into a late-Cretaceous Hell Creek forest, click a living dinosaur, orbit it, read and hear accurate science. Built by Claude Code subagents tracked on GitHub Project #5.

## Read only what your issue lists

Your GitHub issue is your brief: goal, steps, allowed files, ADRs, acceptance. Read those, not the whole repo.

| Need | Where |
|---|---|
| Why the product is the way it is | `docs/superpowers/specs/2026-10-30-dinosaur-explorer-design.md` |
| How agents work | `docs/superpowers/specs/2026-10-30-agent-workflow-design.md` |
| Binding decisions | `docs/decisions/NNNN-*.md` (only the ones your issue names) |
| Known problems | `docs/known-issues.md` |
| How your work is graded | `docs/rubrics/*.md` |
| Commit/branch/style/perf rules | `docs/conventions/*.md` |
| Running/resuming the workflow | `docs/runbook.md` |

## Hard rules

1. **Never commit to `main`.** Work on `task/<issue>-<slug>` in `.worktrees/task-<issue>`; every change lands through a PR (squash merge). `main` is protected.
2. **Edit only the files your issue lists.** Need another file? Say so in your report; do not touch it.
3. **Commits:** `<type>(<scope>): <subject>` — English, imperative, ≤ 72 chars, footer `Refs #<issue>` and the `Co-Authored-By:` line for your model. See `docs/conventions/commits.md`. Never bypass hooks.
4. **Never commit secrets.** The repo is public. Tokens live only in `.env` (gitignored). Never print `.env`.
5. **ADRs bind you.** If your change contradicts an ADR, stop and report. A new architectural decision needs a new ADR in the same PR (`docs/decisions/0000-template.md`).
6. **TDD.** Write the failing test, watch it fail, make it pass. Visual work is graded by rubric evidence (screenshots/video) instead of unit tests.
7. **Checkpoint after every plan step:**
   `node scripts/agent/board.mjs checkpoint <issue> --done "<step done>" --next "<next step>"`
   A disconnect must never cost more than one step.
8. **Do not relax rubrics** or acceptance criteria to pass.

## Report format (≤ 15 lines, last message)

```
STATUS: DONE | BLOCKED | NEEDS_CONTEXT
ISSUE: #<n>  BRANCH: task/<n>-<slug>  HEAD: <sha>
TESTS: <command> → <result>
CHANGED: <files>
NOTES: <deviations, new ADRs, follow-ups — one line each>
```

## Project facts

- Stack: Vite + TypeScript + three.js `WebGPURenderer` + TSL; Vitest; Playwright; glTF-Transform; Blender 4.2+ headless; `edge-tts`.
- Priority on conflict: smooth > dinosaur realism > forest density > species count.
- Scene: Hell Creek, ~68–66 Ma. Species: tyrannosaurus, triceratops, ankylosaurus, edmontosaurus, pachycephalosaurus. No grass.
- Aurelia reference pinned at `724aba263459d1b11a49b72bfc7ce8baac840ca8` (ADR 0007).
- Site base path: `/dinosaur/` (GitHub Pages).
