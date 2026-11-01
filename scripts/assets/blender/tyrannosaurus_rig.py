"""Stage 2 for the Tyrannosaurus asset (issue #20): build the deform armature and skin the mesh.

  blender -b -P scripts/assets/blender/tyrannosaurus_rig.py -- <prep.blend> <rig.blend>

The source model is a static ZBrush sculpt (no skeleton), so the armature is authored here. Bone
positions were read off orthographic silhouettes of the 12 m model (-Y forward, +Z up).
Skinning: Blender automatic (heat) weights, then the lower jaw is re-weighted by a plane so the
mouth can close without dragging the upper teeth, and weights are smoothed and limited to 4 per vertex.
"""
import sys

import bpy
import bmesh
from mathutils import Vector

LEG_X = 0.72
ARM_X = 0.50

# name: (head, tail, parent)
CENTRAL = {
    "root": ((0, -0.1, 0.0), (0, -0.1, 0.5), None),
    "hips": ((0, 0.3, 2.95), (0, -1.0, 3.05), "root"),
    "spine1": ((0, -1.0, 3.05), (0, -2.1, 3.2), "hips"),
    "spine2": ((0, -2.1, 3.2), (0, -3.0, 3.4), "spine1"),
    "neck1": ((0, -3.0, 3.4), (0, -3.5, 3.5), "spine2"),
    "neck2": ((0, -3.5, 3.5), (0, -3.95, 3.55), "neck1"),
    "head": ((0, -3.95, 3.55), (0, -5.5, 3.3), "neck2"),
    "jaw": ((0, -4.0, 2.9), (0, -5.0, 2.25), "head"),
    "tail1": ((0, 0.3, 2.95), (0, 1.4, 2.96), "hips"),
    "tail2": ((0, 1.4, 2.96), (0, 2.6, 2.99), "tail1"),
    "tail3": ((0, 2.6, 2.99), (0, 3.8, 3.02), "tail2"),
    "tail4": ((0, 3.8, 3.02), (0, 5.0, 3.05), "tail3"),
    "tail5": ((0, 5.0, 3.05), (0, 6.0, 3.06), "tail4"),
    "tail6": ((0, 6.0, 3.06), (0, 6.6, 3.06), "tail5"),
}
LEG = {  # yz of each joint; x = side * LEG_X
    "thigh": ((-0.1, 2.35), (-0.7, 1.65), "hips"),
    "shin": ((-0.7, 1.65), (0.45, 0.9), "thigh"),
    "foot": ((0.45, 0.9), (0.2, 0.15), "shin"),
    "toes": ((0.2, 0.15), (-0.65, 0.08), "foot"),
}
ARM = {
    "arm_u": ((-2.8, 2.35), (-2.92, 2.12), "spine2"),
    "arm_l": ((-2.92, 2.12), (-3.12, 2.02), "arm_u"),
    "hand": ((-3.12, 2.02), (-3.28, 1.82), "arm_l"),
}
SIDES = {"L": 1.0, "R": -1.0}


def build_armature():
    arm_data = bpy.data.armatures.new("Tyrannosaurus_Armature")
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


def reweight_jaw(mesh):
    """Vertices below the mouth plane get the jaw bone; smooth transition behind the mouth corner."""
    jaw = mesh.vertex_groups["jaw"]
    for v in mesh.data.vertices:
        y, z = v.co.y, v.co.z
        if y > -4.0:
            continue
        # split height: 2.70 at the hinge rising to 2.93 at the mouth corner (y = -4.7), flat in front
        t = min(max((-4.0 - y) / 0.7, 0.0), 1.0)
        split = 2.70 + 0.23 * t
        d = split - z  # > 0: below the plane
        w = min(max(d / 0.10 + 0.5, 0.0), 1.0)
        if y > -4.3:                                  # fade in around the hinge
            w *= min(max((-4.0 - y) / 0.3, 0.0), 1.0)
        if w <= 0.0:
            if v.index in {g.group for g in []}:
                pass
            continue
        # strip the other weights proportionally, then give the jaw w
        others = [(g.group, g.weight) for g in v.groups if g.group != jaw.index]
        tot = sum(wt for _, wt in others)
        for gi, wt in others:
            mesh.vertex_groups[gi].add([v.index], wt * (1 - w) / tot if tot else 0.0, "REPLACE")
        jaw.add([v.index], w, "REPLACE")


def smooth_jaw(mesh, iters=12):
    """Relax the jaw weight over the surface so isolated vertices behind the mouth corner cannot stay
    behind while their neighbours swing up with the jaw (that tore grey spikes out of the throat)."""
    jaw = mesh.vertex_groups["jaw"]
    head = mesh.vertex_groups["head"]
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
    live = [v.index for v in verts if v.co.y < -3.75 and nbr[v.index]]
    for _ in range(iters):
        new = list(w)
        for i in live:
            new[i] = 0.5 * w[i] + 0.5 * sum(w[j] for j in nbr[i]) / len(nbr[i])
        w = new
    for i in live:
        others = [(g.group, g.weight) for g in verts[i].groups if g.group != jaw.index]
        tot = sum(wt for _, wt in others)
        if tot > 0:
            for gi, wt in others:
                mesh.vertex_groups[gi].add([i], wt * (1 - w[i]) / tot, "REPLACE")
        elif w[i] < 1.0:
            head.add([i], 1 - w[i], "REPLACE")
        jaw.add([i], w[i], "REPLACE")


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
        jaw_i = mesh.vertex_groups["jaw"].index
        cz = sum(mesh.data.vertices[i].co.z for i in comp) / len(comp)
        cy = sum(mesh.data.vertices[i].co.y for i in comp) / len(comp)
        if cy < -3.9:  # teeth: follow whichever jaw the skin they are rooted in follows
            d, skin_i = nearest_skin(mesh, comp, big)
            wj = {g.group: g.weight for g in mesh.data.vertices[skin_i].groups}.get(jaw_i, 0.0)
            split = 2.70 + 0.23 * min(max((-4.0 - cy) / 0.7, 0.0), 1.0)
            big_shell = len(comp) > 400  # tongue: judge by where it sits, not by its root
            below = cz < split + 0.05
            to_jaw = below if big_shell else (below or wj > 0.2)
            acc = {jaw_i: 1.0} if to_jaw else {mesh.vertex_groups["head"].index: 1.0}
            tot = 1.0
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
    mesh = bpy.data.objects["Tyrannosaurus"]
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
    rigidify_islands(mesh)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_limit_total(group_select_mode="BONE_DEFORM", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
