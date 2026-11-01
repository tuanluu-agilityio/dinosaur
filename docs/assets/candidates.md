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

### Round 3 (issue #23, user asked for another model): still NO CANDIDATE

Queries tried (Sketchfab `downloadable=true`, then without the filter to see what exists): `hadrosaurid`, `hadrosaur`, `hadrosaur rigged`, `hadrosaur animated walk`, `saurolophine`, `edmontosaurus annectens`, `edmontosaurus regalis`, `edmontosaurus model`, `edmontosaurus rigged`, `edmontosaurus animated`, `edmontosaurus skeleton`, `edmontosaurus life restoration`, `edmonto`, `anatotitan`, `duck-billed dinosaur`, `Hell Creek hadrosaur`, `saurolophus`, `shantungosaurus`, `kritosaurus`, `brachylophosaurus`, `gryposaurus`, `maiasaura`, `corythosaurus`, `lambeosaurus`. Uploader catalogues: `hsejira`, `Hhhhhh66`, `DinoDanDragonMan`, `Danger_Floof`, `Dino_melt_stuff`. Web: Smithsonian, MorphoSource, Digital Atlas of Ancient Life, CGTrader/RenderHub/SuperHive (no free whole-animal E. annectens found).

- `11eb8aeaf11245b799bcdc84d1a502b2` "Edmontosaurus" (`Danger_Floof`, CC-BY-4.0, 572 faces): **rejected: low-poly.**
- `bb122e88530a4004a8f09e23d0830625` "TLWJP(Arcade) - Anatotitan/Edmontosaurus" (`ziggertron`, CC-BY-4.0, 1,247 faces): **rejected: arcade game rip, low-poly.**
- `3da9f211ae304bd0afd1d15a290eabbd` "Maiasaura With Rig" (`DinoDanDragonMan`, CC-BY-4.0, 17,948 faces, rigged): **rejected: wrong species** (Maiasaura, Campanian Montana, not Hell Creek); Dino Dan lineage is game-sourced.
- `d81a1c7f9f5145fe89b1416e598c39d2` "Accurate lambeosaurus rigged" (`Hhhhhh66`) and `ff429847f5344faebe5caa40055e6cc7` (`hsejira`), CC-BY-4.0: **rejected: wrong species (crested lambeosaurine); the "Accurate ..." series is the Prehistoric Kingdom rip lineage.**
- `6e0e2bcae74e4a1c89537bc3aa0f682e` "LDA Saurolophus (No rig and texture)" (`Dino_melt_stuff`, CC-BY-4.0, 10,000 faces): **rejected: wrong species, untextured, unrigged.**
- Dino Raul / `slang107123456789` / `SammyTheCitipati` hadrosaurs (Saurolophus, Maiasaura, Shantungosaurus, Corythosaurus): **rejected: wrong species and unnamed upstream chain** (same as the Dino Raul Edmontosaurus).
- `6ddb19be075c455796f17502b9a3f899` "UW 15561 - Edmontosaurus copei, Skeleton" (`uwlibraries`, CC BY-NC, 132,958 faces) and `d4a26baf40724504981e07b81b55489b` (tendons and spine): **rejected: fossil skeleton scans, not a fleshed living animal.** Licence acceptable; subject is not.
- Not downloadable (unusable, licence not checked): `caee180bca8e459c803849a4588e3fe6` Edmontosaurus Rig (`bill_nguyen`, sold on RenderHub/SuperHive), `b569fca4003948209b49d5e5f29fb919` (`AneesAnimates`), `29530f3bfac342f4bbe968197b9710d9` and `66c68db473dd4ac68a516148acccd477` (`robertfabiani`).
- Smithsonian, MorphoSource and Digital Atlas of Ancient Life hold only bones, skulls and mounted skeletons for Edmontosaurus, no restoration.

Options for a human: hand-model one in Blender (own work, E. annectens: toothless beak, hoof-mitten hands, no crest); ask `bill_nguyen` about a licence; or close #23 not planned (ADR 0004).

---

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
