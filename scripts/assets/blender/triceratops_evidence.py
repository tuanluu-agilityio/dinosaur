"""Evidence renders for the Triceratops asset (issue #21) that turntable.py cannot do.

  blender -b -P scripts/assets/blender/triceratops_evidence.py -- <model.preview.glb> <outDir> <prefix> <what>

<what> is a comma list of:
  closeup     head from exactly 1 m, 28 mm lens, idle pose (three-quarter and side) -> <prefix>-closeup-1m.png, -closeup-side.png
  eatclose    head at 1.5 m while grazing, mid-chew                                   -> <prefix>-closeup-eat.png
  beakbelow   beak from 1 m below and in front, idle pose                             -> <prefix>-closeup-beak-below.png
  eatmax      grazing frame at maximum jaw opening, side view                         -> <prefix>-eat-max-jaw.png
  (close-ups switch the sun shadows off: EEVEE's self-shadow terminator draws light straight-edged wedges on the
   smooth brow/nasal skin that look like texture seams but are not in the texture, UVs or normals)
  idle|walk|eat  whole-animal clips (orthographic side view, ground + scrolling markers) -> <prefix>-clip-<name>.mp4 + -strip.png
Clip scene: ground plane with 1 m-wide marker bars that scroll back at the walk speed (0.779 m/s) so foot planting
is judgeable; a fixed red line at back height shows the body bob. The ortho frame holds the whole animal
(horns to tail tip) with a margin. The importer's Icosphere bone-shape helper is hidden.
Clips are authored at 30 fps but the glTF importer maps them to the scene rate (24 fps); every output frame samples
the action at i * src_fps / 30 (sub-frame), so 1 s of video is 1 s of animation.
"""
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

WALK_SPEED = 1.2 / (2.2 * 0.7)
WALK_T = 2.2
HEAD = Vector((0, -2.7, 1.55))
FPS = 30


def setup(model):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(model))
    for o in bpy.data.objects:
        if o.name.startswith("Icosphere"):
            o.hide_render = o.hide_viewport = True
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    try:
        sc.eevee.taa_render_samples = 24
    except AttributeError:
        pass
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.5, 1)
    sc.world = w
    for n, e, r in (("k", 3, (math.radians(50), 0, math.radians(35))), ("f", 1, (math.radians(60), 0, math.radians(-140)))):
        lt = bpy.data.lights.new(n, "SUN")
        lt.energy = e
        o = bpy.data.objects.new(n, lt)
        o.rotation_euler = r
        sc.collection.objects.link(o)
    cd = bpy.data.cameras.new("c")
    cd.clip_end = 200
    cam = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    return sc, cam, arm


def play(arm, name, frame):
    act = bpy.data.actions[name]
    if arm.animation_data is None:
        arm.animation_data_create()
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.use_nla = False
    arm.animation_data.action = act
    start, end = act.frame_range
    length = end - start
    f = start + (frame % length)   # `frame` is in action frames (scene fps)
    bpy.context.scene.frame_set(int(f), subframe=f - int(f))
    return length


def aim(cam, loc, target):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


def mat(color, emit=False):
    m = bpy.data.materials.new("m")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    if emit:
        b.inputs["Emission Color"].default_value = color
        b.inputs["Emission Strength"].default_value = 3.0
    else:
        b.inputs["Roughness"].default_value = 0.95
    return m


def no_sun_shadows():
    for o in bpy.data.objects:
        if o.type == "LIGHT":
            o.data.use_shadow = False


def build_ground(spacing):
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
    g = bpy.context.active_object
    g.data.materials.append(mat((0.22, 0.22, 0.22, 1)))
    bars = bpy.data.objects.new("bars", None)
    bpy.context.scene.collection.objects.link(bars)
    bm = mat((0.9, 0.9, 0.9, 1))
    for i in range(-20, 21):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-4.6, i * spacing, 0.004))
        c = bpy.context.active_object
        c.scale = (6.6, 0.14, 0.004)
        c.data.materials.append(bm)
        c.parent = bars
    return bars


