"""Stage 1 for the Triceratops asset (issue #21): OBJ -> scaled, textured .blend.

  blender -b -P scripts/assets/blender/triceratops_prep.py -- <src dir> <out.blend>

Steps (each is listed in assets/manifest.json modifications):
  * import the OBJ (Y-up -> Z-up), subdivide once (Catmull-Clark), uniformly scale to an 8 m nose-to-tail animal, feet on z=0, -Y forward
  * rebuild the PBR material: base colour + normal (resized 4096 -> 2048), and an ORM texture
    (R = baked ambient occlusion, G = roughness, B = metallic) at 1024 px
"""
import os
import sys

import bpy
import numpy as np

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
