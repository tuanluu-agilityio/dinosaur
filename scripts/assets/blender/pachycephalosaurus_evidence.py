"""Evidence renders for the Pachycephalosaurus asset (issue #24) that turntable.py cannot do.

  blender -b -P scripts/assets/blender/tyrannosaurus_evidence.py -- <model.preview.glb> <outDir> <prefix> <what>

<what> is a comma list of:
  closeup     head from exactly 1 m (3/4, front, top views), 35 mm lens, idle pose -> <prefix>-closeup-1m.png, -front, -top
  feet        feet and legs from 1 m, idle pose                        -> <prefix>-closeup-feet.png
  idle|walk|walk-top  full-animal clips (orthographic, whole animal incl. tail in frame) -> <prefix>-clip-<name>.mp4 + -strip.png
Clips are rendered and encoded at 24 fps = the authored rate, whole-cycle length (walk 7.0 s = 4 cycles, idle 8.0 s = 2),
so video time equals real time. Ground has marker bars scrolling back at the walk speed (0.7 m/s) so foot planting is
judgeable, and a fixed red reference line at back height so the body bob is visible.
walk-top is the same walk seen from above (tail counter-swing).
"""
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

WALK_SPEED = 0.7
WALK_T = 1.75
HEAD = Vector((0, -1.4, 1.85))


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
    f = start + (frame % length)
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


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
    g = bpy.context.active_object
    g.data.materials.append(mat((0.22, 0.22, 0.22, 1)))
    bars = bpy.data.objects.new("bars", None)
    bpy.context.scene.collection.objects.link(bars)
    spacing = WALK_SPEED * WALK_T / 3        # three bars per walk cycle so the scroll loops exactly
    bm = mat((0.9, 0.9, 0.9, 1))
    for i in range(-30, 31):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, i * spacing, 0.004))
        c = bpy.context.active_object
        c.scale = (8, 0.05, 0.004)
        c.data.materials.append(bm)
        c.parent = bars
    return bars, spacing


def build_reference_line(z):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.5, 0, z))
    c = bpy.context.active_object
    c.scale = (0.01, 40, 0.02)
    c.data.materials.append(mat((1, 0.1, 0.1, 1), emit=True))


def still(sc, cam, path, loc, target, lens):
    cam.data.type = "PERSP"
    cam.data.lens = lens
    aim(cam, loc, target)
    sc.render.resolution_x = sc.render.resolution_y = 1024
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def clip(sc, cam, arm, name, out_dir, prefix, top=False, fps=24, feet=False):
    clip_name = "walk" if name.startswith("walk") else name
    seconds = 4 * WALK_T if clip_name == "walk" else 8.0        # whole cycles so the video loops
    sc.render.fps = fps
    bars, spacing = build_ground()
    if feet:                                      # short floor marks: at a 4 degree camera a long bar would look like a post
        for c in bars.children:
            c.scale.x = 0.2
    build_reference_line(1.8)
    cam.data.type = "ORTHO"
    sc.render.resolution_x, sc.render.resolution_y = 1200, 600
    cam.data.ortho_scale = 6.6                    # 4.5 m animal + margin: head and whole tail stay in frame
    if feet:                                      # low camera (4 degrees), legs only: floor marks are flat lines, no posts
        cam.data.ortho_scale = 2.0
        e = math.radians(4)
        aim(cam, (-30 * math.cos(e), -0.1, 0.45 + 30 * math.sin(e)), (0, -0.1, 0.45))
        sc.render.resolution_x, sc.render.resolution_y = 1200, 600
    elif top:
        cam.location = (0, 0.55, 30)
        cam.rotation_euler = (0, 0, math.radians(-90))   # image right = -Y (the animal faces right)
    else:
        e = math.radians(16)                      # slightly raised so the ground and its marker bars are visible
        aim(cam, (-30 * math.cos(e), 0.55, 1.1 + 30 * math.sin(e)), (0, 0.55, 1.1))
    total = int(round(seconds * fps))
    tmp = os.path.join(out_dir, f".frames-{prefix}-{name}")
    os.makedirs(tmp, exist_ok=True)
    for i in range(total):
        play(arm, clip_name, i)                   # authored at 24 fps: output frame i == action frame i (+start)
        if clip_name == "walk":                   # ground scrolls back (+Y) at the walk speed
            bars.location.y = (WALK_SPEED * i / fps) % spacing
        sc.render.filepath = os.path.join(tmp, f"f{i:04d}.png")
        bpy.ops.render.render(write_still=True)
    out = os.path.join(out_dir, f"{prefix}-clip-{name}.mp4")
    ff = shutil.which("ffmpeg") or "ffmpeg"
    subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp, "f%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], check=True)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", out, "-vf", f"fps=20/{seconds},scale=480:-1,tile=4x5",
                    "-frames:v", "1", out[:-4] + "-strip.png"], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print("clip", name, out, seconds, "s", fps, "fps")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    model, out_dir, prefix, what = argv[0], os.path.abspath(argv[1]), argv[2], argv[3].split(",")
    os.makedirs(out_dir, exist_ok=True)
    sc, cam, arm = setup(model)
    sc.render.fps = 24
    play(arm, "idle", 0)
    if "closeup" in what or "feet" in what:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        bpy.context.active_object.data.materials.append(mat((0.34, 0.34, 0.34, 1)))
    if "closeup" in what:
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-1m.png"), HEAD + Vector((-0.6, -0.7, 0.25)).normalized() * 1.0, HEAD, 35)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-front.png"), HEAD + Vector((0.0, -1.0, 0.1)).normalized() * 1.0, HEAD, 35)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-top.png"), HEAD + Vector((-0.1, -0.3, 1.0)).normalized() * 1.0, HEAD, 35)
    if "feet" in what:
        F = Vector((0.0, -0.05, 0.4))
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-feet.png"), F + Vector((-0.8, -0.5, 0.1)).normalized() * 1.0, F, 40)
    if "belly" in what:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        bpy.context.active_object.data.materials.append(mat((0.34, 0.34, 0.34, 1)))
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-belly.png"), Vector((0, -0.1, 0.05)), Vector((0, -0.1, 1.05)), 35)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-inner-thigh.png"), Vector((1.0, -0.1, 0.7)), Vector((0.2, -0.1, 0.75)), 40)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-brow.png"), Vector((-0.5, -1.9, 2.1)), Vector((0, -1.3, 1.95)), 50)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-shin.png"), Vector((0, -1.0, 0.35)), Vector((0.34, -0.05, 0.35)), 50)
    if "digits" in what:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        bpy.context.active_object.data.materials.append(mat((0.34, 0.34, 0.34, 1)))
        for nm, tgt, off, lens in (("feet-top", (0, -0.15, 0.1), (0, -0.25, 1.0), 40), ("feet-front", (0, -0.3, 0.15), (0, -1.0, 0.25), 40),
                                   ("hands-front", (0, -1.05, 0.62), (0, -1.0, 0.2), 50), ("hand-side", (0.28, -1.03, 0.6), (1.0, -0.1, 0.1), 60)):
            T = Vector(tgt)
            still(sc, cam, os.path.join(out_dir, f"{prefix}-digits-{nm}.png"), T + Vector(off).normalized() * 1.0, T, lens)
    for name in [w for w in what if w in ("idle", "walk", "walk-top", "walk-feet")]:
        for o in list(bpy.data.objects):
            if o.name.startswith(("Cube", "Plane", "bars")):
                bpy.data.objects.remove(o)
        clip(sc, cam, arm, name, out_dir, prefix, top=name == "walk-top", feet=name == "walk-feet")


main()
