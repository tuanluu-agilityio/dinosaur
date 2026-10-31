# Commit convention

Enforced by `.githooks/commit-msg` (`scripts/hooks/check-commit-msg.mjs`). Never bypass with `--no-verify`.

```
<type>(<scope>): <subject>

<body: why, not what — wrap at 72>

Refs #<issue>            (or Closes #<issue> in the PR body)
Co-Authored-By: Claude <Model> <Version> <noreply@anthropic.com>
```

- **Header:** ≤ 72 chars, English, ASCII only, imperative ("add", not "added"), no trailing period.
- **type:** `feat` new behaviour · `fix` bug fix · `perf` speed/memory · `refactor` no behaviour change · `test` tests only · `docs` docs/ADRs · `build` tooling/deps/hooks · `ci` workflows · `chore` misc · `content` species text · `asset` models/audio/textures.
- **scope:** `scene dino ui i18n audio assets perf content build agent docs` (= the issue's `area:` label).
- **Co-Authored-By:** required on every agent commit — it drives the PR AI-share label (spec §16). Use your actual model, e.g. `Claude Sonnet 5.5`.
- One logical change per commit; a task usually has several commits (one per plan step). PRs are squash-merged, so the PR title becomes the final commit header — make it a valid header.

Examples:
```
feat(ui): add info panel with bottom sheet on phones
perf(scene): halve fern instances on medium tier
content(content): add triceratops content
asset(dino): add tyrannosaurus model
```
