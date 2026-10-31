# Rubric — code review (code-reviewer)

Review the PR diff against its issue. Grade PASS / FAIL; any FAIL → `CHANGES:` with file:line and the fix.

| # | Check |
|---|---|
| K1 | Diff changes only files listed in the issue (or explained in the report and harmless) |
| K2 | New logic has tests that would fail without the change; `npm ci && npm test` pass, `npm run build` passes (once it exists), e2e named in the issue pass, `pytest tests/audio` passes when Python changed |
| K3 | No ADR is violated; any new architectural decision has a new ADR in this PR |
| K4 | No secrets, tokens, `.env` content, absolute local paths or personal data |
| K5 | Interfaces match the plan's "Shared interfaces" exactly (names, parameters, types) |
| K6 | Counts/sizes come from `BUDGETS[tier]`, strings from `t()`, assets only from `approved` manifest entries |
| K7 | Errors handled at boundaries (network, asset load, audio); no unhandled promise rejections; no console errors in e2e |
| K8 | Commits follow `docs/conventions/commits.md`; PR title is a valid commit header; body has `Closes #<n>` |
| K9 | Code reads like the surrounding code; no dead code, debug logs or commented-out blocks; Tweakpane only behind `import.meta.env.DEV` |
| K10 | Reasonable person check: anything a visitor would obviously hit (rotate phone, slow network, double click) does not break |
