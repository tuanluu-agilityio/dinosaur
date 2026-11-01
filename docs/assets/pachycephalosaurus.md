# Pachycephalosaurus asset

- Source: "Pachycephalosaurus_animation" by seirogan, https://sketchfab.com/3d-models/pachycephalosaurus-animation-740349873ae244ef8a19155b525d9193
- Licence: CC Attribution 4.0 (`http://creativecommons.org/licenses/by/4.0/`), "Author must be credited. Commercial use is allowed." (Sketchfab API record; see candidates.md for the page-vs-API note).
- Source state: FBX, 489,096 triangles, 4096 px diffuse + normal, 25-bone rig with one clip `Armature|paki`, which is a leap that travels about 20 m of model units: not an idle or walk, so it is not shipped.

## Pipeline (all headless Blender, scripts in `scripts/assets/blender/`)

1. `node --env-file=<root>/.env scripts/assets/fetch.mjs pachycephalosaurus` (untracked `assets/src/pachycephalosaurus/`; the download holds a zip, unzip it into `unz/`).
2. `pachycephalosaurus_prep.py`: bake rest pose, drop the source rig, scale to 4.5 m, collapse-decimate to 136,946 triangles (head, dome, nodes and limbs weighted denser), rebuild material (2048 px base colour + normal, roughness 0.75).
3. `pachycephalosaurus_rig.py`: 27-bone armature (no jaw), automatic weights, rigid shells.
4. `pachycephalosaurus_anim.py`: procedural `idle`, `walk` at 24 fps; exports the GLB. `--diag` prints the lowest foot vertex per phase, `--test` renders poses.
5. `node scripts/assets/optimize.mjs <glb> public/models pachycephalosaurus` gives `.high.glb` and `.low.glb`.
6. `pachycephalosaurus_evidence.py` (clips with scrolling floor marks, 1 m close-ups) plus the shared `turntable.py` (angles, 15 m shot) produce the evidence.

## Modifications

See `assets/manifest.json` `modifications` (identical list). Summary: scale, decimation, material rebuild, authored rig and two clips, texture downsizing, optimisation. The source texture is untouched.

## Clips (manifest `clips` map: idle, walk)

| Clip | Length | Notes |
|---|---|---|
| idle | 4.0 s (96 frames at 24 fps) | breathing, weight shift, slight head and tail drift |
| walk | 1.75 s (42 frames) | in place; the engine should advance the root at 0.7 m/s so planted feet do not slide; hips bob twice per cycle (6 cm), stiff tail counter-swings 5 degrees |

All clips loop: the last key equals the first. Clip times are real time (authored at 24 fps, evidence videos rendered and encoded at 24 fps).

## Anatomy self-check

Thick bony dome with a ring of bony nodes around it and rows of nodes on the snout, bipedal, knees forward, ankles back, two short arms with the hands held forward and down, three forward toes per foot, five digits per hand, one tail held horizontally off the ground (about 1 m high at the base), both feet on the ground at rest.

## Digit count (counted on `task-24-pachycephalosaurus.high-digits-feet-front.png`, `-digits-hands-front.png`, `-digits-hand-side.png`)

- Hands: 5 digits each (an inner thumb with a nail plus 4 fingers). Foot: 3 forward-pointing clawed toes each (II-IV); no hallux/digit I is modelled. Source geometry, unchanged. Both feet and both hands are the same, left/right symmetric.

## Evidence format

Clips are 24 fps. Walk video 7.0 s = 168 frames (frame i = action frame i, 4 cycles); floor marks scroll at 0.7 m/s (three marks per 1.75 s cycle); whole animal including tail inside the 6.6 m ortho frame. Idle 8.0 s = 192 frames.

## Known limits

- Walk speed is fixed by the foot plant (0.7 m/s); scaling playback speed makes the feet slide.
- At the instant of landing the toe nail dips about 1.4 cm below the floor plane (measured with `--diag`); not visible in the evidence.
- The skin texture on the inner thigh and belly is stretched in the source UVs (fine veined streaks); left as shipped rather than blurred.
- Hands are small as sculpted and the nail tips are slightly angular at 1 m (visible in the hand close-up); not changed.
