# Model candidates (P1-T03, issue #10)

Scouted 2026-10-31 by `asset-scout`; reworked 2026-11-01 after review round 1 (PR #59). Rules: ADR 0003/0013 (licences), ADR 0004 (realism over species count), `docs/rubrics/visual-model.md`.
Nothing here is downloaded into the repo; GLB files live outside the repo for inspection only.

## Summary

| Species | Top pick (manifest `candidate`) | Status |
|---|---|---|
| tyrannosaurus | `6465a297fa784598adc49f6e0042d449` Tyrant King (mschanz) | candidate (static, needs rig + idle/walk) |
| triceratops | `87527079bad44917ab1b98a456b46c7e` Triceratops dinosaur (wojciechmiedziocha) | candidate (static, needs rig + idle/walk; R1 check due, low-ish poly) |
| ankylosaurus | none | **NO CANDIDATE** |
| edmontosaurus | none | **NO CANDIDATE** (review round 1: anatomy FAIL on the only clean-looking model; no other clean model found) |
| pachycephalosaurus | `740349873ae244ef8a19155b525d9193` Pachycephalosaurus_animation (seirogan) | candidate (rigged, 489k tris, must be decimated; `clips: {}` until clip names are confirmed) |

**Launch minimum (ADR 0004: T. rex + 2 others): met, with thin margin.** Three species have a manifest candidate: tyrannosaurus, triceratops and pachycephalosaurus. Ankylosaurus and edmontosaurus have none. All three candidates still need a visual R1/R2 pass and decimation or rigging, so the minimum is met on paper only. If triceratops or pachycephalosaurus fails the R1 or provenance check, the minimum drops to T. rex + 1 and the launch issue must be labelled `needs-human`.

## Method and limits

- **Search:** Sketchfab `GET /v3/search?type=models&downloadable=true` (no token needed). Original queries: `tyrannosaurus rex`, `triceratops`, `ankylosaurus`, `edmontosaurus`, `pachycephalosaurus`, `Prehistoric Planet T-rex`, `animated T-rex biting loop`, `realistic ankylosaurus`, `ankylosaurus rigged animated`, `realistic edmontosaurus`, `hadrosaur realistic`, `pachycephalosaurus realistic dome`, `realistic triceratops rigged`, `realistic tyrannosaurus rigged`, `ANKY-ANKY 2001`. Round 2 added `triceratops`, `edmontosaurus`, and per-uploader catalogue searches (`user=<name>`).
- **Licence:** read from each model's Sketchfab API record (`license.label`, `license.fullName`, `license.url`, `license.requirements`). Every accepted candidate reads `CC Attribution`, `Creative Commons Attribution`, `http://creativecommons.org/licenses/by/4.0/`, requirements `Author must be credited. Commercial use is allowed.`
  - **Deviation (accepted by both reviewers, kept on purpose):** the Sketchfab model pages returned an empty body or HTTP 202 to automated fetch, so the licence string on the page itself could not be quoted. The API record is the same data Sketchfab shows on the page. A human should spot-check the page licence line before the credits view is built.
- **Counts:** `faceCount` and `vertexCount` come from the Sketchfab API record (the API counts are the source of truth). Triangles and unique vertices from the downloaded GLB (glTF JSON) are in the older scout notes only where stated. Texture sizes come from the embedded images. Clips come from glTF animations. `rigged` = glTF has a skin.
- **Look:** thumbnail review plus headless Blender side renders (Workbench engine) from round 1. Round 2 used thumbnails only for the new triceratops pick. These are scouting checks only, not rubric evidence. No turntables, close-ups or frame strips were produced, and none are published.
- **Provenance rule (applied, human may override):** a model is rejected when its own description, its clip names, or a matching mesh says it is ripped from a commercial game or film (Jurassic World Evolution 2, Prehistoric Kingdom, ARK, GMod, Jurassic Park Operation Genesis, an unreleased horror game, NHK, Jurassic Park). The uploader cannot grant CC BY on that base mesh, which falls under ADR 0013's "unclear licences" ban. **Round 2 tightened this:** a pick must be cleared upstream (own-work statement, original-sculpt evidence, or a clean catalogue). A pick that cannot be cleared is rejected, not kept as a candidate with a flag.
- **Face-count match check (round 2):** Sketchfab search was scanned for other models with the same `faceCount` as each pick. A match to a game-sourced model is treated as evidence of a shared base mesh (circumstantial, not proof).
- **Excluded by licence:** NC-ND (for example `f4303dc6b9df423b809be241f2b73e04`, AMNH 5117 endocast), NC-SA (for example `2e8eacd4bf4943c7bddbd61abdd02f56`), "Free Standard" (`6fc901a4677e4f6493e02cdd68514961`, not a CC licence), "Editorial" and "Standard" licences.

---

## Tyrannosaurus

1. **TOP PICK: `6465a297fa784598adc49f6e0042d449` "Tyrant King - Tyrannosaurus"**
   - URL: https://sketchfab.com/3d-models/tyrant-king-tyrannosaurus-6465a297fa784598adc49f6e0042d449
   - Author: Marcel Schanz (`mschanz`). Description says it is his own ZBrush sculpt ("Tyrannosaurus Rex 8.2017 commercial use permitted ... ZBrush 4r8 sculpt").
   - Upstream check (round 2): the uploader's catalogue is mostly his own photogrammetry/material scans (`Rock Grey`, `Cliffs Uhu`, `Moss`, `Ground Mud Dry`) plus his own animal sculpts (`Lizard`, `Dimetrodon`, `Lycaenops`, `Tortoise Sulcata`, `Chimp`). No game-rip or film-rip entries. Cleared.
   - Licence: `CC Attribution` (CC-BY-4.0), `license.url` `http://creativecommons.org/licenses/by/4.0/`.
   - Rigged: n (no skin, no clips). Needs rig + idle + walk (ADR 0004 allows it).
   - Clips: none
   - Polycount: 59,310 faces, 29,845 verts (API); 36,894 unique verts from the earlier GLB count
   - Textures: 6 embedded at 1024 px (jpg/png), description says the source maps are 4096 px
   - Thumbnail: https://media.sketchfab.com/models/6465a297fa784598adc49f6e0042d449/thumbnails/9fbc152224c14b868cf8ba31d52aa005/f911dab543244a5c87a2d8af574a7efa.jpeg
   - Red flags seen: none at thumbnail scale. Hand pronation and arm count not verified at 1 m (R1/anatomy check still due).
2. `4b29a0346f034458a80ae267b5ad3ae4` "Tyrannosaurus rex" (`nobilishornet2`, "Nobilis 2"): **moved to Rejected in round 2 (provenance).** See Rejected.

Rejected (Tyrannosaurus):
- `4b29a0346f034458a80ae267b5ad3ae4` "Tyrannosaurus rex" (`nobilishornet2`, CC-BY-4.0, 42,520 faces): **rejected: provenance (round 2).** Description is Wikipedia text with no stated origin. The face count (42,520) is identical to the `hsejira` "Accurate Tyrannosaurus rex" (`6f9a8f6ad5ff47e28212a064b6783055`), whose description says "from Prehistoric Kingdom game". The same count also appears on the uploader's own `968a80620023448d9bbeb2e54d631dc8` "Tyrannosaurus Rex", whose origin is not stated either. Uploader catalogue includes "Tyrannosaurus Rex - Walk Cycle" and "Dinoraul's Stegosaurus Accurate" (a Dinoraul re-upload). Not cleared.
- `b7a3d267da514df99823e62544f3eda8` "Tyrannosaurus Rex Rig" (`NO.DONT.EAT.ME.CASEOH`, CC-BY-4.0): the only rigged T-rex with clips (skin, 30 clips incl. idle, walk, run, vocal, bite; 27,978 tris; 3 × 1024). **Rejected: provenance.** Uploader writes "best tyrannosaurus model i could find on gmod so i uploaded it". This is a GMod rip, not the uploader's work.
- `94184dfcc8e241ff9537bc4b23e7fdf5` "Prehistoric Planet: Tyrannosaurus Rex Model" (`Draco120`, CC-BY-4.0): **rejected: provenance.** Description says "This model uses as a base the Trex model from Jurassic World Evolution 2". `00e8d35a5af74deea63cc6e942173fdc` "Walking T-Rex (Prehistoric Planet)" has the same mesh (45,126 faces), so it is rejected for the same reason.
- `497a7f22e77a4678b173fb511bea6064` "Tyrannosaurus rex" (`IagoMendez`, CC-BY-4.0): **rejected: provenance.** "Tyrannosaurus rex from 1993 Jurassic Park" (film model).
- `6f9a8f6ad5ff47e28212a064b6783055` "Accurate Tyrannosaurus rex", `f94bb4e8254e413d8b6ef3c18f04e313` "(Scaly)", `d6a0ddf9e82a40c0a5ef772363debc68` "(Feathered)" (`hsejira`, CC-BY-4.0): **rejected: provenance.** "from Prehistoric Kingdom game".
- `a3da8d4248f743b797b151885ef9d85e` "Accurate Tyrannosaurus Rex With Rig V2" (`Hhhhhh66`): **excluded.** Licence "Free Standard", not CC.
- `1cfa3a55278e4ffd81e088f8a9502f5b` "Animated Scary Tyrannosaurus-Rex Dinosaur Loop" (`LasquetiSpice`) and the biting-loop lead `5bbcadb7d9274843abb5ada35767dba1` (`LasquetiSpice`), `e7521195e50644eb9f3afe9c879aef24` (`ChoochooLi-sketchfab`), `5f4fee61da3a409295a047016f532531` (`George.Hatae`), all CC-BY-4.0: **rejected: low-poly.** All four share one 11,938-tri mesh (6,243 verts). The scary loop has one unnamed clip `Animation`.
- `f7d9bdf70d5f49afa6ac2eb5faf05c6e` "Overpowered Tyrannosaurus Rex" (`vang807`, CC-BY-NC-4.0): **not pursued.** 7,366 tris, 10 clips; the description reads as a game character. Not reviewed visually.

## Triceratops

1. **TOP PICK: `87527079bad44917ab1b98a456b46c7e` "Triceratops dinosaur"** (added round 2, replaces `67bccb40…`)
   - URL: https://sketchfab.com/3d-models/triceratops-dinosaur-87527079bad44917ab1b98a456b46c7e
   - Author: `wojciechmiedziocha`. Description: "Model made in blender 2.8 PBR textures. Extra files include hi poly sculpt in blender 2.8 file", with a YouTube timelapse of the work and an ArtStation page. This is a self-declared own-work model.
   - Supporting evidence (round 3, optional item): YouTube https://www.youtube.com/watch?v=aUP4SPlmhak, titled "Triceratops modeling blender 2.8 timelapse". Title matches the description's Blender 2.8 pipeline. The page did not expose the channel name or the title card in the automated fetch, so the uploader link is still based on the description and the catalogue, not on the video's own credits.
   - Upstream check (round 2): catalogue is his own work and unrelated props (`axe_new_t1`, `Iron Axe`, `Electro Ride car`, `Stone hammer textured in InstaMat`, `Heavy helmets skins for Gloria Victis game` (a skin he made for a game, not a rip of one), `Space Roots set`). No game-rip or film-rip entries. Cleared.
   - Licence: `CC Attribution` (CC-BY-4.0), `license.url` `http://creativecommons.org/licenses/by/4.0/`.
   - Rigged: n. Static: 0 skins, 0 clips. Needs rig + idle/walk.
   - Polycount: 12,560 triangles (GLB; API faceCount 12,560), 7,372 unique vertices in the GLB (API vertexCount 6,294; the counts differ by how seams are split, so the GLB figure is the one to use for budgets). **Low-ish for a 1 m close-up.** R1 faceting risk is the main open check.
   - Textures (round 2, read from the GLB's embedded images): 3 × 1024 × 1024 PNG (PBR set, one material).
   - Thumbnail (¾ front view, round 2): https://media.sketchfab.com/models/87527079bad44917ab1b98a456b46c7e/thumbnails/a8b659c1bc2b43838a37a3d197b85ed2/42c3c41568104a25aada07addfba363a.jpeg (1920×1080). Three horns (brow pair plus nose), a frill with a row of edge spikes, and a solid frill with no holes. Limbs under the body, not sprawled. Tail held low. No red flags at thumbnail scale.
2. `379f857737564e7eb32f3575d1d1ab26` "Triceratops" (uploader `ericksalinasr07`, author `Gigan_FK`): **demoted to Rejected in round 2 (cannot clear upstream).** See Rejected.

Rejected (Triceratops):
- `67bccb400cfb45699f4fea6db7664b87` "Triceratops Prorsus" (`nobilishornet2`, CC-BY-4.0, 32,701 faces): **rejected: provenance (round 2).** Description is a Wikipedia copy with no stated origin. Uploader catalogue includes "Dinoraul's Stegosaurus Accurate" (a Dinoraul re-upload), "Tyrannosaurus Rex - Walk Cycle", and a museum scan credit. A web search did not find an original source. The same uploader's T. rex `4b29a034…` shares its face count with a game-sourced model (see Tyrannosaurus). Not cleared.
- `379f857737564e7eb32f3575d1d1ab26` "Triceratops" (`ericksalinasr07`, author `Gigan_FK`, CC-BY-4.0, 9,846 faces): **rejected: cannot clear upstream (round 2).** Description only links to two other Sketchfab models as "original models" (`triceratops-7e72e4d8…` and `hd-triceratops-b107f5…`). Those were not checked. Also too low-poly for R1 at 1 m (round 1 scouting).
- `cc4445c4efe1409fbdafc8dd539c6e1b` "Triceratops" (`martinmor`, CC-BY-4.0, 18,136 faces): **rejected: rubric red flag (round 2, thumbnail).** Bright red-and-blue painted colouring, glossy cartoon-like frill and mouth. Own-work description ("Renders in ArtStation") and catalogue look clean, but the look fails R1 (toy-like flat colours). Not a provenance rejection.
- `e797b70c11fd4d3a91783ad41aa32893` "Accurate Triceratops horridus" (`hsejira`, CC-BY-4.0, 40,128 faces): **rejected: provenance.** "Triceratops horridus from Prehistoric Kingdom game". Realistic-looking at thumbnail scale; a human may override.
- `626943f4eab140888011b31afb555e57` "Accurate Triceratops prorsus" (`hsejira`, CC-BY-4.0, 40,224 faces): **rejected: provenance.** "Triceratops prorsus from Prehistoric Kingdom game".
- `5e2fa21610ab4cd59abcbcb15007ffd5` "triceratops" (`victory_`, CC-BY-4.0): **rejected: stylised.** Glossy toy-like body with thick cartoon legs. 5 clips (idle, bite, eating, idle, sit), 53,218 faces.
- `06cb55f941d94dc8b95ac46f92d89e7c` "Animated triceratops skeleton" (`Zacxophone`, CC0): **rejected: no skin** (R2). Skeleton only. Clips: IdleGround, RiseUp, Roar, RoarToWalk, Walk, Fall. Usable as an anatomy reference, not as the shipped model.
- `4425e68c2d8648e79159dc00ddeddf77` "Triceratop" (`kenchoo`, CC-BY-4.0): **rejected: provenance.** "Rebuilt for this triceratop 'triceratops-jwe'" (a Jurassic World Evolution model). `8b4641c39d2640c1be514d3baac84d79` "triceratops-jwe" (`Anonimusaekasha`, same 16,954 faces): same mesh, same rejection.
- `ccfc8246b1494ec6add31c015bcd92bb` "Amazing Dinoworld 2 Triceratops" (`Radassic`, CC-BY-4.0): **rejected: provenance.** "model from the NHK website for the AR event" (broadcaster asset).
- `2e8eacd4bf4943c7bddbd61abdd02f56` (`svtavernier`): **excluded.** CC BY-NC-SA, ShareAlike not in ADR 0013.
- `909bf645de1746829ab19acd1ae31767` "Triceratops" (`D.art`, CC BY-NC-4.0): **not pursued.** Not visually reviewed; 11,249 tris, 1 clip.
- `98cd01efb8ff468394510a337ec587d8` "Triceratops toy" and `85378c108ee548938377e58bdb22c46c` "Triceratops Toy": **rejected: toy.**
- `300583c7ac6a4449aee23cd2b5d40f09` "Triceratops Photogrammetry test" (`aumakua`): **not pursued.** Photogrammetry test, not a finished animal.

## Ankylosaurus: NO CANDIDATE

Searched: `ankylosaurus`, `realistic ankylosaurus`, `ankylosaurus rigged animated`, `ANKY-ANKY 2001`. Every model with a clean look failed on provenance or on a rubric red flag. Nothing was lowered to pass.

- `68e5ce01a2844e27b9766a5a1e4e75a7` "ankylosaurus" (`slang107123456789`, re-upload "originally credited to Sammy The Citipati", CC-BY-4.0): **rejected: rubric red flag.** The tail club is a single smooth oval ball on a thin tail ("club made of a single smooth ball"). The upstream chain is also unverified. Static, 77,388 tris.
- `9ba4629a871c4b0fa792fc1bb629881b` "Ankylosaurus Updated" (`kenchoo`, CC-BY-4.0): look is acceptable in a side render (knobbed club, osteoderms), but **rejected: provenance.** It copies `5a95eb6d35c94001bee005d06eef6f92` "ANKY-ANKY 2001" (`HasanBODOAMAT`, CC-BY-4.0), whose description reads "Anky From Jwe 2 and Jwe 1" (a Jurassic World Evolution model).
- `2dac5acc3c31434d98532289b4ac08a8` "Accurate Ankylosaurus" (`hsejira`, CC-BY-4.0): **rejected: provenance.** "Ankylosaurus from Prehistoric Kingdom game". Realistic-looking at thumbnail scale.
- `6c88bb1828034dbbb9ddab5ccc36e0a9` "Accurate ankylosaurus rigged" (`Hhhhhh66`, CC-BY-4.0): **rejected: provenance.** "from https://steamcommunity.com/... fr a upcoming horror game". One clip named `ankylosaurus.qc_skeleton`.
- `f979ce18535740efb2f791b2c45cd109` "Ankylosaurus" (`TimFallas`, CC-BY-4.0): **rejected: provenance and stylised.** "from Ark Survival Evolved". Exaggerated spikes. 59,974 tris.
- `c2281a2f1d8f4003a92708239a6e5e4b` "DracoWarrior's Ankylosaurus" (`sharksly`, CC-BY-4.0): **rejected: provenance.** "seen in Jurassic Park III 2001".
- `1a11ce7b6e754aff8d346e397439d19a` "Animated ankylosaurus" (`hcerretti`, CC-BY-4.0): **rejected: rubric red flag.** Tail club is a single smooth ball. One clip `idle`.
- `163daf7cc0664671b017ea874766e809` "Ankylosaurus" (`InaLaAtzu`, CC-BY-4.0): **rejected: stylised.** Toy-like small proportions and glossy surface. 100,020 tris.
- `9709067ffaf2424b9bbaf1e08a46afac` "Low Poly Ankylosaurus" (`rt699448`): **rejected: low-poly** (ADR 0004).
- `818aa7e6389b43958cc55d2a1a8f59b8` (`munam.pratiksha`, CC-BY-4.0): **not pursued.** Download-info call returned HTTP 401 for the token, so the GLB could not be inspected. Thumbnail not reviewed.

Consequence: ankylosaurus issues are not planned until a human decides (ADR 0004). No `assets/manifest.json` entry is written for it.

## Edmontosaurus: NO CANDIDATE (round 2)

Round 1 top pick `b278ec123e054751a7937f8937949e80` is withdrawn. Round 2 found no clean, anatomically correct model.

- `b278ec123e054751a7937f8937949e80` "Edmontosaurus" (`CGreature`, display name Modbuff, CC-BY-4.0, 17,982 faces): **rejected: anatomy FAIL (round 1 visual review).** Fleshy lipped snout with no keratinous beak, forelimbs nearly as long as the hindlimbs, short tail, bulbous head, toy-like shading. It is *E. regalis* (Campanian), but Hell Creek needs *E. annectens*. The uploader posts Skyrim, BF2, TMNT and TUROK models, so the upstream is also unclear.
- `521ee9021ac44ff1a75582cf7639fd81` "Dino Raul's Edmontosaurus 3" (`SammyTheCitipati`, CC-BY-4.0, 58,874 faces): **rejected: unsupported anatomy and upstream chain (round 2).** Row of dorsal spikes along the back and tail, no evidence for them in Edmontosaurus. Re-upload under "Dino Raul" credits; the original creator is not identified. Siblings `e32417f9a9324bab9f2c81317ac342db` and `9d40a539ef16462d8613181a76159928` have the same face count and are rejected with it.
- `973d2fab3bfd4f33818976c8d50b7829` "edmontosaurus" (`dinosaur_cube`, CC-BY-4.0): **rejected: stylised.** Bloated, blob-like body with toy proportions.
- `48b8e5af63184323b5a94077d933a0e9` "Edmontosaurus" (`Jurrassicgamer`, CC-BY-4.0): **rejected: no textures** (R2), 0 images. `8b758b1e6dc34d4fbfe2854a80771237` "Edmontosaurus-jwe" (`Jurrassicgamer`, CC-BY-4.0, 17,874 faces): **rejected: provenance** (Jurassic World Evolution by name).
- `61bc84ae5f9e4686b358ca15f96a086f` "JPOG Posed Edmontosaurus" (`slang107123456789`): **rejected: provenance** (Jurassic Park Operation Genesis by name); 1,386 faces.
- `b9b8bb6855ea40f49d8b2273fab19cf2` "Dino Dan - Dino Defence HD Edmontosaurus" (`spikedaboi`) and `389b630b630a4d2f92f88c13b57ee152` "Dino hunter Deadly Shores Edmontosaurus" (`PaPmont125513`): **rejected: provenance** (game-titled), low poly.
- Skull, femur, ischium, tendon, jaw and tooth scans (for example `2055d7721e454bd8bd4019eb28e27e13`, `1b5b76556e454c2297422b7951ac9d96` which is CC BY-NC-SA, `92715619fb2b44849af36da71457ec15` skull): **excluded.** Fragments, not whole animals.

## Pachycephalosaurus

1. **TOP PICK: `740349873ae244ef8a19155b525d9193` "Pachycephalosaurus_animation"** (replaces `1fdb61b7…`, round 2)
   - URL: https://sketchfab.com/3d-models/pachycephalosaurus-animation-740349873ae244ef8a19155b525d9193
   - Author: `seirogan` (display name seirogan). Description: "Pachycephalosaurus" plus a YouTube link. The video title, read on the watch page, is "デジタルで恐竜を造りました〜パキケファロサウルス〜" ("I made a dinosaur digitally: Pachycephalosaurus"). It is presented as the creator's own digital build, not a game rip. The channel and upload date were not readable from the fetched page.
   - Upstream check (round 2): catalogue is mostly Japanese photogrammetry scans (shrines, food, cars) and one `Spinosaurus` pair plus `Pterosaur_Quetzalcoatlus`, all in the same self-made style. The Pachycephalosaurus sibling `e26e52b6194b499fa86361245919eb4a` ("Pachycephalosaurus", same creator, same 489,096 faces, created 2020) is the same mesh. No game-rip or film-rip entries. Cleared, with the caveat that the video page was the only external evidence.
   - Licence: `CC Attribution` (CC-BY-4.0), `license.url` `http://creativecommons.org/licenses/by/4.0/`.
   - Rigged: y (1 skin). Clip: `Armature|paki` (not confirmed as walk or idle), so `clips: {}` in the manifest until a human or a clip inspection confirms the names.
   - Polycount: **489,096 faces, 244,554 verts (API)**; the GLB is 32 MB against a 15 MB high budget. **Must be decimated** before it can ship as `high`. Textures: 2 × 1024 px (earlier scout).
   - Thumbnail: https://media.sketchfab.com/models/740349873ae244ef8a19155b525d9193/thumbnails/49d95774a0244610be4b18a375468537/74952df84ec240e0b46432cc95b41a2c.jpeg
   - Side render (round 1): domed skull present, tail horizontal. Skin is lumpy and noisy (R2 risk). Hands not verified.
2. `ae6153a305fa4d2791848f361518edf1` "Dinoraul's Pachycephalosaurus" (`SammyTheCitipati`, CC-BY-4.0): **Rejected (round 2 demotion).** See Rejected.

Rejected (Pachycephalosaurus):
- `1fdb61b75099482eac02bc1b87a3f71e` "pachycephalosaurus" (`Made_Rex`, CC-BY-4.0): **rejected: provenance (round 2).** Description is only "cred HATOGAME", so the real creator is not stated. Clip names (`Pachycephalo_Attack1`, `_Die`, `_Hit`, `_Sturn`) read as a game character. ADR 0013 does not allow an unclear origin. API face count is **44,805** (earlier scout note said 28,137; corrected here), 14,274 verts, 10 clips.
- `ae6153a305fa4d2791848f361518edf1` "Dinoraul's Pachycephalosaurus" (`SammyTheCitipati`, CC-BY-4.0, 91,776 faces): **rejected: provenance (round 2, non-blocking flag in round 1).** Re-upload of the Dinoraul chain with no original creator named. Spikes on neck and back, and a conical spike above the head, are unsupported for the species.
- `1869385a9918436a910a78b8fbdf9e1f` "Accurate Pachycephalosaurus wyomingensis" (`hsejira`, CC-BY-4.0, 37,460 faces): **rejected: provenance.** "from Prehistoric Kingdom". Best-looking static pachy at thumbnail scale; a human may override.
- `e26e52b6194b499fa86361245919eb4a` "Pachycephalosaurus" (`seirogan`, CC-BY-4.0): same mesh as the top pick. Kept as a sibling only.
- `6fc901a4677e4f6493e02cdd68514961` "HD Pachycephalosaurus" (`CGreature`): **excluded.** Licence is "Free Standard" (Sketchfab's own licence), not CC.
- `3a7a5989623645b5a58c10bc3f73bfcf` "Pachycephalosaurus Head Dome" (`CarterCountyMuseum`, CC-BY-4.0) and `2e97be5068ff4833956306d79cc9ba17` (`uwlibraries`, CC BY-NC-4.0): **not pursued.** Dome only, not a whole animal.
- `6aa020e4fc1640b78bedb12384eb480e` "JWA Pachycephalosaurus" (`Radassic`): **not pursued.** Name indicates Jurassic World Alive; not reviewed.

---

## Manifest

`assets/manifest.json` holds one `status: "candidate"` entry for each of the three top picks: tyrannosaurus (`6465a297…`), triceratops (`87527079…`), pachycephalosaurus (`740349873…`, `clips: {}`). Ankylosaurus and edmontosaurus have no entry (NO CANDIDATE). File paths are placeholders (`assets/src/<species>/high.glb`, `low.glb`); no binaries were committed.

## Open checks before approval (needs-human or next visual step)

- Triceratops `87527079…`: R1 close-up at 1 m (12,560 faces); side renders needed. Own-work claim rests on the uploader's description.
- Pachycephalosaurus `740349873…`: decimate 489k → a budget that fits the 15 MB high target; confirm clip names (`Armature|paki`); R2 skin noise check.
- Tyrannosaurus `6465a297…`: hands and arm count at 1 m (R1/anatomy).
- Launch minimum: met only if triceratops and pachycephalosaurus both pass these checks. Otherwise label the launch issue `needs-human` (ADR 0004).
