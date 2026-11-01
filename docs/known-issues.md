# Known issues

Problems and limitations that are known and accepted for now. Agents: check this before starting; add a row when you `fail` a task or ship with a limitation.

| ID | Summary | Impact | Workaround | Issue |
|---|---|---|---|---|
| KI-1 | P0-T01..T03 were committed directly to `main` before the PR-only rule | History only | Kept by user decision; see issue comments | #2 #3 #4 #40 |
| KI-2 | PR AI-share label counts lines per commit, not per line (no `git blame`) | Label can be off when humans amend AI commits | Accepted (spec §16) | #39 |
| KI-3 | Board CLI deferred minors: lock not atomic, 500-item list limit, transitive blocking not reported, no CLI close-as-not-planned, `parsePlan` cuts body at `###` inside a task, secret scan misses `github_pat_` | Low at ~40 tasks | Avoid `###` inside task bodies; close dropped tasks with `gh issue close --reason "not planned"` | #43 |
| KI-4 | Project agents in `.claude/agents/` created during a running session are not dispatchable at first ("Agent type not found"); they appeared later in the same session | Delay only | Start `/run` in a fresh session (runbook §2), or wait and retry | #7 |
| KI-5 | Triceratops (#21) was accepted by the user after 5 rounds. In the side close-up only, the front-lip knobs read as a pale, glossy tooth row; at 1 m they read as labial scales. Also, a shadow terminator shows straight-edged wedges on smooth-shaded creature meshes under a shadow-casting sun | Minor realism flaw on Triceratops in the side close-up; the terminator risk applies to every species in-engine | Optional polish: recolour the knobs to skin tone, raise their roughness and flatten their normals in a 1 cm lip band. The lighting task tunes `DirectionalLight.shadow.normalBias`/`bias` | #21 #73 #74 |
