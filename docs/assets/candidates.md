# Model candidates (P1-T03, issue #10)

Scouted 2026-10-31 by `asset-scout`. Rules: ADR 0003/0013 (licences), ADR 0004 (realism over species count), `docs/rubrics/visual-model.md`.
Nothing here is downloaded into the repo; GLB files live outside the repo for inspection only.

## Summary

| Species | Top pick (manifest `candidate`) | Status |
|---|---|---|
| tyrannosaurus | `6465a297fa784598adc49f6e0042d449` | candidate (static, needs rig + idle/walk) |
| triceratops | `67bccb400cfb45699f4fea6db7664b87` | candidate (static, needs rig + idle/walk) |
| ankylosaurus | none | **NO CANDIDATE** |
| edmontosaurus | `b278ec123e054751a7937f8937949e80` | candidate (static, needs rig + idle/walk) |
| pachycephalosaurus | `1fdb61b75099482eac02bc1b87a3f71e` | candidate, **provenance check required before approval** |

Launch minimum (ADR 0004: T. rex + 2 others) is met by tyrannosaurus, triceratops, edmontosaurus and pachycephalosaurus. Ankylosaurus is the species that cannot ship from this search.

## Method and limits

- **Search:** Sketchfab `GET /v3/search?type=models&downloadable=true` (no token needed). Queries: `tyrannosaurus rex`, `triceratops`, `ankylosaurus`, `edmontosaurus`, `pachycephalosaurus`, `Prehistoric Planet T-rex`, `animated T-rex biting loop`, `realistic ankylosaurus`, `ankylosaurus rigged animated`, `realistic edmontosaurus`, `hadrosaur realistic`, `pachycephalosaurus realistic dome`, `realistic triceratops rigged`, `realistic tyrannosaurus rigged`, `ANKY-ANKY 2001`.
- **Licence:** read from each model's Sketchfab API record (`license.label`, `license.fullName`, `license.url`, `license.requirements`). Every accepted candidate reads `CC Attribution`, `Creative Commons Attribution`, `http://creativecommons.org/licenses/by/4.0/`, requirements `Author must be credited. Commercial use is allowed.`
  - **Deviation:** the Sketchfab model pages returned an empty body or HTTP 202 to automated fetch, so the licence string on the page itself could not be quoted. The API record is the same data Sketchfab shows on the page. A human should spot-check the page licence line before the credits view is built.
- **Counts:** triangles and unique vertices come from the downloaded GLB (glTF JSON). Texture sizes come from the embedded images. Clips come from glTF animations. `rigged` = glTF has a skin.
- **Look:** thumbnail review plus headless Blender side renders (Workbench engine). These are scouting checks only, not rubric evidence. No turntables, close-ups or frame strips were produced, and none are published.
- **Provenance rule (applied, human may override):** a model is rejected when its own description, or its clip names, say it is ripped from a commercial game or film (Jurassic World Evolution 2, Prehistoric Kingdom, ARK, GMod, an unreleased horror game, NHK, Jurassic Park). The uploader cannot grant CC BY on that base mesh, which falls under ADR 0013's "unclear licences" ban. A model whose upstream chain is unclear is kept as a candidate with a check flagged.
- **Excluded by licence:** NC-ND (for example `f4303dc6b9df423b809be241f2b73e04`, AMNH 5117 endocast), NC-SA (for example `2e8eacd4bf4943c7bddbd61abdd02f56`), "Free Standard" (`6fc901a4677e4f6493e02cdd68514961`, not a CC licence).

---

## Tyrannosaurus

1. **TOP PICK: `6465a297fa784598adc49f6e0042d449` "Tyrant King - Tyrannosaurus"**
   - URL: https://sketchfab.com/3d-models/tyrant-king-tyrannosaurus-6465a297fa784598adc49f6e0042d449
   - Author: Marcel Schanz (`mschanz`); description says it is his own ZBrush sculpt ("Tyrannosaurus Rex 8.2017 commercial use permitted ... ZBrush 4r8 sculpt")
   - Licence: `CC Attribution` (CC-BY-4.0)
   - Rigged: n (no skin, no clips). Needs rig + idle + walk (ADR 0004 allows it).
   - Clips: none
   - Polycount: 59,310 tris, 36,894 unique verts
   - Textures: 6 embedded at 1024 px (jpg/png), description says the source maps are 4096 px
   - Thumbnail: https://media.sketchfab.com/models/6465a297fa784598adc49f6e0042d449/thumbnails/9fbc152224c14b868cf8ba31d52aa005/f911dab543244a5c87a2d8af574a7efa.jpeg
   - Red flags seen: none at thumbnail scale. Hand pronation and arm count not verified at 1 m (R1/anatomy check still due).
