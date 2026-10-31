# 0009 — Bilingual Vietnamese / English

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user (vi + en) + planner (default and storage)

## Context
Audience reads Vietnamese and English; narration follows the selected language.

## Decision
- Every user-facing string and species text exists in `vi` and `en` (`Localized = { vi, en }`). Missing either fails schema validation.
- Default language: first `navigator.languages` entry starting with `vi` → `vi`, otherwise `en`. The user's choice persists in `localStorage['dino.lang']` and wins.
- Switching language swaps text instantly and restarts narration of the current section in the new language.
- Agent-facing files (plans, ADRs, code, commits) are English; user-facing docs (`runbook.md`, README) are Vietnamese (README bilingual).

## Consequences
No hard-coded UI strings in code; use `t(key)` and `src/i18n/ui.json`.
