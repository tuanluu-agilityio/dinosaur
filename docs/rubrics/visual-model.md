# Rubric — dinosaur model (visual-judge)

Grade every line PASS / FAIL with the evidence named. Any FAIL → `CHANGES:`. Do not pass "almost".

## Evidence required (attached/linked in the PR)
- 6 turntable PNGs (front, back, left, right, ¾ front-high, ¾ rear-low) at 1024 px, neutral grey HDRI — for **both** `high` and `low` variants.
- One MP4 per animation clip (≥ 5 s, side view, ground plane visible).
- `gltf-transform inspect` output for both variants.
- Licence quote copied from the source page.

## Realism
| # | Check | Evidence |
|---|---|---|
| R1 | Reads as a real animal, not a toy: no low-poly faceting, cartoon proportions or flat colours at 1 m camera distance (high variant) | PNGs |
| R2 | Skin has believable detail (scales/osteoderms, wrinkles at joints), PBR materials, no stretched or missing textures | PNGs |
| R3 | Low variant still looks like the same animal at forest distance (≥ 15 m) | low PNGs |

## Anatomy (current scientific consensus; contested points are allowed either way)
| Species | Red flags (any one = FAIL) |
|---|---|
| all | wrong number of fingers/toes; knees bending backward; tail dragging on the ground; "shrink-wrapped" skin showing every skull opening |
| T. rex | pronated hands (palms down) — palms must face inward; arms longer than ~1 m or with 3 functional fingers; upright "Godzilla" posture |
| Triceratops | sprawling lizard-like forelimbs; frill with holes (that's Torosaurus/Chasmosaurus); fewer than 3 facial horns |
| Ankylosaurus | missing tail club; club made of a single smooth ball; no osteoderms/armour plates on back |
| Edmontosaurus | crest on the head (adult *E. annectens* has a flat skull; fleshy comb is allowed); no toothless beak |
| Pachycephalosaurus | no thick domed skull; dome without bony nodes around it |

## Animation
| # | Check | Evidence |
|---|---|---|
| A1 | Required clips exist and loop seamlessly (per task: idle, walk, eat/roar as listed) | MP4 |
| A2 | No visible foot sliding during walk; feet plant on the ground | MP4 |
| A3 | No mesh interpenetration (limbs through body) or joint candy-wrapping | MP4 |
| A4 | Motion has weight: body bobs with steps, tail counter-balances | MP4 |

## Technical
| # | Check | Evidence |
|---|---|---|
| T1 | Licence is CC0 / CC-BY-4.0 / CC-BY-NC-4.0, recorded in `assets/manifest.json` with author + URL | manifest + quote |
| T2 | `high` GLB ≤ 15 MB, `low` GLB ≤ 3 MB (Edmontosaurus low ≤ 2 MB) | inspect output |
| T3 | Textures KTX2; high ≤ 2048 px, low ≤ 1024 px | inspect output |
| T4 | Animation clip names match the manifest `clips` map | inspect output |
| T5 | Every modification is listed in `manifest.modifications` | manifest |