2. `4b29a0346f034458a80ae267b5ad3ae4` "Tyrannosaurus rex" (`nobilishornet2`, "Nobilis 2")
   - URL: https://sketchfab.com/3d-models/tyrannosaurus-rex-4b29a0346f034458a80ae267b5ad3ae4
   - Licence: `CC Attribution` (CC-BY-4.0). Static, 0 clips.
   - Polycount: 42,520 tris, 24,254 unique verts. Textures: 3 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/4b29a0346f034458a80ae267b5ad3ae4/thumbnails/e26c1eca21df45cea3582dac1931b347/5d335542c5e04c98b89f61f28fedb2ee.jpeg
   - Description is Wikipedia text; origin of the mesh is not stated. Looks realistic at thumbnail scale. Hands not verified.

Rejected (Tyrannosaurus):
- `b7a3d267da514df99823e62544f3eda8` "Tyrannosaurus Rex Rig" (`NO.DONT.EAT.ME.CASEOH`, CC-BY-4.0): the only rigged T-rex with clips (skin, 30 clips incl. idle, walk, run, vocal, bite; 27,978 tris; 3 × 1024). **Rejected: provenance.** Uploader writes "best tyrannosaurus model i could find on gmod so i uploaded it". This is a GMod rip, not the uploader's work.
- `94184dfcc8e241ff9537bc4b23e7fdf5` "Prehistoric Planet: Tyrannosaurus Rex Model" (`Draco120`, CC-BY-4.0): **rejected: provenance.** Description says "This model uses as a base the Trex model from Jurassic World Evolution 2". `00e8d35a5af74deea63cc6e942173fdc` "Walking T-Rex (Prehistoric Planet)" has the same mesh (45,126 faces), so it is rejected for the same reason.
- `497a7f22e77a4678b173fb511bea6064` "Tyrannosaurus rex" (`IagoMendez`, CC-BY-4.0): **rejected: provenance.** "Tyrannosaurus rex from 1993 Jurassic Park" (film model).
- `6f9a8f6ad5ff47e28212a064b6783055` "Accurate Tyrannosaurus rex", `f94bb4e8254e413d8b6ef3c18f04e313` "(Scaly)", `d6a0ddf9e82a40c0a5ef772363debc68` "(Feathered)" (`hsejira`, CC-BY-4.0): **rejected: provenance.** "from Prehistoric Kingdom game".
- `1cfa3a55278e4ffd81e088f8a9502f5b` "Animated Scary Tyrannosaurus-Rex Dinosaur Loop" (`LasquetiSpice`) and the biting-loop lead `5bbcadb7d9274843abb5ada35767dba1` (`LasquetiSpice`), `e7521195e50644eb9f3afe9c879aef24` (`ChoochooLi-sketchfab`), `5f4fee61da3a409295a047016f532531` (`George.Hatae`), all CC-BY-4.0: **rejected: low-poly.** All four share one 11,938-tri mesh (6,243 verts). The scary loop has one unnamed clip `Animation`.
- `f7d9bdf70d5f49afa6ac2eb5faf05c6e` "Overpowered Tyrannosaurus Rex" (`vang807`, CC-BY-NC-4.0): **not pursued.** 7,366 tris, 10 clips; the description reads as a game character. Not reviewed visually.

## Triceratops

1. **TOP PICK: `67bccb400cfb45699f4fea6db7664b87` "Triceratops Prorsus"**
   - URL: https://sketchfab.com/3d-models/triceratops-prorsus-67bccb400cfb45699f4fea6db7664b87
   - Author: Nobilis 2 (`nobilishornet2`)
   - Licence: `CC Attribution` (CC-BY-4.0). Static: 1 skin, 0 clips.
   - Polycount: 32,701 tris, 18,807 verts. Textures: 2 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/67bccb400cfb45699f4fea6db7664b87/thumbnails/caa666d5cae24e6abaa42425c10627df/fbf8068054754a5890c47121358825d5.jpeg
   - Red flags seen: none. Three horns visible (brow pair plus nose). Solid frill. Tubercled skin. Forelimbs not sprawled. The species name *prorsus* is contested; the rubric allows contested points either way.
2. `379f857737564e7eb32f3575d1d1ab26` "Triceratops" (uploader `ericksalinasr07`, author shown as `Gigan_FK`)
   - URL: https://sketchfab.com/3d-models/triceratops-379f857737564e7eb32f3575d1d1ab26
   - Licence: `CC Attribution` (CC-BY-4.0). Static: 1 skin, 0 clips.
   - Polycount: 9,846 tris, 5,880 verts. Textures: 3 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/379f857737564e7eb32f3575d1d1ab26/thumbnails/f1690cecdf764e3a887833bb08857563/5e7277980edc4d7984b43662084f2033.jpeg
   - Risks: low poly (≈10k tris, faceting risk at 1 m). Description links to two other Sketchfab models as "original models"; upstream chain not verified.