def build_reference_line(z):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-4.0, 0, z))
    c = bpy.context.active_object
    c.scale = (0.02, 40, 0.05)
    c.data.materials.append(mat((1, 0.1, 0.1, 1), emit=True))


def still(sc, cam, path, loc, target, lens):
    cam.data.type = "PERSP"
    cam.data.lens = lens
    aim(cam, loc, target)
    sc.render.resolution_x = sc.render.resolution_y = 1024
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def clip(sc, cam, arm, name, out_dir, prefix, seconds):
    spacing = WALK_SPEED * WALK_T / 2          # two bars per walk cycle so the scroll loops exactly
    bars = build_ground(spacing)
    build_reference_line(3.4)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 11.0                 # horns to tail tip is 8.8 m: >1 m margin on each end
    sc.render.resolution_x, sc.render.resolution_y = 1200, 600
    e = math.radians(14)
    aim(cam, (30 * math.cos(e), 0.4, 1.6 + 30 * math.sin(e)), (0, 0.4, 1.6))
    total = int(round(seconds * FPS))
    src_fps = sc.render.fps / (sc.render.fps_base or 1.0)
    print("source fps", src_fps)
    tmp = os.path.join(out_dir, f".frames-{prefix}-{name}")
    os.makedirs(tmp, exist_ok=True)
    for i in range(total):
        play(arm, name, i * src_fps / FPS)
        if name == "walk":                      # ground scrolls back (+Y) at the walk speed
            bars.location.y = (WALK_SPEED * i / FPS) % spacing
        sc.render.filepath = os.path.join(tmp, f"f{i:04d}.png")
        bpy.ops.render.render(write_still=True)
    out = os.path.join(out_dir, f"{prefix}-clip-{name}.mp4")
    ff = shutil.which("ffmpeg") or "ffmpeg"
    subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], check=True)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", out, "-vf", f"fps=20/{seconds},scale=480:-1,tile=4x5",
                    "-frames:v", "1", out[:-4] + "-strip.png"], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print("clip", name, out)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    model, out_dir, prefix, what = argv[0], os.path.abspath(argv[1]), argv[2], argv[3].split(",")
    os.makedirs(out_dir, exist_ok=True)
    sc, cam, arm = setup(model)
    play(arm, "idle", 0)
    if any(k in what for k in ("closeup", "eatclose", "beakbelow", "eatmax")):
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        bpy.context.active_object.data.materials.append(mat((0.34, 0.34, 0.34, 1)))
    if "closeup" in what or "beakbelow" in what or "eatmax" in what:
        no_sun_shadows()
    if "closeup" in what:
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-1m.png"), HEAD + Vector((-0.8, -0.6, 0.25)).normalized() * 1.0, HEAD, 24)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-side.png"), HEAD + Vector((1.0, 0.0, 0.1)).normalized() * 1.0, HEAD, 24)
    if "eatclose" in what:
        play(arm, "eat", 0.45 * 150 + 4)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-eat.png"), Vector((2.6, -4.6, 1.3)), Vector((0, -2.5, 0.8)), 35)
    if "beakbelow" in what:
        play(arm, "idle", 0)
        beak = Vector((0, -3.1, 1.05))
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-beak-below.png"), beak + Vector((0.3, -0.7, -0.65)).normalized() * 1.0, beak, 35)
    if "eatmax" in what:
        n = play(arm, "eat", 0)
        play(arm, "eat", n * 0.2867)                         # jaw at its widest in the first chomp
        still(sc, cam, os.path.join(out_dir, f"{prefix}-eat-max-jaw.png"), Vector((1.7, -1.55, 0.5)), Vector((0, -1.55, 0.45)), 28)
    for name in [w for w in what if w in ("idle", "walk", "eat")]:
        for o in list(bpy.data.objects):
            if o.name.startswith(("Cube", "Plane", "bars")):
                bpy.data.objects.remove(o)
        clip(sc, cam, arm, name, out_dir, prefix, {"idle": 8.0, "walk": 6.6, "eat": 10.0}[name])


main()
