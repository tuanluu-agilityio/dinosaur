# Rubric — forest scene (visual-judge, perf-engineer)

Grade PASS / FAIL with evidence; lines the task cannot affect are `N/A (<reason>)` and do not block (e.g. S1 in a camera-only task). Evidence (only what the task can show): screenshots per tier (desktop 1920×1080 and phone proxy 390×844), a 10 s recording of the intro **with its frame strip PNG**, and `test-results/perf.json`.

## Scientific
| # | Check |
|---|---|
| S1 | Flora is late-Cretaceous: ferns, cycads, conifers, early angiosperm shrubs. **No grass**, no modern flowers, no palm-tree clichés |
| S2 | Only the five ADR-0002 species appear (and only `approved` ones) |
| S3 | Herd/solo behaviour plausible: Edmontosaurus in small groups; T. rex solitary |

## Visual
| # | Check |
|---|---|
| V1 | Intro: camera moves through canopy then reveals the valley; no clipping through trunks; skippable |
| V2 | No visible pop-in when tiers or LODs switch; no flicker, z-fighting or shadow acne |
| V3 | Vegetation sways naturally (varied phase/strength, not in lockstep) |
| V4 | Atmosphere: particles drift, fog depth reads, godrays on high tier only; nothing obscures the dinosaurs |
| V5 | Lighting consistent (one sun direction), dinosaurs sit on the ground (contact shadow or AO) |

## Performance (ADR 0006, budgets ADR 0010)
| # | Check |
|---|---|
| P1 | Desktop high tier: median frame ≤ 16.7 ms |
| P2 | Phone proxy medium tier: p95 frame ≤ 33 ms |
| P3 | No frame > 100 ms during camera flight, species load or panel open |
| P4 | WebGL2 fallback: loads, no console errors, compute effects absent |
