# Agent Workflow (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the infrastructure that lets Claude Code subagents run the product plan unattended on the user's machine, tracked on a GitHub Project, resumable after disconnects and usage limits.

**Architecture:** GitHub (issues, Project v2, PRs) + git (branches, worktrees, commits) are the only source of truth. A small Node CLI (`scripts/agent/board.mjs`) wraps every board operation so agents spend one command instead of many `gh` calls. An interactive orchestrator session (`/run` command) reads the board, dispatches subagents defined in `.claude/agents/`, and can be killed and restarted at any time.

**Tech Stack:** Node.js LTS (ESM `.mjs`, no build step), `gh` CLI (GraphQL for Projects v2), Vitest, git worktrees, git hooks via `core.hooksPath`.

**Spec:** `docs/superpowers/specs/2026-10-30-agent-workflow-design.md` (and `2026-10-30-dinosaur-explorer-design.md` for ADR content).

**Plan language:** English, to cut agent tokens (Vietnamese tokenizes ~2–3× longer). Project docs for the user (`runbook.md`, README) are Vietnamese. *(planner's call)*

## Global Constraints

- Phase 0 runs **sequentially, one agent, committing directly to `main`** (spec §13). Tasks P0-T01..T03 are executed interactively with the user present (they create the repo and the board); P0-T04..T06 may run unattended.
- Repo is **public**: never commit secrets. `.env` is gitignored; pre-commit hook blocks token-like strings.
- Branch for every task from Phase 1 on: `task/<issue-number>-<slug>`; squash merge.
- Commit format: Conventional Commits `<type>(<scope>): <subject>`; types `feat fix perf refactor test docs build ci chore content asset`; scopes = `area:*` labels (`scene dino ui i18n audio assets perf content build agent docs`); subject ≤ 72 chars, imperative, English; footer `Refs #<n>` (Phase 1+) and `Co-Authored-By:` trailer of the model.
- Project `Status` options exactly: `Todo`, `In Progress`, `Review`, `Done`.
- Max **3** attempts per task, then label `needs-human`, record in `docs/known-issues.md`, continue other tasks.
- Max **3** concurrent subagents; tasks with `heavy: true` (Blender, Playwright perf runs) never run concurrently with each other.
- Permission mode: **auto mode + allowlist**, never bypass.
- On usage limit: stop; best-effort pause note on running issues and the `Run status` issue; checkpoints are the primary recovery.
- Every board-mutating command is **idempotent** (safe to re-run after a crash).

## Review Focus

1. **Disconnect mid-step with a dirty worktree** → `resume` reports the dirty files and the last checkpoint; the agent inspects and either commits or discards, never silently loses or duplicates work. (P0-T02 `resume` test; P0-T06 dry run)
2. **Plan imported twice** (or import interrupted halfway) → no duplicate issues; missing ones get created. (P0-T02 `planToIssues` + P0-T03 import test)
3. **Two orchestrators started** (user opens a second terminal) → second one refuses with a clear message unless the lock's heartbeat is older than 30 min. (P0-T02 lock test)
4. **A dependency closed as "not planned"** (species dropped) → dependents are not "ready"; they get `blocked` reported, not run. (P0-T02 `readyTasks` test)
5. **Commit message in Vietnamese or missing type** → hook rejects with an example of the right format. (P0-T01 hook test)

---

## Task file format (consumed by `board.mjs import`)

Every task in every plan starts with a level-3 heading `### <ID> — <title>` followed immediately by a fenced block with info string `task`:

````
### P1-T03 — Asset scouting
```task
id: P1-T03
wave: 1
agent: asset-scout
model: haiku
area: assets
depends: [P0-T06]
heavy: false
files: [docs/assets/candidates.md, assets/manifest.json]
```
...markdown body (goal, steps, acceptance criteria)...
````

The issue body is the whole section (heading excluded) plus a hidden marker `<!-- task-id: P1-T03 -->` used for idempotency.

---

### P0-T01 — Repo baseline, hooks, secret guard
```task
id: P0-T01
wave: 0
agent: orchestrator
model: sonnet
area: build
depends: []
heavy: false
files: [package.json, .gitignore, .env.example, .githooks/commit-msg, .githooks/pre-commit, scripts/hooks/check-commit-msg.mjs, scripts/hooks/check-secrets.mjs, tests/hooks/check-commit-msg.test.mjs, tests/hooks/check-secrets.test.mjs, vitest.config.mjs]
```

**Interfaces — Produces:**
- `checkCommitMsg(msg: string): { ok: boolean, error?: string }` in `scripts/hooks/check-commit-msg.mjs`
- `findSecrets(diffText: string): string[]` (matched line excerpts) in `scripts/hooks/check-secrets.mjs`
- npm scripts: `test` (vitest run), `prepare` (`git config core.hooksPath .githooks`)

- [ ] **Step 1:** `git branch -m master main`. Create `package.json` (`"type": "module"`, private), add `vitest` dev dep, `vitest.config.mjs` including `tests/**/*.test.mjs`.
- [ ] **Step 2: Failing tests** `tests/hooks/check-commit-msg.test.mjs`:
  - accepts `feat(ui): add language toggle` and `fix(scene): clamp fog density\n\nRefs #12`
  - rejects `update stuff` (error mentions `<type>(<scope>): <subject>` and an example)
  - rejects unknown type `feature(ui): x`, unknown scope `feat(foo): x`, subject > 72 chars
  - accepts merge commits starting `Merge ` and `Revert "`
- [ ] **Step 3: Failing tests** `tests/hooks/check-secrets.test.mjs`:
  - flags `SKETCHFAB_API_TOKEN=abcd1234…` (≥ 20 chars value), `ghp_`/`gho_` tokens, `-----BEGIN PRIVATE KEY-----`
  - does not flag `.env.example` style `SKETCHFAB_API_TOKEN=` (empty) or the word `token` in prose
- [ ] **Step 4:** Implement both modules; `.githooks/commit-msg` and `.githooks/pre-commit` are `#!/bin/sh` wrappers calling `node scripts/hooks/<x>.mjs` (pre-commit feeds `git diff --cached`). Exit non-zero with the error text.
- [ ] **Step 5:** `.gitignore`: `node_modules/ dist/ .env .worktrees/ .superpowers/ .agent-lock test-results/ playwright-report/`. `.env.example`: `SKETCHFAB_API_TOKEN=`.
- [ ] **Step 6:** `npm install && npm test` → all pass. `git commit -m "bad"` → rejected. Commit `build(build): add repo baseline, commit and secret hooks`.

**Acceptance:** tests pass; both hooks fire on Windows Git Bash; no file outside the list changed.

---

### P0-T02 — Board CLI core (pure logic + gh wrapper)
```task
id: P0-T02
wave: 0
agent: orchestrator
model: sonnet
area: agent
depends: [P0-T01]
heavy: false
files: [scripts/agent/board.mjs, scripts/agent/lib/plan.mjs, scripts/agent/lib/graph.mjs, scripts/agent/lib/checkpoint.mjs, scripts/agent/lib/lock.mjs, scripts/agent/lib/gh.mjs, tests/agent/plan.test.mjs, tests/agent/graph.test.mjs, tests/agent/checkpoint.test.mjs, tests/agent/lock.test.mjs]
```

**Interfaces — Produces:**
- `parsePlan(markdown: string): Task[]` — `Task = { id, title, wave, agent, model, area, depends: string[], heavy: boolean, files: string[], body: string }`; throws `PlanError` naming the task id and field on missing/invalid metadata or duplicate id.
- `readyTasks(tasks: TaskState[], maxConcurrent = 3): string[]` — `TaskState = Task & { status: 'Todo'|'In Progress'|'Review'|'Done', closedAs?: 'completed'|'not_planned' }`. Ready = `Todo` and every dependency `Done` with `closedAs: 'completed'`; ordered by wave then id; never returns two `heavy` tasks, never more than `maxConcurrent - running`, never two tasks whose `files` intersect (with each other or with running tasks).
- `blockedTasks(tasks): {id, by: string[]}[]` — Todo tasks with any dependency closed `not_planned` or labelled `needs-human`.
- `formatCheckpoint(c: {agent, model, attempt, done: string, next: string, branch: string, sha: string}): string` and `parseLastCheckpoint(comments: string[]): Checkpoint | null` — marker `<!-- checkpoint -->`.
- `acquireLock(path, now = Date.now()): {ok: boolean, holder?: {pid, startedAt, heartbeat}}`, `heartbeat(path)`, `releaseLock(path)` — stale after 30 min without heartbeat.
- `gh.mjs`: thin `ghJson(args: string[]): Promise<any>` and `ghGraphql(query, vars)` over `child_process.execFile('gh', …)`; no logic.
- `board.mjs` subcommands (argument parsing only, delegates to lib): `preflight`, `setup`, `import <plan…>`, `ready`, `claim <issue> --agent --model`, `checkpoint <issue> --done --next`, `move <issue> <status>`, `fail <issue> --reason`, `resume`, `pause --reason`, `status`. Output: one line of JSON (agents parse it) unless `--pretty`.

- [ ] **Step 1: Failing tests** `tests/agent/plan.test.mjs`: parses a two-task fixture; body excludes the heading and the `task` block; missing `agent` → `PlanError` mentioning `P1-T03` and `agent`; duplicate id → error.
- [ ] **Step 2: Failing tests** `tests/agent/graph.test.mjs`: dependency `not_planned` → not ready and listed in `blockedTasks`; two heavy Todo tasks → only first returned; file overlap with a running task → excluded; respects `maxConcurrent`.
- [ ] **Step 3: Failing tests** `tests/agent/checkpoint.test.mjs`: round-trip format→parse; last of several checkpoints wins; comments without marker ignored.
- [ ] **Step 4: Failing tests** `tests/agent/lock.test.mjs` (temp dir): second acquire fails with holder info; acquire succeeds when heartbeat is 31 min old.
- [ ] **Step 5:** Implement libs; run `npm test` → pass.
- [ ] **Step 6:** Implement `board.mjs` dispatch for subcommands whose lib exists (GitHub-touching ones are completed in P0-T03). Commit `feat(agent): add board CLI core logic`.

**Acceptance:** all tests pass; `node scripts/agent/board.mjs --help` lists every subcommand.

---

### P0-T03 — Preflight, GitHub setup and import (creates the board)
```task
id: P0-T03
wave: 0
agent: orchestrator
model: sonnet
area: agent
depends: [P0-T02]
heavy: false
files: [scripts/agent/lib/github.mjs, scripts/agent/lib/preflight.mjs, scripts/agent/board.mjs, tests/agent/preflight.test.mjs, tests/agent/import.test.mjs, .agent/project.json]
```

**Run interactively with the user.** Needs: `gh auth refresh -s project` done by the user, user's OK to create the public repo.

**Interfaces — Produces:**
- `.agent/project.json` (committed): `{ owner, repo, projectNumber, projectId, fieldIds: {status, agent, model, wave, attempt, heartbeat}, statusOptionIds: {Todo, "In Progress", Review, Done} }`
- `runPreflight(env): {checks: {name, ok, fix}[]}` — checks: gh logged in with scopes `repo project workflow`; git remote `origin` exists; branch `main`; `core.hooksPath=.githooks`; `node ≥ 20`; `python` + `edge_tts` importable; `blender --version` ≥ 4.2; `toktx` present (KTX2); `SKETCHFAB_API_TOKEN` set in env or `.env`; Playwright browsers installed. Each failing check carries a one-line `fix` command.
- `planToIssues(tasks, existingIssues): {create: Task[], update: {number, task}[]}` — matches by `<!-- task-id: X -->` marker.

- [ ] **Step 1: Failing tests** `tests/agent/preflight.test.mjs` with an injected fake `exec`: missing `project` scope → check fails with fix `gh auth refresh -s project`; all present → all ok.
- [ ] **Step 2: Failing tests** `tests/agent/import.test.mjs`: existing marker → goes to `update`, not `create`; changed body → update; second run over its own output → empty create list.
- [ ] **Step 3:** Implement preflight + `planToIssues`; tests pass.
- [ ] **Step 4:** Implement `setup` (idempotent): use the repo behind `origin` (the user created `tuanluu-agilityio/dinosaur`); create a public `t-rex` repo only if `origin` is missing (`gh repo create --public --source . --push`); create Project v2 "T-rex — Dinosaur Explorer"; link repo; create fields `Agent` (text), `Model` (single select: haiku, sonnet, opus), `Wave` (number), `Attempt` (number), `Heartbeat` (text, ISO time); set `Status` options to the four exact values; labels `phase:0..5`, `area:*`, `needs-human`, `known-issue`, `blocked`, `heavy`; issue `Run status` (pinned). Write `.agent/project.json`.
- [ ] **Step 5:** Implement `import`: parse both plan files, create/update issues (title `[<ID>] <title>`, labels `phase:<wave-phase>`, `area:<area>`, `heavy` if heavy), add to Project with `Status=Todo`, `Wave`, `Agent` (planned agent), `Model`. Then a second pass writes `Blocked by #n` lines resolved from `depends`.
- [ ] **Step 6:** Run `preflight` (report gaps to the user), `setup`, `import docs/superpowers/plans/*.md`. Re-run `import` → output says `created: 0`. Commit `feat(agent): add preflight, GitHub setup and plan import`.

**Acceptance:** board shows every task of both plans in `Todo` with Agent/Model/Wave filled; second import is a no-op; P0-T01..T03 issues moved to `Done` with a closing comment linking their commits.

---

### P0-T04 — Knowledge base: CLAUDE.md, conventions, ADRs, rubrics
```task
id: P0-T04
wave: 0
agent: orchestrator
model: sonnet
area: docs
depends: [P0-T03]
heavy: false
files: [CLAUDE.md, docs/conventions/commits.md, docs/conventions/branching.md, docs/conventions/code-style.md, docs/conventions/performance.md, docs/decisions/0000-template.md, docs/decisions/0001-*.md, docs/decisions/0002-*.md, docs/decisions/0003-*.md, docs/decisions/0004-*.md, docs/decisions/0005-*.md, docs/decisions/0006-*.md, docs/decisions/0007-*.md, docs/decisions/0008-*.md, docs/decisions/0009-*.md, docs/known-issues.md, docs/rubrics/visual-model.md, docs/rubrics/scene.md, docs/rubrics/content.md, docs/rubrics/code.md]
```

- [ ] **Step 1:** `CLAUDE.md` ≤ 100 lines: project one-liner; "read only what your issue lists"; where specs/ADRs/known-issues/rubrics live; commit + branch rules (link conventions); "never commit secrets"; "write an ADR for any new architectural decision in the same PR"; how to report (≤ 15 lines, JSON-ish summary).
- [ ] **Step 2:** ADRs (each: Context / Decision / Consequences / Status: Accepted): 0001 three.js `WebGPURenderer` + TSL, no React; 0002 single Hell Creek (late Maastrichtian) scene, only co-existing species; 0003 model licences CC0/CC-BY/CC-BY-NC, never ND, attribution mandatory; 0004 realism over species count, drop species without a realistic model; 0005 narration pre-generated with `edge-tts`; 0006 performance targets (60 fps desktop / ≥ 30 fps stable WebGPU phones, WebGL2 fallback without compute effects); 0007 Aurelia reference pinned at `724aba263459d1b11a49b72bfc7ce8baac840ca8`, technique→file table copied from spec §7; 0008 automated review via rubrics, no human gates; 0009 bilingual vi/en content, default from browser language.
- [ ] **Step 3:** Rubrics, each a checklist with PASS/FAIL per line and the evidence required:
  - `visual-model.md`: anatomy matches current consensus for that species (list per-species red flags: T-rex hands not pronated, no "shrink-wrapped" skull, lips/teeth coverage stated as debated; Triceratops forelimb posture; Ankylosaurus tail club osteoderms; Edmontosaurus beak; Pachycephalosaurus dome); no cartoon/low-poly look at 1 m camera distance; animation has no foot sliding > visible, no interpenetration; licence allows modification; low-tier GLB ≤ 3 MB, high-tier ≤ 15 MB. Evidence: 6 turntable PNGs + 1 animation MP4 per tier.
  - `scene.md`: flora matches late Cretaceous (no grass), no visible pop-in at tier boundaries, fps targets met.
  - `content.md`: every factual claim has a source; contested claims phrased as contested; numbers in ranges with units; Vietnamese natural, terminology consistent (glossary inside the rubric).
  - `code.md`: tests for new logic, no ADR violations, files only within the issue's list, no secrets.
- [ ] **Step 4:** `docs/known-issues.md` with table header `| ID | Summary | Impact | Workaround | Issue |`.
- [ ] **Step 5:** Commit `docs(docs): add knowledge base, ADRs and rubrics`.

**Acceptance:** every decision in both specs maps to exactly one ADR; CLAUDE.md ≤ 100 lines.

---

### P0-T05 — Agent definitions, permissions, `/run` command
```task
id: P0-T05
wave: 0
agent: orchestrator
model: sonnet
area: agent
depends: [P0-T04]
heavy: false
files: [.claude/agents/asset-scout.md, .claude/agents/asset-engineer.md, .claude/agents/content-writer.md, .claude/agents/fact-checker.md, .claude/agents/frontend-dev.md, .claude/agents/perf-engineer.md, .claude/agents/narrator.md, .claude/agents/code-reviewer.md, .claude/agents/visual-judge.md, .claude/commands/run.md, .claude/settings.json]
```

- [ ] **Step 1:** One file per agent with frontmatter `name`, `description`, `model` (asset-scout haiku, asset-engineer sonnet, content-writer sonnet, fact-checker opus, frontend-dev sonnet, perf-engineer opus, narrator haiku, code-reviewer opus, visual-judge opus) and `tools`. Body (≤ 40 lines): role; "you work only in the worktree path you are given"; checkpoint after every plan step via `node scripts/agent/board.mjs checkpoint`; commit rules; final report format; reviewer agents additionally: rubric file to use, verdict `APPROVE` / `CHANGES: <list>`, never edit code.
- [ ] **Step 2:** `.claude/commands/run.md` — the orchestrator protocol:
  1. `board.mjs preflight` → stop with the fix list if anything fails.
  2. `acquireLock`; if held → stop and explain.
  3. `board.mjs resume` → for each In Progress: dispatch same agent type with the checkpoint's `next` and the worktree path; for each Review: re-run review.
  4. Loop: `board.mjs ready` → for each id: create worktree `.worktrees/task-<n>` on `task/<n>-<slug>` (reuse if exists), `claim`, dispatch subagent with the issue body; on report → open PR (`gh pr create`, title = commit-style), `move Review`, dispatch reviewer(s) by area (`assets`→visual-judge, `content`→fact-checker, all→code-reviewer); APPROVE → squash merge, `move Done`, remove worktree; CHANGES → `move "In Progress"`, attempt+1, re-dispatch with review notes; attempt > 3 → `fail`.
  5. Heartbeat every dispatch. On usage-limit error → `pause --reason usage-limit`, release lock, stop.
  6. When nothing is ready and nothing running → post final summary to `Run status`, stop.
- [ ] **Step 3:** `.claude/settings.json` `permissions.allow`: `Bash(git:*)`, `Bash(gh:*)`, `Bash(npm:*)`, `Bash(npx:*)`, `Bash(node:*)`, `Bash(python:*)`, `Bash(blender:*)`, `Bash(toktx:*)`, `WebSearch`, `WebFetch`, `Edit`, `Write`; `deny`: `Bash(git push --force:*)`, `Bash(rm -rf /:*)`, reading `.env` contents into output.
- [ ] **Step 4:** Commit `feat(agent): add subagent definitions, permissions and run command`.

**Acceptance:** `claude` lists all 9 agents; `/run` appears as a command.

---

### P0-T06 — Dry run, runbook, hand-off to Phase 1
```task
id: P0-T06
wave: 0
agent: orchestrator
model: sonnet
area: agent
depends: [P0-T05]
heavy: false
files: [docs/runbook.md, docs/known-issues.md, .claude/settings.json]
```

- [ ] **Step 1:** Create a throwaway issue `[DRY] hello` (task `DRY-T01`, agent frontend-dev, files `[tmp/dry.txt]`). Run `/run` limited to it: claim → worktree → subagent writes `tmp/dry.txt`, checkpoints after step 1.
- [ ] **Step 2:** Simulate disconnect: kill the session after the first checkpoint. Start a new session, `/run` → verify it resumes at "next", not from scratch; finish → PR → code-reviewer → merge → Done. Then revert the dry change, close the issue `not planned`.
- [ ] **Step 3:** Record every permission prompt that appeared; add the missing allow rules to `.claude/settings.json`.
- [ ] **Step 4:** Write `docs/runbook.md` (Vietnamese): how to start (`claude` → `/run`), how to resume after shutdown/usage limit (same command), how to read the board and `Run status`, how to reopen a task you dislike (move to Todo + comment), how to watch an agent live.
- [ ] **Step 5:** Commit `docs(agent): add runbook and dry-run fixes`; post "Phase 0 complete" in `Run status`.

**Acceptance:** dry run passed including the resume; zero permission prompts on the second dry run.
