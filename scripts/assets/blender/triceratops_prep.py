"""Stage 1 for the Triceratops asset (issue #21): OBJ -> scaled, textured .blend.

  blender -b -P scripts/assets/blender/triceratops_prep.py -- <src dir> <out.blend>

Steps (each is listed in assets/manifest.json modifications):
  * import the OBJ (Y-up -> Z-up), subdivide once (Catmull-Clark), uniformly scale to an 8 m nose-to-tail animal, feet on z=0, -Y forward
  * rebuild the PBR material: base colour + normal (resized 4096 -> 2048), and an ORM texture
    (R = baked ambient occlusion, G = roughness, B = metallic) at 1024 px
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

TARGET_LENGTH = 8.0
TEX = 2048
ORM = 1024


def load(path, name, colorspace, size):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    img.scale(size, size)
    img.name = name
    return img


def channel(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(-1, 4)[:, 0]

def split_z(y):
    """Mouth-line height at y (same plane the rig uses): beak y=-3.2 -> 1.12, mouth corner y=-2.25 -> 1.36."""
    return 1.12 + 0.25 * min(max((y + 3.2) / 0.95, 0.0), 1.2)


def relax(bm, verts, iters, f=0.5):
    """Laplacian-relax positions only (UVs untouched)."""
    verts = list(verts)
    for _ in range(iters):
        new = {}
        for v in verts:
            nb = [e.other_vert(v) for e in v.link_edges]
            if nb:
                c = sum((n.co for n in nb), Vector()) / len(nb)
                new[v] = v.co.lerp(c, f)
        for v, co in new.items():
            v.co = co


def grow(verts, rings):
    out = set(verts)
    front = set(verts)
    for _ in range(rings):
        nxt = set()
        for v in front:
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in out:
                    nxt.add(o)
        out |= nxt
        front = nxt
    return out


def fix_head(mesh):
    """Head clean-up (review round 1): rounder beak outline, smooth keratin beak margin, closed horn-base seams.
    All geometry-only; the baked normal map is flattened over the beak margin afterwards (flatten_beak_normals)."""
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    # 1. local subdivision of the snout so the beak outline has enough segments to round
    bm.faces.ensure_lookup_table()
    edges = {e for f in bm.faces if f.calc_center_median().y < -2.85 and f.calc_center_median().z < 1.9 for e in f.edges}
    bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    # 2. beak outline: vertices of the front 0.55 m of the snout below/at the mouth line
    outline = [v for v in bm.verts if v.co.y < -2.95 and abs(v.co.x) < 0.7 and v.co.z < split_z(v.co.y) + 0.03]
    relax(bm, outline, 6, 0.5)
    # 3. beak margin knobs: the row of scale bumps just above the mouth line
    knobs = [v for v in bm.verts if -3.45 < v.co.y < -2.5 and abs(v.co.x) < 0.6
             and split_z(v.co.y) + 0.02 < v.co.z < split_z(v.co.y) + 0.16]
    relax(bm, knobs, 10, 0.6)
    # 4. horn-base seams: relax rings around sharp creases in the brow/nose region (eye sockets excluded)
    crease = set()
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(38):
            for v in e.verts:
                p = v.co
                if p.y < -2.15 and p.z > 1.35 and not any(((p.x - sx) ** 2 + (p.y + 2.55) ** 2 + (p.z - 1.93) ** 2) < 0.2 ** 2 for sx in (-0.5, 0.5)):
                    crease.add(v)
    relax(bm, grow(crease, 2), 4, 0.5)
    print("head fix: outline", len(outline), "knobs", len(knobs), "crease", len(crease))
    bm.normal_update()
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    mesh.data.polygons.foreach_set("use_smooth", [True] * len(mesh.data.polygons))

def seal_horn_bases(mesh, base, size):
    """The brow and nasal horns are pale keratin shafts that pass through a dark skin collar, leaving a light sliver
    where the collar does not reach the shaft. Classify horn vertices by their base-colour luminance, then flare
    each horn base outwards along its normal (1 cm at the skin line, fading to 0 at 0.14 m) so the shaft fills the collar."""
    from mathutils import kdtree
    buf = np.empty(size * size * 4, dtype=np.float32)
    base.pixels.foreach_get(buf)
    buf = buf.reshape(size, size, 4)
    uv = mesh.data.uv_layers.active.data
    lum = {}
    for poly in mesh.data.polygons:
        for l in poly.loop_indices:
            vi = mesh.data.loops[l].vertex_index
            u, v = uv[l].uv
            px = buf[min(max(int(v * size), 0), size - 1), min(max(int(u * size), 0), size - 1)]
            lum.setdefault(vi, []).append(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2])
    verts = mesh.data.vertices
    horn = {i for i, ls in lum.items() if sum(ls) / len(ls) > 0.22 and verts[i].co.y < -2.2 and verts[i].co.z > 1.2}
    skin = [i for i in range(len(verts)) if i not in horn and verts[i].co.y < -2.2 and verts[i].co.z > 1.2]
    kd = kdtree.KDTree(len(skin))
    for i in skin:
        kd.insert(verts[i].co, i)
    kd.balance()
    moved = 0
    border = set()
    for i in horn:
        d = kd.find(verts[i].co)[2]
        w = max(0.0, 1.0 - d / 0.14)
        w = w * w * (3 - 2 * w)
        if w > 0:
            verts[i].co += verts[i].normal * (0.01 * w)
            moved += 1
        if d < 0.03:
            border.add(i)
    mesh.data.update()
    bm = bmesh.new()                 # relax the horn/skin border so the flare leaves no stair-steps
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    relax(bm, grow({bm.verts[i] for i in border}, 1), 3, 0.4)
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    print("horn vertices", len(horn), "flared", moved)


def flatten_beak_normals(mesh, nrm, size):
    """Paint the tangent-space normal map flat over the UV footprint of the beak margin so the baked knob bumps
    do not shade through the smoothed geometry."""
    uv = mesh.data.uv_layers.active.data
    mask = np.zeros((size, size), dtype=bool)
    for poly in mesh.data.polygons:
        c = poly.center
        if not (-3.45 < c.y < -2.5 and abs(c.x) < 0.6 and split_z(c.y) + 0.0 < c.z < split_z(c.y) + 0.18):
            continue
        pts = [(uv[l].uv[0] * size, uv[l].uv[1] * size) for l in poly.loop_indices]
        for i in range(1, len(pts) - 1):
            tri = np.array([pts[0], pts[i], pts[i + 1]])
            x0, y0 = np.floor(tri.min(0)).astype(int) - 1
            x1, y1 = np.ceil(tri.max(0)).astype(int) + 1
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, size)), np.arange(max(y0, 0), min(y1, size)))
            d = (tri[1, 1] - tri[2, 1]) * (tri[0, 0] - tri[2, 0]) + (tri[2, 0] - tri[1, 0]) * (tri[0, 1] - tri[2, 1])
            if abs(d) < 1e-9:
                continue
            a = ((tri[1, 1] - tri[2, 1]) * (xs - tri[2, 0]) + (tri[2, 0] - tri[1, 0]) * (ys - tri[2, 1])) / d
            b = ((tri[2, 1] - tri[0, 1]) * (xs - tri[2, 0]) + (tri[0, 0] - tri[2, 0]) * (ys - tri[2, 1])) / d
            inside = (a >= -0.05) & (b >= -0.05) & (1 - a - b >= -0.05)
            mask[ys[inside], xs[inside]] = True
    buf = np.empty(size * size * 4, dtype=np.float32)
    nrm.pixels.foreach_get(buf)
    buf = buf.reshape(size, size, 4)
    # feather: average mask over a 5 px box so the flat patch blends into the surrounding detail
    m = mask.astype(np.float32)
    for _ in range(2):
        m = sum(np.roll(np.roll(m, dx, 0), dy, 1) for dx in range(-2, 3) for dy in range(-2, 3)) / 25.0
    m = np.clip(m * 1.6, 0, 1)[..., None]
    flat = np.array([0.5, 0.5, 1.0, 1.0], dtype=np.float32)
    buf = buf * (1 - m) + flat * m
    nrm.pixels.foreach_set(buf.ravel())
    print("flattened normal texels", int(mask.sum()))


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    src, out = os.path.abspath(a[0]), os.path.abspath(a[1])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=os.path.join(src, "obj", "triceratops.obj"))
    mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
    mesh.name = mesh.data.name = "Triceratops"
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # The sculpt is 12.5k triangles: silhouettes (horn bases, eye socket, beak) facet at 1 m. One Catmull-Clark
    # level (UVs and the baked normal map are preserved) rounds them; surface detail stays in the normal map.
    mod = mesh.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = mod.render_levels = 1
    mod.subdivision_type = "CATMULL_CLARK"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh.data.polygons.foreach_set("use_smooth", [True] * len(mesh.data.polygons))
    print("tris after subsurf", sum(len(p.vertices) - 2 for p in mesh.data.polygons))
    ys = [v.co.y for v in mesh.data.vertices]
    k = TARGET_LENGTH / (max(ys) - min(ys))
    mesh.scale = (k, k, k)
    bpy.ops.object.transform_apply(scale=True)
    zmin = min(v.co.z for v in mesh.data.vertices)
    ymid = 0.0
    for v in mesh.data.vertices:
        v.co.z -= zmin
    mesh.data.update()
    fix_head(mesh)
    print("scale factor", k)

    tex = os.path.join(src, "textures")
    base = load(os.path.join(tex, "triceratops_Mat_baseColor.png"), "triceratops_basecolor", "sRGB", TEX)
    nrm = load(os.path.join(tex, "triceratops_Mat_normal.png"), "triceratops_normal", "Non-Color", TEX)
    ao = load(os.path.join(tex, "Ambient_Occlusion_Map_from_Mesh_triceratop.png"), "ao_tmp", "Non-Color", ORM)
    ro = load(os.path.join(tex, "triceratops_Mat_roughness.png"), "ro_tmp", "Non-Color", ORM)
    orm = bpy.data.images.new("triceratops_orm", ORM, ORM, alpha=False)
    orm.colorspace_settings.name = "Non-Color"
    buf = np.ones((ORM * ORM, 4), dtype=np.float32)
    buf[:, 0] = np.clip(channel(ao), 0.0, 1.0)
    buf[:, 1] = np.clip(channel(ro), 0.0, 1.0)
    buf[:, 2] = 0.0
    orm.pixels.foreach_set(buf.ravel())
    flatten_beak_normals(mesh, nrm, TEX)
    seal_horn_bases(mesh, base, TEX)
    for im in (base, nrm, orm):
        im.pack()
    bpy.data.images.remove(ao)
    bpy.data.images.remove(ro)

    m = bpy.data.materials.new("Triceratops_Body")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], o.inputs[0])
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = base
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    oi = nt.nodes.new("ShaderNodeTexImage"); oi.image = orm
    sp = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(oi.outputs["Color"], sp.inputs["Color"])
    nt.links.new(sp.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sp.outputs["Blue"], b.inputs["Metallic"])
    mesh.data.materials.clear()
    mesh.data.materials.append(m)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
