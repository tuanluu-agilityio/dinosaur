"""Stage 2 for the Triceratops asset (issue #21): build the deform armature and skin the mesh.

  blender -b -P scripts/assets/blender/triceratops_rig.py -- <prep.blend> <rig.blend>

The source model is a static sculpt (no skeleton), so the armature is authored here. Joint
positions were read off ortho renders of the 8 m model with a 0.5 m grid (-Y forward, +Z up).
Skinning: Blender automatic (heat) weights; the beak/lower jaw is re-weighted by a mouth-line plane
and relaxed over the surface; weights are limited to 4 influences and normalised.
"""
import sys

import bpy
from mathutils import Vector

FRONT_X = 0.85
HIND_X = 0.95

# name: (head, tail, parent) ; (x, y, z)
CENTRAL = {
    "root": ((0, 0.8, 0.0), (0, 0.8, 0.5), None),
    "hips": ((0, 0.9, 2.45), (0, 0.0, 2.55), "root"),
    "spine1": ((0, 0.0, 2.55), (0, -0.9, 2.6), "hips"),
    "spine2": ((0, -0.9, 2.6), (0, -1.5, 2.45), "spine1"),
    "neck1": ((0, -1.5, 2.45), (0, -1.75, 2.2), "spine2"),
    "neck2": ((0, -1.75, 2.2), (0, -1.95, 1.95), "neck1"),
    "head": ((0, -1.95, 1.95), (0, -3.35, 1.05), "neck2"),
    "jaw": ((0, -2.0, 1.45), (0, -3.25, 0.93), "head"),
    "tail1": ((0, 0.9, 2.45), (0, 1.5, 2.2), "hips"),
    "tail2": ((0, 1.5, 2.2), (0, 2.1, 2.0), "tail1"),
    "tail3": ((0, 2.1, 2.0), (0, 2.7, 1.92), "tail2"),
    "tail4": ((0, 2.7, 1.92), (0, 3.3, 1.87), "tail3"),
    "tail5": ((0, 3.3, 1.87), (0, 3.9, 1.86), "tail4"),
    "tail6": ((0, 3.9, 1.86), (0, 4.45, 1.9), "tail5"),
}
# yz of each joint; x = side * leg x. Parent "hips" / "spine2" for the first bone of a limb.
HIND = {
    "thigh": ((0.80, 2.10), (0.45, 1.30), "hips"),
    "shin": ((0.45, 1.30), (0.80, 0.40), "thigh"),
    "foot": ((0.80, 0.40), (0.60, 0.12), "shin"),
    "toes": ((0.60, 0.12), (0.38, 0.05), "foot"),
}
FRONT = {
    "arm_u": ((-0.65, 1.90), (-0.42, 1.20), "spine2"),
    "arm_l": ((-0.42, 1.20), (-0.82, 0.38), "arm_u"),
    "hand": ((-0.82, 0.38), (-0.95, 0.12), "arm_l"),
    "fingers": ((-0.95, 0.12), (-1.22, 0.05), "hand"),
}
SIDES = {"L": 1.0, "R": -1.0}


def build_armature():
    arm_data = bpy.data.armatures.new("Triceratops_Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add(name, head, tail, parent):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
        b.use_connect = False
        b.use_deform = name != "root"

    for n, (h, t, p) in CENTRAL.items():
        add(n, h, t, p)
    for sd, sx in SIDES.items():
        for table, x, first in ((HIND, HIND_X, "hips"), (FRONT, FRONT_X, "spine2")):
            for n, (h, t, p) in table.items():
                add(f"{n}.{sd}", (sx * x, *h), (sx * x, *t), p if p == first else f"{p}.{sd}")
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def split_z(y):
    """Mouth line height at y (beak y=-3.2 -> 1.12, corner y=-2.25 -> 1.36)."""
    return 1.12 + 0.25 * min(max((y + 3.2) / 0.95, 0.0), 1.2)


def reweight_jaw(mesh):
    jaw = mesh.vertex_groups["jaw"]
    for v in mesh.data.vertices:
        y, z, ax = v.co.y, v.co.z, abs(v.co.x)
        if y > -2.15 or z > 1.6 or y < -3.5 or ax > 0.55:
            continue
        d = split_z(y) - z                      # > 0 below the mouth line
        w = min(max(d / 0.06 + 0.5, 0.0), 1.0)
        if y > -2.4:                            # fade in towards the hinge
            w *= min(max((-2.15 - y) / 0.25, 0.0), 1.0)
        if w <= 0.0:
            continue
        others = [(g.group, g.weight) for g in v.groups if g.group != jaw.index]
        tot = sum(wt for _, wt in others)
        for gi, wt in others:
            mesh.vertex_groups[gi].add([v.index], wt * (1 - w) / tot if tot else 0.0, "REPLACE")
        jaw.add([v.index], w, "REPLACE")


def smooth_jaw(mesh, iters=4):
    """Relax jaw weights over the surface so a lone vertex cannot be torn away from its neighbours."""
    jaw = mesh.vertex_groups["jaw"]
    verts = mesh.data.vertices
    w = [0.0] * len(verts)
    for v in verts:
        for g in v.groups:
            if g.group == jaw.index:
                w[v.index] = g.weight
    nbr = [[] for _ in verts]
    for e in mesh.data.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    live = [v.index for v in verts if -3.5 < v.co.y < -2.1 and v.co.z < 1.7 and nbr[v.index]]
    for _ in range(iters):
        new = list(w)
        for i in live:
            new[i] = 0.5 * w[i] + 0.5 * sum(w[j] for j in nbr[i]) / len(nbr[i])
        w = new
    head = mesh.vertex_groups["head"]
    for i in live:
        others = [(g.group, g.weight) for g in verts[i].groups if g.group != jaw.index]
        tot = sum(wt for _, wt in others)
        if tot > 0:
            for gi, wt in others:
                mesh.vertex_groups[gi].add([i], wt * (1 - w[i]) / tot, "REPLACE")
        elif w[i] < 1.0:
            head.add([i], 1 - w[i], "REPLACE")
        if w[i] > 0:
            jaw.add([i], w[i], "REPLACE")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = argv[0], argv[1]
    bpy.ops.wm.open_mainfile(filepath=src)
    mesh = bpy.data.objects["Triceratops"]
    arm = build_armature()
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    print("groups", len(mesh.vertex_groups))
    bpy.context.view_layer.objects.active = mesh
    reweight_jaw(mesh)
    smooth_jaw(mesh)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_limit_total(group_select_mode="BONE_DEFORM", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
