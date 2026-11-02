"""Stage 2 for the Pachycephalosaurus asset (issue #24): build the deform armature and skin the mesh.

  blender -b -P scripts/assets/blender/pachycephalosaurus_rig.py -- <prep.blend> <rig.blend>

The source clip is a travelling leap (not usable as idle/walk) and its 25-bone rig is coarse, so the
armature is authored here, with joints read off an orthographic side/front view of the 4.5 m model
(-Y forward, +Z up). No jaw bone: the mouth is closed in every shipped clip, so teeth/beak can never tear.
Skinning: Blender automatic (heat) weights; shells the heat solver cannot reach (nodes, eyes) are bound
rigidly to the nearest deform bone; max 4 influences per vertex.
"""
import sys

import bpy
import bmesh
from mathutils import Vector

LEG_X = 0.34
ARM_X = 0.28

# name: (head, tail, parent)   coordinates are (x, y, z)
CENTRAL = {
    "root": ((0, 0.2, 0.0), (0, 0.2, 0.4), None),
    "hips": ((0, 0.55, 1.28), (0, 0.05, 1.32), "root"),
    "spine1": ((0, 0.05, 1.32), (0, -0.30, 1.36), "hips"),
    "spine2": ((0, -0.30, 1.36), (0, -0.60, 1.42), "spine1"),
    "neck1": ((0, -0.60, 1.42), (0, -0.82, 1.54), "spine2"),
    "neck2": ((0, -0.82, 1.54), (0, -1.00, 1.68), "neck1"),
    "head": ((0, -1.00, 1.68), (0, -1.66, 1.74), "neck2"),
    "tail1": ((0, 0.55, 1.28), (0, 0.95, 1.26), "hips"),
    "tail2": ((0, 0.95, 1.26), (0, 1.35, 1.22), "tail1"),
    "tail3": ((0, 1.35, 1.22), (0, 1.75, 1.16), "tail2"),
    "tail4": ((0, 1.75, 1.16), (0, 2.15, 1.10), "tail3"),
    "tail5": ((0, 2.15, 1.10), (0, 2.50, 1.05), "tail4"),
    "tail6": ((0, 2.50, 1.05), (0, 2.80, 1.00), "tail5"),
}
LEG = {  # yz of each joint; x = side * LEG_X
    "thigh": ((-0.06, 0.98), (-0.20, 0.64), "hips"),
    "shin": ((-0.20, 0.64), (0.24, 0.42), "thigh"),
    "foot": ((0.24, 0.42), (-0.06, 0.16), "shin"),
    "toes": ((-0.06, 0.16), (-0.32, 0.10), "foot"),
}
ARM = {
    "arm_u": ((-0.86, 0.98), (-0.86, 0.80), "spine2"),
    "arm_l": ((-0.86, 0.80), (-1.00, 0.66), "arm_u"),
    "hand": ((-1.00, 0.66), (-1.05, 0.56), "arm_l"),
}
SIDES = {"L": 1.0, "R": -1.0}


def build_armature():
    arm_data = bpy.data.armatures.new("Pachycephalosaurus_Armature")
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
        return b

    for n, (h, t, p) in CENTRAL.items():
        add(n, h, t, p)
    for sd, sx in SIDES.items():
        for n, (h, t, p) in LEG.items():
            add(f"{n}.{sd}", (sx * LEG_X, *h), (sx * LEG_X, *t), p if p == "hips" else f"{p}.{sd}")
        for n, (h, t, p) in ARM.items():
            add(f"{n}.{sd}", (sx * ARM_X, *h), (sx * ARM_X, *t), p if p == "spine2" else f"{p}.{sd}")
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def islands(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            c = stack.pop()
            comp.append(c.index)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        out.append(comp)
    bm.free()
    return out


def nearest_bone(mesh, p):
    best, bn = 1e9, None
    for b in bpy.data.objects["Armature"].data.bones:
        if not b.use_deform:
            continue
        a, c = b.head_local, b.tail_local
        ab = c - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = (p - (a + ab * t)).length
        if d < best:
            best, bn = d, b.name
    return bn


_KD = None


def nearest_skin(mesh, comp, big):
    """Closest (distance, skin vertex index) between a shell and the main skin."""
    best = (1e9, None)
    for i in comp:
        co, idx, dist = _KD.find(mesh.data.vertices[i].co)
        if dist < best[0]:
            best = (dist, idx)
    return best


def rigidify_islands(mesh, max_verts=4000):
    """Teeth/claws/eyes are separate shells: give every vertex of a small shell the shell's mean weights so
    it moves rigidly (a tooth straddling the jaw split would otherwise stretch into a spike)."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    n_small = 0
    n_orphan = 0
    comps = islands(mesh)
    big = [i for c in comps if len(c) > max_verts for i in c]
    from mathutils import kdtree
    kd = kdtree.KDTree(len(big))
    for k, i in enumerate(big):
        kd.insert(mesh.data.vertices[i].co, i)
    kd.balance()
    global _KD
    _KD = kd
    for comp in comps:
        if len(comp) > max_verts:
            continue
        n_small += 1
        acc = {}
        for i in comp:
            for g in mesh.data.vertices[i].groups:
                acc[g.group] = acc.get(g.group, 0.0) + g.weight
        tot = sum(acc.values())
        if not tot:  # heat weighting skipped this shell: bind it rigidly to the nearest deform bone
            c = sum((mesh.data.vertices[i].co for i in comp), Vector()) / len(comp)
            acc = {mesh.vertex_groups[nearest_bone(mesh, c)].index: 1.0}
            tot = 1.0
            n_orphan += 1
        for i in comp:
            for g in list(mesh.data.vertices[i].groups):
                mesh.vertex_groups[g.group].remove([i])
            for gi, w in acc.items():
                mesh.vertex_groups[gi].add([i], w / tot, "REPLACE")
    print("rigid islands", n_small, "orphans bound to nearest bone", n_orphan)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = argv[0], argv[1]
    bpy.ops.wm.open_mainfile(filepath=src)
    mesh = bpy.data.objects["Pachycephalosaurus"]
    arm = build_armature()
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    print("groups", len(mesh.vertex_groups))
    bpy.context.view_layer.objects.active = mesh
    rigidify_islands(mesh)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_limit_total(group_select_mode="BONE_DEFORM", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    unweighted = sum(1 for v in mesh.data.vertices if not any(g.weight > 0 for g in v.groups))
    print("unweighted verts", unweighted)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
