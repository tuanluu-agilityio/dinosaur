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
    """The brow and nasal horns are pale keratin shafts that pass through a dark skin collar; the collar lip does not
    reach the shaft and leaves holes and light slivers. Classify horn vertices by base-colour luminance, flare
    each shaft base 2.5 cm outwards (fading over 16 cm) so it overlaps the lip, pull the lip up to half-way towards the shaft (within 3 cm) to close slits, then relax the lip and the border ring."""
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
    kd = kdtree.KDTree(len(horn))
    for i in horn:
        kd.insert(verts[i].co, i)
    kd.balance()
    kd_skin = kdtree.KDTree(len(skin))
    for i in skin:
        kd_skin.insert(verts[i].co, i)
    kd_skin.balance()
    smooth_t = lambda x: x * x * (3 - 2 * x)
    ring = set()
    tight = set()
    for i in horn:                                   # flare each shaft base outwards so it overlaps the collar lip
        d = kd_skin.find(verts[i].co)[2]
        w = smooth_t(max(0.0, 1.0 - d / 0.16))
        if w > 0:
            verts[i].co += verts[i].normal * (0.025 * w)
        if d < 0.04:
            ring.add(i)
    for i in skin:                                   # skin within 6 cm of a shaft is part of the ragged collar lip
        co, hi, d = kd.find(verts[i].co)
        if d < 0.06:
            ring.add(i)
        if d < 0.035:
            tight.add(i)
        if d < 0.03:                                 # sink the lip half-way towards the shaft to close slits
            verts[i].co = verts[i].co.lerp(verts[hi].co, 0.5 * (1.0 - d / 0.03))
    mesh.data.update()
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    relax(bm, grow({bm.verts[i] for i in ring}, 1), 6, 0.5)   # round the lip and the shaft/skin border
    bm.normal_update()
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    mesh.data.polygons.foreach_set("use_smooth", [True] * len(mesh.data.polygons))
    print("horn vertices", len(horn), "ring", len(ring))
    return tight