Rejected (Triceratops):
- `e797b70c11fd4d3a91783ad41aa32893` "Accurate Triceratops horridus" (`hsejira`, CC-BY-4.0): **rejected: provenance.** "Triceratops horridus from Prehistoric Kingdom game". Realistic-looking at thumbnail scale; a human may override.
- `5e2fa21610ab4cd59abcbcb15007ffd5` "triceratops" (`victory_`, CC-BY-4.0): **rejected: stylised.** Glossy toy-like body with thick cartoon legs. 5 clips (idle, bite, eating, idle, sit), 53,218 tris.
- `06cb55f941d94dc8b95ac46f92d89e7c` "Animated triceratops skeleton" (`Zacxophone`, CC0): **rejected: no skin** (R2). Skeleton only. Clips: IdleGround, RiseUp, Roar, RoarToWalk, Walk, Fall. Usable as an anatomy reference, not as the shipped model.
- `4425e68c2d8648e79159dc00ddeddf77` "Triceratop" (`kenchoo`, CC-BY-4.0): **rejected: provenance.** "Rebuilt for this triceratop 'triceratops-jwe'" (a Jurassic World Evolution model).
- `ccfc8246b1494ec6add31c015bcd92bb` "Amazing Dinoworld 2 Triceratops" (`Radassic`, CC-BY-4.0): **rejected: provenance.** "model from the NHK website for the AR event" (broadcaster asset).
- `2e8eacd4bf4943c7bddbd61abdd02f56` (`svtavernier`): **excluded.** CC BY-NC-SA, ShareAlike not in ADR 0013.
- `909bf645de1746829ab19acd1ae31767` "Triceratops" (`D.art`, CC BY-NC-4.0): **not pursued.** Not visually reviewed; 11,249 tris, 1 clip.

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

## Edmontosaurus

1. **TOP PICK: `b278ec123e054751a7937f8937949e80` "Edmontosaurus"**
   - URL: https://sketchfab.com/3d-models/edmontosaurus-b278ec123e054751a7937f8937949e80
   - Author: Modbuff (uploader `CGreature`). Description: "Edmontosaurus regalis".
   - Licence: `CC Attribution` (CC-BY-4.0). Static: 0 skin, 0 clips.
   - Polycount: 17,982 tris, 10,340 verts. Textures: 1 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/b278ec123e054751a7937f8937949e80/thumbnails/a26a2813e1254732936c5b6041aa9145/305a19e483ed4300945e07dc0052997f.jpeg
   - Side render: flat skull, no head crest, no toothless-beak issue visible, plausible hadrosaur body and limbs. Red flags: none seen. Low-ish poly (18k), so R2 detail needs checking.
2. `521ee9021ac44ff1a75582cf7639fd81` "Dino Raul's Edmontosaurus 3" (`SammyTheCitipati`, CC-BY-4.0)
   - URL: https://sketchfab.com/3d-models/dino-rauls-edmontosaurus-3-521ee9021ac44ff1a75582cf7639fd81
   - Licence: `CC Attribution` (CC-BY-4.0). Static: 1 skin, 0 clips.
   - Polycount: 58,874 tris, 34,173 verts. Textures: 1 × 1024 px JPG across 10 materials.
   - Thumbnail: https://media.sketchfab.com/models/521ee9021ac44ff1a75582cf7639fd81/thumbnails/16430f87d0d54a61a561391e055e7175/2bdaba2d7ec34d9284df0da5c66c49e4.jpeg
   - Red flag: a row of dorsal spikes runs along the back and tail, with no evidence for it in Edmontosaurus. Fixable by removing it in Blender (would be recorded in `modifications`). No description; origin not stated. Siblings `e32417f9e77a4...` and `9d40a539ef16...` share the same stats (not separately reviewed).

Rejected (Edmontosaurus):
- `973d2fab3bfd4f33818976c8d50b7829` "edmontosaurus" (`dinosaur_cube`, CC-BY-4.0): **rejected: stylised.** Side render shows a bloated, blob-like body with toy proportions.
- `48b8e5af63184323b5a94077d933a0e9` "Edmontosaurus" (`Jurrassicgamer`, CC-BY-4.0): **rejected: no textures** (R2). 0 images.
- `8b758b1e6dc34d4fbfe2854a80771237` "Edmontosaurus-jwe" (`Jurrassicgamer`): **not pursued.** Name indicates a Jurassic World Evolution model; not reviewed.
- Skull, femur, ischium, tendon and tooth scans (for example `2055d7721e454bd8bd4019eb28e27e13`, `1b5b76556e454c2297422b7951ac9d96` which is CC BY-NC-SA): **excluded.** Fragments, not whole animals.

