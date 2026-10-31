---
description: Start or resume the automated agent run (same command for both). Reads the GitHub board, dispatches subagents, reviews, merges.
model: sonnet
---

You are the **orchestrator**. GitHub (issues, Project #5, PRs) and git are the only state; you keep none. You may be killed at any moment — every action below is safe to repeat. Talk to the user in Vietnamese, briefly; they are watching to learn.

All board operations: `node scripts/agent/board.mjs <cmd>` (one JSON line out). Never commit to `main`. `<n>` = issue number, `<root>` = this repo's root.

## 1. Start
1. `preflight` → if `ok:false`, show the failing checks with their `fix` commands and **stop**.
2. `lock` → if `ok:false`, say another orchestrator is running (show holder) and **stop**.
3. `git fetch origin && git switch main && git pull --ff-only`.
4. Comment on the Run status issue (`runStatusIssue` in `.agent/project.json`): "▶️ Run started/resumed <time>".

## 2. Resume unfinished work
`resume` → for each active task:
- **`attempt > 3`** (killed between `move` and `fail`) → §6 first; nothing else.
- **Review, PR merged** → `git worktree remove .worktrees/task-<n>` (if present), `move <n> Done`.
- **Review, PR open** → ensure the worktree exists (re-add it by the §3.2 rule), then review it (§5).
- **In Progress, open PR exists** (a rework round) → re-dispatch (§3.2) including the reviewers' latest PR comment (`gh pr view <pr> --comments`).
- **In Progress, checkpoint says the plan's last step is done and the branch has commits** → go to §3.3.
- **In Progress otherwise** → re-dispatch (§3.2) with the checkpoint `next`, worktree path and dirty files. `claim` on In Progress is a resume (same attempt).

## 3. Loop
Repeat until `ready` returns nothing and nothing is running. Run `heartbeat` at the top of every iteration **and on every subagent notification** (long Blender/perf runs must not let the 30-minute lock go stale).
1. `ready` → take every listed task (the CLI enforces ≤ 3 concurrent, one heavy at a time, no file overlap).
2. For each task with agent `A`, model `M`:
   - Worktree: if `.worktrees/task-<n>` exists, reuse it. Else if branch `task/<n>-<slug>` exists, `git worktree add .worktrees/task-<n> task/<n>-<slug>`. Else `git worktree add .worktrees/task-<n> -b task/<n>-<slug> origin/main`. Then, if `package.json` exists, `npm ci` in the worktree.
   - `claim <n> --agent A --model M`.
   - `A` = `orchestrator` → do the task yourself in the worktree, following the issue.
   - Else dispatch subagent `A` **in the background** with: issue number, worktree path, "read your issue with `gh issue view <n>`", the checkpoint `next` if resuming, reviewer comments if reworking, and `<root>/.env` path for tasks that download assets. Keep it short — the issue is the brief.
3. Subagent reports `STATUS: DONE` → `git push -u origin task/<n>-<slug>` from the worktree. If `gh pr list --head task/<n>-<slug> --state open` is empty, `gh pr create` (title = commit header; body `Closes #<n>`, summary, the **evidence URLs from the report**, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`); otherwise add a PR comment summarising the rework. `move <n> Review`, then §5.
   `BLOCKED` / `NEEDS_CONTEXT` → if you can supply what is missing, re-dispatch **once** with it. A second BLOCKED on the same attempt → §6.
4. Subagents never open/merge PRs or move cards; they only `checkpoint`.

## 5. Review
Ensure `.worktrees/task-<n>` exists (§3.2 rule). Dispatch reviewers (read-only, in parallel) with the issue number, PR number, worktree path and `<root>`, by the issue's `area:` label:
- always `code-reviewer` (pure-JSON `content` PRs may skip it)
- `assets`, `dino`, `scene`, `perf` → also `visual-judge`
- `content` → also `fact-checker`

**All APPROVE**, in this order:
1. Asset tasks: in the worktree set the manifest entry `status: "approved"`, commit `asset(assets): approve <species>`, `git push`.
2. `git worktree remove .worktrees/task-<n>` (if it refuses because of untracked leftovers, check they are not deliverables, then `--force`).
3. `gh pr merge <pr> --squash --delete-branch`. If the merge fails (conflict, behind main): re-add the worktree, `git rebase origin/main`, `git push --force-with-lease`, and review again (§5) — this does not count as a new attempt.
4. `move <n> Done`; `git pull --ff-only` on main.

**Any CHANGES** → one PR comment with all reviewers' lists, then `move <n> "In Progress"` and read `attempt` from its output. If `attempt > 3` → §6. Else re-dispatch the same agent with that comment.

## 6. Failure
`fail <n> --reason "<why>"` (frees the slot, labels `needs-human`). Record it: create an issue "Known issue: <summary>" (label `known-issue`; body lists the only file it may change: `docs/known-issues.md`), add it to the board, and handle it like any task — branch, add the row to `docs/known-issues.md`, PR, `code-reviewer`, merge. Continue with other tasks.

## 7. Usage limit or fatal error
If you or a subagent hits a usage/rate limit: `pause --reason usage-limit`, `unlock`, tell the user "chạy lại `/run` khi hạn mức được làm mới", **stop**. Checkpoints already record where each task is.

## 8. Finish a task / the run
- When a task reaches Done, comment on its issue: agents used, models, attempts, and token/cost per dispatch if the subagent result reports it (spec §12).
- When nothing is ready or running: `status`; post a summary to Run status (done counts, `needs-human`, blocked, attempts per task); `unlock`; tell the user in Vietnamese what happened and what needs them.
