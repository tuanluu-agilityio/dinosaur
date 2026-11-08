# Final scene QA (P5-T02, #37)

- **Build judged:** `main` at `1043b8c` (after #89, #96, #99, #100 and #95), dev server, Chromium headless on the hardware GPU (WebGPU).
- **Launch species:** T. rex, Triceratops and Pachycephalosaurus (ADR 0004). Ankylosaurus and Edmontosaurus were dropped by user decisions #22 and #23 and are not graded.
- **Profiles:** desktop is 1920×1080 at DPR 1 on the high tier. The phone proxy is 390×844 at DPR 3 (touch) on the medium tier. Both run with `governor=0` and in both languages (en, vi).
- **Pending:** frame-time lines P1–P3 are deferred to P5-T01 (#36) by the user. Verlet secondary motion (#34) is not merged, so it is not judged.
- **Accepted known issues, not re-raised:** KI-5, KI-6, KI-7, KI-12, KI-13 and KI-14.

All evidence is under `https://github.com/tuanluu-agilityio/dinosaur/releases/download/review-artifacts/` and is named `task-37-*`. Below, the files are cited without that prefix.

## Verdict: CHANGES

Seven FAILs need new issues (see the last section). The two worst are on the close-ups. On the phone, the selected dinosaur is hidden behind the bottom sheet. On the desktop high tier, godray bands wash over the dinosaurs.

## Scene rubric (`docs/rubrics/scene.md`)

| # | Grade | Evidence and reason |
|---|---|---|
| S1 | PASS | `forest-desktop-en.png`, `closeup-pachycephalosaurus-desktop-en.png`: ferns, cycads with armoured trunks, Metasequoia-like conifers and broad-leaf shrubs. No grass, palms or modern flowers. |
| S2 | PASS | `capture-log.txt`: the scene spawns `{"tyrannosaurus":1,"triceratops":3,"pachycephalosaurus":1}` on every profile. All three are `approved` in `assets/manifest.json`. |
| S3 | PASS | `aim-*-desktop-en.png`: T. rex and Pachycephalosaurus are alone, and Triceratops is in a group of 3. The panel marks herding as contested. Edmontosaurus groups are N/A because the species was dropped (#23). |
| V1 | PASS | `intro-desktop-strip.png`, `intro-phone-strip.png`: the camera moves low between trunks, rises and reveals the valley. No frame clips through a trunk. A "Skip intro" button shows during the intro and disappears after it (`capture-log.txt`: skip control present). |
| V2 | FAIL | Evidence missing: this run has no capture of a tier or LOD switch. The KI-12 shadow pop is already accepted. Re-shoot with `__quality.forceTier` and a per-frame strip. No flicker, z-fighting or shadow acne shows in any still. |
| V3 | FAIL | Evidence missing: strips at 2 fps cannot show whether sway phase varies. Needs a ≥ 4 fps strip of a fern or cycad clump. |
| V4 | FAIL | `closeup-triceratops-desktop-en.png`, `closeup-orbit-triceratops-desktop-en.png`, `crop-herd.png`, `closeup-orbit-tyrannosaurus-desktop-en.png`, `intro-desktop-strip.png` (row 5): on the desktop high tier, wide white godray bands cross the frame at ground level and veil the dinosaurs. In the intro they wash out the whole opening shot. Particles and fog depth read well. The phone medium tier has no godrays, which is correct. |
| V5 | PASS | `closeup-*-desktop-en.png`, `aim-*-desktop-en.png`: all shadows are parallel to one sun direction, and every dinosaur casts a grounded shadow under its feet. |
| P1 | PENDING | Deferred to P5-T01 (#36) by the user. |
| P2 | PENDING | Deferred to P5-T01 (#36). |
| P3 | PENDING | Deferred to P5-T01 (#36). |
| P4 | PASS | `webgl2-forest-desktop.png` (backend `webgl2`, tier low, no console errors). `tests/e2e/fallback.spec.ts` gives 2 passed: no compute pass runs and clicking opens the panel and starts narration. |

## Dinosaurs in the scene (`docs/rubrics/visual-model.md`)

Each asset was graded on its own in #21, #24 and the T. rex task. Here only what the scene changes is judged.

| # | Grade | Evidence and reason |
|---|---|---|
| R1 | PASS | `closeup-pachycephalosaurus-desktop-en.png` and `closeup-tyrannosaurus-desktop-en.png` show textured, scaled skin under scene light. In shade, T. rex and Triceratops read very dark (`closeup-orbit-tyrannosaurus-desktop-en.png`), but they still read as animals. |
| R2 | PASS | Same files: no stretched or missing textures in scene. The KI-14 belly seam is accepted. |
| R3 | PASS | `aim-*-desktop-en.png`, `forest-phone-*.png`: all three species can be told apart at forest distance. |
| Anatomy | PASS | Nothing seen in scene contradicts the per-asset reviews. The Pachycephalosaurus dome with its ring of nodes, the 3 horns and solid frill of Triceratops, and the horizontal T. rex posture are all visible. |
| A1–A4 | PENDING | Motion is not judged here. Clip motion was graded per asset, and Verlet secondary motion (#34) is not merged. |
| T1–T5 | N/A | These are asset-pipeline lines; this QA changes no assets. |

## Panel content as rendered (`docs/rubrics/content.md`)

`panel-text-*.json` holds the panel text as rendered. A script compared it with `content/species/*.json`. In every profile and language, every section and every `contested[]` item is present.

| # | Grade | Evidence and reason |
|---|---|---|
| C1 | PASS | Spot checks against the cited papers: T. rex 11–12.3 m and 6–8.9 t (Hutchinson 2011, Persons 2019), bite force 8,500–34,500 N (Bates and Falkingham), healed hadrosaur tail (DePalma 2013), SUE and the Field Museum price. Triceratops frill injuries (Farke 2009) and the bonebed (Mathews 2009). Pachycephalosaurus skull pathologies (Peterson 2013). |
| C2 | PASS | T. rex has 8 sources, Triceratops 10 and Pachycephalosaurus 12. Most are peer-reviewed DOIs, plus museum pages. |
| C3 | FAIL | `panel-text-desktop-en.json`: Pachycephalosaurus mass renders as **"0.4–0.5 t"**. The content is 0.37–0.45 t, and the panel's own contested text says "370 to 450 kilograms". `fmt()` in `src/ui/panel.ts` rounds to one decimal, so the shown maximum (500 kg) is above the sourced one. Its length renders as a single value, "3 m" (`lengthM: [3,3]`), not as a range. |
| C4 | PASS | T. rex lips, integument, speed and scavenging; Triceratops herding, frill and Torosaurus; Pachycephalosaurus head-butting. All are phrased as contested and listed. |
| C5 | PASS | No outdated claims. The pure-scavenger view and the frill-only-for-defence view are explicitly marked as outdated. |
| L1 | PASS | Every section and contested item is rendered in both languages (script check). |
| L2 | FAIL | `closeup-tyrannosaurus-phone-vi.png`: the vi quick facts show "11–12.3 m" and "6–8.9 t" with a decimal point. The vi prose uses "12,3 mét". Numbers in quick facts are not localised. |
| L3 | FAIL | `src/i18n/ui.json` `diet.herbivore` vi is "Ăn thực vật", but the glossary says herbivore = "(động vật) ăn cỏ". This is visible in the Triceratops and Pachycephalosaurus quick facts. |
| L4 | PASS | en sections have 121–166 words and vi sections 162–220 syllables, all within limits. |

## Close-up and panel UI findings (FAIL, outside the rubric tables)

| # | Finding | Evidence |
|---|---|---|
| U1 | **On the phone, the close-up hides the dinosaur behind the bottom sheet.** The camera frames the animal in the centre of the full viewport, and the sheet covers the lower half. Only the T. rex tail tip and the top of a Triceratops frill show. On the desktop, the side panel covers the right third: the T. rex head sits on the panel edge, and after orbiting it goes under the panel. | `closeup-tyrannosaurus-phone-en.png`, `closeup-triceratops-phone-vi.png`, `closeup-tyrannosaurus-desktop-en.png`, `closeup-orbit-tyrannosaurus-desktop-en.png` |
| U2 | **The panel opens scrolled down for the second and later dinosaurs.** `InfoPanel.show()` sets `body.scrollTop = 0` while the panel is still `hidden`. That assignment has no effect, so the previous scroll position stays. The Triceratops and Pachycephalosaurus panels open at "Hunting and defense", "Discovery" or "Sources" instead of the title. | `closeup-triceratops-desktop-en.png`, `closeup-pachycephalosaurus-desktop-en.png`, `closeup-triceratops-phone-en.png` |
| U3 | **On the phone, the "Credits" button floats over the open panel sheet** and covers text and source links. | `panel-end-tyrannosaurus-phone-vi.png`, `closeup-tyrannosaurus-phone-en.png` |

Observations that are not FAILs:
- The Triceratops herd members stand body to body. `crop-herd.png` shows overlap in screen space; interpenetration is not confirmed. Re-check once #34 lands.
- The dev-only `tier | backend` overlay sits under the Mute and language buttons. It is not shown in production.

## New issues requested (orchestrator, wave 5)

1. **Godrays veil the dinosaurs and the intro on desktop high (V4).** Cut godray strength near the ground and near the camera in `src/world/godrays.ts`. Verify by re-shooting `closeup-triceratops-desktop` and the intro strip.
2. **Close-up framing ignores the panel (U1).** `CameraDirector.focus` should offset the target into the free viewport area: the left two thirds on desktop, the top half on phone. Verify with all 6 close-ups on both profiles.
3. **Panel scroll reset (U2).** Reset `scrollTop` after the panel is un-hidden. Add a unit or e2e test: open A, scroll, back, open B, expect `scrollTop === 0`.
4. **Credits button overlaps the panel sheet on phone (U3).** Hide it while the panel is open, or put it under the sheet in z-order.
5. **Quick-fact number formatting (C3, L2).** Show values below 1 t in kg, or use two decimals. Use a vi decimal comma via `Intl.NumberFormat`. Give Pachycephalosaurus a length range, or render it as "~3 m".
6. **Glossary: herbivore (L3).** Change vi `diet.herbivore` to "Ăn cỏ".
7. **Evidence gaps (V2, V3).** Capture a tier and LOD switch strip and a sway strip at ≥ 4 fps. These could go in the P5-T01 run.

## Evidence

Shots per profile and language: `forest-{desktop,phone}-{en,vi}.png`, `closeup-{species}-{desktop,phone}-{en,vi}.png`, `closeup-orbit-{species}-desktop-en.png`, `aim-{species}-desktop-en.png`, `panel-end-{tyrannosaurus,triceratops}-phone-vi.png`. Intro: `intro-desktop.mp4`, `intro-desktop-strip.png`, `intro-phone.mp4`, `intro-phone-strip.png`. Also `webgl2-forest-desktop.png`, `panel-text-{desktop,phone}-{en,vi}.json`, `crop-herd.png` and `capture-log.txt`.

The intro was recorded with Playwright and runs slower than real time, so the strips are sampled at 2 fps over 13 s (desktop) and 11 s (phone).