## Pachycephalosaurus

1. **TOP PICK (provenance check required): `1fdb61b75099482eac02bc1b87a3f71e` "pachycephalosaurus"**
   - URL: https://sketchfab.com/3d-models/pachycephalosaurus-1fdb61b75099482eac02bc1b87a3f71e
   - Author: Made_Rex (uploader `Made_Rex`). Description is only "cred HATOGAME", so the real creator is not stated.
   - Licence: `CC Attribution` (CC-BY-4.0). Rigged: y (1 skin).
   - Clips (10): `Pachycephalo_Attack1`, `Pachycephalo_Attack2`, `Pachycephalo_BattleIdle`, `Pachycephalo_Die`, `Pachycephalo_Hit`, `Pachycephalo_Idle`, `Pachycephalo_Idle2`, `Pachycephalo_Run`, `Pachycephalo_Sturn`, `Pachycephalo_Walk`. Mapping if approved: idle → `Pachycephalo_Idle`, walk → `Pachycephalo_Walk`, run → `Pachycephalo_Run`.
   - Polycount: 28,137 tris, 15,664 verts. Textures: 3 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/1fdb61b75099482eac02bc1b87a3f71e/thumbnails/d86dbb45ee194e3baf7efb282f2050dd/256285df9bfc479e93028871faff62f9.jpeg (front view is ambiguous; use the side render)
   - Side render: domed skull ringed by bony knobs, believable proportions, tail held horizontal. No red flags seen at side view. Hands not verified.
   - **Not cleared:** the credit to HATOGAME and clip names such as `Die`, `Hit`, `Sturn` suggest a game-character origin. Verify the upstream licence before approval.
2. `740349873ae244ef8a19155b525d9193` "Pachycephalosaurus_animation" (`seirogan`, CC-BY-4.0)
   - URL: https://sketchfab.com/3d-models/pachycephalosaurus-animation-740349873ae244ef8a19155b525d9193
   - Rigged: y (1 skin). Clip: `Armature|paki` (not confirmed as walk or idle).
   - Polycount: 489,096 tris, 300,557 verts (must be decimated; GLB is 32 MB against a 15 MB high budget). Textures: 2 × 1024 px.
   - Thumbnail: https://media.sketchfab.com/models/740349873ae244ef8a19155b525d9193/thumbnails/49d95774a0244610be4b18a375468537/74952df84ec240e0b46432cc95b41a2c.jpeg
   - Side render: domed skull present, tail horizontal. Skin is lumpy and noisy (R2 risk). Description is a YouTube link only.
3. `ae6153a305fa4d2791848f361518edf1` "Dinoraul's Pachycephalosaurus" (`SammyTheCitipati`, CC-BY-4.0)
   - URL: https://sketchfab.com/3d-models/dinorauls-pachycephalosaurus-ae6153a305fa4d2791848f361518edf1
   - Static: 1 skin, 0 clips. Polycount: 91,776 tris, 52,173 verts. Textures: 1 × 1024 px JPG across 11 materials.
   - Thumbnail: https://media.sketchfab.com/models/ae6153a305fa4d2791848f361518edf1/thumbnails/9e9174cbd1374e5490b73a9c5b1be880/199b8efabe054a98b54013bede55f8a4.jpeg
   - Side render: dome present. A row of spikes runs along the neck and back (no evidence for it; fixable in Blender). Front thumbnail shows a conical spike above the head, so the dome needs a closer check.

Rejected (Pachycephalosaurus):
- `1869385a9918436a910a78b8fbdf9e1f` "Accurate Pachycephalosaurus wyomingensis" (`hsejira`, CC-BY-4.0): **rejected: provenance.** "from Prehistoric Kingdom". Best-looking static pachy at thumbnail scale; a human may override.
- `6fc901a4677e4f6493e02cdd68514961` "HD Pachycephalosaurus" (`CGreature`): **excluded.** Licence is "Free Standard" (Sketchfab's own licence), not CC.
- `3a7a5989623645b5a58c10bc3f73bfcf` "Pachycephalosaurus Head Dome" (`CarterCountyMuseum`, CC-BY-4.0) and `2e97be5068ff4833956306d79cc9ba17` (`uwlibraries`, CC BY-NC-4.0): **not pursued.** Dome only, not a whole animal.
- `6aa020e4fc1640b78bedb12384eb480e` "JWA Pachycephalosaurus" (`Radassic`): **not pursued.** Name indicates Jurassic World Alive; not reviewed.

---

## Manifest

`assets/manifest.json` holds one `status: "candidate"` entry for each of the four top picks above. Ankylosaurus has no entry (NO CANDIDATE). File paths are placeholders (`assets/src/<species>/high.glb`, `low.glb`); no binaries were committed.
