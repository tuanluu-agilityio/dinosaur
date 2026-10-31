"""Render visual-judge evidence for a model (docs/rubrics/visual-model.md).

Usage (headless):
  blender -b -P scripts/assets/blender/turntable.py -- <model.glb> <outDir> [options]

Options:
  --prefix NAME      file prefix (default: model file stem, e.g. tyrannosaurus.high)
  --res N            still resolution, square (default 1024)
  --video-res N      video resolution, square (default 720)
  --seconds S        clip length in seconds (default 5)
  --fps N            video frame rate (default 24)
  --forward AXIS     model forward axis in Blender space: -Y (glTF default), +Y, +X, -X
  --only LIST        comma list of: angles, closeup, far, clips (default: angles,clips)
  --far-dist M       distance for the "far" shot (default 15)
  --engine NAME      BLENDER_EEVEE_NEXT (default), BLENDER_EEVEE or CYCLES

Outputs in <outDir>:
  <prefix>-{front,back,left,right,three-quarter-front-high,three-quarter-rear-low}.png
  <prefix>-closeup-1m.png     (head close-up at 1 m, use on the high variant)
  <prefix>-far-15m.png        (use on the low variant)
  <prefix>-clip-<name>.mp4    (side view, ground plane visible, looped to --seconds)
Frame strips (`ffmpeg ... tile=5x4`) are made by the caller; see CLAUDE.md -> Evidence.
"""
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {
        "prefix": None, "res": 1024, "video-res": 720, "seconds": 5.0, "fps": 24,
        "forward": "-Y", "only": "angles,clips", "far-dist": 15.0, "engine": "BLENDER_EEVEE_NEXT",
    }
    pos = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            key = a[2:]
            if key not in opts:
                sys.exit("unknown option " + a)
            opts[key] = type(opts[key])(argv[i + 1]) if opts[key] is not None else argv[i + 1]
            i += 2
        else:
            pos.append(a)
            i += 1
    if len(pos) != 2:
        sys.exit("usage: blender -b -P turntable.py -- <model.glb> <outDir> [options]")
    return pos[0], pos[1], opts


FORWARD = {"-Y": Vector((0, -1, 0)), "+Y": Vector((0, 1, 0)), "+X": Vector((1, 0, 0)), "-X": Vector((-1, 0, 0))}


def setup_scene(opts):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = opts["engine"]
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX" if "AgX" in [
        i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    world = bpy.data.worlds.new("neutral")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.5, 0.5, 0.5, 1)  # neutral grey, flat "HDRI"
    bg.inputs[1].default_value = 1.0
    scene.world = world
    return scene


def add_lights(center, size):
    sun = bpy.data.lights.new("key", "SUN")
    sun.energy = 3.0
    sun.angle = math.radians(8)
    obj = bpy.data.objects.new("key", sun)
    obj.rotation_euler = (math.radians(50), 0, math.radians(35))
    bpy.context.scene.collection.objects.link(obj)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 1.0
    fobj = bpy.data.objects.new("fill", fill)
    fobj.rotation_euler = (math.radians(60), 0, math.radians(-140))
    bpy.context.scene.collection.objects.link(fobj)


def world_bounds():
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], p[i]) for i in range(3)))
            hi = Vector((max(hi[i], p[i]) for i in range(3)))
    return lo, hi


