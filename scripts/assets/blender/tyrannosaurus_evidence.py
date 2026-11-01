"""Evidence renders for the Tyrannosaurus asset (issue #20) that turntable.py cannot do.

  blender -b -P scripts/assets/blender/tyrannosaurus_evidence.py -- <model.preview.glb> <outDir> <prefix> <what>

<what> is a comma list of:
  closeup     head from exactly 1 m, 28 mm lens, idle pose            -> <prefix>-closeup-1m.png
  lowangle    head from 1 m below and in front, looking up the throat -> <prefix>-closeup-lowangle.png
  idle|walk|roar|walk-top  full-animal clips (orthographic, whole animal in frame) -> <prefix>-clip-<name>.mp4 + -strip.png
Clip scene: a ground plane with 1 m-wide marker bars that scroll back at the walk speed (1.2 m/s) so foot
planting is judgeable, and a fixed red reference line at back height so the body bob is visible.
walk-top is the same walk seen from above (tail counter-swing).
"""
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

WALK_SPEED = 1.2
HEAD = Vector((0, -4.7, 3.3))


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
    spacing = WALK_SPEED * 2.4 / 3          # 0.96 m: three bars per walk cycle so the scroll loops exactly
    bm = mat((0.9, 0.9, 0.9, 1))
    for i in range(-20, 21):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, i * spacing, 0.004))
        c = bpy.context.active_object
        c.scale = (14, 0.14, 0.004)
        c.data.materials.append(bm)
        c.parent = bars
    return bars, spacing


def build_reference_line(z):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(2.5, 0, z))
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


def clip(sc, cam, arm, name, out_dir, prefix, top=False, seconds=7.2, fps=24):
    clip_name = "walk" if name.startswith("walk") else name
    bars, spacing = build_ground()
    build_reference_line(3.55)
    cam.data.type = "ORTHO"
    sc.render.resolution_x, sc.render.resolution_y = (1200, 600) if not top else (1200, 600)
    if top:
        cam.data.ortho_scale = 14.5
        cam.location = (0, 0.4, 30)
        cam.rotation_euler = (0, 0, math.radians(90))   # image right = -Y (the animal faces right)
        cam.rotation_euler = (0, 0, math.radians(-90))
    else:
        cam.data.ortho_scale = 14.5
        e = math.radians(16)                    # slightly raised so the ground and its marker bars are visible
        aim(cam, (-30 * math.cos(e), 0.4, 2.0 + 30 * math.sin(e)), (0, 0.4, 2.0))
    total = int(round(seconds * fps))
    tmp = os.path.join(out_dir, f".frames-{prefix}-{name}")
    os.makedirs(tmp, exist_ok=True)
    for i in range(total):
        play(arm, clip_name, i * 24.0 / fps)
        if clip_name == "walk":                          # ground scrolls back (+Y) at the walk speed
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
    print("clip", name, out)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    model, out_dir, prefix, what = argv[0], os.path.abspath(argv[1]), argv[2], argv[3].split(",")
    os.makedirs(out_dir, exist_ok=True)
    sc, cam, arm = setup(model)
    play(arm, "idle", 0)
    if "closeup" in what:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        bpy.context.active_object.data.materials.append(mat((0.34, 0.34, 0.34, 1)))
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-1m.png"), HEAD + Vector((-0.8, -0.6, 0.35)).normalized() * 1.0, HEAD, 28)
        still(sc, cam, os.path.join(out_dir, f"{prefix}-closeup-lowangle.png"), HEAD + Vector((-0.45, -0.55, -0.7)).normalized() * 1.0, HEAD + Vector((0, 0, -0.25)), 28)
        return
    for name in [w for w in what if w in ("idle", "walk", "roar", "walk-top")]:
        for o in list(bpy.data.objects):
            if o.name.startswith(("Cube", "Plane", "bars")):
                bpy.data.objects.remove(o)
        clip(sc, cam, arm, name, out_dir, prefix, top=name == "walk-top")


main()