def flatten_beak_normals(mesh, nrm, base, size):
    """Paint the tangent-space normal map flat and the base colour plain over a 1-2 cm strip along the mouth line
    (the keratin edge). The strip is built from per-vertex weights (weight 1 within 0.3 cm of the line, 0 beyond 0.8 cm, i.e. about 1.6 cm wide)
    evaluated per texel from the barycentric 3D position, so its width is set in 3D, not by face or UV-triangle size, and it
    fades out smoothly with no hard edge."""
    uv = mesh.data.uv_layers.active.data
    verts = mesh.data.vertices
    mask = np.zeros((size, size), dtype=np.float32)
    for poly in mesh.data.polygons:
        cs = [verts[vi].co for vi in poly.vertices]
        if not any(-3.5 < c.y < -2.45 and abs(c.x) < 0.65 and abs(c.z - split_z(c.y)) < 0.09 for c in cs):
            continue
        pts = [(uv[l].uv[0] * size, uv[l].uv[1] * size) for l in poly.loop_indices]
        for i in range(1, len(pts) - 1):
            tri = np.array([pts[0], pts[i], pts[i + 1]])
            ty = np.array([cs[0].y, cs[i].y, cs[i + 1].y])
            tz = np.array([cs[0].z, cs[i].z, cs[i + 1].z])
            tx = np.array([cs[0].x, cs[i].x, cs[i + 1].x])
            x0, y0 = np.floor(tri.min(0)).astype(int) - 1
            x1, y1 = np.ceil(tri.max(0)).astype(int) + 1
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, size)), np.arange(max(y0, 0), min(y1, size)))
            d = (tri[1, 1] - tri[2, 1]) * (tri[0, 0] - tri[2, 0]) + (tri[2, 0] - tri[1, 0]) * (tri[0, 1] - tri[2, 1])
            if abs(d) < 1e-9:
                continue
            a = ((tri[1, 1] - tri[2, 1]) * (xs - tri[2, 0]) + (tri[2, 0] - tri[1, 0]) * (ys - tri[2, 1])) / d
            b = ((tri[2, 1] - tri[0, 1]) * (xs - tri[2, 0]) + (tri[0, 0] - tri[2, 0]) * (ys - tri[2, 1])) / d
            c = 1 - a - b
            inside = (a >= -0.03) & (b >= -0.03) & (c >= -0.03)
            # per-texel 3D position (barycentric): the strip width is measured in 3D, so large UV triangles cannot widen it
            py = a * ty[0] + b * ty[1] + c * ty[2]
            pz = a * tz[0] + b * tz[1] + c * tz[2]
            px = a * tx[0] + b * tx[1] + c * tx[2]
            zl = 1.12 + 0.25 * np.clip((py + 3.2) / 0.95, 0.0, 1.2)
            dz = np.abs(pz - (zl + 0.005))
            val = np.clip(1.0 - (dz - 0.003) / 0.005, 0.0, 1.0)
            val = val * ((py > -3.45) & (py < -2.5) & (np.abs(px) < 0.6))
            cur = mask[ys[inside], xs[inside]]
            mask[ys[inside], xs[inside]] = np.maximum(cur, val[inside])
    # feather over a few texels (one 3 px box pass)
    m = mask
    for _ in range(1):
        m = sum(np.roll(np.roll(m, dx, 0), dy, 1) for dx in range(-1, 2) for dy in range(-1, 2)) / 9.0
    m = np.clip(m * 1.3, 0, 1)[..., None]
    mask = mask > 0.3
    buf = np.empty(size * size * 4, dtype=np.float32)
    nrm.pixels.foreach_get(buf)
    buf = buf.reshape(size, size, 4)
    flat = np.array([0.5, 0.5, 1.0, 1.0], dtype=np.float32)
    nrm.pixels.foreach_set((buf * (1 - m) + flat * m).ravel())
    # paint the baked tooth/scale outlines out of the base colour: replace the strip by a wide box blur of its
    # surroundings (outlines are thin, so the blur is skin colour), blended with the same feathered mask
    ys, xs = np.nonzero(mask)
    pad = 24
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, size)
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, size)
    bb = np.empty(size * size * 4, dtype=np.float32)
    base.pixels.foreach_get(bb)
    bb = bb.reshape(size, size, 4)
    crop = bb[y0:y1, x0:x1].copy()
    keep = (~mask[y0:y1, x0:x1]).astype(np.float32)[..., None]          # only unmasked pixels feed the blur
    num, den = crop * keep, keep.copy()
    r = 18
    for axis in (0, 1):
        num = sum(np.roll(num, k, axis) for k in range(-r, r + 1)) / (2 * r + 1)
        den = sum(np.roll(den, k, axis) for k in range(-r, r + 1)) / (2 * r + 1)
    for axis in (0, 1):
        num = sum(np.roll(num, k, axis) for k in range(-r, r + 1)) / (2 * r + 1)
        den = sum(np.roll(den, k, axis) for k in range(-r, r + 1)) / (2 * r + 1)
    fill = num / np.maximum(den, 1e-4)
    mc = m[y0:y1, x0:x1]
    bb[y0:y1, x0:x1] = np.where(den > 1e-3, crop * (1 - mc) + fill * mc, crop)
    base.pixels.foreach_set(bb.ravel())
    print("flattened normal texels", int(mask.sum()))

def flatten_horn_normals(mesh, nrm, size, near):
    """The baked normal map has small dark pits and specular slivers where the skin collar meets each horn shaft.
    Paint the normal map flat (feathered) over the UV footprint of the skin faces touching the collar ring."""
    uv = mesh.data.uv_layers.active.data
    mask = np.zeros((size, size), dtype=bool)
    for poly in mesh.data.polygons:
        if not any(v in near for v in poly.vertices):
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
    m = mask.astype(np.float32)
    for _ in range(2):
        m = sum(np.roll(np.roll(m, dx, 0), dy, 1) for dx in range(-2, 3) for dy in range(-2, 3)) / 25.0
    m = np.clip(m * 1.6, 0, 1)[..., None]
    buf = np.empty(size * size * 4, dtype=np.float32)
    nrm.pixels.foreach_get(buf)
    buf = buf.reshape(size, size, 4)
    flat = np.array([0.5, 0.5, 1.0, 1.0], dtype=np.float32)
    nrm.pixels.foreach_set((buf * (1 - m) + flat * m).ravel())
    print("horn-collar normal texels flattened", int(mask.sum()))


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
    flatten_beak_normals(mesh, nrm, base, TEX)
    near = seal_horn_bases(mesh, base, TEX)
    flatten_horn_normals(mesh, nrm, TEX, near)
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