def add_ground(lo, hi):
    size = max(hi.x - lo.x, hi.y - lo.y) * 6 + 40
    bpy.ops.mesh.primitive_plane_add(size=size, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    plane = bpy.context.active_object
    plane.name = "ground"
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.32, 0.32, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    plane.data.materials.append(mat)
    # Checker-free reference marks every metre along the forward axis would clutter; keep plain plane.
    return plane


def make_camera(res):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam_data.clip_end = 500
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = res
    bpy.context.scene.render.resolution_y = res
    return cam


def aim(cam, location, target):
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def frame_distance(cam, extent):
    # distance at which a sphere of diameter `extent` fills ~85 % of the frame
    sensor = cam.data.sensor_width
    return (extent / 2) / math.tan(math.atan(sensor / (2 * cam.data.lens))) / 0.85


def render_still(path):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def rotate_z(v, deg):
    r = math.radians(deg)
    return Vector((v.x * math.cos(r) - v.y * math.sin(r), v.x * math.sin(r) + v.y * math.cos(r), v.z))


def render_angles(cam, center, extent, fwd, prefix, outdir):
    dist = frame_distance(cam, extent)
    # (name, yaw degrees from forward, elevation degrees)
    views = [
        ("front", 0, 5), ("back", 180, 5), ("left", 90, 5), ("right", -90, 5),
        ("three-quarter-front-high", 40, 30), ("three-quarter-rear-low", 150, -4),
    ]
    for name, yaw, elev in views:
        d = rotate_z(fwd, yaw)
        e = math.radians(elev)
        loc = center + Vector((d.x * math.cos(e), d.y * math.cos(e), math.sin(e))) * dist
        if loc.z < bpy.data.objects["ground"].location.z + 0.2:
            loc.z = bpy.data.objects["ground"].location.z + 0.2
        aim(cam, loc, center)
        render_still(os.path.join(outdir, f"{prefix}-{name}.png"))


def render_closeup(cam, lo, hi, fwd, prefix, outdir):
    center = (lo + hi) / 2
    length = max(hi.x - lo.x, hi.y - lo.y)
    head = Vector((center.x, center.y, lo.z + (hi.z - lo.z) * 0.85)) + fwd * (length * 0.45)
    d = rotate_z(fwd, 40)
    loc = head + Vector((d.x, d.y, 0.15)).normalized() * 1.0  # exactly 1 m from the head point
    cam.data.lens = 85
    aim(cam, loc, head)
    render_still(os.path.join(outdir, f"{prefix}-closeup-1m.png"))
    cam.data.lens = 50


def render_far(cam, lo, hi, fwd, prefix, outdir, dist):
    center = (lo + hi) / 2
    side = rotate_z(fwd, 90)
    loc = Vector((center.x, center.y, lo.z + 1.6)) + side * dist
    aim(cam, loc, center)
    render_still(os.path.join(outdir, f"{prefix}-far-{int(dist)}m.png"))


def collect_clips():
    """Group actions into clips: strip '.001' suffixes and the '_<objectname>' the glTF importer appends."""
    clips = {}
    obj_names = [o.name for o in bpy.data.objects]
    for action in bpy.data.actions:
        base = action.name
        for n in sorted(obj_names, key=len, reverse=True):
            if base.endswith("_" + n):
                base = base[: -(len(n) + 1)]
                break
        clips.setdefault(base, []).append(action)
    return clips


def play_clip(actions):
    """Assign each action to the object that owns its fcurves; return (start, end)."""
    start = min(a.frame_range[0] for a in actions)
    end = max(a.frame_range[1] for a in actions)
    for obj in bpy.data.objects:
        if obj.animation_data:
            for t in obj.animation_data.nla_tracks:
                t.mute = True
            obj.animation_data.action = None
    for action in actions:
        targets = []
        for o in bpy.data.objects:
            if o.type == "ARMATURE" and any(fc.data_path.startswith("pose.bones") for fc in action.fcurves):
                targets.append(o)
            elif o.type != "ARMATURE" and any(a is action for a in [getattr(o.animation_data, "action", None)]):
                targets.append(o)
        if not targets:
            candidates = [o for o in bpy.data.objects if o.type in ("ARMATURE", "EMPTY", "MESH")]
            targets = [o for o in candidates if o.name in action.name] or candidates[:1]
        for o in targets:
            if o.animation_data is None:
                o.animation_data_create()
            o.animation_data.action = action
    return int(start), int(max(end, start + 1))


def render_clips(cam, center, extent, fwd, prefix, outdir, opts):
    scene = bpy.context.scene
    clips = collect_clips()
    if not clips:
        print("no animation clips found")
        return
    for obj in bpy.data.objects:  # model's own tracks stay muted; we drive actions directly
        if obj.animation_data:
            obj.animation_data.use_nla = False
    side = rotate_z(fwd, 90)
    dist = frame_distance(cam, extent * 1.25)
    loc = center + side * dist
    loc.z = center.z
    aim(cam, loc, center)
    scene.render.resolution_x = scene.render.resolution_y = opts["video-res"]
    scene.render.fps = opts["fps"]
    total = int(round(opts["seconds"] * opts["fps"]))
    for name, actions in clips.items():
        start, end = play_clip(actions)
        length = max(end - start, 1)
        tmp = os.path.join(outdir, f".frames-{prefix}-{name}")
        os.makedirs(tmp, exist_ok=True)
        scene.render.image_settings.file_format = "PNG"
        for i in range(total):
            scene.frame_set(start + (i % length))  # loops the clip to fill --seconds
            scene.render.filepath = os.path.join(tmp, f"f{i:04d}.png")
            bpy.ops.render.render(write_still=True)
        out = os.path.join(outdir, f"{prefix}-clip-{name}.mp4")
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", str(opts["fps"]), "-i", os.path.join(tmp, "f%04d.png"),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], check=True)
        shutil.rmtree(tmp, ignore_errors=True)
        print("clip", name, "->", out, f"({length} source frames)")
    scene.frame_set(1)
    scene.render.resolution_x = scene.render.resolution_y = opts["res"]


def main():
    model, outdir, opts = parse_args()
    outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)
    only = set(opts["only"].split(","))
    prefix = opts["prefix"] or os.path.splitext(os.path.basename(model))[0]
    scene = setup_scene(opts)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(model))
    scene.frame_set(1)
    bpy.context.view_layer.update()
    lo, hi = world_bounds()
    center = (lo + hi) / 2
    extent = (hi - lo).length
    fwd = FORWARD[opts["forward"]]
    add_ground(lo, hi)
    add_lights(center, extent)
    cam = make_camera(opts["res"])
    if "angles" in only:
        render_angles(cam, center, extent, fwd, prefix, outdir)
    if "closeup" in only:
        render_closeup(cam, lo, hi, fwd, prefix, outdir)
    if "far" in only:
        render_far(cam, lo, hi, fwd, prefix, outdir, opts["far-dist"])
    if "clips" in only:
        render_clips(cam, center, extent, fwd, prefix, outdir, opts)
    print("evidence ->", outdir)


main()
