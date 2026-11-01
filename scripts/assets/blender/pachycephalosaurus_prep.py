"""Stage 1 for the Pachycephalosaurus asset (issue #24): FBX -> scaled, decimated, textured .blend.

  blender -b -P scripts/assets/blender/pachycephalosaurus_prep.py -- <src dir> <out.blend> [--ratio 0.12]

Steps (each is listed in assets/manifest.json modifications):
  * import the FBX, bake the rest pose (the source clip is a leap that travels, so it is not shipped),
    drop the source armature (25 coarse bones) and its weights
  * uniformly scale to a 4.5 m nose-to-tail animal, feet on z=0
  * collapse-decimate 489k -> ~60k triangles, head and dome kept denser (vertex-group weighted)
  * one PBR material: base colour 2048 px, tangent normal map 2048 px, flat roughness 0.75 (source has no roughness)
Coordinates: -Y is forward, +Z up (glTF default after export).
"""
import os
import sys

import bpy
import bmesh

TARGET_LENGTH = 4.5
TEX = 2048
HEAD_W = 0.1


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
    ratio = float(argv[argv.index("--ratio") + 1]) if "--ratio" in argv else 0.2
    global HEAD_W
    HEAD_W = float(argv[argv.index("--headw") + 1]) if "--headw" in argv else HEAD_W
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fbx = [os.path.join(src, "unz", f) for f in os.listdir(os.path.join(src, "unz")) if f.endswith(".fbx")][0]
    bpy.ops.import_scene.fbx(filepath=fbx)
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    # bake the armature-modified (rest) shape, then remove rig and weights
    dg = bpy.context.evaluated_depsgraph_get()
    em = mesh.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(em, depsgraph=dg)
    old = mesh.data
    mesh.modifiers.clear()
    mesh.parent = None
    mesh.data = new
    bpy.data.meshes.remove(old)
    mesh.vertex_groups.clear()
    mesh.matrix_world.identity()
    bpy.data.objects.remove(arm)
    mesh.name = "Pachycephalosaurus"
    mesh.data.name = "Pachycephalosaurus"
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ys = [v.co.y for v in mesh.data.vertices]
    k = TARGET_LENGTH / (max(ys) - min(ys))
    mesh.scale = (k, k, k)
    bpy.ops.object.transform_apply(scale=True)
    zmin = min(v.co.z for v in mesh.data.vertices)
    ymax = max(v.co.y for v in mesh.data.vertices)
    for v in mesh.data.vertices:
        v.co.z -= zmin
    print("scale factor", k, "zmin", zmin)
    # Duplicate-vertex clean-up is skipped on purpose: seams from the UV islands are separate verts only in UV space.
    ymin = min(v.co.y for v in mesh.data.vertices)
    vg = mesh.vertex_groups.new(name="keep")
    head_y = ymin + 1.0   # front metre (skull, dome, nodes) keeps more triangles
    for v in mesh.data.vertices:
        w = HEAD_W if v.co.y < head_y else 1.0
        vg.add([v.index], w, "REPLACE")
    # triangulate first so the ratio is in triangles
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(mesh.data)
    bm.free()
    mod = mesh.modifiers.new("dec", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.vertex_group = "keep"
    mod.vertex_group_factor = 1.0
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="dec")
    mesh.vertex_groups.clear()
    for p in mesh.data.polygons:
        p.use_smooth = True
    print("tris", len(mesh.data.polygons), "verts", len(mesh.data.vertices))

    tex = os.path.join(src, "unz")
    def load(path, name, cs):
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = cs
        img.scale(TEX, TEX)
        img.name = name
        img.pack()
        return img
    base = load(os.path.join(tex, "20201008_paki.png"), "pachycephalosaurus_basecolor", "sRGB")
    nrm = load(os.path.join(tex, "20201008_nor.png"), "pachycephalosaurus_normal", "Non-Color")
    m = bpy.data.materials.new("Pachycephalosaurus_Body")
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
    b.inputs["Roughness"].default_value = 0.75
    mesh.data.materials.clear()
    mesh.data.materials.append(m)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
