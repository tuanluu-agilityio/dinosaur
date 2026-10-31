"""Convert FBX / OBJ / .blend / glTF / GLB to a GLB that keeps animations.

Usage (headless):
  blender -b -P scripts/assets/blender/convert.py -- <input> <output.glb> [--scale 1.0]

Every action is exported as its own glTF animation (named after the action); the importer
puts clips on NLA tracks so nothing is dropped.
"""
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    pos = [a for a in argv if not a.startswith("--")]
    scale = 1.0
    if "--scale" in argv:
        scale = float(argv[argv.index("--scale") + 1])
        pos.remove(argv[argv.index("--scale") + 1])
    if len(pos) != 2:
        sys.exit("usage: blender -b -P convert.py -- <input> <output.glb> [--scale S]")
    return pos[0], pos[1], scale


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_any(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".blend":
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
            dst.actions = src.actions
        for obj in dst.objects:
            if obj is not None:
                bpy.context.scene.collection.objects.link(obj)
    else:
        sys.exit("unsupported input format: " + ext)


def push_actions_to_nla():
    """Make sure every action is exported: park unassigned actions on NLA tracks of the armature."""
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms:
        return
    arm = arms[0]
    if arm.animation_data is None:
        arm.animation_data_create()
    used = {t.strips[0].action for t in arm.animation_data.nla_tracks if t.strips}
    for action in bpy.data.actions:
        if action in used or (action.users == 0 and not action.fcurves):
            continue
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        start = int(action.frame_range[0])
        strip = track.strips.new(action.name, start, action)
        strip.name = action.name
    arm.animation_data.action = None


def main():
    src, dst, scale = parse_args()
    clear_scene()
    import_any(os.path.abspath(src))
    if scale != 1.0:
        for obj in bpy.context.scene.objects:
            if obj.parent is None:
                obj.scale = tuple(s * scale for s in obj.scale)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    push_actions_to_nla()
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(dst),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=True,
        export_apply=False,
        export_image_format="AUTO",
        export_yup=True,
    )
    print("converted ->", dst)


main()
