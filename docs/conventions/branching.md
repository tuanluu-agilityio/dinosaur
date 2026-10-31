# Branches, worktrees, pull requests

- `main` is protected: PR required, no force push, no deletion. Nobody commits to it directly.
- One task = one issue = one branch = one PR.
- Branch: `task/<issue-number>-<slug>` from the latest `main` (`slug` = 2–5 lowercase words, `-` separated).
- Worktree: `.worktrees/task-<issue-number>` (gitignored). Create: `git worktree add .worktrees/task-<n> -b task/<n>-<slug> origin/main`. Reuse it if it exists (resume).
- PR title = a valid commit header; body starts with `Closes #<n>`, then Why / What / Verification, ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Merge: **squash**, delete the branch, then remove the worktree (`git worktree remove .worktrees/task-<n>`).
- Behind `main`? Rebase the task branch on `origin/main` before review (`git rebase origin/main`), never merge `main` into it. Force-push only your own task branch (`--force-with-lease`).
- Non-task changes (rule fixes, review fixes) still get an issue first, then the same flow.
