# Triceratops asset

- Source: "Triceratops dinosaur" by `wojciechmiedziocha`, https://sketchfab.com/3d-models/triceratops-dinosaur-87527079bad44917ab1b98a456b46c7e
- Licence: CC Attribution 4.0 (`http://creativecommons.org/licenses/by/4.0/`), "Author must be credited. Commercial use is allowed." (Sketchfab API record; see candidates.md for the page-vs-API note). Description: "Model made in blender 2.8 PBR textures" (own work, cleared in candidates.md).
- Source state: static Blender sculpt, OBJ, 12,560 triangles, one 4096 px PBR set (base colour, normal, roughness, metallic, specular, baked AO), no skeleton, no clips.

## Pipeline (all headless Blender, scripts in `scripts/assets/blender/`)

1. `node --env-file=<root>/.env scripts/assets/fetch.mjs triceratops` (into the untracked `assets/src/triceratops/`), then unzip `source/triceratops.zip` to `assets/src/triceratops/obj/`.
2. `triceratops_prep.py`: import OBJ, one Catmull-Clark level, scale to 8 m nose-to-tail (horn tips to tail tip; the clips use an 11 m wide frame), head clean-up (snout subdivision, smoothed beak margin and outline, flared horn bases), rebuild material (base colour + normal 2048 px, 1024 px ORM).
3. `triceratops_rig.py`: 29-bone armature, automatic weights, beak re-weight by mouth line.
4. `triceratops_anim.py`: procedural `idle`, `walk`, `eat`; exports the GLB.
5. `node scripts/assets/optimize.mjs <glb> public/models triceratops` gives `.high.glb` (2048 px, 65,294 tris, 6.35 MB) and `.low.glb` (1024 px, 22,852 tris, 2.66 MB).
6. Evidence: `turntable.py` (stills, far shot) and `triceratops_evidence.py` (1 m close-ups, clips on a ground with scrolling markers) on the `--preview` GLBs.

## Modifications

See `assets/manifest.json` `modifications` (identical list). Summary: scale, one subdivision level, material rebuild, authored rig, beak weighting, three procedural clips, texture downsizing for budget, optimisation.

## Clips (manifest `clips` map: idle, walk, eat)

| Clip | Length | Notes |
|---|---|---|
| idle | 4.0 s | breathing, tail sway, slight weight shift, head drift |
| walk | 2.2 s | in place; four-beat lateral sequence (LH, LF, RH, RF), 70 % duty. The engine should advance the root at 0.78 m/s (stride 1.2 m / (2.2 s x 0.7)) so planted feet do not slide; body bobs four times per cycle, rolls onto the supported side, tail counter-swings |
| eat | 5.0 s | head lowers until the beak is at ground level (lowest vertex above z = -0.01 m), three chomps with a small head nod, head rises; all four feet stay planted |

All clips loop: the last key equals the first. Clips are baked at 30 fps; the glTF importer reads them at the scene rate (24 fps), so the evidence renderer samples the action at i x 24/30 and 1 s of video is 1 s of animation (walk 66 frames per cycle at 30 fps, idle 120, eat 150).

## Anatomy self-check

Three facial horns (long brow pair, short nose horn), solid frill with a row of epoccipital spikes and no holes (not Torosaurus), toothless beak, forelimbs held under the body (not sprawled), hind knees forward, columnar feet with four hind and three/four fore toes visible, tail held off the ground. The beak is smooth keratin (the sculpt's tooth-like scale bumps along the beak margin were smoothed).

## Known limits

- The light straight-edged wedges seen on the brow and nasal-horn base in round 1 were not in the texture, UVs or normals: they are EEVEE's sun self-shadow terminator (gone with sun shadows off; the unlit base colour and a muted normal map were clean). The close-up scripts therefore render with sun shadows off; turntable.py stills keep shadows and may show faint wedges at long range only.
- Beak/jaw opening is small (12 degrees at the widest chomp) on purpose; larger angles reveal the closed-mouth sculpt has no mouth interior.
- Walk speed is fixed by the foot plant (0.78 m/s); scaling playback speed would make the feet slide.
- Frill and shoulder do not interpenetrate in the evidence clips at the eat pose; a deeper head-down pose was not tried.
