"""Stage 1 for the Tyrannosaurus asset (issue #20): FBX -> scaled, textured .blend.

  blender -b -P scripts/assets/blender/tyrannosaurus_prep.py -- <src dir> <out.blend>

Steps (each is listed in assets/manifest.json modifications):
  * apply the FBX 0.01 scale/rotation, uniformly scale to a 12 m nose-to-tail animal, feet on z=0
  * rebuild the two PBR materials from the source maps: base colour, normal, and an ORM texture
    whose G channel is roughness = 1 - Glossiness (the source ships glossiness)
  * textures are written at 2048 px (the shipped high-variant limit)
Coordinates: -Y is forward, +Z up (glTF default after export).
"""
import os
import sys

import bpy
import numpy as np

TARGET_LENGTH = 12.0
TEX = 2048


def args():
    a = sys.argv[sys.argv.index("--") + 1:]
    return os.path.abspath(a[0]), os.path.abspath(a[1])


def load_scaled(path, name, colorspace):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    img.scale(TEX, TEX)
    img.name = name
    return img


def main():
    src, out = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fbx = [os.path.join(src, "source", f) for f in os.listdir(os.path.join(src, "source")) if f.endswith(".fbx")][0]
    bpy.ops.import_scene.fbx(filepath=fbx)
    mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
    mesh.name = "Tyrannosaurus"
    mesh.data.name = "Tyrannosaurus"
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ys = [v.co.y for v in mesh.data.vertices]
    k = TARGET_LENGTH / (max(ys) - min(ys))
    mesh.scale = (k, k, k)
    bpy.ops.object.transform_apply(scale=True)
    zmin = min(v.co.z for v in mesh.data.vertices)
    for v in mesh.data.vertices:
        v.co.z -= zmin
    print("scale factor", k)

    tex = os.path.join(src, "textures")
    diffuse = load_scaled(os.path.join(tex, "Tyrant_King_2_Diffuse_copy.jpeg"), "tyrannosaurus_basecolor", "sRGB")
    normal = load_scaled(os.path.join(tex, "Tyrant_King_2_Normal_copy.jpeg"), "tyrannosaurus_normal", "Non-Color")
    gloss = load_scaled(os.path.join(tex, "Tyrant_King_2_Glossiness_copy.jpeg"), "gloss_tmp", "Non-Color")
    g = np.empty(TEX * TEX * 4, dtype=np.float32)
    gloss.pixels.foreach_get(g)
    g = g.reshape(-1, 4)
    orm = bpy.data.images.new("tyrannosaurus_orm", TEX, TEX, alpha=False)
    orm.colorspace_settings.name = "Non-Color"
    buf = np.ones_like(g)
    buf[:, 0] = 1.0                              # occlusion: none baked
    buf[:, 1] = np.clip(1.0 - g[:, 0], 0.2, 1.0)  # roughness = 1 - glossiness
    buf[:, 2] = 0.0                              # metallic
    orm.pixels.foreach_set(buf.ravel())
    orm.scale(512, 512)  # roughness is low-frequency; 512 keeps the shipped files inside the size budget
    orm.pack()
    bpy.data.images.remove(gloss)
    eye_d = load_scaled(os.path.join(tex, "eye_dinosaur_02_Diffuse.jpeg"), "tyrannosaurus_eye_basecolor", "sRGB")
    eye_d.scale(256, 256)  # eyes are a few cm wide: 256 px is plenty; eye normal map dropped
    for im in (diffuse, normal, eye_d):
        im.pack()

    def make(name, base, nrm, orm_img=None, rough=0.2):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out_n = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs[0], out_n.inputs[0])
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = base
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if nrm:
            n = nt.nodes.new("ShaderNodeTexImage"); n.image = nrm
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(n.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        if orm_img:
            o = nt.nodes.new("ShaderNodeTexImage"); o.image = orm_img
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(o.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        else:
            bsdf.inputs["Roughness"].default_value = rough
        return m

    names = [m.name for m in mesh.data.materials]
    print("materials", names)
    body = make("Tyrannosaurus_Body", diffuse, normal, orm)
    eye = make("Tyrannosaurus_Eye", eye_d, None, None, 0.15)
    for i, m in enumerate(mesh.data.materials):
        mesh.data.materials[i] = eye if "eye" in m.name.lower() else body
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
