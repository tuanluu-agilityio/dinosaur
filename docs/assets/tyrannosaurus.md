# Tyrannosaurus asset

- Source: "Tyrant King - Tyrannosaurus" by Marcel Schanz (`mschanz`), https://sketchfab.com/3d-models/tyrant-king-tyrannosaurus-6465a297fa784598adc49f6e0042d449
- Licence: CC Attribution 4.0 (`http://creativecommons.org/licenses/by/4.0/`), "Author must be credited. Commercial use is allowed." (Sketchfab API record; see candidates.md for the page-vs-API note).
- Source state: static ZBrush sculpt, FBX, 59,310 triangles, 4096 px diffuse/normal/glossiness, no skeleton, no clips, mouth posed open.

## Pipeline (all headless Blender, scripts in `scripts/assets/blender/`)

1. `node --env-file=<root>/.env scripts/assets/fetch.mjs tyrannosaurus` (into the untracked `assets/src/tyrannosaurus/`).
2. `tyrannosaurus_prep.py`: scale to 12 m, rebuild materials (base colour, normal, roughness = 1 - glossiness in a 512 px ORM).
3. `tyrannosaurus_rig.py`: 28-bone armature, automatic weights, jaw plane re-weight, rigid tooth/claw/eye shells.
4. `tyrannosaurus_anim.py`: procedural `idle`, `walk`, `roar`; exports the GLB.
5. `node scripts/assets/optimize.mjs <glb> public/models tyrannosaurus` gives `.high.glb` (2048 px, 59k tris) and `.low.glb` (1024 px, 20.7k tris).

## Modifications

See `assets/manifest.json` `modifications` (identical list). Summary: scale, material rebuild, authored rig, jaw/teeth weighting, three procedural clips, closed-mouth base pose, texture downsizing for budget, optimisation.

## Clips (manifest `clips` map: idle, walk, roar)

| Clip | Length | Notes |
|---|---|---|
| idle | 4.0 s | breathing, tail sway, slight weight shift, head drift |
| walk | 2.4 s | in place; engine should advance the root at 1.2 m/s so planted feet do not slide; hips bob twice per cycle, tail counter-swings |
| roar | 3.5 s | inhale, jaw open 40 degrees with head raised and shaking |

All clips loop: the last key equals the first.

## Anatomy self-check

Palms face inward (two clawed fingers, plane of the hand vertical); arm about 0.7 m; horizontal torso with the tail held off the ground; knee forward, ankle back; one tail, two legs, two fingers per hand, three forward toes plus a small hallux.

## Known limits

- Auto-weighted skin at the hip/belly is soft but shows no candy-wrapping in the evidence clips.
- Walk speed is fixed by the foot plant (1.2 m/s); scaling playback speed would make the feet slide.
